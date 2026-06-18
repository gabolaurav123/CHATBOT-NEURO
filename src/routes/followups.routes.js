const express = require('express');
const followupService = require('../services/followupService');
const leadService = require('../services/leadService');
const messageService = require('../services/messageService');
const whatsappService = require('../services/whatsappService');
const { parseUuidParam } = require('../utils/validators');
const { logAdminAction } = require('../services/crmService');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    res.json(await followupService.listFollowUps(req.query));
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const id = parseUuidParam(req);
    const followUp = await followupService.updateFollowUp(id, req.body || {});
    await logAdminAction({ action: 'followup_updated', details: { id, fields: req.body || {} } });
    res.json(followUp);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/send-now', async (req, res, next) => {
  try {
    const id = parseUuidParam(req);
    const followUp = await followupService.getFollowUpById(id);
    if (!followUp) {
      const error = new Error('Follow-up not found');
      error.statusCode = 404;
      throw error;
    }

    const lead = await leadService.getLeadById(followUp.lead_id);
    if (!lead) {
      const error = new Error('Lead not found');
      error.statusCode = 404;
      throw error;
    }

    const whatsappId = followUp.whatsapp_id || leadService.getLeadRecipient(lead);
    if (!whatsappId) {
      await followupService.updateFollowUp(id, { status: 'failed' });
      const error = new Error('No whatsapp_id available for this lead');
      error.statusCode = 400;
      throw error;
    }

    try {
      await whatsappService.sendMessage(whatsappId, followUp.message);
    } catch (error) {
      await followupService.updateFollowUp(id, { status: 'failed' });
      throw error;
    }

    const conversation = await messageService.getOrCreateActiveConversation(lead);
    await messageService.storeMessage({
      leadId: lead.id,
      conversationId: conversation.id,
      whatsappId,
      direction: 'outbound',
      body: followUp.message,
      rawPayload: { followUpId: id, manual: true, whatsapp_id: whatsappId }
    });
    await leadService.updateLastBotMessage(lead.id, followUp.message);
    await followupService.markFollowUpSent(id);
    await logAdminAction({ leadId: lead.id, action: 'followup_sent_now', details: { followUpId: id } });

    res.json({ sent: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
