const { GoogleGenerativeAI } = require('@google/generative-ai');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');
const { SYSTEM_PROMPT } = require('./systemPrompt');

let genAI;
const warnedLegacyModels = new Set();
const LEGACY_MODEL_REPLACEMENTS = new Set([
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite'
]);

function getClient() {
  if (!env.GEMINI_API_KEY) {
    return null;
  }

  if (!genAI) {
    genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  }

  return genAI;
}

function resolveModelName(modelName) {
  const requested = modelName || env.GEMINI_MODEL || 'gemini-2.5-flash';

  if (LEGACY_MODEL_REPLACEMENTS.has(requested)) {
    if (!warnedLegacyModels.has(requested)) {
      warnedLegacyModels.add(requested);
      logger.warn('Legacy Gemini model configured; using gemini-2.5-flash instead', {
        configuredModel: requested,
        runtimeModel: 'gemini-2.5-flash'
      });
    }

    return 'gemini-2.5-flash';
  }

  return requested;
}

function getModel(systemInstruction = SYSTEM_PROMPT, overrides = {}) {
  const client = getClient();
  if (!client) return null;

  return client.getGenerativeModel({
    model: resolveModelName(overrides.model),
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

async function generateText({
  prompt,
  systemInstruction = SYSTEM_PROMPT,
  temperature,
  maxOutputTokens,
  model: modelName
}) {
  const model = getModel(systemInstruction, { model: modelName });

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

async function generateJson({
  prompt,
  systemInstruction = SYSTEM_PROMPT,
  temperature = 0.2,
  maxOutputTokens = 800,
  model: modelName
}) {
  const model = getModel(systemInstruction, { model: modelName });

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
    logger.warn('Gemini text generation failed', { error: error.message });
    return '';
  }
}

module.exports = {
  generateText,
  generateJson,
  safeGenerateText,
  resolveModelName
};
