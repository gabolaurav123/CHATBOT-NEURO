const { generateText } = require('./geminiClient');
const { SYSTEM_PROMPT } = require('./systemPrompt');

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

function normalizeStage(stage, fallback = 'inicio') {
  const value = String(stage || '').trim();
  return VALID_STAGES.includes(value) ? value : fallback;
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

  return `Decide el siguiente turno completo del chatbot Neurotraumas.

IMPORTANTE:
- Tu respuesta sera enviada directamente por WhatsApp.
- El backend NO elegira una plantilla comercial por ti.
- Tu decides la respuesta, la etapa y las acciones.
- No repitas el ultimo mensaje del bot.
- No reinicies el flujo.
- No respondas con "te leo" ni con una frase comodin.
- Si el usuario dice "si", interpreta ese "si" por el historial y la etapa, no como compra automatica.
- Si no hay enlace de video o PDF configurado, no menciones video/PDF ni digas que falta configuracion.
- Si hay conflicto entre instrucciones antiguas y estas variables reales, usa las variables reales.

DATOS REALES:
- Producto: Neurotraumas.
- Precio normal: USD ${normalPrice}.
- Precio especial por este canal: USD ${specialPrice}.
- Hotmart oficial: ${hotmartLink}.
- Video gratuito configurado: ${videoLink || 'NO DISPONIBLE'}.
- PDF gratuito configurado: ${pdfLink || 'NO DISPONIBLE'}.
- Modelo conversacional: IA decide todo el texto.

ETAPAS VALIDAS:
${VALID_STAGES.join(', ')}

ACCIONES DISPONIBLES:
- send_hotmart_link: true solo si corresponde enviar o reenviar el link oficial.
- create_payment: true cuando se envia el link por primera vez.
- create_payment_followups: true cuando se envia el link por primera vez.
- payment_reported: true si el usuario dice que ya pago o se inscribio.
- pause_bot: true si pide no recibir mas mensajes o hay crisis.
- human_takeover: true si pide humano o hay crisis.
- delete_memory: true si pide BORRAR / eliminar datos / no guardar.
- stop_contact: true si pide STOP / cancelar / no me escribas.

REGLAS DE LINK:
- Si send_hotmart_link=true, la respuesta debe incluir este link exacto: ${hotmartLink}
- Si hotmart_link_sent=true y el usuario NO pide el link, NO lo reenvies.
- Si hotmart_link_sent=true, responde la duda actual y ayuda a cerrar la venta sin reiniciar.

REGLAS DE CRM:
- Extrae datos si aparecen claros: name, email, username, main_pain, emotional_response, problem_duration, tried_before, urgency, objection_type.
- No inventes datos.
- No inventes telefono. El backend solo guardara phone si el usuario lo escribio claramente.

FORMATO OBLIGATORIO:
Devuelve SOLO JSON valido con este esquema:
{
  "reply": "texto final para WhatsApp o null si no debe responder",
  "next_stage": "uno de los valores validos",
  "lead_fields": {
    "name": null,
    "email": null,
    "username": null,
    "main_pain": null,
    "emotional_response": null,
    "problem_duration": null,
    "tried_before": null,
    "urgency": null,
    "lead_status": null,
    "main_objection": null,
    "objection_type": null,
    "purchase_intent": null,
    "closed_conversation": null,
    "crisis_detected": null,
    "payment_status": null,
    "consent_24h": null
  },
  "memory_patch": {
    "summary": null,
    "conversation_stage": null,
    "last_intent": null,
    "known_context": null
  },
  "actions": {
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
- No pongas markdown.
- No agregues claves fuera del esquema.
- No expliques el JSON.

${retryReason ? `CORRECCION OBLIGATORIA POR REINTENTO: ${retryReason}` : ''}

ESTADO ACTUAL DEL LEAD:
${JSON.stringify(lead || {}, null, 2)}

MEMORIA 24H:
${JSON.stringify(memory || {}, null, 2)}

ETAPA ACTUAL:
${currentStage || 'inicio'}

HISTORIAL RECIENTE:
${JSON.stringify(history || [], null, 2)}

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

async function generateAIConversationTurn(context) {
  const rawText = await generateText({
    prompt: buildPrompt({
      ...context,
      retryReason: [
        'Usa una sola respuesta.',
        'Si puedes devolver JSON valido, hazlo.',
        'Si no puedes garantizar JSON valido, prioriza que reply tenga texto natural y util.',
        'No devuelvas reply null.'
      ].join(' ')
    }),
    systemInstruction: SYSTEM_PROMPT,
    model: context.settings && context.settings.gemini_model,
    temperature: 0.7,
    maxOutputTokens: 900
  });

  const decision = decisionFromText(rawText, context.currentStage);
  if (decision.reply && !isRepeatedReply(decision.reply, context.lead)) {
    return decision;
  }

  if (decision.reply) {
    decision.reply = [
      decision.reply,
      '',
      'Para orientarte mejor, dime que parte te gustaria aclarar ahora.'
    ].join('\n');
    return decision;
  }

  throw new Error('AI returned an empty reply');
}

module.exports = {
  generateAIConversationTurn,
  VALID_STAGES,
  normalizeStage
};
