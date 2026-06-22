const express = require('express');
const { env } = require('../config/env');
const whatsappService = require('../services/whatsappService');
const { PROMPT_VERSION } = require('../ai/systemPrompt');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const whatsapp = await whatsappService.getStatus();
    const isAdmin = Boolean(env.ADMIN_API_KEY && req.header('x-admin-api-key') === env.ADMIN_API_KEY);
    const publicWhatsApp = {
      status: whatsapp.status,
      connected: whatsapp.status === 'connected',
      lastConnectedAt: whatsapp.lastConnectedAt,
      lastQrAt: whatsapp.lastQrAt,
      lastDisconnectedAt: whatsapp.lastDisconnectedAt
    };

    res.json({
      ok: true,
      service: 'chatbot-neuro',
      status: 'running',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      config: {
        databaseConfigured: Boolean(env.DATABASE_URL),
        adminApiKeyConfigured: Boolean(env.ADMIN_API_KEY),
        openaiConfigured: Boolean(env.OPENAI_API_KEY),
        openaiModel: env.OPENAI_MODEL,
        openaiMaxOutputTokens: env.OPENAI_MAX_OUTPUT_TOKENS,
        promptVersion: PROMPT_VERSION,
        whatsappSessionPath: env.WHATSAPP_SESSION_PATH,
        nodeEnv: env.NODE_ENV,
        port: env.PORT
      },
      whatsapp: isAdmin ? whatsapp : publicWhatsApp
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
