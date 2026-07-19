const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildHolograficasPrompt,
  invalidDecisionReason,
  normalizeDecision
} = require('../src/ai/holograficasResponseGenerator');

const context = {
  lead: { selected_plan: 'holograficas', last_bot_message: null },
  memory: {},
  history: [],
  userMessage: 'quiero saber qué incluye',
  currentStage: 'post_video',
  settings: {}
};

test('el prompt aislado usa solo precio y enlaces de Holográficas', () => {
  const prompt = buildHolograficasPrompt(context);
  assert.match(prompt, /W101807995K/);
  assert.match(prompt, /btHy8kSC4E4/);
  assert.match(prompt, /USD 72/);
  assert.doesNotMatch(prompt, /T103515864E|USD 270|USD 360|1gpukjl/);
});

test('rechaza cualquier mezcla comercial con Neurotraumas', () => {
  const reason = invalidDecisionReason({
    reply: 'Entrá a Neurotraumas por USD 270',
    actions: {}
  }, context);
  assert.match(reason, /No mezcles/);
});

test('rechaza precios y enlaces inventados para Holográficas', () => {
  const wrongPrice = invalidDecisionReason({
    reply: 'La inversión es de USD 99.',
    actions: {}
  }, context);
  const wrongLink = invalidDecisionReason({
    reply: 'Entrá desde https://pay.hotmart.com/OTROPRODUCTO',
    actions: {}
  }, context);

  assert.match(wrongPrice, /precio oficial/);
  assert.match(wrongLink, /enlaces oficiales/);
});

test('exige recursos oficiales cuando activa acciones de enlace', () => {
  const videoReason = invalidDecisionReason({
    reply: 'Te paso el video.',
    actions: { send_video_link: true }
  }, context);
  const paymentReason = invalidDecisionReason({
    reply: 'Te paso el acceso.',
    actions: { send_hotmart_link: true }
  }, context);
  assert.match(videoReason, /video oficial/);
  assert.match(paymentReason, /Hotmart oficial/);
});

test('normaliza acciones faltantes y conserva etapas válidas', () => {
  const decision = normalizeDecision({
    reply: 'Respuesta válida',
    next_stage: 'datos_solicitados',
    actions: { human_takeover: true }
  }, 'captacion');
  assert.equal(decision.next_stage, 'datos_solicitados');
  assert.equal(decision.actions.human_takeover, true);
  assert.equal(decision.actions.send_hotmart_link, false);
});
