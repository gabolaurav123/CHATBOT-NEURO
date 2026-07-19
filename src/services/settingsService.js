const { query } = require('../config/db');
const { env } = require('../config/env');

const DEFAULT_PRODUCT_NAME = 'Neurotraumas';
const DEFAULT_NORMAL_PRICE = '360';
const DEFAULT_SPECIAL_PRICE = '270';
const DEFAULT_VIDEO_LINK = 'https://drive.google.com/file/d/1gpukjlEwfQMXHN8LD_GN2-IEncwZ3wFy/view?usp=drive_link';
const DEFAULT_HOTMART_LINK = 'https://pay.hotmart.com/T103515864E';
const LEGACY_HOTMART_LINK = 'https://pay.hotmart.com/W101807995K';
const LEGACY_VIDEO_LINK = 'https://youtu.be/btHy8kSC4E4';
const HOTMART_PLACEHOLDERS = [
  '(LINK HOTMART)',
  '[LINK HOTMART]',
  'LINK HOTMART',
  '(HOTMART_LINK)',
  '[HOTMART_LINK]',
  'HOTMART_LINK'
];

function activeTextSetting(value, fallback, legacyValues = []) {
  const text = value === undefined || value === null ? '' : String(value).trim();
  if (!text || legacyValues.includes(text)) return fallback;
  return text;
}

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
    product_name: activeTextSetting(settings.product_name, DEFAULT_PRODUCT_NAME, ['Gimnasio del Cerebro']),
    product_normal_price: activeTextSetting(settings.product_normal_price, DEFAULT_NORMAL_PRICE, ['72']),
    product_special_price: activeTextSetting(settings.product_special_price || settings.product_price, DEFAULT_SPECIAL_PRICE, ['72']),
    product_price: activeTextSetting(settings.product_special_price || settings.product_price, DEFAULT_SPECIAL_PRICE, ['72']),
    video_link: activeTextSetting(settings.video_link, DEFAULT_VIDEO_LINK, [LEGACY_VIDEO_LINK]),
    pdf_link: settings.pdf_link || env.PDF_LINK,
    hotmart_link: activeTextSetting(settings.hotmart_link, DEFAULT_HOTMART_LINK, [LEGACY_HOTMART_LINK, ...HOTMART_PLACEHOLDERS]),
    openai_model: settings.openai_model || env.OPENAI_MODEL,
    openai_max_output_tokens: settings.openai_max_output_tokens || String(env.OPENAI_MAX_OUTPUT_TOKENS),
    holograficas_product_name: settings.holograficas_product_name || env.HOLOGRAFICAS_PRODUCT_NAME,
    holograficas_price: settings.holograficas_price || String(env.HOLOGRAFICAS_PRICE),
    holograficas_video_link: settings.holograficas_video_link || env.HOLOGRAFICAS_VIDEO_LINK,
    holograficas_hotmart_link: settings.holograficas_hotmart_link || env.HOLOGRAFICAS_HOTMART_LINK
  };
}

module.exports = {
  getSettings,
  getSetting,
  upsertSettings,
  getRuntimeSettings
};
