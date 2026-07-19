const test = require('node:test');
const assert = require('node:assert/strict');
const { detectCrisis } = require('../src/bot/safety');

test('detecta expresiones críticas antes del modelo', () => {
  assert.equal(detectCrisis('me quiero morir'), true);
  assert.equal(detectCrisis('estoy en peligro inmediato'), true);
  assert.equal(detectCrisis('sufro violencia actual'), true);
  assert.equal(detectCrisis('quiero información'), false);
});
