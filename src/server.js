const express = require('express');
const cors = require('cors');
const { env } = require('./config/env');
const healthRoutes = require('./routes/health.routes');
const whatsappRoutes = require('./routes/whatsapp.routes');
const qrRoutes = require('./routes/qr.routes');
const leadsRoutes = require('./routes/leads.routes');
const { conversationsRouter, messagesRouter } = require('./routes/conversations.routes');
const settingsRoutes = require('./routes/settings.routes');
const paymentsRoutes = require('./routes/payments.routes');
const followupsRoutes = require('./routes/followups.routes');
const testRoutes = require('./routes/test.routes');

function adminAuth(req, res, next) {
  if (!env.ADMIN_API_KEY) {
    return res.status(503).json({ error: 'ADMIN_API_KEY is not configured' });
  }

  const apiKey = req.header('x-admin-api-key');
  if (apiKey !== env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  return next();
}

function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  app.get('/', (req, res) => {
    res.json({
      ok: true,
      service: 'chatbot-neuro',
      message: 'API running. Open /api/health to check public runtime status.'
    });
  });

  app.use('/api/health', healthRoutes);
  app.use('/api/whatsapp', adminAuth, whatsappRoutes);
  app.use('/api/qr', adminAuth, qrRoutes);
  app.use('/api/leads', adminAuth, leadsRoutes);
  app.use('/api/conversations', adminAuth, conversationsRouter);
  app.use('/api/messages', adminAuth, messagesRouter);
  app.use('/api/settings', adminAuth, settingsRoutes);
  app.use('/api/payments', adminAuth, paymentsRoutes);
  app.use('/api/followups', adminAuth, followupsRoutes);
  app.use('/api/test', adminAuth, testRoutes);

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((error, req, res, next) => {
    const statusCode = error.statusCode || (error.name === 'ZodError' ? 400 : 500);
    res.status(statusCode).json({
      error: error.message || 'Internal server error',
      details: error.name === 'ZodError' ? error.errors : undefined
    });
  });

  return app;
}

module.exports = {
  createApp,
  adminAuth
};
