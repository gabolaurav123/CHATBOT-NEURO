const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildOptInResetFields,
  isOptedOutLead,
  shouldResumeOptedOutLead
} = require('../src/bot/conversationControl');

test('un saludo del usuario reactiva un opt-out sin crisis', () => {
  const lead = {
    bot_paused: true,
    closed_conversation: true,
    crisis_detected: false,
    funnel_stage: 'pausado',
    lead_status: 'perdido'
  };

  assert.equal(isOptedOutLead(lead), true);
  assert.equal(shouldResumeOptedOutLead(lead, 'Hola'), true);
  assert.equal(shouldResumeOptedOutLead(lead, 'mensaje automático'), false);
});

test('una crisis pausada nunca se reactiva automáticamente', () => {
  assert.equal(shouldResumeOptedOutLead({
    bot_paused: true,
    closed_conversation: true,
    crisis_detected: true
  }, 'Hola'), false);
});

test('la reactivación limpia el plan para volver al selector', () => {
  const fields = buildOptInResetFields({
    selected_plan: 'holograficas',
    payment_status: 'pendiente',
    lead_status: 'perdido',
    hotmart_link_sent: false
  }, new Date('2026-07-19T15:00:00Z'));

  assert.equal(fields.bot_paused, false);
  assert.equal(fields.closed_conversation, false);
  assert.equal(fields.selected_plan, null);
  assert.equal(fields.crm_section, null);
  assert.equal(fields.funnel_stage, 'inicio');
  assert.equal(fields.lead_status, 'frio');
  assert.equal(fields.consent_24h, true);
});
