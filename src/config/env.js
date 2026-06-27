const dotenv = require('dotenv');

dotenv.config();

function numberFromEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;

  const value = Number(raw);
  if (Number.isNaN(value)) {
    throw new Error(`${name} must be a valid number`);
  }

  return value;
}

const env = {
  DATABASE_URL: process.env.DATABASE_URL,
  PORT: numberFromEnv('PORT', 80),
  NODE_ENV: process.env.NODE_ENV || 'development',
  ADMIN_API_KEY: process.env.ADMIN_API_KEY,
  CRM_SECTION: process.env.CRM_SECTION || 'holografica',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-5.4-mini',
  OPENAI_MAX_OUTPUT_TOKENS: numberFromEnv('OPENAI_MAX_OUTPUT_TOKENS', 700),
  BOT_NAME: process.env.BOT_NAME || 'Priscila',
  PRODUCT_NAME: process.env.PRODUCT_NAME || 'Gimnasio del Cerebro',
  PRODUCT_NORMAL_PRICE: numberFromEnv('PRODUCT_NORMAL_PRICE', 72),
  PRODUCT_SPECIAL_PRICE: numberFromEnv('PRODUCT_SPECIAL_PRICE', 72),
  PRODUCT_PRICE: numberFromEnv('PRODUCT_PRICE', numberFromEnv('PRODUCT_SPECIAL_PRICE', 72)),
  VIDEO_LINK: process.env.VIDEO_LINK || 'https://youtu.be/btHy8kSC4E4',
  PDF_LINK: process.env.PDF_LINK || '',
  HOTMART_LINK: process.env.HOTMART_LINK || 'https://pay.hotmart.com/W101807995K',
  MEMORY_EXPIRATION_HOURS: numberFromEnv('MEMORY_EXPIRATION_HOURS', 24),
  FOLLOWUP_1_HOURS: numberFromEnv('FOLLOWUP_1_HOURS', 12),
  FOLLOWUP_PAYMENT_1_HOURS: numberFromEnv('FOLLOWUP_PAYMENT_1_HOURS', 6),
  FOLLOWUP_PAYMENT_2_HOURS: numberFromEnv('FOLLOWUP_PAYMENT_2_HOURS', 24),
  FOLLOWUP_PAYMENT_3_HOURS: numberFromEnv('FOLLOWUP_PAYMENT_3_HOURS', 48),
  FOLLOWUP_4_DAYS: numberFromEnv('FOLLOWUP_4_DAYS', 7),
  WHATSAPP_SESSION_PATH: process.env.WHATSAPP_SESSION_PATH || '.baileys_auth',
  TIMEZONE: process.env.TIMEZONE || 'America/La_Paz'
};

function validateStartupEnv() {
  const required = ['DATABASE_URL', 'ADMIN_API_KEY'];
  const missing = required.filter((name) => !env[name]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

module.exports = {
  env,
  validateStartupEnv
};
