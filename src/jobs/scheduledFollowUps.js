const cron = require('node-cron');
const { env } = require('../config/env');
const followupService = require('../services/followupService');
const leadService = require('../services/leadService');
const messageService = require('../services/messageService');
const whatsappService = require('../services/whatsappService');
const { logger } = require('../utils/logger');

async function processDueFollowUps() {
  const followUps = await followupService.listDueFollowUps();

  for (const followUp of followUps) {
    try {
      const lead = await leadService.getLeadById(followUp.lead_id);
      if (!lead || lead.bot_paused || lead.human_takeover) continue;

      const whatsappId = followUp.whatsapp_id || lead.whatsapp_id;
      if (!whatsappId) {
        await followupService.updateFollowUp(followUp.id, { status: 'failed' });
        logger.error('Follow-up send skipped; no whatsapp_id available', { followUpId: followUp.id });
        continue;
      }

      await whatsappService.sendMessage(whatsappId, followUp.message);
      const conversation = await messageService.getOrCreateActiveConversation(lead);
      await messageService.storeMessage({
        leadId: lead.id,
        conversationId: conversation.id,
        whatsappId,
        direction: 'outbound',
        body: followUp.message,
        rawPayload: { followUpId: followUp.id, whatsapp_id: whatsappId }
      });
      await followupService.markFollowUpSent(followUp.id);
      await leadService.updateLastBotMessage(lead.id, followUp.message);
      await leadService.refreshLeadScore(lead.id);
    } catch (error) {
      logger.error('Follow-up send failed', {
        followUpId: followUp.id,
        error: error.message
      });
      await followupService.updateFollowUp(followUp.id, { status: 'failed' }).catch(() => {});
    }
  }
}

function startScheduledFollowUpsJob() {
  return cron.schedule(
    '*/5 * * * *',
    async () => {
      try {
        await processDueFollowUps();
      } catch (error) {
        logger.error('Scheduled follow-up job failed', { error: error.message });
      }
    },
    { timezone: env.TIMEZONE }
  );
}

module.exports = {
  processDueFollowUps,
  startScheduledFollowUpsJob
};
