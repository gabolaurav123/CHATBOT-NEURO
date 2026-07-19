const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PLANS,
  detectSelectedPlan,
  getPlanResources,
  holograficasWelcomeReply,
  planCatalogReply,
  resolvePlanRoute,
  planSelectionReply
} = require('../src/bot/productCatalog');

test('detecta planes por número solo durante la selección', () => {
  assert.equal(detectSelectedPlan('1', { awaitingSelection: true }), PLANS.NEUROTRAUMAS);
  assert.equal(detectSelectedPlan('2', { awaitingSelection: true }), PLANS.HOLOGRAFICAS);
  assert.equal(detectSelectedPlan('2'), null);
});

test('detecta nombres y conceptos exclusivos de cada producto', () => {
  assert.equal(detectSelectedPlan('Quiero Neurotraumas'), PLANS.NEUROTRAUMAS);
  assert.equal(detectSelectedPlan('Me interesan las Tarjetas Holográficas'), PLANS.HOLOGRAFICAS);
  assert.equal(detectSelectedPlan('Tengo ansiedad'), null);
});

test('mantiene recursos comerciales aislados', () => {
  const neuro = getPlanResources(PLANS.NEUROTRAUMAS, {});
  const holograficas = getPlanResources(PLANS.HOLOGRAFICAS, {});

  assert.equal(neuro.hotmartLink, 'https://pay.hotmart.com/T103515864E');
  assert.equal(holograficas.hotmartLink, 'https://pay.hotmart.com/W101807995K');
  assert.equal(holograficas.videoLink, 'https://youtu.be/btHy8kSC4E4');
  assert.equal(holograficas.price, 72);
});

test('los mensajes deterministas presentan primero el selector y luego a Priscila', () => {
  assert.match(planSelectionReply(), /1️⃣ Neurotraumas/);
  assert.match(planSelectionReply(), /2️⃣ Holográficas/);
  assert.doesNotMatch(planSelectionReply(), /Marisa|Priscila/);
  assert.match(holograficasWelcomeReply(), /Soy Priscila/);
  assert.match(holograficasWelcomeReply(), /6️⃣ Cargas familiares/);
});

test('las consultas de la captura muestran el catálogo aunque el lead sea antiguo', () => {
  for (const message of [
    'Dime que planes tienes solo NeuroTrauma?',
    'Pero aparte de NeuroTrauma que cursos más tienes'
  ]) {
    assert.deepEqual(resolvePlanRoute({
      message,
      selectedPlan: 'neurotraumas',
      legacyEstablished: true
    }), { type: 'catalog' });
  }

  const reply = planCatalogReply();
  assert.match(reply, /1️⃣ Neurotraumas/);
  assert.match(reply, /2️⃣ Holográficas \/ Gimnasio del Cerebro/);
  assert.doesNotMatch(reply, /solo (trabajamos|tenemos) con Neurotraumas/i);
});

test('permite elegir Holográficas después de abrir el catálogo', () => {
  assert.deepEqual(resolvePlanRoute({
    message: '2',
    selectedPlan: 'neurotraumas',
    awaitingSelection: true
  }), {
    type: 'select',
    selectedPlan: 'holograficas',
    switched: true
  });
});

test('una comparación muestra catálogo y una elección explícita cambia de plan', () => {
  assert.equal(resolvePlanRoute({
    message: 'Cuál es la diferencia entre Neurotraumas y Holográficas?',
    selectedPlan: 'neurotraumas'
  }).type, 'catalog');

  assert.equal(resolvePlanRoute({
    message: 'Quiero Holográficas',
    selectedPlan: 'neurotraumas'
  }).selectedPlan, 'holograficas');
});
