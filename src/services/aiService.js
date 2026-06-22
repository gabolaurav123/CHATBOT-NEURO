const OpenAI = require('openai');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');
const { SYSTEM_PROMPT } = require('../ai/systemPrompt');

let client;

function getClient() {
  if (!env.OPENAI_API_KEY) {
    return null;
  }

  if (!client) {
    client = new OpenAI({
      apiKey: env.OPENAI_API_KEY
    });
  }

  return client;
}

function getModel(modelName) {
  return modelName || env.OPENAI_MODEL || 'gpt-5.4-mini';
}

function getMaxOutputTokens(value) {
  const tokens = Number(value || env.OPENAI_MAX_OUTPUT_TOKENS || 700);
  if (!Number.isFinite(tokens) || tokens <= 0) return 700;
  return Math.min(Math.max(Math.round(tokens), 500), 1200);
}

function extractOutputText(response) {
  if (response && typeof response.output_text === 'string') {
    return response.output_text.trim();
  }

  const output = Array.isArray(response && response.output) ? response.output : [];
  for (const item of output) {
    const content = Array.isArray(item && item.content) ? item.content : [];
    for (const part of content) {
      if (typeof part.text === 'string') return part.text.trim();
      if (typeof part.output_text === 'string') return part.output_text.trim();
    }
  }

  return '';
}

async function createResponse({ input, instructions = SYSTEM_PROMPT, model, maxOutputTokens, json = false }) {
  const openai = getClient();

  if (!openai) {
    console.error('Falta OPENAI_API_KEY en las variables de entorno.');
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const request = {
    model: getModel(model),
    instructions,
    input,
    max_output_tokens: getMaxOutputTokens(maxOutputTokens),
    reasoning: {
      effort: 'none'
    }
  };

  if (json) {
    request.text = {
      format: {
        type: 'json_object'
      }
    };
  }

  const response = await openai.responses.create(request);

  if (response.status === 'incomplete') {
    const reason = response.incomplete_details && response.incomplete_details.reason;
    throw new Error(`OpenAI response incomplete${reason ? `: ${reason}` : ''}`);
  }

  const text = extractOutputText(response);
  if (!text) {
    throw new Error('OpenAI returned an empty response');
  }

  return text;
}

async function generateBotReply(userMessage, context = '') {
  try {
    if (!env.OPENAI_API_KEY) {
      console.error('Falta OPENAI_API_KEY en las variables de entorno.');
      return 'Ahora mismo tengo un problema tecnico para responder. Por favor intenta de nuevo en unos minutos.';
    }

    const input = [
      'Contexto actual del usuario:',
      context || 'Sin contexto adicional.',
      '',
      'Mensaje actual:',
      userMessage
    ].join('\n');

    return await createResponse({
      input,
      instructions: SYSTEM_PROMPT,
      maxOutputTokens: env.OPENAI_MAX_OUTPUT_TOKENS
    });
  } catch (error) {
    logger.error('OpenAI error', {
      error: error.message
    });
    return 'Perdon, tuve un problema tecnico respondiendo. Me repetis tu mensaje por favor?';
  }
}

async function generateBotDecision({ prompt, model, maxOutputTokens }) {
  return createResponse({
    input: prompt,
    instructions: SYSTEM_PROMPT,
    model,
    maxOutputTokens,
    json: true
  });
}

module.exports = {
  generateBotReply,
  generateBotDecision,
  getModel
};
