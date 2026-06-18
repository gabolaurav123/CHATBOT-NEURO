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

      await whatsappService.sendMessage(lead.phone, followUp.message);
      const conversation = await messageService.getOrCreateActiveConversation(lead);
      await messageService.storeMessage({
        leadId: lead.id,
        conversationId: conversation.id,
        direction: 'outbound',
        body: followUp.message,
        rawPayload: { followUpId: followUp.id }
      });
      await followupService.markFollowUpSent(followUp.id);
      await leadService.updateLastBotMessage(lead.id, followUp.message);
      await leadService.refreshLeadScore(lead.id);
    } catch (error) {
      logger.error('Follow-up send failed', {
        followUpId: followUp.id,
        error: error.message
      });
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
