const EventEmitter = require('events');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');
const { qrToDataUrl } = require('./qr');
const { updateSessionSnapshot, clearQr, getLatestSession } = require('./session');

class WhatsAppClientManager extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.status = 'disconnected';
    this.qr = null;
    this.connectedPhone = null;
    this.messageHandler = null;
    this.initializing = false;
  }

  async initialize(messageHandler, { force = false } = {}) {
    if (messageHandler) {
      this.messageHandler = messageHandler;
    }

    if (this.initializing && !force) return;
    if (this.client && !force && ['initializing', 'qr_pending', 'connected'].includes(this.status)) return;

    if (force) {
      await this.destroyClient();
    }

    this.initializing = true;
    this.status = 'initializing';
    await updateSessionSnapshot({ status: this.status, sessionInfo: { reason: 'initialize' } });

    const client = new Client({
      authStrategy: new LocalAuth({ dataPath: env.WHATSAPP_SESSION_PATH }),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      }
    });

    client.on('qr', async (qr) => {
      this.status = 'qr_pending';
      this.qr = await qrToDataUrl(qr);
      await updateSessionSnapshot({
        status: this.status,
        qrCode: this.qr,
        setQrTimestamp: true,
        sessionInfo: { event: 'qr' }
      });
      this.emit('qr', this.qr);
      logger.info('WhatsApp QR generated');
    });

    client.on('authenticated', async () => {
      logger.info('WhatsApp authenticated');
      await updateSessionSnapshot({
        status: 'initializing',
        sessionInfo: { event: 'authenticated' }
      });
    });

    client.on('ready', async () => {
      this.initializing = false;
      this.status = 'connected';
      this.connectedPhone = client.info && client.info.wid ? `+${client.info.wid.user}` : null;
      this.qr = null;

      await clearQr();
      await updateSessionSnapshot({
        status: this.status,
        connectedPhone: this.connectedPhone,
        setConnectedTimestamp: true,
        sessionInfo: {
          event: 'ready',
          platform: client.info && client.info.platform
        }
      });
      this.emit('ready');
      logger.info('WhatsApp connected', { connectedPhone: this.connectedPhone });
    });

    client.on('auth_failure', async (message) => {
      this.initializing = false;
      this.status = 'disconnected';
      logger.warn('WhatsApp auth failure', { message });
      await clearQr();
      await updateSessionSnapshot({
        status: this.status,
        setDisconnectedTimestamp: true,
        sessionInfo: { event: 'auth_failure', message }
      });
    });

    client.on('disconnected', async (reason) => {
      this.initializing = false;
      this.status = 'disconnected';
      this.connectedPhone = null;
      logger.warn('WhatsApp disconnected', { reason });
      await clearQr();
      await updateSessionSnapshot({
        status: this.status,
        clearConnectedPhone: true,
        setDisconnectedTimestamp: true,
        sessionInfo: { event: 'disconnected', reason }
      });
    });

    client.on('message', async (message) => {
      if (this.messageHandler) {
        await this.messageHandler(message);
      }
    });

    this.client = client;

    try {
      await client.initialize();
    } catch (error) {
      this.initializing = false;
      this.status = 'disconnected';
      logger.error('WhatsApp initialization failed', { error: error.message });
      await updateSessionSnapshot({
        status: this.status,
        setDisconnectedTimestamp: true,
        sessionInfo: { event: 'initialize_error', error: error.message }
      });
      throw error;
    }
  }

  async waitForQr(timeoutMs = 20000) {
    if (this.qr) return this.qr;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.off('qr', onQr);
        reject(new Error('QR generation timeout'));
      }, timeoutMs);

      const onQr = (qr) => {
        clearTimeout(timeout);
        resolve(qr);
      };

      this.once('qr', onQr);
    });
  }

  async generateQr() {
    if (this.status === 'connected') {
      return this.getQr();
    }

    await this.initialize(this.messageHandler, { force: true });
    await this.waitForQr();
    return this.getQr();
  }

  async restart() {
    await this.initialize(this.messageHandler, { force: true });
    return this.getStatus();
  }

  async logout() {
    if (this.client) {
      try {
        await this.client.logout();
      } catch (error) {
        logger.warn('WhatsApp logout failed', { error: error.message });
      }
    }

    await this.destroyClient();
    this.status = 'disconnected';
    this.qr = null;
    this.connectedPhone = null;
    await clearQr();
    await updateSessionSnapshot({
      status: this.status,
      clearConnectedPhone: true,
      setDisconnectedTimestamp: true,
      sessionInfo: { event: 'logout' }
    });

    return this.getStatus();
  }

  async destroyClient() {
    if (!this.client) return;

    try {
      await this.client.destroy();
    } catch (error) {
      logger.warn('WhatsApp destroy failed', { error: error.message });
    }

    this.client = null;
    this.initializing = false;
  }

  async sendMessage(phoneOrChatId, message) {
    if (!this.client || this.status !== 'connected') {
      throw new Error('WhatsApp client is not connected');
    }

    const chatId = String(phoneOrChatId).includes('@c.us')
      ? phoneOrChatId
      : `${String(phoneOrChatId).replace(/\D/g, '')}@c.us`;

    return this.client.sendMessage(chatId, message);
  }

  async getStatus() {
    const latest = await getLatestSession();

    return {
      status: this.status || (latest && latest.status) || 'disconnected',
      connectedPhone: this.connectedPhone || (latest && latest.connected_phone) || null,
      lastConnectedAt: latest && latest.last_connected_at,
      lastQrAt: latest && latest.last_qr_at,
      lastDisconnectedAt: latest && latest.last_disconnected_at
    };
  }

  async getQr() {
    const latest = await getLatestSession();
    return {
      qr: this.qr || (latest && latest.qr_code) || null,
      status: this.status || (latest && latest.status) || 'disconnected'
    };
  }
}

module.exports = new WhatsAppClientManager();
