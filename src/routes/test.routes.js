const express = require('express');
const { z } = require('zod');
const whatsappService = require('../services/whatsappService');

const router = express.Router();

const sendMessageSchema = z.object({
  jid: z.string().min(5),
  text: z.string().min(1).max(4000)
});

router.post('/send-message', async (req, res, next) => {
  try {
    const { jid, text } = sendMessageSchema.parse(req.body || {});

    await whatsappService.sendMessage(jid, text);
    console.log('WhatsApp test message sent', { remoteJid: jid });

    res.json({
      sent: true,
      jid
    });
  } catch (error) {
    console.error('Failed to send WhatsApp test message', {
      jid: req.body && req.body.jid,
      error: error.message,
      stack: error.stack
    });
    next(error);
  }
});

module.exports = router;
