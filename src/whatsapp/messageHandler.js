const { normalizeWhatsAppIdentity } = require('../utils/normalizePhone');
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
  const movingMediaMessage = content[`${'vid'}eoMessage`];
  if (movingMediaMessage && movingMediaMessage.caption) return movingMediaMessage.caption;
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
  const remoteJid = message && message.key && message.key.remoteJid;
  const fromMe = Boolean(message && message.key && message.key.fromMe);
  const messageType = message && message.message ? Object.keys(message.message)[0] : 'unknown';
  const body = String(extractMessageBody(message) || '').trim();

  console.log('Incoming WhatsApp message', {
    remoteJid,
    fromMe,
    text: body,
    pushName: message && message.pushName,
    messageType
  });

  if (!message || !message.key || fromMe) return;
  if (!remoteJid || remoteJid.endsWith('@g.us')) return;

  const identity = normalizeWhatsAppIdentity(remoteJid);

  console.log('WhatsApp identity resolved', {
    remoteJid,
    phone: identity.phone,
    whatsapp_id: identity.whatsapp_id,
    whatsapp_lid: identity.whatsapp_lid,
    display_phone: identity.display_phone
  });

  if (!identity.whatsapp_id || !body) return;

  try {
    const result = await conversationEngine.handleIncomingMessage({
      whatsappId: identity.whatsapp_id,
      phone: identity.phone,
      identity,
      body,
      rawPayload: toRawPayload(message, body)
    });

    if (!result || !result.reply) {
      console.log('No WhatsApp reply generated', {
        remoteJid,
        leadId: result && result.leadId,
        conversationId: result && result.conversationId
      });
      return;
    }

    const replyJid = result.whatsappId || identity.whatsapp_id;
    try {
      console.log('Sending WhatsApp reply', { remoteJid: replyJid });
      await whatsappService.sendMessage(replyJid, result.reply);
      console.log('WhatsApp reply sent', { remoteJid: replyJid });
    } catch (error) {
      console.error('Failed to send WhatsApp reply', {
        remoteJid: replyJid,
        error: error.message,
        stack: error.stack
      });
      return;
    }

    await messageService.storeMessage({
      leadId: result.leadId,
      conversationId: result.conversationId,
      whatsappId: replyJid,
      direction: 'outbound',
      body: result.reply,
      rawPayload: { automated: true, provider: 'baileys' }
    });
    await leadService.updateLastBotMessage(result.leadId, result.reply);
    await leadService.refreshLeadScore(result.leadId);
  } catch (error) {
    logger.error('Incoming WhatsApp message handling failed', {
      error: error.message,
      whatsapp_id: identity.whatsapp_id
    });
  }
}

module.exports = {
  handleIncomingMessage,
  extractMessageBody
};
