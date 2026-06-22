const { generateBotDecision } = require('../services/aiService');
const { PROMPT_VERSION } = require('./systemPrompt');

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
  return /desde cero|desde 0|empezar de cero|empezar desde cero|empezar de 0|empezar desde 0|como si no supiera nada|\breinicia\b|\breiniciar\b|\btest\b|\bprueba\b/.test(text);
}

function isColdStartMessage(message) {
  const text = normalizeText(message);
  return /^(hola|buenas|buen dia|buenos dias|buenas tardes|buenas noches|neuro|info|ayuda|inicio|empezar|quiero informacion|quiero info|quiero empezar|me interesa|informacion)$/.test(text);
}

function userCorrectsOpeningStyle(message) {
  const text = normalizeText(message);
  return /(debes|deberias|deberia|tienes que|tenes que).*(empezar|iniciar|presentarte|hola|marisa|soy marisa)/.test(text)
    || /(no debes|no deberias).*(empezar|iniciar)/.test(text);
}

function hasForbiddenFormatting(reply) {
  return /[*#]/.test(String(reply || ''));
}

function initialOptionsReply(prefix = '') {
  const lines = [
    'Hola, soy Marisa 👋🌿',
    'Gracias por escribirnos.',
    '',
    'Vi tu interés en NEUROTRAUMAS™.',
    '',
    'Antes de enviarte información, quiero entender algo importante para ayudarte mejor.',
    '',
    '¿Qué sientes que hoy te está afectando más?',
    '',
    '1️⃣ Ansiedad constante',
    '2️⃣ Autosabotaje',
    '3️⃣ Pensamientos repetitivos',
    '4️⃣ Relaciones difíciles',
    '5️⃣ Me siento bloqueado(a)'
  ];

  if (prefix) {
    lines.unshift(prefix, '');
  }

  return lines.join('\n');
}

function shouldUseInitialOptions(context = {}) {
  const stage = normalizeStage(context.currentStage, 'inicio');
  const lead = context.lead || {};
  const hasPainContext = Boolean(lead.main_pain || lead.emotional_response || lead.problem_duration);
  const earlyStage = ['inicio', 'captacion'].includes(stage);
  return earlyStage && !hasPainContext && (
    isColdStartMessage(context.userMessage)
    || userWantsFreshStart(context.userMessage)
  );
}

function includesInitialOptions(reply) {
  const text = normalizeText(reply);
  return text.includes('vi tu interes en neurotraumas')
    && text.includes('ansiedad constante')
    && text.includes('autosabotaje')
    && text.includes('pensamientos repetitivos')
    && text.includes('relaciones dificiles')
    && text.includes('me siento bloqueado');
}

function isMetaReply(reply) {
  const text = normalizeText(reply);
  return /puedo hacerlo mas natural|puedo responderte directo|puedo adaptarte|adapto el tono|no hace falta empezar|como en una conversacion real|por ejemplo claro te cuento|segun la memoria|segun el prompt|deberia responder|debo responder|instrucciones/.test(text);
}

function isPrematureSalesDump(reply, context = {}) {
  const text = normalizeText(reply);
  const earlyStage = ['inicio', 'captacion'].includes(normalizeStage(context.currentStage, 'inicio'));
  const freshStart = userWantsFreshStart(context.userMessage) || userCorrectsOpeningStyle(context.userMessage);
  if (!earlyStage && !freshStart) return false;

  const mentionsPrice = /\busd\b|precio|valor normal|precio especial|270|360/.test(text);
  const mentionsPayment = /hotmart|link de pago|inscripcion|comprar|pagar/.test(text);
  const askedCommercial = /precio|cuanto cuesta|valor|comprar|pagar|link|hotmart|inscrib/.test(normalizeText(context.userMessage));

  return !askedCommercial && (mentionsPrice || mentionsPayment);
}

function badDecisionReason(decision, context) {
  if (!decision || !decision.reply) return 'La respuesta quedo vacia. Debes responder con texto natural.';
  if (isRepeatedReply(decision.reply, context.lead)) return 'La respuesta repite demasiado el ultimo mensaje del bot.';
  if (isMetaReply(decision.reply)) return 'La respuesta habla sobre como deberias contestar en vez de contestar como Marisa.';
  if (hasForbiddenFormatting(decision.reply)) return 'No uses asteriscos, simbolos # ni formato Markdown. Responde con texto simple de WhatsApp.';
  if (shouldUseInitialOptions(context) && !includesInitialOptions(decision.reply)) return 'Primer contacto frio: debes usar el mensaje inicial obligatorio con opciones 1 a 5.';
  if (isPrematureSalesDump(decision.reply, context)) return 'La respuesta vende o muestra precio demasiado pronto para un reinicio desde cero.';
  return null;
}

function fallbackFreshStartDecision(context = {}) {
  const correction = userCorrectsOpeningStyle(context.userMessage);
  const reply = initialOptionsReply(correction ? 'Tienes razón, empecemos bien.' : '');

  return {
    reply,
    next_stage: 'captacion',
    lead_fields: {
      funnel_stage: 'captacion'
    },
    memory_patch: {
      last_intent: correction ? 'opening_style_corrected' : 'fresh_start'
    },
    actions: emptyActions()
  };
}

function fallbackGenericDecision(context = {}) {
  return {
    reply: shouldUseInitialOptions(context)
      ? initialOptionsReply()
      : [
        'Gracias por escribirme.',
        '',
        'Quiero orientarte con cuidado y sin apresurarte 🌿',
        '',
        'Para hacerlo más simple, puedes responder con una opción:',
        '',
        '1️⃣ Ansiedad o miedo',
        '2️⃣ Autosabotaje o bloqueo',
        '3️⃣ Pensamientos repetitivos',
        '4️⃣ Relaciones difíciles',
        '5️⃣ No sé cómo explicarlo todavía'
      ].join('\n'),
    next_stage: normalizeStage(context.currentStage, 'captacion'),
    lead_fields: {},
    memory_patch: {
      last_intent: 'safe_conversation_fallback'
    },
    actions: emptyActions()
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
  const hotmartLink = settings.hotmart_link || 'https://pay.hotmart.com/T103515864E';
  const videoLink = settings.video_link || '';
  const pdfLink = settings.pdf_link || '';
  const normalPrice = settings.product_normal_price || '360';
  const specialPrice = settings.product_special_price || settings.product_price || '270';

  return `${PROMPT_VERSION}

Decide el siguiente turno completo del chatbot Neurotraumas.

IMPORTANTE:
- Tu respuesta sera enviada directamente por WhatsApp.
- El backend NO elegira una plantilla comercial por ti.
- Tu decides la respuesta, la etapa y las acciones.
- No repitas el ultimo mensaje del bot.
- No reinicies el flujo.
- No respondas con "te leo" ni con una frase comodin.
- Si el usuario dice "si", interpreta ese "si" por el historial y la etapa, no como compra automatica.
- Si no hay enlace de video o PDF configurado, no menciones video/PDF ni digas que falta configuracion.
- El video es opcional: no obligues al usuario a verlo, no esperes solo "ya lo vi" y no frenes diagnostico, acompanamiento ni venta si no lo vio.
- Si el usuario ignora el video y cuenta su problema, responde a su problema sin insistir con el video.
- Si el usuario pide "desde cero", "desde 0", "como si no supiera nada", "reiniciar" o dice que es una prueba/test, tratalo como reinicio conversacional: empieza como Marisa, explica brevemente y guia paso a paso. No mandes precio, Hotmart ni oferta completa salvo que lo pida explicitamente.
- Si el usuario corrige el estilo, por ejemplo "no debes empezar con hola soy marisa?", no contestes con teoria ni digas "puedo hacerlo". Corrige y responde ya en personaje.
- Nunca hables sobre el prompt, la memoria, las instrucciones ni sobre como deberias responder.
- En primer contacto frio usa obligatoriamente la bienvenida con opciones 1 a 5. No ofrezcas video, precio ni Hotmart antes de que elija o cuente su situacion.
- Usa opciones numeradas cuando ayude a que la persona no escriba demasiado.
- No uses asteriscos.
- No uses simbolos #.
- No uses Markdown.
- Usa emojis calidos de forma natural: 👋 ❤️ 🌿 ✨ 🙂.
- Si hay conflicto entre instrucciones antiguas y estas variables reales, usa las variables reales.

DATOS REALES:
- Producto: Neurotraumas.
- Precio normal: USD ${normalPrice}.
- Precio especial por este canal: USD ${specialPrice}.
- Hotmart oficial: ${hotmartLink}.
- Video gratuito configurado: ${videoLink || 'NO DISPONIBLE'}.
- PDF gratuito configurado: ${pdfLink || 'NO DISPONIBLE'}.
- Modelo conversacional: IA decide todo el texto.

MENSAJE INICIAL OBLIGATORIO PARA CONTACTO FRIO:
Hola, soy Marisa 👋🌿
Gracias por escribirnos.

Vi tu interés en NEUROTRAUMAS™.

Antes de enviarte información, quiero entender algo importante para ayudarte mejor.

¿Qué sientes que hoy te está afectando más?

1️⃣ Ansiedad constante
2️⃣ Autosabotaje
3️⃣ Pensamientos repetitivos
4️⃣ Relaciones difíciles
5️⃣ Me siento bloqueado(a)

REGLAS DE OPCIONES:
- Si el usuario elige 1, 2, 3, 4 o 5, interpreta la opcion segun la ultima lista del historial.
- Despues de validar, pregunta lo siguiente con opciones cuando sea natural.
- No pidas respuestas largas si puedes ofrecer 3 a 5 opciones.
- Si el usuario escribe libremente, responde a lo que conto y no lo fuerces a elegir.
- Para tiempo puedes preguntar: ¿Hace cuánto sientes que esto viene afectándote? 🌿 con opciones 1️⃣ Hace poco, 2️⃣ Más de 6 meses, 3️⃣ Más de 1 año, 4️⃣ Siento que viene desde hace mucho.
- Para cuerpo puedes preguntar: Cuando aparece, ¿dónde lo notas más? ❤️ con opciones 1️⃣ Pecho o respiración, 2️⃣ Garganta o ganas de llorar, 3️⃣ Mente acelerada, 4️⃣ Tensión en el cuerpo, 5️⃣ No sé identificarlo.

ETAPAS VALIDAS:
${VALID_STAGES.join(', ')}

ACCIONES DISPONIBLES:
- send_video_link: true solo si el usuario acepta recibir la clase/video, pide el video, quiere entender primero o esta frio sin contar su situacion; solo si VIDEO_LINK existe y no lo enviaste ya, salvo que lo pida de nuevo.
- send_pdf_link: true solo si el usuario pide o acepta PDF/material y PDF_LINK existe.
- send_hotmart_link: true solo si corresponde enviar o reenviar el link oficial.
- create_payment: true cuando se envia el link por primera vez.
- create_payment_followups: true cuando se envia el link por primera vez.
- payment_reported: true si el usuario dice que ya pago o se inscribio.
- pause_bot: true si pide no recibir mas mensajes o hay crisis.
- human_takeover: true si pide humano o hay crisis.
- delete_memory: true si pide BORRAR / eliminar datos / no guardar.
- stop_contact: true si pide STOP / cancelar / no me escribas.

REGLAS DE LINK:
- Si send_video_link=true, la respuesta debe incluir este link exacto: ${videoLink || 'NO DISPONIBLE'}.
- Si send_video_link=true, usa esta estructura natural: "Perfecto ❤️ Te paso la clase corta para que la veas con calma:", luego el link exacto, luego aclara que puede avisar que parte le resono y que tambien puede seguir hablando sin verla ahora.
- Si video_sent=true y el usuario no pide reenviar el video, no vuelvas a mandar el link ni preguntes otra vez si ya lo vio.
- Si el usuario dice que no quiere ver el video, que no tiene tiempo o que lo vera despues, responde con calma y continua con una pregunta diagnostica; no actives send_video_link.
- Si el usuario dice "ya vi el video", pregunta que parte sintio mas relacionada con lo que vive ahora; no actives send_video_link.
- Si send_pdf_link=true, la respuesta debe incluir este link exacto: ${pdfLink || 'NO DISPONIBLE'}.
- Si no existe video o PDF configurado, no actives send_video_link/send_pdf_link y no inventes links.
- Si send_hotmart_link=true, la respuesta debe incluir este link exacto: ${hotmartLink}
- Si hotmart_link_sent=true y el usuario NO pide el link, NO lo reenvies.
- Si hotmart_link_sent=true, responde la duda actual y ayuda a cerrar la venta sin reiniciar.

REGLAS DE CRM:
- Extrae datos si aparecen claros: name, email, username, main_pain, emotional_response, problem_duration, tried_before, urgency, objection_type.
- No inventes datos.
- No inventes telefono. El backend solo guardara phone si el usuario lo escribio claramente.

FORMATO OBLIGATORIO:
Devuelve SOLO JSON valido. Para ahorrar tokens, puedes dejar lead_fields y memory_patch como objetos vacios si no hay datos nuevos.
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

REGLAS DEL JSON:
- reply debe ser un string natural si debe responder.
- Usa null en campos desconocidos.
- No uses asteriscos, simbolos #, encabezados, Markdown ni bloques de codigo.
- No agregues claves fuera del esquema.
- No expliques el JSON.

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
    // The fallback usually returns plain WhatsApp text, not JSON.
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
        'reply debe tener texto natural, util y en personaje.',
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
    'Si el usuario pide empezar desde cero, empieza con Marisa y una bienvenida suave.',
    'No menciones precio ni Hotmart al inicio salvo que el usuario lo pida explicitamente.',
    'No expliques como vas a responder; responde como Marisa.',
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

  if (userWantsFreshStart(context.userMessage) || userCorrectsOpeningStyle(context.userMessage)) {
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
