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
    product_price: settings.product_price || String(env.PRODUCT_PRICE),
    hotmart_link: settings.hotmart_link || env.HOTMART_LINK,
    landing_link: settings.landing_link || env.LANDING_LINK,
    gemini_model: settings.gemini_model || env.GEMINI_MODEL
  };
}

module.exports = {
  getSettings,
  getSetting,
  upsertSettings,
  getRuntimeSettings
};
