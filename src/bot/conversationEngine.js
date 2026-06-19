const leadService = require('../services/leadService');
const messageService = require('../services/messageService');
const memoryService = require('../services/memoryService');
const settingsService = require('../services/settingsService');
const paymentService = require('../services/paymentService');
const followupService = require('../services/followupService');
const { generateNeuroReply } = require('../ai/responseGenerator');
const { normalizeUserProvidedPhone } = require('../utils/normalizePhone');
const { addHours } = require('../utils/date');
const { env } = require('../config/env');
const {
  normalizeText,
  detectInitialKeyword,
  detectGreeting,
  detectPain,
  detectPurchaseIntent,
  detectDeleteRequest,
  detectStopRequest,
  detectHumanRequest,
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
  detectFarewell,
  detectUrgency
} = require('./intentDetector');
const { detectObjection } = require('./objectionDetector');
const { detectCrisis } = require('./safety');
const { buildPaymentFollowUps } = require('./followUps');

const STAGE_ALIASES = {
  video_offered: 'video_ofrecido',
  video_sent: 'video_enviado',
  diagnostic_orientation: 'diagnostico_orientativo',
  diagnostic_change: 'diagnostico_orientativo',
  diagnostic_duration: 'diagnostico_orientativo',
  diagnostic_tried: 'diagnostico_orientativo',
  diagnostic_urgency: 'diagnostico_orientativo',
  pain_followup: 'diagnostico_orientativo',
  pain_selection: 'diagnostico_orientativo',
  captacion: 'diagnostico_orientativo',
  discovery: 'descubrimiento_emocional',
  pdf_offered: 'pdf_ofrecido',
  pdf_sent: 'pdf_enviado',
  pdf_no_configurado: 'programa',
  program_intro: 'programa',
  offer_presented: 'oferta_presentada',
  payment_link_sent: 'link_pago_enviado',
  post_link_conversation: 'post_link_conversacion',
  payment_reported: 'pago_reportado',
  closed: 'cierre_frio',
  cierre_positivo: 'post_link_conversacion',
  onboarding: 'pago_reportado'
};

const STAGE_RANK = {
  inicio: 0,
  video_ofrecido: 10,
  video_enviado: 20,
  diagnostico_orientativo: 30,
  descubrimiento_emocional: 40,
  pdf_ofrecido: 50,
  pdf_enviado: 60,
  programa: 70,
  oferta_presentada: 80,
  objecion: 85,
  link_pago_enviado: 90,
  post_link_conversacion: 95,
  pago_reportado: 100,
  cierre_frio: 110,
  crisis: 120
};

function memoryObject(memoryRow) {
  return memoryRow && memoryRow.memory ? memoryRow.memory : {};
}

function cleanObject(value) {
  return Object.fromEntries(
    Object.entries(value || {}).filter(([, entry]) => entry !== undefined)
  );
}

function normalizeStage(value) {
  if (!value) return null;
  const normalized = String(value).trim();
  return STAGE_ALIASES[normalized] || normalized;
}

function lastOutboundMessage(history = []) {
  return [...(history || [])].reverse().find((item) => item.direction === 'outbound' && item.body);
}

function inferStageFromText(value) {
  const text = normalizeText(value);
  if (!text) return null;

  if (/pay hotmart|pay\.hotmart|https?:\/\/pay/.test(text)) {
    return 'link_pago_enviado';
  }
  if (/precio especial|garantia de 14 dias|valor normal|incluye 12 semanas|acceso de por vida/.test(text)) return 'oferta_presentada';
  if (/como funciona neurotraumas|programa de 12 semanas|neurotraumas es un proceso/.test(text)) return 'programa';
  if (/pdf gratuito|pdf corto|guia simple|te envio el pdf/.test(text)) return 'pdf_ofrecido';
  if (/cuando lo leas|cuando lo veas|lee el pdf|te dejo el pdf/.test(text)) return 'pdf_enviado';
  if (/memoria emocional|sistema nervioso|tiene sentido|respuesta aprendida|herida emocional/.test(text)) return 'descubrimiento_emocional';
  if (/viene desde hace mucho|empezo hace poco|mente o en el cuerpo|diagnostico orientativo|dos preguntas/.test(text)) return 'diagnostico_orientativo';
  if (/video gratuito|clase corta|12 minutos|cuando termines|miralo con calma/.test(text)) return 'video_enviado';
  if (/quieres que te envie el video|quieres recibir el video|video ahora/.test(text)) return 'video_ofrecido';

  return null;
}

function pickFurthestStage(stages) {
  return stages
    .map(normalizeStage)
    .filter((stage) => stage && Object.prototype.hasOwnProperty.call(STAGE_RANK, stage))
    .sort((a, b) => STAGE_RANK[b] - STAGE_RANK[a])[0] || 'inicio';
}

function resolveStage({ lead, conversation, memory, history }) {
  const inferred = inferStageFromText(lastOutboundMessage(history) && lastOutboundMessage(history).body);
  const candidates = [
    lead && lead.funnel_stage,
    conversation && conversation.current_step,
    memory && memory.current_step,
    memory && memory.conversation_stage,
    inferred
  ];

  if (lead && lead.crisis_detected) return 'crisis';
  if (lead && lead.payment_status === 'reportado') return 'pago_reportado';

  if (lead && lead.hotmart_link_sent) {
    const afterLink = pickFurthestStage(candidates);
    return STAGE_RANK[afterLink] >= STAGE_RANK.link_pago_enviado ? afterLink : 'link_pago_enviado';
  }

  if (lead && lead.offer_presented) candidates.push('oferta_presentada');
  if (lead && lead.pdf_sent) candidates.push('pdf_enviado');
  if (lead && lead.video_sent) candidates.push('video_enviado');

  return pickFurthestStage(candidates);
}

function looksLikeEmotionalStory(message) {
  const text = normalizeText(message);
  return Boolean(detectPain(message))
    || /(me pasa|siento|tengo|no puedo|lloro|miedo|ansiedad|bloqueo|pecho|garganta|taquicardia|pareja|apego|culpa|triste|soltar|abandono|rechazo|trauma|autosabotaje|pensamientos|cansancio|estres|dolor)/.test(text);
}

function hasDiscoveryAgreement(message) {
  const text = normalizeText(message);
  return detectAffirmative(message)
    || /(tiene sentido|exacto|eso me pasa|asi me siento|puede ser|totalmente|me identifico|lo entiendo|si me pasa)/.test(text);
}

function detectIntent(message) {
  const objection = detectObjection(message);
  const pain = detectPain(message);

  if (detectCrisis(message)) return 'crisis';
  if (detectDeleteRequest(message)) return 'delete';
  if (detectStopRequest(message)) return 'stop';
  if (detectHumanRequest(message)) return 'human';
  if (detectBotIdentityQuestion(message)) return 'bot_identity';
  if (detectPaymentReported(message)) return 'payment_reported';
  if (detectPurchaseIntent(message)) return 'payment_link';
  if (detectPriceIntent(message)) return 'price';
  if (objection && objection !== 'ninguna') return 'objection';
  if (detectViewedVideo(message)) return 'viewed_video';
  if (detectViewedPdf(message)) return 'viewed_pdf';
  if (detectProgramDetailsIntent(message)) return 'program_details';
  if (detectFreeMaterialIntent(message)) return 'free_material';
  if (detectSummaryIntent(message)) return 'summary';
  if (detectFarewell(message)) return 'farewell';
  if (detectThanksOrOk(message)) return 'thanks';
  if (detectNegative(message)) return 'negative';
  if (detectAffirmative(message)) return 'affirmative';
  if (pain) return `pain:${pain}`;
  if (detectInitialKeyword(message)) return 'info';
  if (detectGreeting(message)) return 'greeting';
  if (looksLikeEmotionalStory(message)) return 'emotional_story';

  return 'other';
}

function isPainIntent(intent) {
  return intent && (intent.startsWith('pain:') || intent === 'emotional_story');
}

function isReopeningIntent(intent) {
  return [
    'greeting',
    'info',
    'payment_link',
    'price',
    'program_details',
    'free_material',
    'summary',
    'affirmative'
  ].includes(intent) || isPainIntent(intent);
}

function asksForVideo(message) {
  return /(video|clase|12 minutos)/.test(normalizeText(message));
}

function asksForPdf(message) {
  return /(pdf|guia|material escrito|documento)/.test(normalizeText(message));
}

function getAmount(settings = {}) {
  const raw = settings.product_special_price || settings.product_price || env.PRODUCT_SPECIAL_PRICE || 270;
  const amount = Number(String(raw).replace(/[^\d.]/g, ''));
  return Number.isFinite(amount) && amount > 0 ? amount : 270;
}

function getHotmartLink(settings = {}) {
  return settings.hotmart_link || env.HOTMART_LINK || 'https://pay.hotmart.com/T103515864E';
}

function getSpecialPrice(settings = {}) {
  return settings.product_special_price || settings.product_price || env.PRODUCT_SPECIAL_PRICE || 270;
}

function collectLeadFields(body, lead, intent) {
  const fields = {};
  const phone = normalizeUserProvidedPhone(body);
  const pain = detectPain(body);
  const urgency = detectUrgency(body);
  const objection = detectObjection(body);
  const text = normalizeText(body);

  if (phone && !lead.phone) {
    fields.phone = phone;
    fields.display_phone = phone;
  }

  if (pain && pain !== 'informacion' && !lead.main_pain) fields.main_pain = pain;
  if (urgency && !lead.urgency) fields.urgency = urgency;
  if (objection && objection !== 'ninguna') {
    fields.main_objection = objection;
    fields.objection_type = objection;
  }

  if (!lead.problem_duration && /(mes|ano|anos|año|años|semana|dia|dias|vida|siempre|hace mucho|hace poco)/.test(text)) {
    fields.problem_duration = String(body).slice(0, 180);
  }

  if (!lead.tried_before && /(terapia|curso|meditacion|meditacion|nada|probe|probado|intente|intentado|psicologo|psicologa)/.test(text)) {
    fields.tried_before = String(body).slice(0, 180);
  }

  if (!lead.emotional_response && (isPainIntent(intent) || looksLikeEmotionalStory(body)) && String(body).trim().length > 2) {
    fields.emotional_response = String(body).slice(0, 500);
  }

  return fields;
}

function memoryPatchFor({ body, intent, nextStage, leadFields = {}, extra = {} }) {
  return cleanObject({
    ...leadFields,
    ...extra,
    current_step: nextStage,
    conversation_stage: nextStage,
    last_intent: intent,
    last_user_message: body,
    last_interaction_at: new Date().toISOString()
  });
}

async function persistState({ lead, conversation, stage, leadFields = {}, memoryPatch = {}, summary }) {
  const fields = cleanObject({
    ...leadFields,
    funnel_stage: stage
  });

  let updatedLead = lead;
  if (Object.keys(fields).length > 0) {
    updatedLead = await leadService.updateLead(lead.id, fields);
  }

  await memoryService.upsertMemory({
    leadId: updatedLead.id,
    phone: updatedLead.phone || updatedLead.display_phone || updatedLead.whatsapp_id,
    memoryPatch: {
      ...memoryPatch,
      current_step: stage,
      conversation_stage: stage
    },
    summary
  });

  await messageService.updateConversation(conversation.id, {
    current_step: stage,
    expires_at: addHours(new Date(), env.MEMORY_EXPIRATION_HOURS)
  });

  return updatedLead;
}

function repeatedOrBad(reply, lead) {
  const current = normalizeText(reply);
  const last = normalizeText(lead && lead.last_bot_message);
  if (!current) return true;
  if (/^te leo\b/.test(current)) return true;
  if (!last) return false;
  if (current === last) return true;
  if (last.length >= 80 && current.includes(last.slice(0, 80))) return true;
  if (current.length >= 80 && last.includes(current.slice(0, 80))) return true;
  return false;
}

function replacementReply(stage, intent, settings) {
  const price = getSpecialPrice(settings);
  const link = getHotmartLink(settings);

  if (intent === 'payment_link') {
    return [
      'Claro. Te dejo el link seguro de Hotmart:',
      '',
      link,
      '',
      `El precio especial es de $${price} USD y tienes garantia de 14 dias.`
    ].join('\n');
  }

  if (stage === 'video_ofrecido' || stage === 'inicio') {
    return 'Para avanzar sin repetir el saludo: que sientes que hoy te esta afectando mas, ansiedad, bloqueo, pensamientos repetitivos, relaciones dificiles o autosabotaje?';
  }

  if (stage === 'diagnostico_orientativo') {
    return 'Para ubicarlo mejor: esto viene desde hace mucho tiempo o empezo hace poco? Y cuando aparece, lo notas mas en la mente o en el cuerpo?';
  }

  if (stage === 'descubrimiento_emocional') {
    return 'Lo tomo desde lo que me dices. Sientes que esto se activa mas en relaciones, en momentos de soledad o cuando aparece algun recuerdo?';
  }

  if (stage === 'oferta_presentada' || stage === 'programa') {
    return `Lo resumo sin repetir todo: Neurotraumas dura 12 semanas, tiene acceso de por vida en Hotmart, acompanamiento y garantia de 14 dias. El precio especial es de $${price} USD. Quieres revisar el contenido, la garantia o la inscripcion?`;
  }

  if (stage === 'link_pago_enviado' || stage === 'post_link_conversacion') {
    return 'Ya tienes el link de Hotmart. Dime que duda quieres resolver ahora: pago, acceso, garantia, contenido o si aplica para tu caso?';
  }

  return 'Para avanzar sin repetirnos, respondeme con lo que quieres revisar ahora: tu caso, el programa, el precio o el acceso.';
}

function result({ lead, conversation, reply, whatsappId, stage, intent, settings }) {
  if (!reply) {
    return {
      leadId: lead.id,
      conversationId: conversation.id,
      whatsappId: lead.whatsapp_id || whatsappId,
      reply: null
    };
  }

  return {
    leadId: lead.id,
    conversationId: conversation.id,
    whatsappId: lead.whatsapp_id || whatsappId,
    reply: repeatedOrBad(reply, lead) ? replacementReply(stage || lead.funnel_stage, intent, settings) : reply
  };
}

async function replyWithAI({
  lead,
  conversation,
  memory,
  history,
  body,
  settings,
  currentStage,
  nextStage,
  intent,
  objective,
  requiredFacts,
  leadFields = {},
  memoryExtra = {},
  summary,
  whatsappId
}) {
  const automaticFields = collectLeadFields(body, lead, intent);
  const finalLeadFields = cleanObject({
    ...automaticFields,
    ...leadFields,
    consent_24h: true,
    memory_expires_at: addHours(new Date(), env.MEMORY_EXPIRATION_HOURS)
  });
  const finalMemoryPatch = memoryPatchFor({
    body,
    intent,
    nextStage,
    leadFields: finalLeadFields,
    extra: memoryExtra
  });

  const updatedLead = await persistState({
    lead,
    conversation,
    stage: nextStage,
    leadFields: finalLeadFields,
    memoryPatch: finalMemoryPatch,
    summary
  });

  const nextMemory = {
    ...memory,
    ...finalMemoryPatch,
    current_step: nextStage,
    conversation_stage: nextStage
  };

  const reply = await generateNeuroReply({
    lead: updatedLead,
    memory: nextMemory,
    history,
    userMessage: body,
    stage: currentStage,
    nextStage,
    intent,
    objective,
    requiredFacts,
    settings
  });

  return result({
    lead: updatedLead,
    conversation,
    reply,
    whatsappId,
    stage: nextStage,
    intent,
    settings
  });
}

async function fixedReply({ lead, conversation, stage, leadFields, memoryPatch, reply, whatsappId }) {
  const updatedLead = await persistState({
    lead,
    conversation,
    stage,
    leadFields,
    memoryPatch
  });

  return result({
    lead: updatedLead,
    conversation,
    reply,
    whatsappId,
    stage,
    intent: stage
  });
}

async function handleDelete({ lead, conversation, whatsappId }) {
  await memoryService.deleteMemoryByLeadId(lead.id);
  const updatedLead = await leadService.updateLead(lead.id, {
    consent_24h: false,
    memory_expires_at: null,
    funnel_stage: 'inicio'
  });
  await messageService.updateConversation(conversation.id, {
    current_step: 'inicio',
    expires_at: addHours(new Date(), env.MEMORY_EXPIRATION_HOURS)
  });

  return result({
    lead: updatedLead,
    conversation,
    whatsappId,
    stage: 'inicio',
    intent: 'delete',
    reply: 'Entiendo. Ya borre la memoria temporal de esta conversacion.'
  });
}

async function handlePaymentReported({ lead, conversation, memory, history, body, settings, currentStage, whatsappId }) {
  const link = getHotmartLink(settings);
  const updatedLead = await persistState({
    lead,
    conversation,
    stage: 'pago_reportado',
    leadFields: {
      payment_status: 'reportado',
      purchase_intent: true
    },
    memoryPatch: memoryPatchFor({
      body,
      intent: 'payment_reported',
      nextStage: 'pago_reportado',
      extra: { payment_status: 'reportado' }
    })
  });

  await paymentService.reportPaymentByUser({
    leadId: updatedLead.id,
    phone: updatedLead.phone,
    paymentLink: link,
    amount: getAmount(settings),
    metadata: { source: 'bot_payment_reported' }
  });

  const reply = await generateNeuroReply({
    lead: updatedLead,
    memory: { ...memory, payment_status: 'reportado' },
    history,
    userMessage: body,
    stage: currentStage,
    nextStage: 'pago_reportado',
    intent: 'payment_reported',
    objective: 'El usuario dice que ya pago o se inscribio. Agradece, pide confirmacion de Hotmart o correo de inscripcion y explica que se revisara el acceso.',
    settings
  });

  return result({
    lead: updatedLead,
    conversation,
    reply,
    whatsappId,
    stage: 'pago_reportado',
    intent: 'payment_reported',
    settings
  });
}

async function sendHotmartLink({ lead, conversation, memory, history, body, settings, currentStage, whatsappId }) {
  const link = getHotmartLink(settings);
  const amount = getAmount(settings);
  const wasAlreadySent = Boolean(lead.hotmart_link_sent);

  const updatedLead = await persistState({
    lead,
    conversation,
    stage: 'link_pago_enviado',
    leadFields: {
      purchase_intent: true,
      hotmart_link_sent: true,
      hotmart_link_sent_at: lead.hotmart_link_sent_at || new Date(),
      payment_status: lead.payment_status || 'pendiente'
    },
    memoryPatch: memoryPatchFor({
      body,
      intent: 'payment_link',
      nextStage: 'link_pago_enviado',
      extra: {
        purchase_intent: true,
        hotmart_link_sent: true,
        hotmart_link: link
      }
    })
  });

  if (!wasAlreadySent) {
    await paymentService.createPayment({
      leadId: updatedLead.id,
      phone: updatedLead.phone,
      paymentLink: link,
      amount,
      metadata: { source: 'bot_hotmart_link' }
    });

    await followupService.createFollowUps(
      buildPaymentFollowUps(updatedLead, link).map((item) => ({
        ...item,
        leadId: updatedLead.id,
        phone: updatedLead.phone,
        whatsappId: updatedLead.whatsapp_id
      }))
    );
  }

  const reply = await generateNeuroReply({
    lead: updatedLead,
    memory: { ...memory, hotmart_link_sent: true, hotmart_link: link },
    history,
    userMessage: body,
    stage: currentStage,
    nextStage: 'link_pago_enviado',
    intent: 'payment_link',
    objective: wasAlreadySent
      ? 'El usuario pidio nuevamente el link de pago. Reenvia el link oficial de Hotmart y responde de forma breve.'
      : 'El usuario pidio comprar, pagar, inscribirse o recibir el link. Envia el link oficial de Hotmart. No hagas diagnostico adicional.',
    requiredFacts: [
      `Incluye este link exacto: ${link}`,
      `Precio especial: $${getSpecialPrice(settings)} USD.`,
      'Garantia: 14 dias.',
      'Indica que puede escribir si tiene dudas sobre pago, acceso o contenido.'
    ].join('\n'),
    settings
  });

  return result({
    lead: updatedLead,
    conversation,
    reply,
    whatsappId,
    stage: 'link_pago_enviado',
    intent: 'payment_link',
    settings
  });
}

async function startConversation(context) {
  return replyWithAI({
    ...context,
    nextStage: 'video_ofrecido',
    intent: context.intent || 'inicio',
    objective: [
      'Responder el primer contacto sin vender.',
      'Si el usuario saludo o pidio informacion, presentate brevemente como Marisa/equipo de Marisa.',
      'Explica que antes de enviar informacion quieres entender que le pasa.',
      'Ofrece avanzar con una clase corta gratuita de 12 minutos o pregunta que le afecta mas.',
      'No mandes Hotmart.'
    ].join(' '),
    requiredFacts: 'Menciona la memoria temporal de 24 horas solo de forma breve si corresponde. Si no quiere memoria, puede escribir BORRAR.',
    leadFields: {
      closed_conversation: false
    }
  });
}

async function askDiagnostic(context) {
  return replyWithAI({
    ...context,
    nextStage: 'diagnostico_orientativo',
    objective: [
      'Responder a lo que el usuario acaba de decir.',
      'No vendas.',
      'Haz diagnostico orientativo con maximo dos preguntas: hace cuanto viene pasando y si lo nota mas en mente o cuerpo.'
    ].join(' '),
    requiredFacts: 'No diagnostiques clinicamente. Solo orienta para entender mejor su caso.'
  });
}

async function sendVideoOrDiagnostic(context) {
  const { settings } = context;

  if (settings.video_link) {
    return replyWithAI({
      ...context,
      nextStage: 'video_enviado',
      intent: 'send_video',
      objective: 'El usuario acepto recibir el video gratuito. Envia el link del video y dile que lo mire con calma. No vendas ni mandes Hotmart.',
      requiredFacts: `Incluye este link exacto del video: ${settings.video_link}`,
      leadFields: {
        video_sent: true,
        video_sent_at: new Date()
      },
      memoryExtra: {
        video_sent: true,
        video_link: settings.video_link
      }
    });
  }

  return replyWithAI({
    ...context,
    nextStage: 'diagnostico_orientativo',
    intent: 'affirmative',
    objective: 'El usuario acepto avanzar, pero no hay link de video disponible. No menciones configuracion. Continua con una pregunta diagnostica natural.',
    requiredFacts: 'No inventes un link de video.'
  });
}

async function explainDiscovery(context) {
  return replyWithAI({
    ...context,
    nextStage: 'descubrimiento_emocional',
    objective: [
      'Responder de forma personalizada a lo que conto el usuario.',
      'Explica con cuidado que a veces el sistema nervioso mantiene respuestas aprendidas o memoria emocional.',
      'No diagnostiques ni vendas.',
      'Cierra preguntando si eso le hace sentido o donde se le activa mas.'
    ].join(' ')
  });
}

async function offerPdfOrProgram(context) {
  const { settings } = context;

  if (settings.pdf_link) {
    return replyWithAI({
      ...context,
      nextStage: 'pdf_ofrecido',
      intent: 'offer_pdf',
      objective: 'El usuario conecto con la explicacion. Valida brevemente y ofrece un PDF gratuito como siguiente paso. No vendas ni mandes Hotmart.',
      requiredFacts: 'Pregunta si quiere que le envies el PDF gratuito.'
    });
  }

  return introduceProgram(context);
}

async function sendPdfOrProgram(context) {
  const { settings } = context;

  if (settings.pdf_link) {
    return replyWithAI({
      ...context,
      nextStage: 'pdf_enviado',
      intent: 'send_pdf',
      objective: 'El usuario acepto recibir el PDF. Envia el link del PDF y pide que luego cuente que parte conecto con su caso. No vendas.',
      requiredFacts: `Incluye este link exacto del PDF: ${settings.pdf_link}`,
      leadFields: {
        pdf_sent: true,
        pdf_sent_at: new Date()
      },
      memoryExtra: {
        pdf_sent: true,
        pdf_link: settings.pdf_link
      }
    });
  }

  return introduceProgram(context);
}

async function introduceProgram(context) {
  return replyWithAI({
    ...context,
    nextStage: 'programa',
    intent: context.intent || 'program_intro',
    objective: [
      'Conecta lo que el usuario conto con Neurotraumas.',
      'Explica de forma breve que es un proceso de 12 semanas para entender y trabajar respuestas emocionales repetidas.',
      'No mandes Hotmart todavia.',
      'Pregunta si quiere que le expliques que incluye.'
    ].join(' ')
  });
}

async function presentOffer(context) {
  const { settings } = context;
  return replyWithAI({
    ...context,
    nextStage: 'oferta_presentada',
    intent: context.intent || 'offer',
    objective: 'Presenta la oferta completa de Neurotraumas de forma clara. No mandes el link todavia; pregunta si quiere revisarlo en Hotmart.',
    requiredFacts: [
      'Duracion: 12 semanas.',
      'Incluye clases en vivo, ejercicios, grupo privado, materiales, 2 lives grupales, certificado y actualizaciones.',
      'Acceso de por vida en Hotmart.',
      'Garantia de 14 dias.',
      'Precio normal: $360 USD.',
      `Precio especial: $${getSpecialPrice(settings)} USD.`
    ].join('\n'),
    leadFields: {
      offer_presented: true,
      offer_presented_at: context.lead.offer_presented_at || new Date()
    },
    memoryExtra: {
      offer_presented: true
    }
  });
}

async function answerPrice(context) {
  const { settings } = context;
  return replyWithAI({
    ...context,
    nextStage: 'oferta_presentada',
    intent: 'price',
    objective: 'El usuario pregunto precio. Responde directo con precio normal y precio especial. Explica brevemente que incluye y pregunta si quiere revisar el link. No mandes el link aun.',
    requiredFacts: [
      'Precio normal: $360 USD.',
      `Precio especial por este canal: $${getSpecialPrice(settings)} USD.`,
      'Garantia: 14 dias.',
      'Plataforma: Hotmart.',
      'No incluyas el link todavia.'
    ].join('\n'),
    leadFields: {
      offer_presented: true,
      offer_presented_at: context.lead.offer_presented_at || new Date()
    },
    memoryExtra: {
      offer_presented: true
    }
  });
}

async function handleObjection(context) {
  const objection = detectObjection(context.body);
  return replyWithAI({
    ...context,
    nextStage: 'objecion',
    intent: 'objection',
    objective: [
      `El usuario expreso una objecion o duda de tipo "${objection}".`,
      'Responde exactamente a esa duda con empatia y claridad.',
      'No presiones.',
      'No mandes Hotmart salvo que tambien lo haya pedido.'
    ].join(' '),
    requiredFacts: `Objecion detectada: ${objection}.`,
    leadFields: {
      main_objection: objection,
      objection_type: objection
    },
    memoryExtra: {
      objection_type: objection
    }
  });
}

async function handlePostLinkConversation(context) {
  if (context.intent === 'payment_reported') {
    return handlePaymentReported(context);
  }

  if (context.intent === 'payment_link') {
    return sendHotmartLink(context);
  }

  if (context.intent === 'objection') {
    return handleObjection({
      ...context,
      currentStage: context.currentStage || 'post_link_conversacion'
    });
  }

  return replyWithAI({
    ...context,
    nextStage: 'post_link_conversacion',
    objective: [
      'El link de Hotmart ya fue enviado antes.',
      'Responde la duda actual del usuario sin reiniciar la conversacion.',
      'No reenvies el link salvo que el usuario lo pida.',
      'Ayuda con pago, acceso, garantia, contenido o encaje con su caso.'
    ].join(' '),
    requiredFacts: `Link ya enviado: ${getHotmartLink(context.settings)}`
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

  console.log('Bot control state', {
    bot_paused: lead.bot_paused,
    human_takeover: lead.human_takeover
  });

  if (lead.human_takeover || lead.bot_paused) {
    return result({
      lead,
      conversation,
      reply: null,
      whatsappId,
      stage: lead.funnel_stage,
      intent: 'manual_control'
    });
  }

  const memoryRow = await memoryService.getMemoryByLeadId(lead.id);
  const memory = memoryObject(memoryRow);
  const history = await messageService.getConversationHistory(lead.id);
  const settings = await settingsService.getRuntimeSettings();
  const currentStage = resolveStage({ lead, conversation, memory, history });
  const intent = detectIntent(body);

  console.log('Conversation decision', {
    leadId: lead.id,
    currentStage,
    intent,
    funnel_stage: lead.funnel_stage,
    conversation_step: conversation.current_step,
    memory_step: memory.current_step,
    hotmart_link_sent: lead.hotmart_link_sent,
    offer_presented: lead.offer_presented
  });

  const context = {
    lead,
    conversation,
    memory,
    history,
    body,
    settings,
    currentStage,
    intent,
    whatsappId
  };

  if (lead.closed_conversation && !isReopeningIntent(intent)) {
    return replyWithAI({
      ...context,
      nextStage: 'cierre_frio',
      objective: 'La conversacion estaba cerrada. Responde de forma breve, sin insistir y sin vender. Si el usuario solo agradece, cierra con respeto.'
    });
  }

  if (intent === 'crisis') {
    return fixedReply({
      lead,
      conversation,
      stage: 'crisis',
      whatsappId,
      leadFields: {
        crisis_detected: true,
        bot_paused: true,
        human_takeover: true
      },
      memoryPatch: {
        crisis_detected: true,
        last_user_message: body
      },
      reply: [
        'Siento mucho que estes pasando por esto.',
        '',
        'Ahora lo mas importante es tu seguridad. Por favor busca a una persona de confianza y contacta emergencias o una linea de ayuda de tu pais si sientes que puedes hacerte dano.',
        '',
        'Voy a dejar esta conversacion para seguimiento humano.'
      ].join('\n')
    });
  }

  if (intent === 'delete') return handleDelete({ lead, conversation, whatsappId });

  if (intent === 'stop') {
    return fixedReply({
      lead,
      conversation,
      stage: 'cierre_frio',
      whatsappId,
      leadFields: {
        bot_paused: true,
        lead_status: 'perdido',
        closed_conversation: true
      },
      memoryPatch: {
        closed_conversation: true,
        last_user_message: body
      },
      reply: 'Esta bien, lo respeto. No voy a seguir insistiendo. Si en otro momento quieres retomar, puedes escribirme por aqui.'
    });
  }

  if (intent === 'human') {
    return fixedReply({
      lead,
      conversation,
      stage: currentStage,
      whatsappId,
      leadFields: {
        human_takeover: true
      },
      memoryPatch: {
        human_takeover: true,
        last_user_message: body
      },
      reply: 'Claro. Dejo esta conversacion para que una persona del equipo pueda ayudarte directamente.'
    });
  }

  if (intent === 'payment_reported') return handlePaymentReported(context);

  if (currentStage === 'link_pago_enviado' || currentStage === 'post_link_conversacion' || lead.hotmart_link_sent) {
    return handlePostLinkConversation(context);
  }

  if (intent === 'payment_link') return sendHotmartLink(context);
  if (intent === 'price') return answerPrice(context);
  if (intent === 'objection') return handleObjection(context);

  if (intent === 'bot_identity') {
    return replyWithAI({
      ...context,
      nextStage: currentStage,
      objective: 'El usuario pregunta si eres bot o quien eres. Responde con transparencia como asistente del equipo de Marisa y vuelve a su duda concreta. No vendas.'
    });
  }

  if (intent === 'free_material') {
    if (asksForPdf(body)) return sendPdfOrProgram(context);
    if (asksForVideo(body)) return sendVideoOrDiagnostic(context);
    if (!lead.video_sent) return sendVideoOrDiagnostic(context);
    if (!lead.pdf_sent) return offerPdfOrProgram(context);
    return askDiagnostic(context);
  }

  if (intent === 'summary' || intent === 'program_details') {
    return introduceProgram(context);
  }

  if (currentStage === 'cierre_frio' && isReopeningIntent(intent)) {
    return startConversation({
      ...context,
      lead: await leadService.updateLead(lead.id, {
        closed_conversation: false,
        bot_paused: false
      })
    });
  }

  if (currentStage === 'inicio') {
    if (isPainIntent(intent) || looksLikeEmotionalStory(body)) return askDiagnostic(context);
    return startConversation(context);
  }

  if (currentStage === 'video_ofrecido') {
    if (intent === 'affirmative') return sendVideoOrDiagnostic(context);
    if (intent === 'negative') return askDiagnostic({
      ...context,
      objective: 'El usuario no quiere el video. Respeta eso y continua con una pregunta suave para entender su situacion. No vendas.'
    });
    if (isPainIntent(intent) || looksLikeEmotionalStory(body)) return askDiagnostic(context);

    return replyWithAI({
      ...context,
      nextStage: 'video_ofrecido',
      objective: 'Responder lo que el usuario dijo sin repetir la bienvenida. Mantener la invitacion a entender su caso o recibir el video gratuito. No vendas.'
    });
  }

  if (currentStage === 'video_enviado') {
    if (intent === 'thanks') {
      return replyWithAI({
        ...context,
        nextStage: 'video_enviado',
        objective: 'El usuario agradece o dice que vera el video. Responde breve y pide que luego cuente que parte le hizo sentido.'
      });
    }

    return askDiagnostic(context);
  }

  if (currentStage === 'diagnostico_orientativo') {
    return explainDiscovery(context);
  }

  if (currentStage === 'descubrimiento_emocional') {
    if (hasDiscoveryAgreement(body) || intent === 'affirmative') return offerPdfOrProgram(context);
    if (intent === 'negative') {
      return replyWithAI({
        ...context,
        nextStage: 'descubrimiento_emocional',
        objective: 'El usuario no esta seguro o no conecta con la explicacion. Responde con humildad, pregunta una cosa concreta sobre su experiencia y no vendas.'
      });
    }
    return explainDiscovery(context);
  }

  if (currentStage === 'pdf_ofrecido') {
    if (intent === 'affirmative') return sendPdfOrProgram(context);
    if (intent === 'negative') return introduceProgram(context);
    return replyWithAI({
      ...context,
      nextStage: 'pdf_ofrecido',
      objective: 'Responder su duda actual sobre el material gratuito o su caso. No vendas y no repitas el ofrecimiento completo.'
    });
  }

  if (currentStage === 'pdf_enviado') {
    if (intent === 'thanks') {
      return replyWithAI({
        ...context,
        nextStage: 'pdf_enviado',
        objective: 'El usuario agradece o dice que revisara el PDF. Responde breve y pide que luego cuente que parte conecto con su caso.'
      });
    }

    if (intent === 'viewed_pdf' || intent === 'affirmative') return introduceProgram(context);
    return introduceProgram(context);
  }

  if (currentStage === 'programa') {
    if (intent === 'affirmative' || intent === 'program_details' || intent === 'summary') return presentOffer(context);

    return replyWithAI({
      ...context,
      nextStage: 'programa',
      objective: 'Responder la duda actual sobre Neurotraumas sin enviar el link de pago todavia. Si corresponde, pregunta si quiere que le expliques que incluye.'
    });
  }

  if (currentStage === 'oferta_presentada') {
    if (intent === 'affirmative') return sendHotmartLink(context);

    return replyWithAI({
      ...context,
      nextStage: 'oferta_presentada',
      objective: 'Responder la duda actual despues de presentar la oferta. No reenvies ni inventes informacion. Solo manda Hotmart si lo pide claramente.'
    });
  }

  if (currentStage === 'objecion') {
    if (intent === 'affirmative') return sendHotmartLink(context);

    return replyWithAI({
      ...context,
      nextStage: 'objecion',
      objective: 'Continuar respondiendo la objecion o duda actual con claridad y sin presionar. No reinicies la conversacion.'
    });
  }

  if (currentStage === 'pago_reportado') {
    return replyWithAI({
      ...context,
      nextStage: 'pago_reportado',
      objective: 'El usuario ya reporto pago. Responde solo sobre confirmacion, acceso o siguientes pasos. No vendas.'
    });
  }

  return replyWithAI({
    ...context,
    nextStage: currentStage,
    objective: 'Responder exactamente al ultimo mensaje del usuario, sin reiniciar, sin repetir mensajes previos y avanzando solo si su mensaje lo permite.'
  });
}

module.exports = {
  handleIncomingMessage,
  detectIntent,
  resolveStage
};
