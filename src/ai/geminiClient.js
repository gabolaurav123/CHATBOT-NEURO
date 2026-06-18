const { GoogleGenerativeAI } = require('@google/generative-ai');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');
const { SYSTEM_PROMPT } = require('./systemPrompt');
const { fallbackMessage } = require('../bot/flows');

let genAI;

function getClient() {
  if (!env.GEMINI_API_KEY) {
    return null;
  }

  if (!genAI) {
    genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  }

  return genAI;
}

function getModel(systemInstruction = SYSTEM_PROMPT, overrides = {}) {
  const client = getClient();
  if (!client) return null;

  return client.getGenerativeModel({
    model: overrides.model || env.GEMINI_MODEL,
    systemInstruction
  });
}

function extractJson(text) {
  if (!text) return null;

  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return JSON.parse(trimmed);
  }

  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) return null;

  return JSON.parse(match[0]);
}

async function generateText({ prompt, systemInstruction = SYSTEM_PROMPT, temperature, maxOutputTokens }) {
  const model = getModel(systemInstruction);

  if (!model) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: temperature ?? env.GEMINI_TEMPERATURE,
      maxOutputTokens: maxOutputTokens ?? env.GEMINI_MAX_OUTPUT_TOKENS
    }
  });

  return result.response.text();
}

async function generateJson({ prompt, systemInstruction = SYSTEM_PROMPT, temperature = 0.2, maxOutputTokens = 800 }) {
  const model = getModel(systemInstruction);

  if (!model) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      maxOutputTokens,
      responseMimeType: 'application/json'
    }
  });

  return extractJson(result.response.text());
}

async function safeGenerateText(options) {
  try {
    return await generateText(options);
  } catch (error) {
    logger.warn('Gemini text generation failed; using fallback reply', { error: error.message });
    return fallbackMessage();
  }
}

async function generateBotReply({
  lead,
  memory,
  conversationHistory,
  userMessage,
  currentStage,
  settings
}) {
  const fallback = {
    reply: fallbackMessage(),
    detectedIntent: 'otro',
    detectedObjection: 'ninguna',
    nextStage: currentStage || 'captacion',
    fieldsToUpdate: {
      name: null,
      email: null,
      username: null,
      main_pain: null,
      urgency: null,
      problem_duration: null,
      tried_before: null
    },
    shouldSendHotmartLink: false,
    shouldPauseBot: false,
    shouldCreateFollowUp: false
  };

  const prompt = `Analiza la conversación y devuelve SOLO JSON válido con este esquema exacto:
{
  "reply": "mensaje que se enviará por WhatsApp",
  "detectedIntent": "info | ansiedad | autosabotaje | precio | compra | objecion | crisis | borrar | humano | otro",
  "detectedObjection": "precio | tiempo | confianza | indecision | ninguna",
  "nextStage": "captacion | diagnostico | datos_solicitados | oferta_presentada | link_pago_enviado | post_link_conversacion | pago_reportado | onboarding",
  "fieldsToUpdate": {
    "name": null,
    "email": null,
    "username": null,
    "main_pain": null,
    "urgency": null,
    "problem_duration": null,
    "tried_before": null
  },
  "shouldSendHotmartLink": false,
  "shouldPauseBot": false,
  "shouldCreateFollowUp": false
}

Reglas:
- Producto: ${settings.product_name || 'Neurotraumas™'}.
- Precio: USD $${settings.product_price || 360}.
- Link Hotmart disponible: ${settings.hotmart_link || 'https://pay.hotmart.com/T103515864E'}.
- No menciones páginas externas de preparación ni materiales previos de preventa.
- No prometas curas, no diagnostiques, no inventes descuentos ni cupos.
- Una sola pregunta por respuesta.
- Si hay crisis o autolesión, deja de vender.

Lead:
${JSON.stringify(lead || {}, null, 2)}

Memoria:
${JSON.stringify(memory || {}, null, 2)}

Etapa actual: ${currentStage || 'captacion'}

Historial reciente:
${JSON.stringify(conversationHistory || [], null, 2)}

Mensaje del usuario:
${userMessage}`;

  try {
    const parsed = await generateJson({
      prompt,
      systemInstruction: SYSTEM_PROMPT,
      temperature: env.GEMINI_TEMPERATURE,
      maxOutputTokens: env.GEMINI_MAX_OUTPUT_TOKENS
    });

    return {
      ...fallback,
      ...parsed,
      fieldsToUpdate: {
        ...fallback.fieldsToUpdate,
        ...(parsed && parsed.fieldsToUpdate ? parsed.fieldsToUpdate : {})
      }
    };
  } catch (error) {
    logger.warn('Gemini structured reply failed; using fallback object', { error: error.message });
    return fallback;
  }
}

module.exports = {
  generateText,
  generateJson,
  safeGenerateText,
  generateBotReply
};
