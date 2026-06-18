const leadService = require('../services/leadService');
const messageService = require('../services/messageService');
const memoryService = require('../services/memoryService');
const settingsService = require('../services/settingsService');
const paymentService = require('../services/paymentService');
const followupService = require('../services/followupService');
const { classifyUserMessage } = require('../ai/intentClassifier');
const { generateHumanReply } = require('../ai/responseGenerator');
const { generateBotReply } = require('../ai/geminiClient');
const { extractEmail } = require('../utils/validators');
const { addHours } = require('../utils/date');
const { env } = require('../config/env');
const {
  detectInitialKeyword,
  detectPain,
  detectPurchaseIntent,
  detectPriceIntent,
  detectVideoSeen,
  detectUrgency
} = require('./intentDetector');
const { detectObjection } = require('./objectionDetector');
const {
  firstMessage,
  painReplies,
  diagnosticQuestion1,
  diagnosticQuestion2,
  diagnosticQuestion3,
  diagnosticQuestion4,
  askName,
  askEmail,
  askEmailAgain,
  askUsername,
  landingMessage,
  offerMessage,
  hotmartMessage,
  objectionReplies,
  crisisMessage,
  deleteMemoryMessage,
  stopMessage,
  humanTakeoverMessage,
  fallbackMessage
} = require('./flows');
const { buildLandingFollowUp, buildPaymentFollowUps } = require('./followUps');

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
    reply
  };
}

async function sendLanding({ lead, conversation, settings }) {
  const updatedLead = await updateLeadAndMemory({
    lead,
    conversation,
    leadFields: {
      funnel_stage: 'landing_enviada'
    },
    memoryPatch: {
      current_step: 'landing_sent',
      stage: 'landing_enviada'
    },
    currentStep: 'landing_sent'
  });

  const followUp = buildLandingFollowUp(updatedLead);
  await followupService.createFollowUp({
    leadId: updatedLead.id,
    phone: updatedLead.phone,
    type: followUp.type,
    scheduledAt: followUp.scheduledAt,
    message: followUp.message
  });

  return landingMessage(updatedLead, settings.landing_link);
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

  return offerMessage(settings);
}

async function sendHotmart({ lead, conversation, settings }) {
  const hotmartLink = settings.hotmart_link || env.HOTMART_LINK;

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
        type: item.type,
        scheduledAt: item.scheduledAt,
        message: item.message
      }))
    );
  }

  return hotmartMessage(updatedLead, hotmartLink);
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
        lead_status: leadStatus
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
    const updatedLead = await updateLeadAndMemory({
      lead,
      conversation,
      leadFields: {
        username
      },
      memoryPatch: {
        current_step: 'ready_for_landing',
        username
      },
      currentStep: 'ready_for_landing'
    });

    return sendLanding({ lead: updatedLead, conversation, settings });
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

async function handleIncomingMessage({ whatsappId, phone, body, rawPayload }) {
  const sourceKeyword = detectInitialKeyword(body);
  let lead = await leadService.upsertLeadByPhone({ phone, whatsappId, sourceKeyword });
  const conversation = await messageService.getOrCreateActiveConversation(lead);

  await messageService.storeMessage({
    leadId: lead.id,
    conversationId: conversation.id,
    direction: 'inbound',
    body,
    rawPayload
  });

  await leadService.updateLastUserMessage(lead.id, body);
  lead = await leadService.getLeadById(lead.id);

  const memoryRow = await memoryService.getMemoryByLeadId(lead.id);
  const memory = memoryObject(memoryRow);
  const history = await messageService.getConversationHistory(lead.id);
  const settings = await settingsService.getRuntimeSettings();
  const classification = await classifyUserMessage({ message: body, lead, memory, history });
  classification.stopRequested = /^(stop|cancelar|no me escribas|no quiero mensajes|no me contacten)/i.test(body.trim());

  const specialReply = await handleSpecialCases({ lead, conversation, classification });
  if (specialReply) {
    return result({ lead, conversation, reply: specialReply });
  }

  if (lead.human_takeover || lead.bot_paused) {
    return result({ lead, conversation, reply: null });
  }

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

  if (classification.wantsPaymentLink || detectPurchaseIntent(body)) {
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

  const videoSeen = detectVideoSeen(body);
  if (videoSeen) {
    await leadService.updateLead(lead.id, {
      notes: `${lead.notes || ''}\n${new Date().toISOString()} vio_video`.trim()
    });
  }

  if (detectPriceIntent(body) || videoSeen || lead.lead_status === 'caliente') {
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
