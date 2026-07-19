const leadService = require('../services/leadService');
const messageService = require('../services/messageService');
const memoryService = require('../services/memoryService');
const settingsService = require('../services/settingsService');
const paymentService = require('../services/paymentService');
const followupService = require('../services/followupService');
const { generateAIConversationTurn, initialOptionsReply, normalizeStage } = require('../ai/responseGenerator');
const { generateHolograficasConversationTurn } = require('../ai/holograficasResponseGenerator');
const { classifySafety } = require('../ai/safetyClassifier');
const { normalizeUserProvidedPhone } = require('../utils/normalizePhone');
const { extractEmail, isValidEmail } = require('../utils/validators');
const { addHours } = require('../utils/date');
const { logger } = require('../utils/logger');
const { env } = require('../config/env');
const { detectInitialKeyword } = require('./intentDetector');
const { buildPaymentFollowUps, buildHolograficasPaymentFollowUps } = require('./followUps');
const {
  PLANS,
  getPlanResources,
  holograficasWelcomeReply,
  normalizeText,
  planCatalogReply,
  resolvePlanRoute,
  planSelectionReply
} = require('./productCatalog');

const STAGE_ALIASES = {
  video_ofrecido: 'captacion',
  video_enviado: 'diagnostico',
  diagnostico_orientativo: 'diagnostico',
  descubrimiento_emocional: 'diagnostico',
  pdf_ofrecido: 'datos_solicitados',
  pdf_enviado: 'datos_solicitados',
  programa: 'oferta_presentada',
  payment_link_sent: 'link_pago_enviado',
  post_link_conversation: 'post_link_conversacion',
  payment_reported: 'pago_reportado',
  closed: 'cierre_frio'
};

const LEGACY_HOTMART_LINK = 'https://pay.hotmart.com/W101807995K';
const HOTMART_PLACEHOLDER = 'https://pay.hotmart.com/T103515864E';
const HOTMART_PLACEHOLDERS = [
  '(LINK HOTMART)',
  '[LINK HOTMART]',
  'LINK HOTMART',
  '(HOTMART_LINK)',
  '[HOTMART_LINK]',
  'HOTMART_LINK'
];

const ALLOWED_AI_LEAD_FIELDS = new Set([
  'name',
  'email',
  'username',
  'phone',
  'display_phone',
  'source',
  'source_keyword',
  'country',
  'selected_plan',
  'crm_section',
  'main_pain',
  'emotional_response',
  'problem_duration',
  'tried_before',
  'urgency',
  'lead_status',
  'main_objection',
  'objection_type',
  'purchase_intent',
  'closed_conversation',
  'crisis_detected',
  'payment_status',
  'consent_24h',
  'notes'
]);

function memoryObject(memoryRow) {
  return memoryRow && memoryRow.memory ? memoryRow.memory : {};
}

function cleanObject(value) {
  return Object.fromEntries(
    Object.entries(value || {}).filter(([, entry]) => (
      entry !== undefined
      && entry !== null
      && entry !== ''
    ))
  );
}

function resolveCurrentStage({ lead, conversation, memory }) {
  if (lead && lead.payment_status === 'reportado') return 'pago_reportado';
  if (lead && lead.hotmart_link_sent && lead.payment_status !== 'confirmado') {
    return normalizeStage(lead.funnel_stage === 'link_pago_enviado' ? 'link_pago_enviado' : 'post_link_conversacion');
  }
  if (lead && lead.crisis_detected) return 'crisis';
  if (lead && lead.human_takeover) return 'humano';
  if (lead && lead.bot_paused) return 'pausado';

  const raw = (memory && (memory.conversation_stage || memory.current_step))
    || (lead && lead.funnel_stage)
    || (conversation && conversation.current_step)
    || 'inicio';
  const alias = lead && lead.selected_plan === PLANS.HOLOGRAFICAS && raw === 'video_enviado'
    ? raw
    : STAGE_ALIASES[raw] || raw;
  return normalizeStage(alias, 'inicio');
}

function getHotmartLink(settings = {}, lead = {}) {
  if (lead.selected_plan === PLANS.HOLOGRAFICAS) {
    return getPlanResources(PLANS.HOLOGRAFICAS, settings).hotmartLink;
  }
  const link = String(settings.hotmart_link || env.HOTMART_LINK || '').trim();
  if (!link || link === LEGACY_HOTMART_LINK || HOTMART_PLACEHOLDERS.includes(link)) return HOTMART_PLACEHOLDER;
  return link;
}

function getAmount(settings = {}, lead = {}) {
  const raw = getPlanResources(lead.selected_plan || PLANS.NEUROTRAUMAS, settings).price;
  const amount = Number(String(raw).replace(/[^\d.]/g, ''));
  return Number.isFinite(amount) && amount > 0
    ? amount
    : (lead.selected_plan === PLANS.HOLOGRAFICAS ? 72 : 270);
}

function sanitizeLeadFields(aiFields = {}, lead, body) {
  const safe = {};

  for (const [key, value] of Object.entries(aiFields || {})) {
    if (!ALLOWED_AI_LEAD_FIELDS.has(key)) continue;
    if (value === null || value === undefined || value === '') continue;

    if (key === 'email') {
      const email = String(value).trim().toLowerCase();
      if (isValidEmail(email)) safe.email = email;
      continue;
    }

    if (key === 'urgency') {
      const urgency = Number(value);
      if (Number.isFinite(urgency) && urgency >= 1 && urgency <= 10) safe.urgency = urgency;
      continue;
    }

    if (key === 'phone') {
      const phone = normalizeUserProvidedPhone(value);
      if (phone) {
        safe.phone = phone;
        safe.display_phone = phone;
      }
      continue;
    }

    if (key === 'display_phone') {
      const phone = normalizeUserProvidedPhone(value);
      safe.display_phone = phone || String(value).trim().slice(0, 500);
      continue;
    }

    if (key === 'source') {
      safe.source = String(value).trim().slice(0, 500);
      continue;
    }

    if (key === 'country') {
      safe.country = String(value).trim().slice(0, 120);
      continue;
    }

    if (key === 'selected_plan') {
      if (Object.values(PLANS).includes(value) && (!lead.selected_plan || lead.selected_plan === value)) {
        safe.selected_plan = value;
      }
      continue;
    }

    if (typeof value === 'boolean') {
      safe[key] = value;
      continue;
    }

    safe[key] = String(value).trim().slice(0, key === 'notes' ? 2000 : 500);
  }

  const emailFromText = extractEmail(body);
  if (emailFromText && !lead.email) safe.email = emailFromText;

  const phone = normalizeUserProvidedPhone(body);
  if (phone && !lead.phone && !safe.phone) {
    safe.phone = phone;
    safe.display_phone = phone;
  }

  return safe;
}

function sanitizeMemoryPatch(memoryPatch = {}, decision, body) {
  const patch = typeof memoryPatch === 'object' && memoryPatch ? { ...memoryPatch } : {};
  return {
    ...patch,
    current_step: decision.next_stage,
    conversation_stage: decision.next_stage,
    last_user_message: body,
    last_ai_actions: decision.actions,
    last_interaction_at: new Date().toISOString()
  };
}

async function updateConversationState({ conversation, nextStage }) {
  await messageService.updateConversation(conversation.id, {
    current_step: nextStage,
    expires_at: addHours(new Date(), env.MEMORY_EXPIRATION_HOURS)
  });
}

async function createPaymentFlow({ lead, settings, firstTime }) {
  if (!firstTime) return;

  const link = getHotmartLink(settings, lead);
  const amount = getAmount(settings, lead);

  await paymentService.createPayment({
    leadId: lead.id,
    phone: lead.phone,
    paymentLink: link,
    amount,
    metadata: {
      source: 'ai_conversation_turn',
      selected_plan: lead.selected_plan,
      crm_section: lead.crm_section
    }
  });

  await followupService.createFollowUps(
    (lead.selected_plan === PLANS.HOLOGRAFICAS
      ? buildHolograficasPaymentFollowUps(link)
      : buildPaymentFollowUps(lead, link)).map((item) => ({
      ...item,
      leadId: lead.id,
      phone: lead.phone,
      whatsappId: lead.whatsapp_id
    }))
  );
}

async function reportPayment({ lead, settings }) {
  await paymentService.reportPaymentByUser({
    leadId: lead.id,
    phone: lead.phone,
    paymentLink: getHotmartLink(settings, lead),
    amount: getAmount(settings, lead),
    metadata: {
      source: 'ai_payment_reported',
      selected_plan: lead.selected_plan,
      crm_section: lead.crm_section
    }
  });
}

async function applyAIDecision({
  lead,
  conversation,
  memory,
  body,
  settings,
  decision
}) {
  const actions = decision.actions || {};
  const firstHotmartSend = Boolean(actions.send_hotmart_link && !lead.hotmart_link_sent);
  const leadFields = sanitizeLeadFields(decision.lead_fields, lead, body);
  const selectedPlan = leadFields.selected_plan || lead.selected_plan;
  const resources = getPlanResources(selectedPlan || PLANS.NEUROTRAUMAS, settings);

  if (selectedPlan === PLANS.HOLOGRAFICAS) {
    leadFields.selected_plan = PLANS.HOLOGRAFICAS;
    leadFields.crm_section = 'holografica';
  } else if (selectedPlan === PLANS.NEUROTRAUMAS) {
    leadFields.selected_plan = PLANS.NEUROTRAUMAS;
    leadFields.crm_section = 'neurotraumas';
  }

  leadFields.funnel_stage = decision.next_stage;
  leadFields.consent_24h = leadFields.consent_24h === false ? false : true;
  leadFields.memory_expires_at = addHours(new Date(), env.MEMORY_EXPIRATION_HOURS);

  if (actions.send_video_link && resources.videoLink) {
    leadFields.video_sent = true;
    leadFields.video_sent_at = lead.video_sent_at || new Date();
    const videoStage = selectedPlan === PLANS.HOLOGRAFICAS ? 'video_enviado' : 'diagnostico';
    leadFields.funnel_stage = videoStage;
    decision.next_stage = videoStage;
  }

  if (actions.send_pdf_link && settings.pdf_link) {
    leadFields.pdf_sent = true;
    leadFields.pdf_sent_at = lead.pdf_sent_at || new Date();
    leadFields.funnel_stage = 'datos_solicitados';
    decision.next_stage = 'datos_solicitados';
  }

  if (actions.send_hotmart_link) {
    leadFields.purchase_intent = true;
    leadFields.hotmart_link_sent = true;
    leadFields.hotmart_link_sent_at = lead.hotmart_link_sent_at || new Date();
    leadFields.payment_status = leadFields.payment_status || lead.payment_status || 'pendiente';
    leadFields.funnel_stage = 'link_pago_enviado';
    decision.next_stage = 'link_pago_enviado';
    if (selectedPlan === PLANS.HOLOGRAFICAS) {
      leadFields.source = 'whatsapp_multi_plan_holograficas';
    }
  }

  if (actions.payment_reported) {
    leadFields.payment_status = 'reportado';
    leadFields.purchase_intent = true;
    leadFields.funnel_stage = 'pago_reportado';
    decision.next_stage = 'pago_reportado';
    if (selectedPlan === PLANS.HOLOGRAFICAS) {
      leadFields.lead_status = 'comprador';
      leadFields.source = 'whatsapp_multi_plan_holograficas';
    }
  }

  if (actions.stop_contact) {
    leadFields.bot_paused = true;
    leadFields.lead_status = 'perdido';
    leadFields.closed_conversation = true;
    leadFields.funnel_stage = 'pausado';
    decision.next_stage = 'pausado';
  }

  if (actions.pause_bot) {
    leadFields.bot_paused = true;
    if (!actions.stop_contact && decision.next_stage !== 'crisis') {
      leadFields.funnel_stage = 'pausado';
      decision.next_stage = 'pausado';
    }
  }

  if (actions.human_takeover) {
    leadFields.human_takeover = true;
    if (decision.next_stage !== 'crisis') {
      leadFields.funnel_stage = 'humano';
      decision.next_stage = 'humano';
    }
  }

  if (decision.next_stage === 'crisis' || leadFields.crisis_detected) {
    leadFields.crisis_detected = true;
    leadFields.bot_paused = true;
    leadFields.human_takeover = true;
    leadFields.funnel_stage = 'crisis';
    decision.next_stage = 'crisis';
  }

  let updatedLead = await leadService.updateLead(lead.id, cleanObject(leadFields));

  if (actions.delete_memory) {
    await memoryService.deleteMemoryByLeadId(updatedLead.id);
    updatedLead = await leadService.updateLead(updatedLead.id, {
      consent_24h: false,
      memory_expires_at: null
    });
  } else {
    await memoryService.upsertMemory({
      leadId: updatedLead.id,
      phone: updatedLead.phone || updatedLead.display_phone || updatedLead.whatsapp_id,
      memoryPatch: sanitizeMemoryPatch(decision.memory_patch, decision, body),
      summary: decision.memory_patch && decision.memory_patch.summary
    });
  }

  await updateConversationState({ conversation, nextStage: decision.next_stage });

  if (actions.send_hotmart_link || actions.create_payment || actions.create_payment_followups) {
    await createPaymentFlow({ lead: updatedLead, settings, firstTime: firstHotmartSend });
  }

  if (actions.payment_reported) {
    await reportPayment({ lead: updatedLead, settings });
  }

  return updatedLead;
}

function result({ lead, conversation, reply, whatsappId }) {
  return {
    leadId: lead.id,
    conversationId: conversation.id,
    whatsappId: lead.whatsapp_id || whatsappId,
    reply: reply || null
  };
}

function isRecoverableBotControl(lead) {
  const brokenAutomationText = [
    lead && lead.notes,
    lead && lead.last_bot_message
  ].filter(Boolean).join('\n');

  return Boolean(
    lead
    && (lead.human_takeover || lead.bot_paused)
    && !lead.crisis_detected
    && /AI failed:|IA no esta configurada|problema tecnico|te leo/i.test(brokenAutomationText)
  );
}

function isRestartMessage(body) {
  return /^(hola|buenas|buenos dias|buenas tardes|buenas noches|gimnasio|cerebro|gimnasio del cerebro|info|ayuda|inicio|empezar|reiniciar)$/i
    .test(String(body || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim());
}

function shouldResetStaleSalesState(lead, body) {
  return Boolean(
    isRestartMessage(body)
    && lead
    && !lead.crisis_detected
    && /AI failed:|IA no esta configurada|problema tecnico|te leo/i.test(String([
      lead.notes,
      lead.last_bot_message
    ].filter(Boolean).join('\n')))
    && (
      lead.hotmart_link_sent
      || lead.purchase_intent
      || ['pago_reportado', 'link_pago_enviado', 'post_link_conversacion', 'oferta_presentada'].includes(lead.funnel_stage)
      || lead.payment_status === 'reportado'
    )
  );
}

function aiUnavailableReply(error, lead) {
  if (lead && lead.selected_plan === PLANS.HOLOGRAFICAS) {
    return 'Perdón, tuve un problema técnico respondiendo. ¿Me repetís tu mensaje, por favor? 🌿';
  }
  if (!lead || !lead.selected_plan) return planSelectionReply();
  return initialOptionsReply();
}

function emptyActions() {
  return {
    send_video_link: false,
    send_pdf_link: false,
    send_hotmart_link: false,
    create_payment: false,
    create_payment_followups: false,
    payment_reported: false,
    pause_bot: false,
    human_takeover: false,
    delete_memory: false,
    stop_contact: false
  };
}

function planSelectionDecision(body) {
  const text = normalizeText(body);
  const hasProblem = /ansiedad|miedo|autosabot|bloque|no avanzo|pensamientos|relacion|dinero|estanc|herida|famil/.test(text);
  return {
    reply: planSelectionReply({ hasProblem }),
    next_stage: 'seleccion_plan',
    lead_fields: { source: 'whatsapp_multi_plan' },
    memory_patch: {
      awaiting_plan_selection: true,
      source: 'whatsapp_multi_plan'
    },
    actions: emptyActions()
  };
}

function selectedPlanDecision(selectedPlan) {
  const holograficas = selectedPlan === PLANS.HOLOGRAFICAS;
  return {
    reply: holograficas ? holograficasWelcomeReply() : initialOptionsReply(),
    next_stage: 'captacion',
    lead_fields: {
      selected_plan: selectedPlan,
      crm_section: holograficas ? 'holografica' : 'neurotraumas',
      source: 'whatsapp_multi_plan'
    },
    memory_patch: {
      selected_plan: selectedPlan,
      awaiting_plan_selection: false,
      source: 'whatsapp_multi_plan'
    },
    actions: emptyActions()
  };
}

function catalogDecision() {
  return {
    reply: planCatalogReply(),
    next_stage: 'seleccion_plan',
    lead_fields: { source: 'whatsapp_multi_plan' },
    memory_patch: {
      awaiting_plan_selection: true,
      last_intent: 'catalog_request'
    },
    actions: emptyActions()
  };
}

function crisisDecision() {
  return {
    reply: [
      'Siento mucho que estés pasando por esto ❤️',
      'En este momento lo más importante es que no estés sol@.',
      '',
      'Por favor buscá ayuda inmediata con una persona de confianza, un profesional de salud o emergencias de tu país.',
      '',
      'Estos entrenamientos pueden acompañar procesos personales, pero no reemplazan ayuda profesional en una situación urgente 🌿'
    ].join('\n'),
    next_stage: 'crisis',
    lead_fields: { crisis_detected: true },
    memory_patch: { crisis_detected: true },
    actions: {
      ...emptyActions(),
      pause_bot: true,
      human_takeover: true
    }
  };
}

function hasExistingPlanState(lead, history) {
  if (!lead) return false;
  return history.length > 1
    || !['inicio', 'seleccion_plan', null, undefined].includes(lead.funnel_stage)
    || Boolean(lead.main_pain || lead.video_sent || lead.offer_presented || lead.hotmart_link_sent);
}

async function resetLeadForPlanSelection(lead, selectedPlan) {
  await memoryService.deleteMemoryByLeadId(lead.id);
  await followupService.cancelPendingFollowUpsByLead(lead.id);
  return leadService.updateLead(lead.id, {
    selected_plan: selectedPlan,
    crm_section: selectedPlan === PLANS.HOLOGRAFICAS ? 'holografica' : 'neurotraumas',
    source: 'whatsapp_multi_plan',
    funnel_stage: 'captacion',
    video_sent: false,
    video_sent_at: null,
    pdf_sent: false,
    pdf_sent_at: null,
    offer_presented: false,
    offer_presented_at: null,
    hotmart_link_sent: false,
    hotmart_link_sent_at: null,
    purchase_intent: false,
    closed_conversation: false,
    payment_status: 'pendiente',
    main_objection: null,
    objection_type: null
  });
}

async function handleIncomingMessage({ whatsappId, phone, identity, body, rawPayload }) {
  const sourceKeyword = detectInitialKeyword(body);
  const leadIdentity = identity || {
    phone,
    whatsapp_id: whatsappId,
    whatsapp_lid: String(whatsappId || '').endsWith('@lid') ? whatsappId : null,
    display_phone: phone || whatsappId
  };

  let lead = await leadService.upsertLeadByWhatsAppIdentity({ identity: leadIdentity, sourceKeyword });
  const conversation = await messageService.getOrCreateActiveConversation(lead);

  await messageService.storeMessage({
    leadId: lead.id,
    conversationId: conversation.id,
    whatsappId: lead.whatsapp_id || whatsappId,
    direction: 'inbound',
    body,
    rawPayload
  });

  await leadService.updateLastUserMessage(lead.id, body);
  lead = await leadService.getLeadById(lead.id);

  const userProvidedPhone = normalizeUserProvidedPhone(body);
  if (!lead.phone && userProvidedPhone) {
    lead = await leadService.updateLead(lead.id, {
      phone: userProvidedPhone,
      display_phone: userProvidedPhone
    });
  }

  if (isRecoverableBotControl(lead)) {
    const resetSalesState = shouldResetStaleSalesState(lead, body);

    console.log('Auto releasing stale bot control state', {
      leadId: lead.id,
      whatsapp_id: lead.whatsapp_id,
      bot_paused: lead.bot_paused,
      human_takeover: lead.human_takeover,
      funnel_stage: lead.funnel_stage,
      resetSalesState
    });

    const releaseFields = {
      bot_paused: false,
      human_takeover: false,
      notes: [
        lead.notes,
        `Auto-released stale bot control state at ${new Date().toISOString()}`
      ].filter(Boolean).join('\n').slice(0, 2000)
    };

    if (['humano', 'pausado'].includes(lead.funnel_stage)) {
      releaseFields.funnel_stage = 'inicio';
    }

    if (resetSalesState) {
      Object.assign(releaseFields, {
        funnel_stage: 'inicio',
        payment_status: 'pendiente',
        hotmart_link_sent: false,
        hotmart_link_sent_at: null,
        purchase_intent: false,
        offer_presented: false,
        offer_presented_at: null,
        closed_conversation: false,
        main_objection: null,
        objection_type: null
      });
    }

    lead = await leadService.updateLead(lead.id, {
      ...releaseFields
    });

    if (resetSalesState) {
      await memoryService.deleteMemoryByLeadId(lead.id);
      await updateConversationState({ conversation, nextStage: 'inicio' });
    }
  }

  console.log('Bot control state', {
    bot_paused: lead.bot_paused,
    human_takeover: lead.human_takeover
  });

  if (lead.human_takeover || lead.bot_paused) {
    console.log('Bot response skipped by control state', {
      leadId: lead.id,
      whatsapp_id: lead.whatsapp_id,
      bot_paused: lead.bot_paused,
      human_takeover: lead.human_takeover,
      crisis_detected: lead.crisis_detected,
      funnel_stage: lead.funnel_stage
    });

    return result({ lead, conversation, reply: null, whatsappId });
  }

  const memoryRow = await memoryService.getMemoryByLeadId(lead.id);
  const memory = memoryObject(memoryRow);
  const history = await messageService.getConversationHistory(lead.id, 12);
  const settings = await settingsService.getRuntimeSettings();

  if (classifySafety(body).isCrisis) {
    const decision = crisisDecision();
    const updatedLead = await applyAIDecision({ lead, conversation, memory, body, settings, decision });
    return result({ lead: updatedLead, conversation, reply: decision.reply, whatsappId });
  }

  const awaitingSelection = Boolean(memory.awaiting_plan_selection)
    || lead.funnel_stage === 'seleccion_plan';
  const planRoute = resolvePlanRoute({
    message: body,
    selectedPlan: lead.selected_plan,
    awaitingSelection
  });

  if (planRoute.type === 'catalog') {
    const decision = catalogDecision();
    const updatedLead = await applyAIDecision({ lead, conversation, memory, body, settings, decision });
    return result({ lead: updatedLead, conversation, reply: decision.reply, whatsappId });
  }

  if (planRoute.type === 'select') {
    if (lead.selected_plan || hasExistingPlanState(lead, history)) {
      lead = await resetLeadForPlanSelection(lead, planRoute.selectedPlan);
    }
    const decision = selectedPlanDecision(planRoute.selectedPlan);
    const updatedLead = await applyAIDecision({ lead, conversation, memory: {}, body, settings, decision });
    return result({ lead: updatedLead, conversation, reply: decision.reply, whatsappId });
  }

  if (planRoute.type === 'selection') {
    const decision = planSelectionDecision(body);
    const updatedLead = await applyAIDecision({ lead, conversation, memory, body, settings, decision });
    return result({ lead: updatedLead, conversation, reply: decision.reply, whatsappId });
  }

  const currentStage = resolveCurrentStage({ lead, conversation, memory });

  console.log('AI conversation context', {
    leadId: lead.id,
    currentStage,
    funnel_stage: lead.funnel_stage,
    hotmart_link_sent: lead.hotmart_link_sent,
    payment_status: lead.payment_status
  });

  let decision;
  try {
    const generateTurn = lead.selected_plan === PLANS.HOLOGRAFICAS
      ? generateHolograficasConversationTurn
      : generateAIConversationTurn;
    decision = await generateTurn({
      lead,
      memory,
      history,
      userMessage: body,
      currentStage,
      settings
    });
  } catch (error) {
    console.error('AI conversation turn failed', {
      leadId: lead.id,
      error: error.message,
      stack: error.stack
    });

    logger.error('AI conversation turn failed', {
      leadId: lead.id,
      error: error.message,
      stack: error.stack
    });

    const updatedLead = await leadService.updateLead(lead.id, {
      notes: [lead.notes, `AI failed: ${error.message}`].filter(Boolean).join('\n').slice(0, 2000)
    });

    return result({
      lead: updatedLead,
      conversation,
      reply: aiUnavailableReply(error, lead),
      whatsappId
    });
  }

  console.log('AI conversation decision', {
    leadId: lead.id,
    next_stage: decision.next_stage,
    actions: decision.actions,
    hasReply: Boolean(decision.reply)
  });

  const updatedLead = await applyAIDecision({
    lead,
    conversation,
    memory,
    body,
    settings,
    decision
  });

  return result({
    lead: updatedLead,
    conversation,
    reply: decision.reply,
    whatsappId
  });
}

module.exports = {
  handleIncomingMessage,
  resolveCurrentStage
};
