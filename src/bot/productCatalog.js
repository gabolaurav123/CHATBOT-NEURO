const { env } = require('../config/env');

const PLANS = {
  NEUROTRAUMAS: 'neurotraumas',
  HOLOGRAFICAS: 'holograficas'
};

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function detectSelectedPlan(message, { awaitingSelection = false } = {}) {
  const text = normalizeText(message);
  if (!text) return null;

  if (awaitingSelection && /^(1|uno|opcion 1)$/.test(text)) return PLANS.NEUROTRAUMAS;
  if (awaitingSelection && /^(2|dos|opcion 2)$/.test(text)) return PLANS.HOLOGRAFICAS;

  if (/\b(neurotraumas?|neuro trauma|neuro|traumas?)\b/.test(text)) {
    return PLANS.NEUROTRAUMAS;
  }

  if (/\b(holograficas?|gimnasio del cerebro|tarjetas holograficas?|reloj emocional|rueda del alma)\b/.test(text)) {
    return PLANS.HOLOGRAFICAS;
  }

  return null;
}

function detectCatalogIntent(message) {
  const text = normalizeText(message);
  return /\b(que|cuales|cuantos) (planes|cursos|programas|productos)\b/.test(text)
    || /\b(otros?|demas) (planes|cursos|programas|productos)\b/.test(text)
    || /\b(aparte|ademas) de (neuro|neurotrauma|neurotraumas|holograficas|gimnasio del cerebro)\b/.test(text)
    || /\bsolo (tienen|trabajan con|hay|ofrecen)\b/.test(text)
    || /\b(tienen|hay|ofrecen) algo mas\b/.test(text)
    || /\b(diferencia|comparar|comparacion)\b.*\b(neuro|holograficas|planes|cursos)\b/.test(text);
}

function resolvePlanRoute({ message, selectedPlan, awaitingSelection = false, legacyEstablished = false } = {}) {
  if (detectCatalogIntent(message)) return { type: 'catalog' };

  const requestedPlan = detectSelectedPlan(message, { awaitingSelection });
  if (requestedPlan && (!selectedPlan || awaitingSelection || requestedPlan !== selectedPlan)) {
    return {
      type: 'select',
      selectedPlan: requestedPlan,
      switched: Boolean(selectedPlan && requestedPlan !== selectedPlan)
    };
  }

  if (!selectedPlan && legacyEstablished) {
    return { type: 'legacy_neurotraumas' };
  }

  if (!selectedPlan) return { type: 'selection' };
  return { type: 'continue' };
}

function planSelectionReply({ hasProblem = false } = {}) {
  if (hasProblem) {
    return [
      'Te entiendo ❤️',
      'Para orientarte mejor y no confundirte con información que no corresponde, primero necesito saber qué plan querés conocer:',
      '',
      '1️⃣ Neurotraumas',
      '2️⃣ Holográficas / Gimnasio del Cerebro',
      '',
      'Respondeme con el número y te guío desde ahí 🌿'
    ].join('\n');
  }

  return [
    'Hola 👋🌿',
    'Gracias por escribirnos.',
    '',
    'Para orientarte mejor, decime sobre qué plan querés información:',
    '',
    '1️⃣ Neurotraumas',
    '2️⃣ Holográficas / Gimnasio del Cerebro',
    '',
    'Respondeme solo con el número o el nombre del plan ❤️'
  ].join('\n');
}

function planCatalogReply() {
  return [
    'Claro ❤️',
    'Trabajamos con dos planes diferentes:',
    '',
    '1️⃣ Neurotraumas',
    '2️⃣ Holográficas / Gimnasio del Cerebro',
    '',
    'Cada uno tiene su propio contenido, precio y acceso.',
    'Respondeme con el número o el nombre del plan que querés conocer y te cuento desde ahí 🌿'
  ].join('\n');
}

function holograficasWelcomeReply() {
  return [
    'Perfecto ❤️',
    'Soy Priscila, del Gimnasio del Cerebro 🌿🧠',
    '',
    'Este entrenamiento es para personas que sienten que algo se repite en su vida y quieren empezar a trabajarlo desde la raíz.',
    '',
    'Decime, ¿qué te gustaría transformar primero?',
    '',
    '1️⃣ Ansiedad o pensamientos que no paran',
    '2️⃣ Miedos o inseguridad',
    '3️⃣ Bloqueos con el dinero',
    '4️⃣ Relaciones o heridas emocionales',
    '5️⃣ Propósito o sensación de estar estancad@',
    '6️⃣ Cargas familiares o del pasado',
    '',
    'Respondeme solo con el número ❤️'
  ].join('\n');
}

function getPlanResources(selectedPlan, settings = {}) {
  if (selectedPlan === PLANS.HOLOGRAFICAS) {
    return {
      productName: settings.holograficas_product_name || env.HOLOGRAFICAS_PRODUCT_NAME,
      assistantName: 'Priscila',
      price: Number(settings.holograficas_price || env.HOLOGRAFICAS_PRICE || 72),
      videoLink: settings.holograficas_video_link || env.HOLOGRAFICAS_VIDEO_LINK,
      hotmartLink: settings.holograficas_hotmart_link || env.HOLOGRAFICAS_HOTMART_LINK
    };
  }

  return {
    productName: settings.product_name || env.PRODUCT_NAME,
    assistantName: env.BOT_NAME,
    price: Number(settings.product_special_price || settings.product_price || env.PRODUCT_SPECIAL_PRICE || 270),
    videoLink: settings.video_link || env.VIDEO_LINK,
    hotmartLink: settings.hotmart_link || env.HOTMART_LINK
  };
}

module.exports = {
  PLANS,
  detectCatalogIntent,
  detectSelectedPlan,
  getPlanResources,
  holograficasWelcomeReply,
  normalizeText,
  planCatalogReply,
  resolvePlanRoute,
  planSelectionReply
};
