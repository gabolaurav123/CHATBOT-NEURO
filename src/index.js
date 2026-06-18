const { validateStartupEnv } = require('./config/env');
const { initializeDatabase, closePool } = require('./config/db');
const { createApp } = require('./server');
const whatsappClient = require('./whatsapp/client');
const { handleIncomingMessage } = require('./whatsapp/messageHandler');
const { startCleanExpiredMemoryJob } = require('./jobs/cleanExpiredMemory');
const { startScheduledFollowUpsJob } = require('./jobs/scheduledFollowUps');
const { logger } = require('./utils/logger');

async function main() {
  validateStartupEnv();
  await initializeDatabase();

  const app = createApp();
  const PORT = process.env.PORT || 80;
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
  });

  const jobs = [
    startCleanExpiredMemoryJob(),
    startScheduledFollowUpsJob()
  ];

  whatsappClient.initialize(handleIncomingMessage).catch((error) => {
    logger.error('WhatsApp client could not start automatically', { error: error.message });
  });

  const shutdown = async () => {
    logger.info('Shutting down');
    jobs.forEach((job) => job.stop());
    server.close(async () => {
      await whatsappClient.destroyClient();
      await closePool();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  logger.error('Startup failed', { error: error.message });
  process.exit(1);
});
