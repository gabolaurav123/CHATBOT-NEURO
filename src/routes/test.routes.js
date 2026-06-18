const express = require('express');
const { z } = require('zod');
const whatsappService = require('../services/whatsappService');
const leadService = require('../services/leadService');
const { isUuid } = require('../utils/validators');

const router = express.Router();

const sendMessageSchema = z.object({
  leadId: z.string().optional(),
  jid: z.string().min(5).optional(),
  text: z.string().min(1).max(4000)
}).refine((value) => value.leadId || value.jid, {
  message: 'leadId or jid is required'
});

router.post('/send-message', async (req, res, next) => {
  try {
    const { leadId, jid, text } = sendMessageSchema.parse(req.body || {});
    let whatsappId = jid;

    if (leadId) {
      if (!isUuid(leadId)) {
        return res.status(400).json({ error: 'Invalid lead id' });
      }
      const lead = await leadService.getLeadById(leadId);
      if (!lead) {
        return res.status(404).json({ error: 'Lead not found' });
      }
      whatsappId = leadService.getLeadRecipient(lead);
    }

    if (!whatsappId) {
      return res.status(400).json({ error: 'No whatsapp_id available for this lead' });
    }

    await whatsappService.sendMessage(whatsappId, text);
    console.log('WhatsApp test message sent', { whatsapp_id: whatsappId });

    res.json({
      sent: true,
      whatsapp_id: whatsappId
    });
  } catch (error) {
    console.error('Failed to send WhatsApp test message', {
      leadId: req.body && req.body.leadId,
      jid: req.body && req.body.jid,
      error: error.message,
      stack: error.stack
    });
    next(error);
  }
});

module.exports = router;
