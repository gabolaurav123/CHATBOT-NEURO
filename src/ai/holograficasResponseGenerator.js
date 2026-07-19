const { generateBotDecision } = require('../services/aiService');
const { HOLOGRAFICAS_PROMPT_VERSION, HOLOGRAFICAS_SYSTEM_PROMPT } = require('./holograficasPrompt');
const { PLANS, getPlanResources, holograficasWelcomeReply, normalizeText } = require('../bot/productCatalog');

const VALID_HOLOGRAFICAS_STAGES = new Set([
  'captacion',
  'video_enviado',
  'post_video',
  'datos_solicitados',
  'datos_recibidos',
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
]);

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

function compactLead(lead = {}) {
  return {
    name: lead.name,
    country: lead.country,
    phone: lead.phone,
    email: lead.email,
    selected_plan: lead.selected_plan,
    crm_section: lead.crm_section,
    source: lead.source,
    main_pain: lead.main_pain,
    emotional_response: lead.emotional_response,
    problem_duration: lead.problem_duration,
    tried_before: lead.tried_before,
    urgency: lead.urgency,
    lead_status: lead.lead_status,
    funnel_stage: lead.funnel_stage,
    objection_type: lead.objection_type,
    video_sent: lead.video_sent,
    hotmart_link_sent: lead.hotmart_link_sent,
    purchase_intent: lead.purchase_intent,
    payment_status: lead.payment_status,
    last_bot_message: lead.last_bot_message
  };
}

function compactHistory(history = []) {
  return history.slice(-12).map((item) => ({
    direction: item.direction,
    body: String(item.body || '').slice(0, 700),
    created_at: item.created_at
  }));
}

function buildHolograficasPrompt({ lead, memory, history, userMessage, currentStage, settings, retryReason = '' }) {
  const resources = getPlanResources(PLANS.HOLOGRAFICAS, settings);
  return `${HOLOGRAFICAS_PROMPT_VERSION}

Decide el siguiente turno completo para Holográficas. El plan ya fue elegido y no debes mezclar Neurotraumas.

CONFIGURACIÓN REAL:
- Producto: ${resources.productName}
- Precio: USD ${resources.price}
- Video: ${resources.videoLink}
- Hotmart: ${resources.hotmartLink}

Devuelve SOLO JSON válido:
{
  "reply": "texto final para WhatsApp",
  "next_stage": "etapa válida",
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

ETAPAS VÁLIDAS: ${Array.from(VALID_HOLOGRAFICAS_STAGES).join(', ')}
No uses Markdown, asteriscos ni #. No agregues claves fuera del esquema.
${retryReason ? `CORRECCIÓN OBLIGATORIA: ${retryReason}` : ''}

LEAD:
${JSON.stringify(compactLead(lead), null, 2)}

MEMORIA:
${JSON.stringify(memory || {}, null, 2)}

ETAPA ACTUAL: ${currentStage || 'captacion'}

HISTORIAL RECIENTE:
${JSON.stringify(compactHistory(history), null, 2)}

MENSAJE ACTUAL:
${userMessage}`;
}

function parseJsonObject(text) {
  const value = String(text || '').trim();
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (error) {
    const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
      try {
        return JSON.parse(fenced[1].trim());
      } catch (nestedError) {
        return null;
      }
    }
    const object = value.match(/\{[\s\S]*\}/);
    if (!object) return null;
    try {
      return JSON.parse(object[0]);
    } catch (nestedError) {
      return null;
    }
  }
}

function normalizeDecision(raw, currentStage) {
  const decision = raw && typeof raw === 'object' ? raw : {};
  const actions = decision.actions && typeof decision.actions === 'object' ? decision.actions : {};
  const nextStage = VALID_HOLOGRAFICAS_STAGES.has(decision.next_stage)
    ? decision.next_stage
    : (VALID_HOLOGRAFICAS_STAGES.has(currentStage) ? currentStage : 'captacion');

  return {
    reply: typeof decision.reply === 'string' ? decision.reply.trim() : '',
    next_stage: nextStage,
    lead_fields: decision.lead_fields && typeof decision.lead_fields === 'object' ? decision.lead_fields : {},
    memory_patch: decision.memory_patch && typeof decision.memory_patch === 'object' ? decision.memory_patch : {},
    actions: Object.fromEntries(
      Object.keys(emptyActions()).map((key) => [key, Boolean(actions[key])])
    )
  };
}

function invalidDecisionReason(decision, context) {
  if (!decision.reply) return 'reply debe contener una respuesta natural.';
  if (/[*#]/.test(decision.reply)) return 'No uses Markdown, asteriscos ni #.';
  if (/neurotraumas|T103515864E|USD\s*(270|360)|drive\.google\.com\/file\/d\/1gpuk/i.test(decision.reply)) {
    return 'No mezcles ningún dato de Neurotraumas con Holográficas.';
  }
  if (decision.actions.send_pdf_link) return 'Holográficas no ofrece un PDF en este flujo.';

  const resources = getPlanResources(PLANS.HOLOGRAFICAS, context.settings);
  if (decision.actions.send_video_link && !decision.reply.includes(resources.videoLink)) {
    return 'Incluye el video oficial exacto cuando send_video_link=true.';
  }
  if (decision.actions.send_hotmart_link && !decision.reply.includes(resources.hotmartLink)) {
    return 'Incluye el Hotmart oficial exacto cuando send_hotmart_link=true.';
  }
  if (context.lead.last_bot_message && normalizeText(context.lead.last_bot_message) === normalizeText(decision.reply)) {
    return 'No repitas exactamente el último mensaje.';
  }
  return null;
}

function fallbackDecision(context) {
  const text = normalizeText(context.userMessage);
  const resources = getPlanResources(PLANS.HOLOGRAFICAS, context.settings);

  if (/precio|cuanto cuesta|valor/.test(text)) {
    return {
      reply: `La inversión es de USD ${resources.price} ❤️\nIncluye 45 clases, materiales, Reloj Emocional, Rueda del Alma, Tarjetas Holográficas y acceso de por vida 🌿\n\n¿Querés que te pase el acceso oficial?`,
      next_stage: 'oferta_presentada',
      lead_fields: {},
      memory_patch: { last_intent: 'price' },
      actions: emptyActions()
    };
  }

  if (/video|master class|masterclass/.test(text)) {
    return {
      reply: `Perfecto ❤️\nTe dejo la Mini Master Class oficial para que veas cómo funciona:\n\n${resources.videoLink}\n\nCuando la termines, escribime “YA LA VI” 🌿`,
      next_stage: 'video_enviado',
      lead_fields: {},
      memory_patch: { last_intent: 'video_requested' },
      actions: { ...emptyActions(), send_video_link: true }
    };
  }

  return {
    reply: holograficasWelcomeReply(),
    next_stage: 'captacion',
    lead_fields: {},
    memory_patch: { last_intent: 'safe_holograficas_fallback' },
    actions: emptyActions()
  };
}

async function requestDecision(context, retryReason = '') {
  const raw = await generateBotDecision({
    prompt: buildHolograficasPrompt({ ...context, retryReason }),
    instructions: HOLOGRAFICAS_SYSTEM_PROMPT,
    model: context.settings && context.settings.openai_model,
    maxOutputTokens: context.settings && context.settings.openai_max_output_tokens
  });
  return normalizeDecision(parseJsonObject(raw), context.currentStage);
}

async function generateHolograficasConversationTurn(context) {
  let decision = await requestDecision(context);
  let reason = invalidDecisionReason(decision, context);
  if (!reason) return decision;

  decision = await requestDecision(context, reason);
  reason = invalidDecisionReason(decision, context);
  return reason ? fallbackDecision(context) : decision;
}

module.exports = {
  VALID_HOLOGRAFICAS_STAGES,
  buildHolograficasPrompt,
  generateHolograficasConversationTurn,
  invalidDecisionReason,
  normalizeDecision
};
