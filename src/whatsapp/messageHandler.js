const { normalizePhone } = require('../utils/normalizePhone');
const { logger } = require('../utils/logger');
const conversationEngine = require('../bot/conversationEngine');
const whatsappService = require('../services/whatsappService');
const messageService = require('../services/messageService');
const leadService = require('../services/leadService');

function toRawPayload(message) {
  return {
    id: message.id && message.id._serialized,
    from: message.from,
    to: message.to,
    timestamp: message.timestamp,
    type: message.type,
    body: message.body
  };
}

async function handleIncomingMessage(message) {
  if (!message || message.fromMe) return;
  if (message.from && message.from.endsWith('@g.us')) return;

  const phone = normalizePhone(message.from);
  const body = String(message.body || '').trim();

  if (!phone || !body) return;

  try {
    const result = await conversationEngine.handleIncomingMessage({
      whatsappId: message.from,
      phone,
      body,
      rawPayload: toRawPayload(message)
    });

    if (!result || !result.reply) return;

    await whatsappService.sendMessage(phone, result.reply);
    await messageService.storeMessage({
      leadId: result.leadId,
      conversationId: result.conversationId,
      direction: 'outbound',
      body: result.reply,
      rawPayload: { automated: true }
    });
    await leadService.updateLastBotMessage(result.leadId, result.reply);
    await leadService.refreshLeadScore(result.leadId);
  } catch (error) {
    logger.error('Incoming WhatsApp message handling failed', {
      error: error.message,
      phone
    });
  }
}

module.exports = {
  handleIncomingMessage
};
