const express = require('express');
const { env } = require('../config/env');
const whatsappService = require('../services/whatsappService');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const whatsapp = await whatsappService.getStatus();

    res.json({
      ok: true,
      service: 'chatbot-neuro',
      status: 'running',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      config: {
        databaseConfigured: Boolean(env.DATABASE_URL),
        adminApiKeyConfigured: Boolean(env.ADMIN_API_KEY),
        geminiConfigured: Boolean(env.GEMINI_API_KEY),
        geminiModel: env.GEMINI_MODEL,
        whatsappSessionPath: env.WHATSAPP_SESSION_PATH,
        nodeEnv: env.NODE_ENV,
        port: env.PORT
      },
      whatsapp
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
