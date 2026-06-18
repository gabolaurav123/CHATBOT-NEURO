const EventEmitter = require('events');
const fs = require('fs-extra');
const pino = require('pino');
const {
  DisconnectReason,
  makeWASocket,
  useMultiFileAuthState
} = require('@whiskeysockets/baileys');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');
const { normalizePhone, toWhatsAppId } = require('../utils/normalizePhone');
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
    this.manualClose = false;
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

    this.manualClose = false;
    this.initializing = true;
    this.status = 'initializing';
    await updateSessionSnapshot({ status: this.status, sessionInfo: { reason: 'initialize', provider: 'baileys' } });

    const { state, saveCreds } = await useMultiFileAuthState(env.WHATSAPP_SESSION_PATH);

    const client = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      syncFullHistory: false,
      markOnlineOnConnect: false
    });

    client.ev.on('creds.update', saveCreds);

    client.ev.on('connection.update', async (update) => {
      await this.handleConnectionUpdate(update);
    });

    client.ev.on('messages.upsert', async ({ messages }) => {
      for (const message of messages || []) {
        if (this.messageHandler) {
          await this.messageHandler(message);
        }
      }
    });

    this.client = client;
  }

  async handleConnectionUpdate(update) {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      this.status = 'qr_pending';
      this.qr = await qrToDataUrl(qr);
      this.initializing = false;
      await updateSessionSnapshot({
        status: this.status,
        qrCode: this.qr,
        setQrTimestamp: true,
        sessionInfo: { event: 'qr', provider: 'baileys' }
      });
      this.emit('qr', this.qr);
      logger.info('WhatsApp QR generated with Baileys');
    }

    if (connection === 'open') {
      this.initializing = false;
      this.status = 'connected';
      this.connectedPhone = normalizePhone(this.client && this.client.user && this.client.user.id);
      this.qr = null;

      await clearQr();
      await updateSessionSnapshot({
        status: this.status,
        connectedPhone: this.connectedPhone,
        setConnectedTimestamp: true,
        sessionInfo: {
          event: 'connected',
          provider: 'baileys',
          user: this.client && this.client.user
        }
      });
      this.emit('ready');
      logger.info('WhatsApp connected with Baileys', { connectedPhone: this.connectedPhone });
    }

    if (connection === 'close') {
      this.initializing = false;
      this.status = 'disconnected';
      this.connectedPhone = null;
      this.qr = null;

      const statusCode = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output
        ? lastDisconnect.error.output.statusCode
        : undefined;

      await clearQr();
      await updateSessionSnapshot({
        status: this.status,
        clearConnectedPhone: true,
        setDisconnectedTimestamp: true,
        sessionInfo: {
          event: 'disconnected',
          provider: 'baileys',
          statusCode
        }
      });

      logger.warn('WhatsApp disconnected', { statusCode });

      if (!this.manualClose && statusCode !== DisconnectReason.loggedOut) {
        setTimeout(() => {
          this.initialize(this.messageHandler, { force: true }).catch((error) => {
            logger.error('WhatsApp reconnect failed', { error: error.message });
          });
        }, 5000);
      }
    }
  }

  async waitForQr(timeoutMs = 30000) {
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
    this.manualClose = true;
    await this.destroyClient();
    await fs.remove(env.WHATSAPP_SESSION_PATH);
    this.manualClose = false;
    this.qr = null;
    this.connectedPhone = null;
    this.status = 'initializing';
    await clearQr();

    await this.initialize(this.messageHandler, { force: true });
    await this.waitForQr();
    return this.getQr();
  }

  async restart() {
    await this.initialize(this.messageHandler, { force: true });
    return this.getStatus();
  }

  async logout() {
    this.manualClose = true;

    if (this.client && typeof this.client.logout === 'function') {
      try {
        await this.client.logout();
      } catch (error) {
        logger.warn('WhatsApp logout failed', { error: error.message });
      }
    }

    await this.destroyClient();
    await fs.remove(env.WHATSAPP_SESSION_PATH);
    this.status = 'disconnected';
    this.qr = null;
    this.connectedPhone = null;
    await clearQr();
    await updateSessionSnapshot({
      status: this.status,
      clearConnectedPhone: true,
      setDisconnectedTimestamp: true,
      sessionInfo: { event: 'logout', provider: 'baileys' }
    });

    this.manualClose = false;
    return this.getStatus();
  }

  async destroyClient() {
    if (!this.client) return;

    this.manualClose = true;

    try {
      if (this.client.ev && typeof this.client.ev.removeAllListeners === 'function') {
        this.client.ev.removeAllListeners('connection.update');
        this.client.ev.removeAllListeners('messages.upsert');
        this.client.ev.removeAllListeners('creds.update');
      }
      if (this.client.ws && typeof this.client.ws.close === 'function') {
        this.client.ws.close();
      }
      if (typeof this.client.end === 'function') {
        this.client.end();
      }
    } catch (error) {
      logger.warn('WhatsApp socket close failed', { error: error.message });
    }

    this.client = null;
    this.initializing = false;
  }

  async sendMessage(phoneOrChatId, message) {
    if (!this.client || this.status !== 'connected') {
      throw new Error('WhatsApp client is not connected');
    }

    const value = String(phoneOrChatId || '').trim();
    const jid = value.includes('@') ? value : toWhatsAppId(value);
    if (!jid) {
      throw new Error('Invalid WhatsApp recipient');
    }

    return this.client.sendMessage(jid, { text: message });
  }

  async getStatus() {
    const latest = await getLatestSession();
    const latestStatus = latest && latest.status;
    const status = this.status !== 'disconnected' ? this.status : latestStatus || 'disconnected';

    return {
      status,
      connectedPhone: this.connectedPhone || (latest && latest.connected_phone) || null,
      lastConnectedAt: latest && latest.last_connected_at,
      lastQrAt: latest && latest.last_qr_at,
      lastDisconnectedAt: latest && latest.last_disconnected_at
    };
  }

  async getQr() {
    const latest = await getLatestSession();
    const latestStatus = latest && latest.status;
    const hasQr = this.qr || (latest && latest.qr_code);

    return {
      qr: hasQr || null,
      status: this.status !== 'disconnected' ? this.status : latestStatus || 'disconnected'
    };
  }
}

module.exports = new WhatsAppClientManager();
