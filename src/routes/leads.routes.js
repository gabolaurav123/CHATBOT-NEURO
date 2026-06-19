const express = require('express');
const leadService = require('../services/leadService');
const memoryService = require('../services/memoryService');
const messageService = require('../services/messageService');
const paymentService = require('../services/paymentService');
const followupService = require('../services/followupService');
const settingsService = require('../services/settingsService');
const whatsappService = require('../services/whatsappService');
const { logAdminAction } = require('../services/crmService');
const { isUuid, textMessageSchema } = require('../utils/validators');
const { hotmartMessage } = require('../bot/flows');
const { buildPaymentFollowUps } = require('../bot/followUps');

const router = express.Router();

function parseLeadId(req) {
  const id = req.params.id;
  if (!isUuid(id)) {
    const error = new Error('Invalid lead id');
    error.statusCode = 400;
    throw error;
  }
  return id;
}

function getRecipientOrThrow(lead) {
  const recipient = leadService.getLeadRecipient(lead);
  if (!recipient) {
    const error = new Error('No whatsapp_id available for this lead');
    error.statusCode = 400;
    throw error;
  }
  return recipient;
}

async function getLeadOr404(id) {
  const lead = await leadService.getLeadById(id);
  if (!lead) {
    const error = new Error('Lead not found');
    error.statusCode = 404;
    throw error;
  }
  return lead;
}

async function storeManualOutbound(lead, message, rawPayload = {}) {
  const conversation = await messageService.getOrCreateActiveConversation(lead);
  await messageService.storeMessage({
    leadId: lead.id,
    conversationId: conversation.id,
    whatsappId: lead.whatsapp_id || rawPayload.recipient || null,
    direction: 'outbound',
    body: message,
    rawPayload: {
      manual: true,
      ...rawPayload
    }
  });
  await leadService.updateLastBotMessage(lead.id, message);
  await leadService.refreshLeadScore(lead.id);
}

router.get('/', async (req, res, next) => {
  try {
    res.json(await leadService.listLeads(req.query));
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = parseLeadId(req);
    res.json(await getLeadOr404(id));
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const id = parseLeadId(req);
    const lead = await leadService.updateLead(id, req.body || {});
    await leadService.refreshLeadScore(id);
    await logAdminAction({ leadId: id, action: 'lead_updated', details: req.body || {} });
    res.json(lead);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/pause-bot', async (req, res, next) => {
  try {
    const id = parseLeadId(req);
    const lead = await leadService.updateLead(id, { bot_paused: true });
    await logAdminAction({ leadId: id, action: 'bot_paused' });
    res.json(lead);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/resume-bot', async (req, res, next) => {
  try {
    const id = parseLeadId(req);
    const lead = await leadService.updateLead(id, { bot_paused: false });
    await logAdminAction({ leadId: id, action: 'bot_resumed' });
    res.json(lead);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/takeover', async (req, res, next) => {
  try {
    const id = parseLeadId(req);
    const lead = await leadService.updateLead(id, { human_takeover: true });
    await logAdminAction({ leadId: id, action: 'human_takeover' });
    res.json(lead);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/release-takeover', async (req, res, next) => {
  try {
    const id = parseLeadId(req);
    const lead = await leadService.updateLead(id, { human_takeover: false });
    await logAdminAction({ leadId: id, action: 'human_takeover_released' });
    res.json(lead);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/send-message', async (req, res, next) => {
  try {
    const id = parseLeadId(req);
    const parsed = textMessageSchema.parse(req.body || {});
    const text = parsed.text || parsed.message;
    const lead = await getLeadOr404(id);
    const recipient = getRecipientOrThrow(lead);

    await whatsappService.sendMessage(recipient, text);
    await storeManualOutbound(lead, text, { recipient });
    await logAdminAction({ leadId: id, action: 'manual_message_sent', details: { message: text, recipient } });

    res.json({ sent: true });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/send-hotmart-link', async (req, res, next) => {
  try {
    const id = parseLeadId(req);
    let lead = await getLeadOr404(id);
    const settings = await settingsService.getRuntimeSettings();
    const hotmartLink = settings.hotmart_link || 'https://pay.hotmart.com/T103515864E';
    const message = hotmartMessage(lead, hotmartLink, settings);
    const recipient = getRecipientOrThrow(lead);

    await whatsappService.sendMessage(recipient, message);
    await storeManualOutbound(lead, message, { hotmart: true, recipient });

    lead = await leadService.updateLead(id, {
      hotmart_link_sent: true,
      hotmart_link_sent_at: new Date(),
      purchase_intent: true,
      funnel_stage: 'link_pago_enviado',
      payment_status: 'pendiente'
    });

    await paymentService.createPayment({
      leadId: lead.id,
      phone: lead.phone,
      paymentLink: hotmartLink,
      amount: settings.product_special_price || settings.product_price,
      metadata: { source: 'crm' }
    });

    const followUps = buildPaymentFollowUps(lead, hotmartLink);
    await followupService.createFollowUps(
      followUps.map((item) => ({
        leadId: lead.id,
        phone: lead.phone,
        whatsappId: lead.whatsapp_id,
        type: item.type,
        scheduledAt: item.scheduledAt,
        message: item.message
      }))
    );

    await logAdminAction({ leadId: id, action: 'hotmart_link_sent' });
    res.json({ sent: true, lead });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/mark-paid', async (req, res, next) => {
  try {
    const id = parseLeadId(req);
    const payment = await paymentService.markLeadPaid(id);
    const lead = await leadService.getLeadById(id);
    await logAdminAction({ leadId: id, action: 'payment_marked_paid' });
    res.json({ payment, lead });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/delete-memory', async (req, res, next) => {
  try {
    const id = parseLeadId(req);
    await memoryService.deleteMemoryByLeadId(id);
    const lead = await leadService.updateLead(id, {
      consent_24h: false,
      memory_expires_at: null
    });
    await logAdminAction({ leadId: id, action: 'memory_deleted' });
    res.json({ deleted: true, lead });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
