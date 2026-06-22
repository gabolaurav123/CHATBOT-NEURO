const { query } = require('../config/db');
const { env } = require('../config/env');

async function getSettings() {
  const result = await query('SELECT key, value, json_value FROM bot_settings ORDER BY key ASC');
  const settings = {};

  for (const row of result.rows) {
    settings[row.key] = row.json_value !== null ? row.json_value : row.value;
  }

  return settings;
}

async function getSetting(key, fallback = null) {
  const result = await query('SELECT value, json_value FROM bot_settings WHERE key = $1', [key]);
  const row = result.rows[0];
  if (!row) return fallback;
  return row.json_value !== null ? row.json_value : row.value;
}

async function upsertSettings(settings) {
  const entries = Object.entries(settings || {});

  for (const [key, value] of entries) {
    if (value !== null && typeof value === 'object') {
      await query(
        `INSERT INTO bot_settings (key, json_value, value)
         VALUES ($1, $2::jsonb, NULL)
         ON CONFLICT (key) DO UPDATE SET json_value = EXCLUDED.json_value, value = NULL`,
        [key, JSON.stringify(value)]
      );
    } else {
      await query(
        `INSERT INTO bot_settings (key, value, json_value)
         VALUES ($1, $2, NULL)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, json_value = NULL`,
        [key, value === undefined || value === null ? null : String(value)]
      );
    }
  }

  return getSettings();
}

async function getRuntimeSettings() {
  const settings = await getSettings();

  return {
    product_name: settings.product_name || env.PRODUCT_NAME,
    product_normal_price: settings.product_normal_price || String(env.PRODUCT_NORMAL_PRICE),
    product_special_price: settings.product_special_price || settings.product_price || String(env.PRODUCT_SPECIAL_PRICE),
    product_price: settings.product_special_price || settings.product_price || String(env.PRODUCT_PRICE),
    video_link: settings.video_link || env.VIDEO_LINK,
    pdf_link: settings.pdf_link || env.PDF_LINK,
    hotmart_link: settings.hotmart_link || env.HOTMART_LINK,
    openai_model: settings.openai_model || env.OPENAI_MODEL,
    openai_max_output_tokens: settings.openai_max_output_tokens || String(env.OPENAI_MAX_OUTPUT_TOKENS)
  };
}

module.exports = {
  getSettings,
  getSetting,
  upsertSettings,
  getRuntimeSettings
};
