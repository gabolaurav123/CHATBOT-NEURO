const leadService = require('../services/leadService');
const messageService = require('../services/messageService');
const memoryService = require('../services/memoryService');
const settingsService = require('../services/settingsService');
const paymentService = require('../services/paymentService');
const followupService = require('../services/followupService');
const { classifyUserMessage } = require('../ai/intentClassifier');
const { generateHumanReply, generatePostLinkReply } = require('../ai/responseGenerator');
const { generateBotReply } = require('../ai/geminiClient');
const { extractEmail } = require('../utils/validators');
const { normalizeUserProvidedPhone } = require('../utils/normalizePhone');
const { addHours } = require('../utils/date');
const { env } = require('../config/env');
const {
  detectInitialKeyword,
  detectGreeting,
  detectPain,
  detectPurchaseIntent,
  detectPriceIntent,
  detectPaymentReported,
  detectUrgency
} = require('./intentDetector');
const { detectObjection } = require('./objectionDetector');
const {
  firstMessage,
  greetingMessage,
  painReplies,
  diagnosticQuestion1,
  diagnosticQuestion2,
  diagnosticQuestion3,
  diagnosticQuestion4,
  askName,
  askEmail,
  askEmailAgain,
  askUsername,
  askPhone,
  offerMessage,
  hotmartMessage,
  objectionReplies,
  crisisMessage,
  deleteMemoryMessage,
  stopMessage,
  humanTakeoverMessage,
  fallbackMessage,
  postLinkFallback,
  paymentReportedMessage
} = require('./flows');
const { buildPaymentFollowUps } = require('./followUps');

function memoryObject(memoryRow) {
  return memoryRow && memoryRow.memory ? memoryRow.memory : {};
}

function cleanName(message) {
  const value = String(message || '')
    .replace(/^(me llamo|soy|mi nombre es)\s+/i, '')
    .trim();

  if (!value || value.includes('@') || value.length > 80 || value.length < 2) return null;
  if (/\d{4,}/.test(value)) return null;

  return value;
}

function cleanUsername(message) {
  const value = String(message || '').trim();
  const match = value.match(/@[\w.]{2,}/);
  if (match) return match[0];
  return value.slice(0, 120);
}

function interpretDiagnosticChange(message) {
  const text = String(message || '').toLowerCase();
  if (/^a\b|ansiedad/.test(text)) return 'ansiedad';
  if (/^b\b|autosabotaje/.test(text)) return 'autosabotaje';
  if (/^c\b|paz/.test(text)) return 'paz_mental';
  if (/^d\b|relaciones/.test(text)) return 'relaciones';
  if (/^e\b|seguridad/.test(text)) return 'recuperar_seguridad';
  if (/^f\b|entender/.test(text)) return 'entender_que_me_pasa';
  return message;
}

async function updateLeadAndMemory({ lead, conversation, leadFields, memoryPatch, summary, currentStep }) {
  let updatedLead = lead;

  if (leadFields && Object.keys(leadFields).length > 0) {
    updatedLead = await leadService.updateLead(lead.id, leadFields);
  }

  if (memoryPatch) {
    await memoryService.upsertMemory({
      leadId: lead.id,
      phone: lead.phone,
      memoryPatch,
      summary
    });
  }

  if (currentStep) {
    await messageService.updateConversation(conversation.id, {
      current_step: currentStep,
      expires_at: addHours(new Date(), env.MEMORY_EXPIRATION_HOURS)
    });
  }

  return updatedLead || lead;
}

function result({ lead, conversation, reply }) {
  return {
    leadId: lead.id,
    conversationId: conversation.id,
    whatsappId: lead.whatsapp_id,
    reply
  };
}

async function sendOffer({ lead, conversation, settings }) {
  await updateLeadAndMemory({
    lead,
    conversation,
    leadFields: {
      funnel_stage: 'oferta_presentada'
    },
    memoryPatch: {
      current_step: 'offer_presented',
      stage: 'oferta_presentada'
    },
    currentStep: 'offer_presented'
  });

  return offerMessage(settings, lead);
}

async function sendHotmart({ lead, conversation, settings }) {
  const hotmartLink = settings.hotmart_link || env.HOTMART_LINK || 'https://pay.hotmart.com/T103515864E';

  const updatedLead = await updateLeadAndMemory({
    lead,
    conversation,
    leadFields: {
      hotmart_link_sent: true,
      hotmart_link_sent_at: new Date(),
      funnel_stage: 'link_pago_enviado',
      payment_status: 'pendiente'
    },
    memoryPatch: {
      current_step: 'payment_link_sent',
      stage: 'link_pago_enviado'
    },
    currentStep: 'payment_link_sent'
  });

  if (!lead.hotmart_link_sent) {
    await paymentService.createPayment({
      leadId: updatedLead.id,
      phone: updatedLead.phone,
      paymentLink: hotmartLink,
      amount: settings.product_price || env.PRODUCT_PRICE,
      metadata: { source: 'bot' }
    });

    const followUps = buildPaymentFollowUps(updatedLead, hotmartLink);
    await followupService.createFollowUps(
      followUps.map((item) => ({
        leadId: updatedLead.id,
        phone: updatedLead.phone,
        whatsappId: updatedLead.whatsapp_id,
        type: item.type,
        scheduledAt: item.scheduledAt,
        message: item.message
      }))
    );
  }

  return hotmartMessage(updatedLead, hotmartLink);
}

function wantsProgramDetails(message) {
  return /(qu[eé] incluye|expl[ií]came|que tiene|qué tiene|m[aá]s info|como funciona|c[oó]mo funciona)/i.test(message || '');
}

function wantsPaymentHelp(message) {
  return /(c[oó]mo pago|d[oó]nde pago|pasame el link|p[aá]same el link|link otra vez|no encuentro el link|inscripci[oó]n|inscripcion|precio|link)/i.test(message || '');
}

async function handlePostLinkConversation({ lead, conversation, memory, history, body, settings }) {
  const hotmartLink = settings.hotmart_link || env.HOTMART_LINK || 'https://pay.hotmart.com/T103515864E';
  const name = lead.name ? `, ${lead.name}` : '';

  if (detectPaymentReported(body)) {
    await updateLeadAndMemory({
      lead,
      conversation,
      leadFields: {
        payment_status: 'reportado',
        funnel_stage: 'pago_reportado'
      },
      memoryPatch: {
        current_step: 'payment_reported',
        stage: 'pago_reportado'
      },
      currentStep: 'payment_reported'
    });
    await paymentService.reportPaymentByUser({
      leadId: lead.id,
      phone: lead.phone,
      paymentLink: hotmartLink,
      amount: settings.product_price || env.PRODUCT_PRICE,
      metadata: { source: 'bot_post_link' }
    });
    return paymentReportedMessage(lead);
  }

  await updateLeadAndMemory({
    lead,
    conversation,
    leadFields: {
      funnel_stage: 'post_link_conversacion'
    },
    memoryPatch: {
      current_step: 'post_link_conversation',
      stage: 'post_link_conversacion'
    },
    currentStep: 'post_link_conversation'
  });

  const objection = detectObjection(body);
  if (objection === 'precio') {
    return `Te entiendo${name}.

Y es válido mirarlo con cuidado.

Más que verlo solo como un pago, míralo como una decisión sobre algo que lleva tiempo afectándote.

Si esto sigue igual 3, 6 o 12 meses más, también tiene un costo emocional.

La pregunta no es solo cuánto cuesta entrar.

También es cuánto te está costando seguir cargando con lo mismo.

Si quieres avanzar, aquí tienes nuevamente el acceso oficial:

${hotmartLink}`;
  }

  if (objection === 'tiempo') {
    return `Te entiendo.

Justamente muchas personas llegan sintiendo que no tienen tiempo ni energía.

Neurotraumas™ está pensado para avanzar paso a paso, no para saturarte.

La idea no es exigirte más, sino darte estructura y herramientas para empezar a entender lo que te pasa.

¿Tu preocupación es más por horarios, constancia o energía emocional?`;
  }

  if (objection === 'confianza') {
    return `Es normal tener dudas.

Nadie debería tomar una decisión importante solo por impulso.

Lo que sí puedo decirte es que Neurotraumas™ no se basa en prometer resultados mágicos.

Se basa en ayudarte a comprender tus patrones, trabajar con herramientas prácticas y acompañarte durante 12 semanas.

No se trata de cambiar de la noche a la mañana.

Se trata de empezar a dejar de repetir lo mismo sin entender por qué.

Si quieres, te puedo explicar qué incluye exactamente antes de que tomes la decisión.`;
  }

  if (objection === 'indecision') {
    return `Claro${name}, piénsalo con calma.

Solo te dejo una pregunta para que lo mires con honestidad:

¿Lo quieres pensar porque necesitas revisar algo concreto, o porque una parte de ti tiene miedo de empezar?

Si quieres, puedo ayudarte a resolver esa duda puntual.`;
  }

  if (wantsProgramDetails(body)) {
    return `Claro.

Neurotraumas™ incluye un entrenamiento de 12 semanas donde trabajarás comprensión del sistema nervioso, identificación de patrones automáticos, ansiedad, autosabotaje, bloqueos internos y herramientas prácticas para regularte mejor.

Además tendrás ejercicios aplicados, acompañamiento y comunidad.

La idea es que no solo entiendas lo que te pasa, sino que tengas una estructura para empezar a trabajarlo.

Si sientes que esto conecta con lo que estás viviendo, puedes inscribirte aquí:

${hotmartLink}`;
  }

  if (wantsPaymentHelp(body) || detectPurchaseIntent(body)) {
    return `Claro${name}.

Te dejo nuevamente el acceso oficial de inscripción:

${hotmartLink}

Cuando completes el pago, guarda la confirmación de Hotmart y avísame por aquí para ayudarte con los siguientes pasos.`;
  }

  return generatePostLinkReply({
    lead,
    memory,
    history,
    userMessage: body,
    settings
  }).catch(() => postLinkFallback(lead, hotmartLink));
}

async function handleSpecialCases({ lead, conversation, classification }) {
  if (classification.isCrisis || classification.intent === 'crisis') {
    await updateLeadAndMemory({
      lead,
      conversation,
      leadFields: {
        funnel_stage: 'crisis',
        bot_paused: true,
        human_takeover: true
      },
      memoryPatch: {
        current_step: 'crisis',
        stage: 'crisis'
      },
      currentStep: 'crisis'
    });
    return crisisMessage();
  }

  if (classification.wantsDeleteData || classification.intent === 'borrar') {
    await memoryService.deleteMemoryByLeadId(lead.id);
    await leadService.updateLead(lead.id, {
      consent_24h: false,
      memory_expires_at: null
    });
    return deleteMemoryMessage();
  }

  if (classification.stopRequested) {
    await leadService.updateLead(lead.id, {
      bot_paused: true,
      lead_status: 'perdido'
    });
    return stopMessage();
  }

  if (classification.needsHuman || classification.intent === 'humano') {
    await leadService.updateLead(lead.id, {
      human_takeover: true
    });
    return humanTakeoverMessage();
  }

  return null;
}

async function handleCurrentStep({ lead, conversation, memory, classification, body, settings }) {
  const currentStep = memory.current_step || conversation.current_step || 'inicio';

  if (currentStep === 'pain_selection' || lead.funnel_stage === 'captacion') {
    const pain = classification.pain || detectPain(body);

    if (!pain) {
      return fallbackMessage();
    }

    const reply = painReplies[pain] || painReplies.informacion;
    await updateLeadAndMemory({
      lead,
      conversation,
      leadFields: {
        main_pain: pain,
        funnel_stage: 'diagnostico'
      },
      memoryPatch: {
        current_step: pain === 'informacion' ? 'diagnostic_change' : 'pain_followup',
        stage: 'diagnostico',
        main_pain: pain
      },
      summary: `Dolor principal: ${pain}`,
      currentStep: pain === 'informacion' ? 'diagnostic_change' : 'pain_followup'
    });

    return reply;
  }

  if (currentStep === 'pain_followup') {
    await updateLeadAndMemory({
      lead,
      conversation,
      leadFields: {
        emotional_response: body
      },
      memoryPatch: {
        current_step: 'diagnostic_change',
        emotional_response: body
      },
      currentStep: 'diagnostic_change'
    });

    return diagnosticQuestion1();
  }

  if (currentStep === 'diagnostic_change') {
    const mainPain = interpretDiagnosticChange(body);
    await updateLeadAndMemory({
      lead,
      conversation,
      leadFields: {
        main_pain: lead.main_pain || mainPain,
        emotional_response: body
      },
      memoryPatch: {
        current_step: 'diagnostic_duration',
        desired_change: mainPain
      },
      currentStep: 'diagnostic_duration'
    });

    return diagnosticQuestion2();
  }

  if (currentStep === 'diagnostic_duration') {
    await updateLeadAndMemory({
      lead,
      conversation,
      leadFields: {
        problem_duration: body
      },
      memoryPatch: {
        current_step: 'diagnostic_tried',
        problem_duration: body
      },
      currentStep: 'diagnostic_tried'
    });

    return diagnosticQuestion3();
  }

  if (currentStep === 'diagnostic_tried') {
    await updateLeadAndMemory({
      lead,
      conversation,
      leadFields: {
        tried_before: body
      },
      memoryPatch: {
        current_step: 'diagnostic_urgency',
        tried_before: body
      },
      currentStep: 'diagnostic_urgency'
    });

    return diagnosticQuestion4();
  }

  if (currentStep === 'diagnostic_urgency') {
    const urgency = classification.urgency || detectUrgency(body);
    if (!urgency || urgency < 1 || urgency > 10) {
      return 'Para ubicarte bien, respóndeme con un número del 1 al 10. ¿Qué tan urgente es para ti empezar a cambiar esto?';
    }

    const leadStatus = urgency >= 7 ? 'caliente' : urgency >= 5 ? 'tibio' : 'frio';
    const nextStep = lead.name ? 'ask_email' : 'ask_name';

    const updatedLead = await updateLeadAndMemory({
      lead,
      conversation,
      leadFields: {
        urgency,
        lead_status: leadStatus,
        funnel_stage: 'datos_solicitados'
      },
      memoryPatch: {
        current_step: nextStep,
        urgency
      },
      currentStep: nextStep
    });

    return updatedLead.name ? askEmail(updatedLead) : askName();
  }

  if (currentStep === 'ask_name') {
    const name = classification.name || cleanName(body);
    if (!name) {
      return 'Para registrarte bien, ¿me dices tu nombre?';
    }

    const updatedLead = await updateLeadAndMemory({
      lead,
      conversation,
      leadFields: {
        name
      },
      memoryPatch: {
        current_step: 'ask_email',
        name
      },
      currentStep: 'ask_email'
    });

    return askEmail(updatedLead);
  }

  if (currentStep === 'ask_email') {
    const email = classification.email || extractEmail(body);
    if (!email) {
      return askEmailAgain();
    }

    await updateLeadAndMemory({
      lead,
      conversation,
      leadFields: {
        email
      },
      memoryPatch: {
        current_step: 'ask_username',
        email
      },
      currentStep: 'ask_username'
    });

    return askUsername();
  }

  if (currentStep === 'ask_username') {
    const username = classification.username || cleanUsername(body);
    const nextStep = lead.phone ? 'offer_presented' : 'ask_phone';
    const updatedLead = await updateLeadAndMemory({
      lead,
      conversation,
      leadFields: {
        username
      },
      memoryPatch: {
        current_step: nextStep,
        username
      },
      currentStep: nextStep
    });

    if (!updatedLead.phone) {
      return askPhone();
    }

    return sendOffer({ lead: updatedLead, conversation, settings });
  }

  if (currentStep === 'ask_phone') {
    const phone = normalizeUserProvidedPhone(body);
    if (!phone) {
      return 'Para guardarlo bien, envíame tu número de WhatsApp con código de país. Ejemplo: +59171234567';
    }

    const updatedLead = await updateLeadAndMemory({
      lead,
      conversation,
      leadFields: {
        phone,
        display_phone: phone
      },
      memoryPatch: {
        current_step: 'offer_presented',
        phone
      },
      currentStep: 'offer_presented'
    });

    return sendOffer({ lead: updatedLead, conversation, settings });
  }

  return null;
}

async function applyGeminiFields({ lead, conversation, aiReply }) {
  const fields = aiReply && aiReply.fieldsToUpdate ? aiReply.fieldsToUpdate : {};
  const safeFields = {};

  for (const key of ['name', 'email', 'username', 'main_pain', 'urgency', 'problem_duration', 'tried_before']) {
    if (fields[key] !== null && fields[key] !== undefined && fields[key] !== '') {
      safeFields[key] = fields[key];
    }
  }

  if (Object.keys(safeFields).length > 0) {
    await updateLeadAndMemory({
      lead,
      conversation,
      leadFields: safeFields,
      memoryPatch: safeFields
    });
  }
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
    whatsappId: lead.whatsapp_id,
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

  console.log('Bot control state', {
    bot_paused: lead.bot_paused,
    human_takeover: lead.human_takeover
  });

  if (lead.human_takeover || lead.bot_paused) {
    return result({ lead, conversation, reply: null });
  }

  const memoryRow = await memoryService.getMemoryByLeadId(lead.id);
  const memory = memoryObject(memoryRow);
  const history = await messageService.getConversationHistory(lead.id);
  const settings = await settingsService.getRuntimeSettings();
  const isPostLink = lead.hotmart_link_sent && lead.payment_status === 'pendiente';

  if (sourceKeyword && lead.funnel_stage === 'inicio') {
    await updateLeadAndMemory({
      lead,
      conversation,
      leadFields: {
        source_keyword: sourceKeyword,
        funnel_stage: 'captacion',
        consent_24h: true,
        memory_expires_at: addHours(new Date(), env.MEMORY_EXPIRATION_HOURS)
      },
      memoryPatch: {
        current_step: 'pain_selection',
        stage: 'captacion',
        source_keyword: sourceKeyword
      },
      currentStep: 'pain_selection'
    });

    return result({ lead, conversation, reply: firstMessage() });
  }

  if (detectGreeting(body) && lead.funnel_stage === 'inicio') {
    return result({ lead, conversation, reply: greetingMessage() });
  }

  const classification = await classifyUserMessage({ message: body, lead, memory, history });
  classification.stopRequested = /^(stop|cancelar|no me escribas|no quiero mensajes|no me contacten)/i.test(body.trim());

  const specialReply = await handleSpecialCases({ lead, conversation, classification });
  if (specialReply) {
    return result({ lead, conversation, reply: specialReply });
  }

  if (isPostLink) {
    const reply = await handlePostLinkConversation({ lead, conversation, memory, history, body, settings });
    return result({ lead: await leadService.getLeadById(lead.id), conversation, reply });
  }

  if (classification.wantsPaymentLink || detectPurchaseIntent(body) || detectPriceIntent(body)) {
    const reply = await sendHotmart({ lead, conversation, settings });
    return result({ lead, conversation, reply });
  }

  const objection = classification.objection || detectObjection(body);
  if (objection && objection !== 'ninguna') {
    await updateLeadAndMemory({
      lead,
      conversation,
      leadFields: {
        main_objection: objection
      },
      memoryPatch: {
        objection,
        current_step: 'objection'
      },
      currentStep: 'objection'
    });
    return result({ lead, conversation, reply: objectionReplies[objection] });
  }

  const stepReply = await handleCurrentStep({ lead, conversation, memory, classification, body, settings });
  if (stepReply) {
    return result({ lead, conversation, reply: stepReply });
  }

  if (lead.lead_status === 'caliente' && !['oferta_presentada', 'link_pago_enviado', 'post_link_conversacion', 'pago_reportado', 'onboarding'].includes(lead.funnel_stage)) {
    const reply = await sendOffer({ lead, conversation, settings });
    return result({ lead, conversation, reply });
  }

  const aiStructured = await generateBotReply({
    lead,
    memory,
    conversationHistory: history,
    userMessage: body,
    currentStage: lead.funnel_stage,
    settings
  });

  await applyGeminiFields({ lead, conversation, aiReply: aiStructured });

  if (aiStructured.shouldSendHotmartLink || aiStructured.detectedIntent === 'compra') {
    const reply = await sendHotmart({ lead, conversation, settings });
    return result({ lead, conversation, reply });
  }

  if (aiStructured.detectedObjection && aiStructured.detectedObjection !== 'ninguna') {
    return result({
      lead,
      conversation,
      reply: objectionReplies[aiStructured.detectedObjection] || aiStructured.reply
    });
  }

  const humanReply = aiStructured.reply && aiStructured.reply !== fallbackMessage()
    ? aiStructured.reply
    : await generateHumanReply({
      lead,
      memory,
      history,
      userMessage: body,
      stage: lead.funnel_stage,
      settings
    });

  return result({ lead, conversation, reply: humanReply });
}

module.exports = {
  handleIncomingMessage
};
