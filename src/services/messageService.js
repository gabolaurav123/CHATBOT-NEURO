const { query } = require('../config/db');
const { env } = require('../config/env');

async function getOrCreateActiveConversation(lead) {
  const existing = await query(
    `SELECT * FROM conversations
     WHERE lead_id = $1 AND status = 'active'
     ORDER BY started_at DESC
     LIMIT 1`,
    [lead.id]
  );

  if (existing.rows[0]) return existing.rows[0];

  const created = await query(
    `INSERT INTO conversations (lead_id, phone, last_message_at, expires_at, current_step)
     VALUES ($1, $2, NOW(), NOW() + ($3::int * INTERVAL '1 hour'), 'inicio')
     RETURNING *`,
    [lead.id, lead.phone, env.MEMORY_EXPIRATION_HOURS]
  );

  return created.rows[0];
}

async function updateConversation(id, fields) {
  const allowed = new Set(['status', 'summary', 'current_step', 'metadata', 'expires_at', 'last_message_at']);
  const entries = Object.entries(fields || {}).filter(([key]) => allowed.has(key));

  if (entries.length === 0) {
    const result = await query('SELECT * FROM conversations WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  const params = [];
  const assignments = entries.map(([key, value], index) => {
    params.push(key === 'metadata' ? JSON.stringify(value || {}) : value);
    return `${key} = $${index + 1}`;
  });

  params.push(id);
  const result = await query(
    `UPDATE conversations SET ${assignments.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );

  return result.rows[0] || null;
}

async function storeMessage({ leadId, conversationId, direction, body, rawPayload, messageType = 'text' }) {
  const result = await query(
    `INSERT INTO messages (lead_id, conversation_id, direction, message_type, body, raw_payload)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     RETURNING *`,
    [leadId, conversationId, direction, messageType, body || '', JSON.stringify(rawPayload || {})]
  );

  await query(
    `UPDATE conversations
     SET last_message_at = NOW()
     WHERE id = $1`,
    [conversationId]
  );

  return result.rows[0];
}

async function getConversationHistory(leadId, limit = 12) {
  const result = await query(
    `SELECT direction, body, created_at
     FROM messages
     WHERE lead_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [leadId, limit]
  );

  return result.rows.reverse();
}

async function getMessagesByLead(leadId, limit = 200, offset = 0) {
  const result = await query(
    `SELECT *
     FROM messages
     WHERE lead_id = $1
     ORDER BY created_at ASC
     LIMIT $2 OFFSET $3`,
    [leadId, Math.min(Number(limit) || 200, 1000), Number(offset) || 0]
  );

  return result.rows;
}

async function listConversations({ limit = 100, offset = 0 } = {}) {
  const result = await query(
    `SELECT c.*, l.name, l.email, l.lead_status, l.funnel_stage, l.human_takeover, l.bot_paused
     FROM conversations c
     LEFT JOIN leads l ON l.id = c.lead_id
     ORDER BY COALESCE(c.last_message_at, c.started_at) DESC
     LIMIT $1 OFFSET $2`,
    [Math.min(Number(limit) || 100, 500), Number(offset) || 0]
  );

  return result.rows;
}

async function getConversationsByLead(leadId) {
  const result = await query(
    `SELECT *
     FROM conversations
     WHERE lead_id = $1
     ORDER BY started_at DESC`,
    [leadId]
  );

  return result.rows;
}

module.exports = {
  getOrCreateActiveConversation,
  updateConversation,
  storeMessage,
  getConversationHistory,
  getMessagesByLead,
  listConversations,
  getConversationsByLead
};
