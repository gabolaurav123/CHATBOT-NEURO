const { normalizePhone } = require('../utils/normalizePhone');
const { logger } = require('../utils/logger');
const conversationEngine = require('../bot/conversationEngine');
const whatsappService = require('../services/whatsappService');
const messageService = require('../services/messageService');
const leadService = require('../services/leadService');

function extractMessageBody(message) {
  const content = message && message.message;
  if (!content) return '';

  if (content.ephemeralMessage && content.ephemeralMessage.message) {
    return extractMessageBody({ message: content.ephemeralMessage.message });
  }
  if (content.viewOnceMessage && content.viewOnceMessage.message) {
    return extractMessageBody({ message: content.viewOnceMessage.message });
  }
  if (content.conversation) return content.conversation;
  if (content.extendedTextMessage && content.extendedTextMessage.text) return content.extendedTextMessage.text;
  if (content.imageMessage && content.imageMessage.caption) return content.imageMessage.caption;
  if (content.videoMessage && content.videoMessage.caption) return content.videoMessage.caption;
  if (content.buttonsResponseMessage) {
    return content.buttonsResponseMessage.selectedDisplayText || content.buttonsResponseMessage.selectedButtonId || '';
  }
  if (content.listResponseMessage) {
    return content.listResponseMessage.title
      || (content.listResponseMessage.singleSelectReply && content.listResponseMessage.singleSelectReply.selectedRowId)
      || '';
  }
  if (content.templateButtonReplyMessage) {
    return content.templateButtonReplyMessage.selectedDisplayText
      || content.templateButtonReplyMessage.selectedId
      || '';
  }

  return '';
}

function toRawPayload(message, body) {
  return {
    id: message.key && message.key.id,
    remoteJid: message.key && message.key.remoteJid,
    participant: message.key && message.key.participant,
    fromMe: message.key && message.key.fromMe,
    pushName: message.pushName,
    messageTimestamp: message.messageTimestamp,
    body
  };
}

async function handleIncomingMessage(message) {
  if (!message || !message.key || message.key.fromMe) return;

  const remoteJid = message.key.remoteJid;
  if (!remoteJid || remoteJid.endsWith('@g.us')) return;

  const phone = normalizePhone(remoteJid);
  const body = String(extractMessageBody(message) || '').trim();

  if (!phone || !body) return;

  try {
    const result = await conversationEngine.handleIncomingMessage({
      whatsappId: remoteJid,
      phone,
      body,
      rawPayload: toRawPayload(message, body)
    });

    if (!result || !result.reply) return;

    await whatsappService.sendMessage(phone, result.reply);
    await messageService.storeMessage({
      leadId: result.leadId,
      conversationId: result.conversationId,
      direction: 'outbound',
      body: result.reply,
      rawPayload: { automated: true, provider: 'baileys' }
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
  handleIncomingMessage,
  extractMessageBody
};
