const leadService = require('../services/leadService');
const messageService = require('../services/messageService');
const memoryService = require('../services/memoryService');
const settingsService = require('../services/settingsService');
const paymentService = require('../services/paymentService');
const followupService = require('../services/followupService');
const { classifyUserMessage } = require('../ai/intentClassifier');
const {
  generateHumanReply,
  generateStageReply,
  generatePostLinkReply,
  contextualFallbackReply
} = require('../ai/responseGenerator');
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

function lastOutboundMessage(history = []) {
  return [...(history || [])].reverse().find((item) => item.direction === 'outbound' && item.body);
}

function inferStepFromText(text) {
  const value = String(text || '').toLowerCase();

  if (!value) return null;
  if (/(quer[eé]s que te env[ií]e el video|quer[eé]s que te la env[ií]e|clase corta de 12 minutos|video ahora)/i.test(value)) {
    return 'video_offered';
  }
  if (/(video gratuito|miralo tranquila|miralo con calma|cuando termines)/i.test(value)) {
    return 'video_sent';
  }
  if (/(te hago dos preguntitas|viene desde hace mucho|empez[oó] hace poco|reacci[oó]n fuerte en el cuerpo)/i.test(value)) {
    return 'diagnostic_orientation';
  }
  if (/(tiene sentido esto|tiene sentido con lo que ven[ií]s sintiendo|memoria emocional|sistema nervioso puede activarse)/i.test(value)) {
    return 'discovery';
  }
  if (/(pdf corto|pdf gratuito|quer[eé]s que te lo env[ií]e|gu[ií]a simple)/i.test(value)) {
    return 'pdf_offered';
  }
  if (/(leelo con calma|cuando lo veas|parte sentiste m[aá]s cercana)/i.test(value)) {
    return 'pdf_sent';
  }
  if (/(quer[eé]s que te cuente c[oó]mo funciona|existe neurotraumas)/i.test(value)) {
    return 'program_intro';
  }
  if (/(precio especial|valor normal|incluye:|garant[ií]a de 14 d[ií]as|link de hotmart para verlo)/i.test(value)) {
    return 'offer_presented';
  }
  if (/(pay\.hotmart\.com|link seguro de hotmart|inscripci[oó]n)/i.test(value)) {
    return 'payment_link_sent';
  }

  return null;
}

function inferStepFromHistory(history = []) {
  const outbound = lastOutboundMessage(history);
  return inferStepFromText(outbound && outbound.body);
}

function stepToFunnelStage(step) {
  const map = {
    video_offered: 'video_ofrecido',
    video_sent: 'video_enviado',
    diagnostic_orientation: 'diagnostico_orientativo',
    discovery: 'descubrimiento_emocional',
    pdf_offered: 'pdf_ofrecido',
    pdf_sent: 'pdf_enviado',
    program_intro: 'descubrimiento_emocional',
    offer_presented: 'oferta_presentada',
    payment_link_sent: 'link_pago_enviado',
    post_link_conversation: 'post_link_conversacion',
    payment_reported: 'pago_reportado',
    closed: 'cierre_frio'
  };

  return map[step] || step || 'inicio';
}

function activeStep(lead, conversation, memory, history = []) {
  const storedStep = memory.current_step || conversation.current_step || lead.funnel_stage || 'inicio';
  const inferredStep = inferStepFromHistory(history);

  if ((!storedStep || storedStep === 'inicio') && inferredStep) {
    return inferredStep;
  }

  return storedStep;
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
  return /(pasame el link|mandame el link|enviame el link|link otra vez|no me llego|donde pago|quiero comprar|quiero inscribirme|me inscribo|inscribirme|inscripcion|inscripción|quiero pagar|perdi el link|perdí el link|link de pago|como pago)/.test(text);
}

function isOfferStage(lead) {
  return Boolean(lead && (
    lead.offer_presented
    || lead.funnel_stage === 'oferta_presentada'
    || lead.funnel_stage === 'objecion'
    || lead.funnel_stage === 'link_pago_enviado'
    || lead.funnel_stage === 'post_link_conversacion'
  ));
}

function shouldSendPaymentLinkNow({ lead, body }) {
  if (!detectPurchaseIntent(body)) return false;
  return isOfferStage(lead) || shouldAskForLinkAgain(body);
}

function lastBotAskedForVideo(lead, history = []) {
  const outbound = lastOutboundMessage(history);
  const text = lead && lead.last_bot_message ? lead.last_bot_message : (outbound && outbound.body);
  return /(video|clase corta|12 minutos|te la env[ií]e|te env[ií]e el video)/i.test(text || '');
}

async function buildStageReply({ lead, memory, history, body, settings, stage, objective, fallback }) {
  return generateStageReply({
    lead,
    memory,
    history,
    userMessage: body,
    stage,
    settings,
    objective,
    fallback
  });
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

async function offerVideo({ lead, conversation, settings, memory, history, body }) {
  const pain = detectPain(body);
  let fallback = firstMessage(settings, lead);

  if (pain || looksLikeEmotionalStory(body)) {
    fallback = problemWelcomeMessage(settings, lead);
  } else if (detectInitialKeyword(body) && !detectGreeting(body)) {
    fallback = infoWelcomeMessage(settings, lead);
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

  const reply = await buildStageReply({
    lead: updatedLead,
    memory,
    history,
    body,
    settings,
    stage: 'video_ofrecido',
    objective: 'Responder el primer mensaje del usuario de forma natural, presentarte como Marisa si corresponde y ofrecer la clase corta gratuita de 12 minutos. No vendas, no mandes Hotmart y no hagas diagnóstico completo todavía.',
    fallback
  });

  return result({ lead: updatedLead, conversation, reply });
}

async function sendVideo({ lead, conversation, settings, memory, history, body }) {
  const hasLink = Boolean(settings.video_link);
  const nextStep = hasLink ? 'video_sent' : 'diagnostic_orientation';
  const stage = hasLink ? 'video_enviado' : 'diagnostico_orientativo';
  const fallback = videoSentMessage(settings);

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

  const reply = await buildStageReply({
    lead: updatedLead,
    memory,
    history,
    body,
    settings,
    stage,
    objective: hasLink
      ? 'El usuario aceptó recibir el video. Envíale el video gratuito y dile que lo mire con calma. No vendas ni mandes Hotmart.'
      : 'El usuario aceptó avanzar, pero no hay link de video configurado. Avanza de forma natural al diagnóstico orientativo con dos preguntas cuidadosas. No menciones configuraciones internas.',
    fallback
  });

  return result({ lead: updatedLead, conversation, reply });
}

async function askDiagnostic({ lead, conversation, memory, history, settings, reply: fallback = diagnosticIntroMessage(), body }) {
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

  const reply = await buildStageReply({
    lead: updatedLead,
    memory,
    history,
    body,
    settings,
    stage: 'diagnostico_orientativo',
    objective: 'Responder lo que el usuario dijo y abrir diagnóstico orientativo con máximo dos preguntas: tiempo del problema y reacción corporal. No vendas y no mandes Hotmart.',
    fallback
  });

  return result({ lead: updatedLead, conversation, reply });
}

async function handleDiagnosticAnswer({ lead, conversation, memory, history, settings, body }) {
  let fallback = diagnosticUnknownMessage();

  if (isRecentProblem(body)) {
    fallback = diagnosticRecentMessage();
  } else if (isLongTermProblem(body) || hasBodyReaction(body)) {
    fallback = diagnosticLongMessage();
  } else if (isUnknownOrigin(body)) {
    fallback = diagnosticUnknownMessage();
  } else {
    fallback = diagnosticLongMessage();
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

  const reply = await buildStageReply({
    lead: updatedLead,
    memory,
    history,
    body,
    settings,
    stage: 'descubrimiento_emocional',
    objective: 'Responder de forma personalizada a lo que contó el usuario. Explica con cuidado que puede haber una respuesta aprendida del sistema nervioso o memoria emocional, sin diagnosticar. Cierra preguntando si le hace sentido.',
    fallback
  });

  return result({ lead: updatedLead, conversation, reply });
}

async function offerPdf({ lead, conversation, memory, history, settings, body }) {
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

  const reply = await buildStageReply({
    lead: updatedLead,
    memory,
    history,
    body,
    settings,
    stage: 'pdf_ofrecido',
    objective: 'El usuario dijo que le hace sentido. Valida brevemente y ofrece el PDF gratuito como siguiente paso. No vendas y no mandes Hotmart.',
    fallback: pdfOfferMessage()
  });

  return result({ lead: updatedLead, conversation, reply });
}

async function sendPdf({ lead, conversation, settings, memory, history, body }) {
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

  const reply = await buildStageReply({
    lead: updatedLead,
    memory,
    history,
    body,
    settings,
    stage,
    objective: hasLink
      ? 'El usuario aceptó recibir el PDF. Envíale el PDF gratuito y pide que luego cuente qué parte conectó con su caso. No vendas.'
      : 'El usuario aceptó el PDF, pero no hay link configurado. Continúa de forma humana hacia la comprensión de su caso y pregunta si quiere que le cuentes cómo funciona Neurotraumas. No menciones configuraciones internas.',
    fallback: pdfSentMessage(settings)
  });

  return result({ lead: updatedLead, conversation, reply });
}

async function introduceProgram({ lead, conversation, memory, history, settings, body }) {
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

  const reply = await buildStageReply({
    lead: updatedLead,
    memory,
    history,
    body,
    settings,
    stage: 'descubrimiento_emocional',
    objective: 'El usuario está listo para entender el programa. Conecta lo que contó con Neurotraumas y pregunta si quiere que le expliques cómo funciona. No mandes Hotmart todavía.',
    fallback: programIntroMessage()
  });

  return result({ lead: updatedLead, conversation, reply });
}

async function sendOffer({ lead, conversation, settings, memory, history, body }) {
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

  const reply = await buildStageReply({
    lead: updatedLead,
    memory,
    history,
    body,
    settings,
    stage: 'oferta_presentada',
    objective: 'Presenta la oferta completa de Neurotraumas con precio normal, precio especial, duración, inclusiones, acceso de por vida, Hotmart y garantía. Termina preguntando si quiere el link para verlo con calma. No mandes el link todavía.',
    fallback: offerMessage(settings, updatedLead)
  });

  return result({ lead: updatedLead, conversation, reply });
}

async function sendHotmart({ lead, conversation, settings, memory, history, body }) {
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

  const reply = await buildStageReply({
    lead: updatedLead,
    memory,
    history,
    body,
    settings,
    stage: 'link_pago_enviado',
    objective: `El usuario ya pidió el link, quiere comprar o aceptó después de la oferta. Envíale el link oficial de Hotmart una sola vez: ${link}. Menciona precio especial, garantía y que puede escribir si tiene dudas.`,
    fallback: hotmartMessage(updatedLead, link, settings)
  });

  return result({ lead: updatedLead, conversation, reply });
}

async function sendPriceOnly({ lead, conversation, settings, memory, history, body }) {
  const updatedLead = await updateLeadAndMemory({
    lead,
    conversation,
    leadFields: {
      funnel_stage: lead.funnel_stage === 'inicio' ? 'oferta_presentada' : lead.funnel_stage
    },
    memoryPatch: {
      current_step: activeStep(lead, conversation, {}, history),
      last_price_answered: true
    }
  });

  const reply = await buildStageReply({
    lead: updatedLead,
    memory,
    history,
    body,
    settings,
    stage: updatedLead.funnel_stage,
    objective: 'El usuario preguntó precio. Responde directo con precio normal y precio especial, incluye de forma breve qué contiene el programa y pregunta si quiere el link para revisar en Hotmart. No mandes el link aún.',
    fallback: priceOnlyMessage(settings)
  });

  return result({ lead: updatedLead, conversation, reply });
}

async function sendFreeMaterials({ lead, conversation, settings, memory, history, body }) {
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

  const reply = await buildStageReply({
    lead: updatedLead,
    memory,
    history,
    body,
    settings,
    stage: updatedLead.funnel_stage,
    objective: 'El usuario pidió material gratuito. Responde con naturalidad y comparte video/PDF solo si existen links configurados. Si no existen, orienta con una pregunta útil. No menciones configuraciones internas y no vendas.',
    fallback: freeMaterialsMessage(settings)
  });

  return result({ lead: updatedLead, conversation, reply });
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
    return sendHotmart({ lead: updatedLead, conversation, settings, memory, history, body });
  }

  if (detectAffirmative(body)) {
    return result({ lead: updatedLead, conversation, reply: softCloseMessage() });
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

    const reply = await buildStageReply({
      lead: leadWithObjection,
      memory,
      history,
      body,
      settings,
      stage: 'objecion',
      objective: `El usuario expresó una objeción de tipo "${objection}" después de recibir el link. Responde a su duda concreta con empatía, sin presionar y sin repetir el link salvo que lo pida.`,
      fallback: objectionReplies[objection] || postLinkFallback(leadWithObjection)
    });

    return result({ lead: leadWithObjection, conversation, reply });
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

async function handleStep({ lead, conversation, memory, history, body, settings }) {
  const step = activeStep(lead, conversation, memory, history);
  const inferredStep = inferStepFromHistory(history);

  if (lead.closed_conversation && !detectProgramDetailsIntent(body) && !detectPurchaseIntent(body) && !detectPriceIntent(body)) {
    return result({ lead, conversation, reply: farewellMessage() });
  }

  if (lead.funnel_stage === 'inicio' && inferredStep && inferredStep !== 'video_offered') {
    await updateLeadAndMemory({
      lead,
      conversation,
      leadFields: {
        funnel_stage: stepToFunnelStage(inferredStep)
      },
      memoryPatch: {
        current_step: inferredStep,
        conversation_stage: inferredStep
      },
      currentStep: inferredStep
    });
  }

  if (lead.funnel_stage === 'inicio' && detectAffirmative(body) && lastBotAskedForVideo(lead, history)) {
    return sendVideo({ lead, conversation, settings, memory, history, body });
  }

  if (step === 'pain_selection' || lead.funnel_stage === 'captacion') {
    if (detectPain(body) || detectAffirmative(body) || looksLikeEmotionalStory(body)) {
      return askDiagnostic({
        lead,
        conversation,
        memory,
        history,
        settings,
        reply: detectAffirmative(body) ? diagnosticIntroMessage() : directPainDiagnosticMessage(),
        body
      });
    }
  }

  if (['pain_followup', 'diagnostic_change', 'diagnostic_duration', 'diagnostic_tried', 'diagnostic_urgency'].includes(step)) {
    return handleDiagnosticAnswer({ lead, conversation, memory, history, settings, body });
  }

  if (step === 'video_offered' || lead.funnel_stage === 'video_ofrecido') {
    if (detectAffirmative(body)) {
      return sendVideo({ lead, conversation, settings, memory, history, body });
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
      return askDiagnostic({ lead, conversation, memory, history, settings, reply: directPainDiagnosticMessage(), body });
    }
  }

  if (step === 'video_sent' || lead.funnel_stage === 'video_enviado') {
    if (detectThanksOrOk(body)) {
      return result({ lead, conversation, reply: videoWaitingMessage() });
    }

    if (detectViewedVideo(body) || hasDiscoveryAgreement(body)) {
      return askDiagnostic({ lead, conversation, memory, history, settings, reply: diagnosticIntroMessage(), body });
    }

    if (looksLikeEmotionalStory(body)) {
      return askDiagnostic({ lead, conversation, memory, history, settings, reply: directPainDiagnosticMessage(), body });
    }
  }

  if (step === 'diagnostic_orientation' || lead.funnel_stage === 'diagnostico_orientativo') {
    return handleDiagnosticAnswer({ lead, conversation, memory, history, settings, body });
  }

  if (step === 'discovery' || lead.funnel_stage === 'descubrimiento_emocional') {
    if (hasDiscoveryAgreement(body)) {
      return offerPdf({ lead, conversation, memory, history, settings, body });
    }

    if (detectProgramDetailsIntent(body)) {
      return introduceProgram({ lead, conversation, memory, history, settings, body });
    }

    if (isUnknownOrigin(body)) {
      return result({ lead, conversation, reply: diagnosticUnknownMessage() });
    }
  }

  if (step === 'pdf_offered' || lead.funnel_stage === 'pdf_ofrecido') {
    if (detectAffirmative(body)) {
      return sendPdf({ lead, conversation, settings, memory, history, body });
    }

    if (detectNegative(body)) {
      return introduceProgram({ lead, conversation, memory, history, settings, body });
    }
  }

  if (step === 'pdf_sent' || lead.funnel_stage === 'pdf_enviado') {
    if (detectThanksOrOk(body)) {
      return result({ lead, conversation, reply: pdfWaitingMessage() });
    }

    if (detectViewedPdf(body) || detectProgramDetailsIntent(body)) {
      return introduceProgram({ lead, conversation, memory, history, settings, body });
    }
  }

  if (step === 'program_intro') {
    if (detectAffirmative(body) || detectProgramDetailsIntent(body)) {
      return sendOffer({ lead, conversation, settings, memory, history, body });
    }
  }

  if (step === 'offer_presented' || lead.funnel_stage === 'oferta_presentada') {
    if (detectAffirmative(body) || detectPurchaseIntent(body)) {
      return sendHotmart({ lead, conversation, settings, memory, history, body });
    }

    if (detectThanksOrOk(body)) {
      return result({ lead, conversation, reply: softCloseMessage() });
    }
  }

  if (step && step !== 'inicio') {
    const stage = stepToFunnelStage(step);
    const reply = await buildStageReply({
      lead,
      memory,
      history,
      body,
      settings,
      stage,
      objective: `La conversación ya está en la etapa "${stage}". Responde exactamente a lo que el usuario dijo, sin reiniciar, sin repetir bienvenida y sin saltar a venta. Avanza solo si su mensaje lo permite.`,
      fallback: contextualFallbackReply({ lead, userMessage: body, stage, settings })
    });

    return result({ lead, conversation, reply });
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
  const lastOutbound = lastOutboundMessage(history);

  console.log('Conversation state resolved', {
    leadId: lead.id,
    funnel_stage: lead.funnel_stage,
    conversation_step: conversation.current_step,
    memory_step: memory.current_step,
    inferred_step: inferStepFromHistory(history),
    last_bot_preview: lastOutbound && lastOutbound.body ? String(lastOutbound.body).slice(0, 120) : null
  });

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

  const stepReply = await handleStep({ lead, conversation, memory, history, body, settings });
  if (stepReply) {
    return stepReply;
  }

  if (shouldSendPaymentLinkNow({ lead, body })) {
    return sendHotmart({ lead, conversation, settings, memory, history, body });
  }

  if (detectPriceIntent(body)) {
    return sendPriceOnly({ lead, conversation, settings, memory, history, body });
  }

  if (detectSummaryIntent(body)) {
    return result({ lead, conversation, reply: summaryMessage(settings) });
  }

  if (detectFreeMaterialIntent(body) && !lead.hotmart_link_sent && !lead.video_sent && !lead.pdf_sent && lead.funnel_stage === 'inicio') {
    return sendFreeMaterials({ lead, conversation, settings, memory, history, body });
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

    const reply = await buildStageReply({
      lead: updatedLead,
      memory,
      history,
      body,
      settings,
      stage: 'objecion',
      objective: `El usuario expresó una objeción de tipo "${objection}". Responde a lo que dijo, valida su preocupación, aclara lo necesario y termina con una pregunta suave. No mandes Hotmart todavía.`,
      fallback: objectionReplies[objection]
    });

    return result({ lead: updatedLead, conversation, reply });
  }

  if ((sourceKeyword || detectGreeting(body)) && lead.funnel_stage === 'inicio') {
    return offerVideo({ lead, conversation, settings, memory, history, body });
  }

  if (lead.funnel_stage === 'inicio' && detectAffirmative(body)) {
    return offerVideo({ lead, conversation, settings, memory, history, body });
  }

  if (looksLikeEmotionalStory(body) && !lead.offer_presented && !lead.hotmart_link_sent) {
    return askDiagnostic({ lead, conversation, memory, history, settings, reply: directPainDiagnosticMessage(), body });
  }

  if (detectProgramDetailsIntent(body)) {
    return introduceProgram({ lead, conversation, memory, history, settings, body });
  }

  if (lead.funnel_stage === 'inicio') {
    return offerVideo({ lead, conversation, settings, memory, history, body });
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

  if ((aiStructured.shouldSendHotmartLink || aiStructured.detectedIntent === 'compra') && shouldSendPaymentLinkNow({ lead, body })) {
    return sendHotmart({ lead: await leadService.getLeadById(lead.id), conversation, settings, memory, history, body });
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
