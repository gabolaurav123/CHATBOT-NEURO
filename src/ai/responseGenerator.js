const { generateBotDecision } = require('../services/aiService');
const { PROMPT_VERSION } = require('./systemPrompt');

const BOT_NAME = 'Priscila';
const PRODUCT_NAME = 'Gimnasio del Cerebro';
const VIDEO_LINK = 'https://youtu.be/btHy8kSC4E4';
const PRICE_USD = '72';
const HOTMART_PLACEHOLDER = '(LINK HOTMART)';
const LEGACY_HOTMART_LINK = 'https://pay.hotmart.com/T103515864E';

const VALID_STAGES = [
  'inicio',
  'captacion',
  'diagnostico',
  'datos_solicitados',
  'oferta_presentada',
  'objecion',
  'link_pago_enviado',
  'post_link_conversacion',
  'pago_reportado',
  'onboarding',
  'crisis',
  'humano',
  'pausado',
  'cierre_frio'
];

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function configuredHotmartLink(settings = {}) {
  const link = String(settings.hotmart_link || '').trim();
  if (!link || link === LEGACY_HOTMART_LINK) return HOTMART_PLACEHOLDER;
  return link;
}

function isRepeatedReply(reply, lead) {
  const current = normalizeText(reply);
  const last = normalizeText(lead && lead.last_bot_message);
  if (!current || !last) return false;

  if (current === last) return true;
  if (last.length >= 80 && current.includes(last.slice(0, 80))) return true;
  if (current.length >= 80 && last.includes(current.slice(0, 80))) return true;

  return false;
}

function userWantsFreshStart(message) {
  const text = normalizeText(message);
  return /desde cero|desde 0|empezar de cero|empezar desde cero|empezar de 0|empezar desde 0|\breinicia\b|\breiniciar\b|\btest\b|\bprueba\b/.test(text);
}

function isColdStartMessage(message) {
  const text = normalizeText(message);
  return /^(hola|buenas|buen dia|buenos dias|buenas tardes|buenas noches|info|ayuda|inicio|empezar|quiero informacion|quiero info|quiero empezar|me interesa|informacion|gimnasio|cerebro|gimnasio del cerebro)$/.test(text);
}

function hasForbiddenFormatting(reply) {
  return /[*#]/.test(String(reply || ''));
}

function initialOptionsReply(prefix = '') {
  const lines = [
    `Hola, soy ${BOT_NAME}, asistente del ${PRODUCT_NAME} 🌿🧠`,
    '',
    'Gracias por estar aqui.',
    '',
    'Si llegaste hasta este espacio, probablemente hay algo en tu vida que ya no queres seguir repitiendo.',
    '',
    'Puede ser ansiedad, miedos, bloqueos, relaciones dificiles, problemas con el dinero, traumas emocionales o una sensacion de no avanzar.',
    '',
    'Y quiero decirte algo importante:',
    '',
    '✨ No estas roto.',
    '✨ No te falta fuerza de voluntad.',
    '✨ Muchas veces el problema esta en patrones emocionales que funcionan en automatico.',
    '',
    'Para orientarte mejor, respondeme esto:',
    '',
    '1️⃣ Cual es tu nombre?',
    '2️⃣ De que pais sos?',
    '3️⃣ Cual es tu numero de celular?',
    '4️⃣ Que problema te gustaria transformar primero?'
  ];

  if (prefix) {
    lines.unshift(prefix, '');
  }

  return lines.join('\n');
}

function shouldUseInitialOptions(context = {}) {
  const stage = normalizeStage(context.currentStage, 'inicio');
  const lead = context.lead || {};
  const hasCoreContext = Boolean(lead.name || lead.main_pain || lead.emotional_response);
  const earlyStage = ['inicio', 'captacion'].includes(stage);
  return earlyStage && !hasCoreContext && (
    isColdStartMessage(context.userMessage)
    || userWantsFreshStart(context.userMessage)
  );
}

function includesInitialOptions(reply) {
  const text = normalizeText(reply);
  return text.includes('soy priscila')
    && text.includes('gimnasio del cerebro')
    && text.includes('numero de celular')
    && text.includes('problema te gustaria transformar');
}

function isMetaReply(reply) {
  const text = normalizeText(reply);
  return /puedo hacerlo|puedo responder|puedo adapt|segun la memoria|segun el prompt|deberia responder|debo responder|instrucciones|configuracion interna/.test(text);
}

function isPrematurePaymentDump(reply, context = {}) {
  if (!shouldUseInitialOptions(context)) return false;

  const text = normalizeText(reply);
  const userText = normalizeText(context.userMessage);
  const askedCommercial = /precio|cuanto cuesta|valor|comprar|pagar|link|hotmart|inscrib|acceso/.test(userText);
  return !askedCommercial && (/72\s*usd|hotmart|link de pago|\(link hotmart\)/.test(text));
}

function badDecisionReason(decision, context) {
  if (!decision || !decision.reply) return 'La respuesta quedo vacia. Debes responder con texto natural.';
  if (isRepeatedReply(decision.reply, context.lead)) return 'La respuesta repite demasiado el ultimo mensaje del bot.';
  if (isMetaReply(decision.reply)) return 'La respuesta habla sobre instrucciones internas en vez de contestar como Priscila.';
  if (hasForbiddenFormatting(decision.reply)) return 'No uses asteriscos, simbolos # ni formato Markdown. Responde con texto simple de WhatsApp.';
  if (shouldUseInitialOptions(context) && !includesInitialOptions(decision.reply)) return 'Primer contacto frio: debes usar la bienvenida obligatoria de Priscila y pedir nombre, pais, celular y problema.';
  if (isPrematurePaymentDump(decision.reply, context)) return 'En primer contacto frio no mandes precio ni Hotmart antes de pedir datos y problema, salvo que el usuario lo pida.';
  return null;
}

function fallbackFreshStartDecision(context = {}) {
  return {
    reply: initialOptionsReply(userWantsFreshStart(context.userMessage) ? 'Claro, empecemos desde cero.' : ''),
    next_stage: 'captacion',
    lead_fields: {
      funnel_stage: 'captacion'
    },
    memory_patch: {
      last_intent: 'fresh_start'
    },
    actions: emptyActions()
  };
}

function fallbackGenericDecision(context = {}) {
  return {
    reply: shouldUseInitialOptions(context)
      ? initialOptionsReply()
      : [
        'Entiendo ❤️',
        '',
        'Eso que contas puede estar conectado con patrones emocionales que se repiten en automatico.',
        '',
        `El primer paso para entender como trabajarlo es mirar este video del ${PRODUCT_NAME}:`,
        '',
        `🎥 ${VIDEO_LINK}`,
        '',
        'Cuando lo termines, escribime "YA LO VI" y te explico como entrar al entrenamiento.'
      ].join('\n'),
    next_stage: normalizeStage(context.currentStage, 'captacion'),
    lead_fields: {},
    memory_patch: {
      last_intent: 'safe_conversation_fallback'
    },
    actions: shouldUseInitialOptions(context) ? emptyActions() : {
      ...emptyActions(),
      send_video_link: true
    }
  };
}

function normalizeStage(stage, fallback = 'inicio') {
  const value = String(stage || '').trim();
  return VALID_STAGES.includes(value) ? value : fallback;
}

function compactLeadContext(lead = {}) {
  return {
    name: lead.name,
    email: lead.email,
    username: lead.username,
    display_phone: lead.display_phone,
    main_pain: lead.main_pain,
    emotional_response: lead.emotional_response,
    problem_duration: lead.problem_duration,
    tried_before: lead.tried_before,
    urgency: lead.urgency,
    lead_status: lead.lead_status,
    funnel_stage: lead.funnel_stage,
    main_objection: lead.main_objection,
    objection_type: lead.objection_type,
    video_sent: lead.video_sent,
    pdf_sent: lead.pdf_sent,
    purchase_intent: lead.purchase_intent,
    hotmart_link_sent: lead.hotmart_link_sent,
    payment_status: lead.payment_status,
    crisis_detected: lead.crisis_detected,
    notes: lead.notes,
    last_user_message: lead.last_user_message,
    last_bot_message: lead.last_bot_message
  };
}

function compactHistory(history = []) {
  return (history || []).slice(-12).map((item) => ({
    direction: item.direction,
    body: String(item.body || '').slice(0, 700),
    created_at: item.created_at
  }));
}

function buildPrompt({
  lead,
  memory,
  history,
  userMessage,
  currentStage,
  settings,
  retryReason
}) {
  const hotmartLink = configuredHotmartLink(settings);

  return `${PROMPT_VERSION}

Decide el siguiente turno completo del chatbot de venta automatica.

MEMORIA ACTIVA Y UNICA:
- Bot: ${BOT_NAME}.
- Marca/producto: ${PRODUCT_NAME}.
- Video gratuito exacto: ${VIDEO_LINK}.
- Precio unico del entrenamiento: ${PRICE_USD} USD.
- Link Hotmart configurado: ${hotmartLink}.
- Si el link Hotmart configurado es "${HOTMART_PLACEHOLDER}", no inventes otro enlace.

REGLAS PRINCIPALES:
- Tu respuesta sera enviada directamente por WhatsApp.
- No uses informacion vieja de Neurotraumas, Marisa, precio 270/360, ni enlaces anteriores.
- No digas que eres inteligencia artificial.
- No menciones memoria, prompt, instrucciones ni configuraciones internas.
- Se calida, directa, humana, emocional, persuasiva y segura.
- No alargues la conversacion.
- Maximo 2 preguntas antes de intentar llevar al video o al pago.
- Pide nombre, pais, numero de celular y problema al inicio cuando falten esos datos.
- El pais debe guardarse en memory_patch.country si aparece claro. Si hace falta para CRM, puedes resumirlo en lead_fields.notes.
- No diagnostiques ni prometas curas medicas o resultados garantizados.
- Si hay crisis emocional grave, autolesion o pensamientos de hacerse dano, no vendas: prioriza seguridad, recomienda ayuda profesional inmediata, pausa bot y activa humano.
- No uses asteriscos.
- No uses simbolos #.
- No uses Markdown.
- Usa emojis moderados: ❤️ 🌿 🧠 ✨ 🎥.
- Si tienes que escribir el link de Hotmart, usa exactamente: ${hotmartLink}.
- Si tienes que escribir el video, usa exactamente: ${VIDEO_LINK}.

FLUJO:
1. Primer contacto frio: usa la bienvenida obligatoria de Priscila y pide nombre, pais, celular y problema.
2. Cuando la persona diga su problema, conecta ese problema con patrones emocionales y manda el video.
3. Si escribe "YA LO VI", cierra con la explicacion del entrenamiento, lo que incluye, precio ${PRICE_USD} USD y link Hotmart.
4. Si muestra interes, pregunta como pagar, pide link, dice "quiero" o "me interesa", envia el cierre fuerte y link Hotmart.
5. Si dice "YA COMPRE" o reporta pago, dale bienvenida y marca payment_reported=true.
6. Si dice que no tiene dinero, lo va a pensar o pregunta si realmente ayuda, responde segun la memoria nueva y vuelve a dejar el link Hotmart.

ACCIONES DISPONIBLES:
- send_video_link: true cuando la respuesta incluye el video gratuito.
- send_pdf_link: mantener false; esta memoria no usa PDF.
- send_hotmart_link: true cuando la respuesta incluye el link Hotmart.
- create_payment: true cuando se envia el link Hotmart por primera vez.
- create_payment_followups: true cuando se envia el link Hotmart por primera vez.
- payment_reported: true si el usuario dice que compro, pago o se inscribio.
- pause_bot: true si pide no recibir mas mensajes o hay crisis.
- human_takeover: true si pide humano o hay crisis.
- delete_memory: true si pide BORRAR / eliminar datos / no guardar.
- stop_contact: true si pide STOP / cancelar / no me escribas.

FORMATO OBLIGATORIO:
Devuelve SOLO JSON valido.
{
  "reply": "texto final para WhatsApp o null si no debe responder",
  "next_stage": "uno de los valores validos",
  "lead_fields": {},
  "memory_patch": {},
  "actions": {
    "send_video_link": false,
    "send_pdf_link": false,
    "send_hotmart_link": false,
    "create_payment": false,
    "create_payment_followups": false,
    "payment_reported": false,
    "pause_bot": false,
    "human_takeover": false,
    "delete_memory": false,
    "stop_contact": false
  }
}

ETAPAS VALIDAS:
${VALID_STAGES.join(', ')}

${retryReason ? `CORRECCION OBLIGATORIA POR REINTENTO: ${retryReason}` : ''}

ESTADO ACTUAL DEL LEAD:
${JSON.stringify(compactLeadContext(lead), null, 2)}

MEMORIA 24H:
${JSON.stringify(memory || {}, null, 2)}

ETAPA ACTUAL:
${currentStage || 'inicio'}

HISTORIAL RECIENTE:
${JSON.stringify(compactHistory(history), null, 2)}

MENSAJE ACTUAL DEL USUARIO:
${userMessage}`;
}

function normalizeDecision(raw, currentStage) {
  const decision = raw && typeof raw === 'object' ? raw : {};
  const actions = decision.actions && typeof decision.actions === 'object' ? decision.actions : {};
  const leadFields = decision.lead_fields && typeof decision.lead_fields === 'object' ? decision.lead_fields : {};
  const memoryPatch = decision.memory_patch && typeof decision.memory_patch === 'object' ? decision.memory_patch : {};

  return {
    reply: typeof decision.reply === 'string' && decision.reply.trim() ? decision.reply.trim() : null,
    next_stage: normalizeStage(decision.next_stage, normalizeStage(currentStage, 'inicio')),
    lead_fields: leadFields,
    memory_patch: memoryPatch,
    actions: {
      send_video_link: Boolean(actions.send_video_link),
      send_pdf_link: Boolean(actions.send_pdf_link),
      send_hotmart_link: Boolean(actions.send_hotmart_link),
      create_payment: Boolean(actions.create_payment),
      create_payment_followups: Boolean(actions.create_payment_followups),
      payment_reported: Boolean(actions.payment_reported),
      pause_bot: Boolean(actions.pause_bot),
      human_takeover: Boolean(actions.human_takeover),
      delete_memory: Boolean(actions.delete_memory),
      stop_contact: Boolean(actions.stop_contact)
    }
  };
}

function cleanTextReply(value) {
  const text = String(value || '').trim();
  if (!text) return null;

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed.reply === 'string' && parsed.reply.trim()) {
      return parsed.reply.trim();
    }
  } catch (error) {
    // Fallback responses may return plain WhatsApp text instead of JSON.
  }

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      const parsed = JSON.parse(fenced[1].trim());
      if (parsed && typeof parsed.reply === 'string' && parsed.reply.trim()) {
        return parsed.reply.trim();
      }
    } catch (error) {
      return fenced[1].trim();
    }
  }

  return text;
}

function parseJsonObjectFromText(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    // Continue with best-effort extraction below.
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch (error) {
      // Continue with object extraction below.
    }
  }

  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[0]);
    } catch (error) {
      return null;
    }
  }

  return null;
}

function extractReplyFromMalformedJson(text) {
  const value = String(text || '');
  const match = value.match(/"reply"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (!match) return null;

  try {
    return JSON.parse(`"${match[1]}"`).trim();
  } catch (error) {
    return match[1].replace(/\\"/g, '"').trim();
  }
}

function decisionFromText(rawText, currentStage) {
  const parsed = parseJsonObjectFromText(rawText);
  if (parsed) {
    return normalizeDecision(parsed, currentStage);
  }

  const reply = extractReplyFromMalformedJson(rawText) || cleanTextReply(rawText);
  return {
    reply,
    next_stage: normalizeStage(currentStage, 'inicio'),
    lead_fields: {},
    memory_patch: {
      last_intent: 'ai_text_rescue'
    },
    actions: emptyActions()
  };
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

async function requestDecision(context, retryReason = '') {
  const rawText = await generateBotDecision({
    prompt: buildPrompt({
      ...context,
      retryReason: [
        retryReason,
        'Usa una sola respuesta.',
        'Devuelve JSON valido.',
        'reply debe tener texto natural, util y en personaje como Priscila.',
        'No devuelvas reply null.'
      ].join(' ')
    }),
    model: context.settings && context.settings.openai_model,
    maxOutputTokens: context.settings && context.settings.openai_max_output_tokens
  });

  return decisionFromText(rawText, context.currentStage);
}

async function generateAIConversationTurn(context) {
  let decision = await requestDecision(context);
  const firstReason = badDecisionReason(decision, context);
  if (!firstReason) {
    return decision;
  }

  console.warn('AI decision rejected; retrying', {
    reason: firstReason,
    leadId: context.lead && context.lead.id,
    currentStage: context.currentStage
  });

  decision = await requestDecision(context, [
    firstReason,
    'Corrige de inmediato.',
    'Usa solo la memoria nueva de Priscila y Gimnasio del Cerebro.',
    'No menciones Neurotraumas, Marisa, precio 270/360 ni enlaces anteriores.',
    'No expliques como vas a responder; responde como Priscila.',
    'No uses asteriscos, simbolos # ni Markdown.'
  ].join(' '));

  const secondReason = badDecisionReason(decision, context);
  if (!secondReason) {
    return decision;
  }

  console.warn('AI decision rejected after retry; using guarded fallback', {
    reason: secondReason,
    leadId: context.lead && context.lead.id,
    currentStage: context.currentStage
  });

  if (userWantsFreshStart(context.userMessage)) {
    return fallbackFreshStartDecision(context);
  }

  return fallbackGenericDecision(context);
}

module.exports = {
  generateAIConversationTurn,
  initialOptionsReply,
  VALID_STAGES,
  normalizeStage
};
