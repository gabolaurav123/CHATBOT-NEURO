const cron = require('node-cron');
const { env } = require('../config/env');
const memoryService = require('../services/memoryService');
const { logger } = require('../utils/logger');

function startCleanExpiredMemoryJob() {
  return cron.schedule(
    '0 * * * *',
    async () => {
      try {
        const deleted = await memoryService.deleteExpiredMemories();
        if (deleted > 0) {
          logger.info('Expired conversation memories deleted', { deleted });
        }
      } catch (error) {
        logger.error('Expired memory cleanup failed', { error: error.message });
      }
    },
    { timezone: env.TIMEZONE }
  );
}

module.exports = {
  startCleanExpiredMemoryJob
};
