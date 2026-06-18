const { query } = require('../config/db');
const { env } = require('../config/env');
const { computeLeadScore, statusFromScore } = require('../bot/leadScoring');

const ALLOWED_UPDATE_FIELDS = new Set([
  'name',
  'email',
  'username',
  'source_keyword',
  'main_pain',
  'emotional_response',
  'problem_duration',
  'tried_before',
  'urgency',
  'lead_score',
  'lead_status',
  'funnel_stage',
  'main_objection',
  'hotmart_link_sent',
  'hotmart_link_sent_at',
  'payment_status',
  'human_takeover',
  'bot_paused',
  'consent_24h',
  'memory_expires_at',
  'last_user_message',
  'last_bot_message',
  'notes'
]);

async function upsertLeadByPhone({ phone, whatsappId, sourceKeyword }) {
  const result = await query(
    `INSERT INTO leads (
       phone,
       whatsapp_id,
       source_keyword,
       first_contact_at,
       last_contact_at,
       memory_expires_at
     )
     VALUES ($1, $2, $3, NOW(), NOW(), NOW() + ($4::int * INTERVAL '1 hour'))
     ON CONFLICT (phone) DO UPDATE SET
       whatsapp_id = COALESCE(EXCLUDED.whatsapp_id, leads.whatsapp_id),
       source_keyword = COALESCE(leads.source_keyword, EXCLUDED.source_keyword),
       first_contact_at = COALESCE(leads.first_contact_at, NOW()),
       last_contact_at = NOW(),
       memory_expires_at = CASE
         WHEN leads.consent_24h = TRUE THEN NOW() + ($4::int * INTERVAL '1 hour')
         ELSE leads.memory_expires_at
       END
     RETURNING *`,
    [phone, whatsappId || null, sourceKeyword || null, env.MEMORY_EXPIRATION_HOURS]
  );

  return result.rows[0];
}

async function getLeadById(id) {
  const result = await query('SELECT * FROM leads WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function getLeadByPhone(phone) {
  const result = await query('SELECT * FROM leads WHERE phone = $1', [phone]);
  return result.rows[0] || null;
}

async function listLeads({ limit = 100, offset = 0, status, q } = {}) {
  const params = [];
  const clauses = [];

  if (status) {
    params.push(status);
    clauses.push(`lead_status = $${params.length}`);
  }

  if (q) {
    params.push(`%${q}%`);
    clauses.push(`(phone ILIKE $${params.length} OR name ILIKE $${params.length} OR email ILIKE $${params.length})`);
  }

  params.push(Math.min(Number(limit) || 100, 500));
  const limitIndex = params.length;
  params.push(Number(offset) || 0);
  const offsetIndex = params.length;

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await query(
    `SELECT * FROM leads
     ${where}
     ORDER BY COALESCE(last_contact_at, created_at) DESC
     LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    params
  );

  return result.rows;
}

async function updateLead(id, fields) {
  const entries = Object.entries(fields || {}).filter(([key]) => ALLOWED_UPDATE_FIELDS.has(key));

  if (entries.length === 0) {
    return getLeadById(id);
  }

  const assignments = [];
  const params = [];

  entries.forEach(([key, value], index) => {
    params.push(value);
    assignments.push(`${key} = $${index + 1}`);
  });

  params.push(id);
  const result = await query(
    `UPDATE leads
     SET ${assignments.join(', ')}
     WHERE id = $${params.length}
     RETURNING *`,
    params
  );

  return result.rows[0] || null;
}

async function updateLastUserMessage(id, message) {
  const result = await query(
    `UPDATE leads
     SET last_user_message = $1,
         last_contact_at = NOW(),
         memory_expires_at = CASE
           WHEN consent_24h = TRUE THEN NOW() + ($2::int * INTERVAL '1 hour')
           ELSE memory_expires_at
         END
     WHERE id = $3
     RETURNING *`,
    [message, env.MEMORY_EXPIRATION_HOURS, id]
  );

  return result.rows[0] || null;
}

async function updateLastBotMessage(id, message) {
  return updateLead(id, {
    last_bot_message: message,
    last_contact_at: new Date()
  });
}

async function refreshLeadScore(id) {
  const lead = await getLeadById(id);
  if (!lead) return null;

  const leadScore = computeLeadScore(lead);
  const leadStatus = lead.lead_status === 'perdido' ? 'perdido' : statusFromScore(leadScore, lead.urgency);

  return updateLead(id, {
    lead_score: leadScore,
    lead_status: leadStatus
  });
}

async function setManualControl(id, fields) {
  return updateLead(id, fields);
}

module.exports = {
  upsertLeadByPhone,
  getLeadById,
  getLeadByPhone,
  listLeads,
  updateLead,
  updateLastUserMessage,
  updateLastBotMessage,
  refreshLeadScore,
  setManualControl
};
