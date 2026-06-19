const { generateJson } = require('./geminiClient');
const { logger } = require('../utils/logger');
const {
  detectLeadIntent,
  detectPain,
  detectPurchaseIntent,
  detectDeleteRequest,
  detectHumanRequest,
  detectUrgency
} = require('../bot/intentDetector');
const { detectObjection } = require('../bot/objectionDetector');
const { detectCrisis } = require('../bot/safety');
const { extractEmail } = require('../utils/validators');

function ruleBasedClassification(message) {
  const intent = detectLeadIntent(message);
  const objection = detectObjection(message);
  const email = extractEmail(message);

  return {
    intent,
    pain: detectPain(message),
    objection,
    urgency: detectUrgency(message),
    email,
    name: null,
    username: null,
    wantsPaymentLink: detectPurchaseIntent(message),
    wantsDeleteData: detectDeleteRequest(message),
    needsHuman: detectHumanRequest(message),
    isCrisis: detectCrisis(message)
  };
}

async function classifyUserMessage({ message, lead, memory, history }) {
  const fallback = ruleBasedClassification(message);

  const prompt = `Devuelve SOLO JSON válido. Clasifica este mensaje de WhatsApp para Marisa, guía de Neurotraumas.

Esquema:
{
  "intent": "info | ansiedad | autosabotaje | precio | compra | objecion | crisis | borrar | humano | otro",
  "pain": "ansiedad | autosabotaje | pensamientos_repetitivos | relaciones_dificiles | bloqueo | informacion | null",
  "objection": "precio | tiempo | confianza | indecision | ninguna",
  "urgency": null,
  "email": null,
  "name": null,
  "username": null,
  "wantsPaymentLink": false,
  "wantsDeleteData": false,
  "needsHuman": false,
  "isCrisis": false
}

No inventes datos personales. Extrae nombre, email o usuario solo si aparecen claramente.
No marques wantsPaymentLink solo porque pregunta precio; eso es precio, no compra.

Lead:
${JSON.stringify(lead || {}, null, 2)}

Memoria:
${JSON.stringify(memory || {}, null, 2)}

Historial reciente:
${JSON.stringify(history || [], null, 2)}

Mensaje:
${message}`;

  try {
    const ai = await generateJson({ prompt, temperature: 0.1, maxOutputTokens: 500 });
    return {
      ...fallback,
      ...ai,
      wantsPaymentLink: Boolean((ai && ai.wantsPaymentLink) || fallback.wantsPaymentLink),
      wantsDeleteData: Boolean((ai && ai.wantsDeleteData) || fallback.wantsDeleteData),
      needsHuman: Boolean((ai && ai.needsHuman) || fallback.needsHuman),
      isCrisis: Boolean((ai && ai.isCrisis) || fallback.isCrisis),
      email: (ai && ai.email) || fallback.email,
      urgency: (ai && ai.urgency) || fallback.urgency,
      objection: fallback.objection !== 'ninguna' ? fallback.objection : (ai && ai.objection) || 'ninguna',
      intent: fallback.intent !== 'otro' ? fallback.intent : (ai && ai.intent) || 'otro',
      pain: fallback.pain || (ai && ai.pain) || null
    };
  } catch (error) {
    logger.warn('Gemini classification failed; using rule-based classification', { error: error.message });
    return fallback;
  }
}

module.exports = {
  classifyUserMessage,
  ruleBasedClassification
};
