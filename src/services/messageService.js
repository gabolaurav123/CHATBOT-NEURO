const { query } = require('../config/db');
const { env } = require('../config/env');
const { isUuid } = require('../utils/validators');
const { decorateLeadContact } = require('./leadService');

async function getOrCreateActiveConversation(lead) {
  const existing = await query(
    `SELECT * FROM conversations
     WHERE lead_id = $1 AND status = 'active'
     ORDER BY started_at DESC
     LIMIT 1`,
    [lead.id]
  );

  if (existing.rows[0]) {
    if (lead.whatsapp_id && existing.rows[0].whatsapp_id !== lead.whatsapp_id) {
      const updated = await query(
        `UPDATE conversations
         SET whatsapp_id = $1,
             phone = COALESCE($2, phone)
         WHERE id = $3
         RETURNING *`,
        [lead.whatsapp_id, lead.phone || null, existing.rows[0].id]
      );
      return updated.rows[0];
    }
    return existing.rows[0];
  }

  const created = await query(
    `INSERT INTO conversations (lead_id, phone, whatsapp_id, last_message_at, expires_at, current_step)
     VALUES ($1, $2, $3, NOW(), NOW() + ($4::int * INTERVAL '1 hour'), 'inicio')
     RETURNING *`,
    [lead.id, lead.phone || null, lead.whatsapp_id || null, env.MEMORY_EXPIRATION_HOURS]
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

async function storeMessage({ leadId, conversationId, direction, body, rawPayload, messageType = 'text', whatsappId }) {
  const result = await query(
    `INSERT INTO messages (lead_id, conversation_id, whatsapp_id, direction, message_type, body, raw_payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     RETURNING *`,
    [leadId, conversationId, whatsappId || null, direction, messageType, body || '', JSON.stringify(rawPayload || {})]
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
  if (!isUuid(leadId)) return [];

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
  if (!isUuid(leadId)) return [];

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

function decorateConversation(row) {
  if (!row) return null;
  const decoratedLead = decorateLeadContact({
    id: row.lead_id,
    phone: row.lead_phone || row.phone,
    whatsapp_id: row.whatsapp_id,
    whatsapp_lid: row.whatsapp_lid,
    display_phone: row.display_phone,
    name: row.name,
    email: row.email
  });

  return {
    ...row,
    display_contact: decoratedLead && decoratedLead.display_contact,
    phone_is_real: decoratedLead && decoratedLead.phone_is_real
  };
}

async function listConversations({ limit = 100, offset = 0, search, q } = {}) {
  const params = [];
  const clauses = [];
  const searchText = search || q;

  if (searchText) {
    if (isUuid(searchText)) {
      params.push(searchText);
      clauses.push(`c.lead_id = $${params.length}`);
    } else {
      params.push(`%${searchText}%`);
      clauses.push(`(
        c.phone ILIKE $${params.length}
        OR l.phone ILIKE $${params.length}
        OR l.name ILIKE $${params.length}
        OR l.email ILIKE $${params.length}
        OR l.username ILIKE $${params.length}
        OR l.whatsapp_id ILIKE $${params.length}
        OR l.whatsapp_lid ILIKE $${params.length}
        OR l.display_phone ILIKE $${params.length}
      )`);
    }
  }

  params.push(Math.min(Number(limit) || 100, 500));
  const limitIndex = params.length;
  params.push(Number(offset) || 0);
  const offsetIndex = params.length;
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const result = await query(
    `SELECT c.*,
            l.phone AS lead_phone,
            l.whatsapp_id,
            l.whatsapp_lid,
            l.display_phone,
            l.name,
            l.email,
            l.username,
            l.lead_status,
            l.funnel_stage,
            l.human_takeover,
            l.bot_paused
     FROM conversations c
     LEFT JOIN leads l ON l.id = c.lead_id
     ${where}
     ORDER BY COALESCE(c.last_message_at, c.started_at) DESC
     LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    params
  );

  return result.rows.map(decorateConversation);
}

async function getConversationsByLead(leadId) {
  if (!isUuid(leadId)) return [];

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
