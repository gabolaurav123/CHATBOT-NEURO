const leadService = require('../services/leadService');
const messageService = require('../services/messageService');
const memoryService = require('../services/memoryService');
const settingsService = require('../services/settingsService');
const paymentService = require('../services/paymentService');
const followupService = require('../services/followupService');
const { classifyUserMessage } = require('../ai/intentClassifier');
const { generateHumanReply, generatePostLinkReply } = require('../ai/responseGenerator');
const { generateBotReply } = require('../ai/geminiClient');
const { normalizeUserProvidedPhone } = require('../utils/normalizePhone');
const { addHours } = require('../utils/date');
const { env } = require('../config/env');
const {
  normalizeText,
  detectInitialKeyword,
  detectGreeting,
  detectPain,
  detectPurchaseIntent,
  detectPriceIntent,
  detectPaymentReported,
  detectAffirmative,
  detectNegative,
  detectThanksOrOk,
  detectViewedVideo,
  detectViewedPdf,
  detectProgramDetailsIntent,
  detectFreeMaterialIntent,
  detectSummaryIntent,
  detectBotIdentityQuestion,
  detectFarewell
} = require('./intentDetector');
const { detectObjection } = require('./objectionDetector');
const {
  firstMessage,
  infoWelcomeMessage,
  problemWelcomeMessage,
  videoSentMessage,
  videoDeclinedMessage,
  videoWaitingMessage,
  diagnosticIntroMessage,
  directPainDiagnosticMessage,
  diagnosticLongMessage,
  diagnosticRecentMessage,
  diagnosticUnknownMessage,
  pdfOfferMessage,
  pdfSentMessage,
  pdfWaitingMessage,
  programIntroMessage,
  priceOnlyMessage,
  summaryMessage,
  freeMaterialsMessage,
  offerMessage,
  hotmartMessage,
  objectionReplies,
  crisisMessage,
  deleteMemoryMessage,
  stopMessage,
  humanTakeoverMessage,
  botIdentityMessage,
  softCloseMessage,
  farewellMessage,
  fallbackMessage,
  postLinkFallback,
  paymentReportedMessage
} = require('./flows');
const { buildPaymentFollowUps } = require('./followUps');

function memoryObject(memoryRow) {
  return memoryRow && memoryRow.memory ? memoryRow.memory : {};
}

function activeStep(lead, conversation, memory) {
  return memory.current_step || conversation.current_step || lead.funnel_stage || 'inicio';
}

async function updateLeadAndMemory({ lead, conversation, leadFields, memoryPatch, summary, currentStep }) {
  let updatedLead = lead;

  if (leadFields && Object.keys(leadFields).length > 0) {
    updatedLead = await leadService.updateLead(lead.id, leadFields);
  }

  if (memoryPatch) {
    await memoryService.upsertMemory({
      leadId: lead.id,
      phone: updatedLead.phone,
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

function getSpecialPrice(settings) {
  return settings.product_special_price || settings.product_price || env.PRODUCT_SPECIAL_PRICE || env.PRODUCT_PRICE;
}

function shouldAskForLinkAgain(message) {
  const text = normalizeText(message);
  return /(pasame el link|mandame el link|enviame el link|link otra vez|no me llego|donde pago|quiero comprar|quiero inscribirme|quiero pagar|perdi el link|perdí el link|link de pago|como pago)/.test(text);
}

function looksLikeEmotionalStory(message) {
  const text = normalizeText(message);
  return Boolean(detectPain(message))
    || /(me pasa|siento|tengo|no puedo|lloro|miedo|ansiedad|bloqueo|pecho|garganta|taquicardia|pareja|apego|culpa|triste|soltar|abandono|rechazo|trauma)/.test(text);
}

function hasDiscoveryAgreement(message) {
  const text = normalizeText(message);
  return detectAffirmative(message)
    || /(tiene sentido|exacto|eso me pasa|asi me siento|así me siento|nunca lo habia pensado|nunca lo había pensado|puede ser|totalmente|me identifico)/.test(text);
}

function isRecentProblem(message) {
  const text = normalizeText(message);
  return /(hace poco|reciente|semanas|dias|días|meses|empezo hace poco|empezó hace poco|desde hace poco)/.test(text);
}

function isLongTermProblem(message) {
  const text = normalizeText(message);
  return /(hace mucho|desde hace anos|desde hace años|toda mi vida|siempre|infancia|desde nina|desde niña|desde nino|desde niño|mas de un ano|más de un año|anos|años)/.test(text);
}

function isUnknownOrigin(message) {
  const text = normalizeText(message);
  return /(no se|no sé|no sabria|no sabría|ni idea|no entiendo|no identifico)/.test(text);
}

function hasBodyReaction(message) {
  const text = normalizeText(message);
  return /(cuerpo|pecho|garganta|taquicardia|tension|tensión|nudo|bloqueo|llorar|miedo|panico|pánico|temblor|respirar|presion|presión)/.test(text);
}

async function offerVideo({ lead, conversation, settings, body }) {
  const pain = detectPain(body);
  let reply = firstMessage(settings, lead);

  if (pain || looksLikeEmotionalStory(body)) {
    reply = problemWelcomeMessage(settings, lead);
  } else if (detectInitialKeyword(body) && !detectGreeting(body)) {
    reply = infoWelcomeMessage(settings, lead);
  }

  const updatedLead = await updateLeadAndMemory({
    lead,
    conversation,
    leadFields: {
      funnel_stage: 'video_ofrecido',
      consent_24h: true,
      memory_expires_at: addHours(new Date(), env.MEMORY_EXPIRATION_HOURS)
    },
    memoryPatch: {
      current_step: 'video_offered',
      conversation_stage: 'video_ofrecido',
      video_sent: Boolean(lead.video_sent),
      pdf_sent: Boolean(lead.pdf_sent),
      offer_presented: Boolean(lead.offer_presented),
      hotmart_link_sent: Boolean(lead.hotmart_link_sent)
    },
    currentStep: 'video_offered'
  });

  return result({ lead: updatedLead, conversation, reply });
}

async function sendVideo({ lead, conversation, settings }) {
  const hasLink = Boolean(settings.video_link);
  const nextStep = hasLink ? 'video_sent' : 'diagnostic_orientation';
  const stage = hasLink ? 'video_enviado' : 'diagnostico_orientativo';

  const updatedLead = await updateLeadAndMemory({
    lead,
    conversation,
    leadFields: {
      video_sent: hasLink,
      video_sent_at: hasLink ? new Date() : lead.video_sent_at,
      funnel_stage: stage
    },
    memoryPatch: {
      current_step: nextStep,
      conversation_stage: stage,
      video_sent: hasLink
    },
    currentStep: nextStep
  });

  return result({ lead: updatedLead, conversation, reply: videoSentMessage(settings) });
}

async function askDiagnostic({ lead, conversation, reply = diagnosticIntroMessage(), body }) {
  const pain = detectPain(body);
  const updatedLead = await updateLeadAndMemory({
    lead,
    conversation,
    leadFields: {
      main_pain: lead.main_pain || pain || null,
      funnel_stage: 'diagnostico_orientativo'
    },
    memoryPatch: {
      current_step: 'diagnostic_orientation',
      conversation_stage: 'diagnostico_orientativo',
      main_pain: lead.main_pain || pain || null
    },
    summary: pain ? `Dolor principal: ${pain}` : undefined,
    currentStep: 'diagnostic_orientation'
  });

  return result({ lead: updatedLead, conversation, reply });
}

async function handleDiagnosticAnswer({ lead, conversation, body }) {
  let reply = diagnosticUnknownMessage();

  if (isRecentProblem(body)) {
    reply = diagnosticRecentMessage();
  } else if (isLongTermProblem(body) || hasBodyReaction(body)) {
    reply = diagnosticLongMessage();
  } else if (isUnknownOrigin(body)) {
    reply = diagnosticUnknownMessage();
  } else {
    reply = diagnosticLongMessage();
  }

  const updatedLead = await updateLeadAndMemory({
    lead,
    conversation,
    leadFields: {
      emotional_response: body,
      problem_duration: lead.problem_duration || body,
      funnel_stage: 'descubrimiento_emocional'
    },
    memoryPatch: {
      current_step: 'discovery',
      conversation_stage: 'descubrimiento_emocional',
      emotional_response: body,
      problem_duration: lead.problem_duration || body
    },
    currentStep: 'discovery'
  });

  return result({ lead: updatedLead, conversation, reply });
}

async function offerPdf({ lead, conversation }) {
  const updatedLead = await updateLeadAndMemory({
    lead,
    conversation,
    leadFields: {
      funnel_stage: 'pdf_ofrecido'
    },
    memoryPatch: {
      current_step: 'pdf_offered',
      conversation_stage: 'pdf_ofrecido'
    },
    currentStep: 'pdf_offered'
  });

  return result({ lead: updatedLead, conversation, reply: pdfOfferMessage() });
}

async function sendPdf({ lead, conversation, settings }) {
  const hasLink = Boolean(settings.pdf_link);
  const nextStep = hasLink ? 'pdf_sent' : 'program_intro';
  const stage = hasLink ? 'pdf_enviado' : 'pdf_no_configurado';

  const updatedLead = await updateLeadAndMemory({
    lead,
    conversation,
    leadFields: {
      pdf_sent: hasLink,
      pdf_sent_at: hasLink ? new Date() : lead.pdf_sent_at,
      funnel_stage: stage
    },
    memoryPatch: {
      current_step: nextStep,
      conversation_stage: stage,
      pdf_sent: hasLink
    },
    currentStep: nextStep
  });

  return result({ lead: updatedLead, conversation, reply: pdfSentMessage(settings) });
}

async function introduceProgram({ lead, conversation }) {
  const updatedLead = await updateLeadAndMemory({
    lead,
    conversation,
    leadFields: {
      funnel_stage: 'descubrimiento_emocional'
    },
    memoryPatch: {
      current_step: 'program_intro',
      conversation_stage: 'descubrimiento_emocional'
    },
    currentStep: 'program_intro'
  });

  return result({ lead: updatedLead, conversation, reply: programIntroMessage() });
}

async function sendOffer({ lead, conversation, settings }) {
  const updatedLead = await updateLeadAndMemory({
    lead,
    conversation,
    leadFields: {
      offer_presented: true,
      offer_presented_at: lead.offer_presented_at || new Date(),
      funnel_stage: 'oferta_presentada'
    },
    memoryPatch: {
      current_step: 'offer_presented',
      conversation_stage: 'oferta_presentada',
      offer_presented: true
    },
    currentStep: 'offer_presented'
  });

  return result({ lead: updatedLead, conversation, reply: offerMessage(settings, updatedLead) });
}

async function sendHotmart({ lead, conversation, settings }) {
  const link = settings.hotmart_link || env.HOTMART_LINK || 'https://pay.hotmart.com/T103515864E';
  const amount = getSpecialPrice(settings);

  const updatedLead = await updateLeadAndMemory({
    lead,
    conversation,
    leadFields: {
      purchase_intent: true,
      hotmart_link_sent: true,
      hotmart_link_sent_at: lead.hotmart_link_sent_at || new Date(),
      funnel_stage: 'link_pago_enviado',
      payment_status: 'pendiente'
    },
    memoryPatch: {
      current_step: 'payment_link_sent',
      conversation_stage: 'link_pago_enviado',
      purchase_intent: true,
      hotmart_link_sent: true
    },
    currentStep: 'payment_link_sent'
  });

  if (!lead.hotmart_link_sent) {
    await paymentService.createPayment({
      leadId: updatedLead.id,
      phone: updatedLead.phone,
      paymentLink: link,
      amount,
      metadata: { source: 'bot' }
    });

    const followUps = buildPaymentFollowUps(updatedLead, link);
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

  return result({ lead: updatedLead, conversation, reply: hotmartMessage(updatedLead, link, settings) });
}

async function sendPriceOnly({ lead, conversation, settings }) {
  const updatedLead = await updateLeadAndMemory({
    lead,
    conversation,
    leadFields: {
      funnel_stage: lead.funnel_stage === 'inicio' ? 'oferta_presentada' : lead.funnel_stage
    },
    memoryPatch: {
      current_step: activeStep(lead, conversation, {}),
      last_price_answered: true
    }
  });

  return result({ lead: updatedLead, conversation, reply: priceOnlyMessage(settings) });
}

async function sendFreeMaterials({ lead, conversation, settings }) {
  const updatedLead = await updateLeadAndMemory({
    lead,
    conversation,
    leadFields: {
      video_sent: Boolean(settings.video_link) || lead.video_sent,
      video_sent_at: settings.video_link && !lead.video_sent ? new Date() : lead.video_sent_at,
      pdf_sent: Boolean(settings.pdf_link) || lead.pdf_sent,
      pdf_sent_at: settings.pdf_link && !lead.pdf_sent ? new Date() : lead.pdf_sent_at,
      funnel_stage: settings.pdf_link ? 'pdf_enviado' : lead.funnel_stage
    },
    memoryPatch: {
      current_step: settings.pdf_link ? 'pdf_sent' : 'diagnostic_orientation',
      conversation_stage: settings.pdf_link ? 'pdf_enviado' : lead.funnel_stage,
      video_sent: Boolean(settings.video_link) || lead.video_sent,
      pdf_sent: Boolean(settings.pdf_link) || lead.pdf_sent
    },
    currentStep: settings.pdf_link ? 'pdf_sent' : 'diagnostic_orientation'
  });

  return result({ lead: updatedLead, conversation, reply: freeMaterialsMessage(settings) });
}

async function handleSpecialCases({ lead, conversation, classification }) {
  if (classification.isCrisis || classification.intent === 'crisis') {
    await updateLeadAndMemory({
      lead,
      conversation,
      leadFields: {
        funnel_stage: 'crisis',
        crisis_detected: true,
        bot_paused: true,
        human_takeover: true
      },
      memoryPatch: {
        current_step: 'crisis',
        conversation_stage: 'crisis',
        crisis_detected: true
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
      lead_status: 'perdido',
      closed_conversation: true,
      funnel_stage: 'cierre_frio'
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

async function handlePostLinkConversation({ lead, conversation, memory, history, body, settings }) {
  const link = settings.hotmart_link || env.HOTMART_LINK || 'https://pay.hotmart.com/T103515864E';

  if (detectPaymentReported(body)) {
    const updatedLead = await updateLeadAndMemory({
      lead,
      conversation,
      leadFields: {
        payment_status: 'reportado',
        funnel_stage: 'pago_reportado',
        purchase_intent: true
      },
      memoryPatch: {
        current_step: 'payment_reported',
        conversation_stage: 'pago_reportado'
      },
      currentStep: 'payment_reported'
    });

    await paymentService.reportPaymentByUser({
      leadId: updatedLead.id,
      phone: updatedLead.phone,
      paymentLink: link,
      amount: getSpecialPrice(settings),
      metadata: { source: 'bot_post_link' }
    });

    return result({ lead: updatedLead, conversation, reply: paymentReportedMessage(updatedLead) });
  }

  const updatedLead = await updateLeadAndMemory({
    lead,
    conversation,
    leadFields: {
      funnel_stage: 'post_link_conversacion'
    },
    memoryPatch: {
      current_step: 'post_link_conversation',
      conversation_stage: 'post_link_conversacion'
    },
    currentStep: 'post_link_conversation'
  });

  if (detectBotIdentityQuestion(body)) {
    return result({ lead: updatedLead, conversation, reply: botIdentityMessage() });
  }

  if (shouldAskForLinkAgain(body) || detectPurchaseIntent(body)) {
    return sendHotmart({ lead: updatedLead, conversation, settings });
  }

  if (detectThanksOrOk(body) || detectFarewell(body)) {
    return result({ lead: updatedLead, conversation, reply: softCloseMessage() });
  }

  const objection = detectObjection(body);
  if (objection && objection !== 'ninguna') {
    const leadWithObjection = await updateLeadAndMemory({
      lead: updatedLead,
      conversation,
      leadFields: {
        main_objection: objection,
        objection_type: objection,
        funnel_stage: 'objecion'
      },
      memoryPatch: {
        objection_type: objection,
        current_step: 'post_link_conversation'
      }
    });

    return result({
      lead: leadWithObjection,
      conversation,
      reply: objectionReplies[objection] || postLinkFallback(leadWithObjection)
    });
  }

  if (detectProgramDetailsIntent(body)) {
    return result({ lead: updatedLead, conversation, reply: offerMessage(settings, updatedLead) });
  }

  if (detectPriceIntent(body)) {
    return result({ lead: updatedLead, conversation, reply: priceOnlyMessage(settings) });
  }

  if (detectSummaryIntent(body)) {
    return result({ lead: updatedLead, conversation, reply: summaryMessage(settings) });
  }

  const reply = await generatePostLinkReply({
    lead: updatedLead,
    memory,
    history,
    userMessage: body,
    settings
  }).catch(() => postLinkFallback(updatedLead));

  return result({ lead: updatedLead, conversation, reply });
}

async function handleStep({ lead, conversation, memory, body, settings }) {
  const step = activeStep(lead, conversation, memory);

  if (lead.closed_conversation && !detectProgramDetailsIntent(body) && !detectPurchaseIntent(body) && !detectPriceIntent(body)) {
    return result({ lead, conversation, reply: farewellMessage() });
  }

  if (step === 'video_offered' || lead.funnel_stage === 'video_ofrecido') {
    if (detectAffirmative(body)) {
      return sendVideo({ lead, conversation, settings });
    }

    if (detectNegative(body)) {
      const updatedLead = await updateLeadAndMemory({
        lead,
        conversation,
        leadFields: {
          closed_conversation: true,
          funnel_stage: 'cierre_frio'
        },
        memoryPatch: {
          current_step: 'closed',
          conversation_stage: 'cierre_frio',
          closed_conversation: true
        },
        currentStep: 'closed'
      });
      return result({ lead: updatedLead, conversation, reply: videoDeclinedMessage() });
    }

    if (looksLikeEmotionalStory(body)) {
      return askDiagnostic({ lead, conversation, reply: directPainDiagnosticMessage(), body });
    }
  }

  if (step === 'video_sent' || lead.funnel_stage === 'video_enviado') {
    if (detectThanksOrOk(body)) {
      return result({ lead, conversation, reply: videoWaitingMessage() });
    }

    if (detectViewedVideo(body) || hasDiscoveryAgreement(body)) {
      return askDiagnostic({ lead, conversation, reply: diagnosticIntroMessage(), body });
    }

    if (looksLikeEmotionalStory(body)) {
      return askDiagnostic({ lead, conversation, reply: directPainDiagnosticMessage(), body });
    }
  }

  if (step === 'diagnostic_orientation' || lead.funnel_stage === 'diagnostico_orientativo') {
    return handleDiagnosticAnswer({ lead, conversation, body });
  }

  if (step === 'discovery' || lead.funnel_stage === 'descubrimiento_emocional') {
    if (hasDiscoveryAgreement(body)) {
      return offerPdf({ lead, conversation });
    }

    if (detectProgramDetailsIntent(body)) {
      return introduceProgram({ lead, conversation });
    }

    if (isUnknownOrigin(body)) {
      return result({ lead, conversation, reply: diagnosticUnknownMessage() });
    }
  }

  if (step === 'pdf_offered' || lead.funnel_stage === 'pdf_ofrecido') {
    if (detectAffirmative(body)) {
      return sendPdf({ lead, conversation, settings });
    }

    if (detectNegative(body)) {
      return introduceProgram({ lead, conversation });
    }
  }

  if (step === 'pdf_sent' || lead.funnel_stage === 'pdf_enviado') {
    if (detectThanksOrOk(body)) {
      return result({ lead, conversation, reply: pdfWaitingMessage() });
    }

    if (detectViewedPdf(body) || detectProgramDetailsIntent(body)) {
      return introduceProgram({ lead, conversation });
    }
  }

  if (step === 'program_intro') {
    if (detectAffirmative(body) || detectProgramDetailsIntent(body)) {
      return sendOffer({ lead, conversation, settings });
    }
  }

  if (step === 'offer_presented' || lead.funnel_stage === 'oferta_presentada') {
    if (detectAffirmative(body) || detectPurchaseIntent(body)) {
      return sendHotmart({ lead, conversation, settings });
    }

    if (detectThanksOrOk(body)) {
      return result({ lead, conversation, reply: softCloseMessage() });
    }
  }

  return null;
}

async function applyGeminiFields({ lead, conversation, aiReply }) {
  const fields = aiReply && aiReply.fieldsToUpdate ? aiReply.fieldsToUpdate : {};
  const safeFields = {};

  for (const key of ['name', 'email', 'username', 'main_pain', 'urgency', 'problem_duration', 'tried_before', 'objection_type']) {
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

  if (detectBotIdentityQuestion(body)) {
    return result({ lead, conversation, reply: botIdentityMessage() });
  }

  const classification = await classifyUserMessage({ message: body, lead, memory, history });
  classification.stopRequested = /^(stop|cancelar|no me escribas|no quiero mensajes|no me contacten)/i.test(body.trim());

  const specialReply = await handleSpecialCases({ lead, conversation, classification });
  if (specialReply) {
    return result({ lead: await leadService.getLeadById(lead.id), conversation, reply: specialReply });
  }

  lead = await leadService.getLeadById(lead.id);

  if (lead.hotmart_link_sent && lead.payment_status === 'pendiente') {
    return handlePostLinkConversation({ lead, conversation, memory, history, body, settings });
  }

  if (classification.wantsPaymentLink || detectPurchaseIntent(body)) {
    return sendHotmart({ lead, conversation, settings });
  }

  if (detectPriceIntent(body)) {
    return sendPriceOnly({ lead, conversation, settings });
  }

  if (detectSummaryIntent(body)) {
    return result({ lead, conversation, reply: summaryMessage(settings) });
  }

  if (detectFreeMaterialIntent(body) && !lead.hotmart_link_sent && !lead.video_sent && !lead.pdf_sent && lead.funnel_stage === 'inicio') {
    return sendFreeMaterials({ lead, conversation, settings });
  }

  const objection = classification.objection || detectObjection(body);
  if (objection && objection !== 'ninguna') {
    const updatedLead = await updateLeadAndMemory({
      lead,
      conversation,
      leadFields: {
        main_objection: objection,
        objection_type: objection,
        funnel_stage: 'objecion'
      },
      memoryPatch: {
        objection_type: objection,
        current_step: 'objection',
        conversation_stage: 'objecion'
      },
      currentStep: 'objection'
    });

    return result({ lead: updatedLead, conversation, reply: objectionReplies[objection] });
  }

  const stepReply = await handleStep({ lead, conversation, memory, body, settings });
  if (stepReply) {
    return stepReply;
  }

  if ((sourceKeyword || detectGreeting(body)) && lead.funnel_stage === 'inicio') {
    return offerVideo({ lead, conversation, settings, body });
  }

  if (looksLikeEmotionalStory(body) && !lead.offer_presented && !lead.hotmart_link_sent) {
    return askDiagnostic({ lead, conversation, reply: directPainDiagnosticMessage(), body });
  }

  if (detectProgramDetailsIntent(body)) {
    return introduceProgram({ lead, conversation });
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
    return sendHotmart({ lead: await leadService.getLeadById(lead.id), conversation, settings });
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
