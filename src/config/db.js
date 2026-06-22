const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { env } = require('./env');
const { logger } = require('../utils/logger');

let pool;

function getPool() {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to connect to PostgreSQL');
  }

  if (!pool) {
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
  }

  return pool;
}

async function query(text, params = []) {
  return getPool().query(text, params);
}

async function initializeDatabase() {
  const schemaPath = path.join(__dirname, '..', 'database', 'migrations', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  await query(schema);
  await seedDefaultSettings();
  logger.info('Database schema is ready');
}

async function seedDefaultSettings() {
  const settings = [
    ['product_name', env.PRODUCT_NAME],
    ['product_normal_price', String(env.PRODUCT_NORMAL_PRICE)],
    ['product_special_price', String(env.PRODUCT_SPECIAL_PRICE)],
    ['product_price', String(env.PRODUCT_PRICE)],
    ['video_link', env.VIDEO_LINK],
    ['pdf_link', env.PDF_LINK],
    ['hotmart_link', env.HOTMART_LINK],
    ['openai_model', env.OPENAI_MODEL],
    ['openai_max_output_tokens', String(env.OPENAI_MAX_OUTPUT_TOKENS)]
  ];

  for (const [key, value] of settings) {
    await query(
      `INSERT INTO bot_settings (key, value)
       VALUES ($1, $2)
       ON CONFLICT (key) DO NOTHING`,
      [key, value]
    );
  }
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

module.exports = {
  getPool,
  query,
  initializeDatabase,
  closePool
};
