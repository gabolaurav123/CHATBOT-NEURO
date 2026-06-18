const { query } = require('../config/db');
const { isUuid } = require('../utils/validators');
const { decorateLeadContact } = require('./leadService');

async function createFollowUp({ leadId, phone, whatsappId, type, scheduledAt, message }) {
  const result = await query(
    `INSERT INTO followups (lead_id, phone, whatsapp_id, type, scheduled_at, message)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [leadId, phone || null, whatsappId || null, type, scheduledAt, message]
  );

  return result.rows[0];
}

async function createFollowUps(items) {
  const created = [];
  for (const item of items) {
    created.push(await createFollowUp(item));
  }
  return created;
}

function decorateFollowUp(row) {
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

async function listFollowUps({ limit = 100, offset = 0, status, search, q } = {}) {
  const params = [];
  const clauses = [];
  const searchText = search || q;

  if (status) {
    params.push(status);
    clauses.push(`f.status = $${params.length}`);
  }

  if (searchText) {
    if (isUuid(searchText)) {
      params.push(searchText);
      clauses.push(`f.lead_id = $${params.length}`);
    } else {
      params.push(`%${searchText}%`);
      clauses.push(`(
        f.phone ILIKE $${params.length}
        OR f.type ILIKE $${params.length}
        OR f.message ILIKE $${params.length}
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
    `SELECT f.*,
            l.phone AS lead_phone,
            l.whatsapp_id,
            l.whatsapp_lid,
            l.display_phone,
            l.name,
            l.email,
            l.username,
            l.bot_paused,
            l.human_takeover
     FROM followups f
     LEFT JOIN leads l ON l.id = f.lead_id
     ${where}
     ORDER BY f.scheduled_at ASC
     LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    params
  );

  return result.rows.map(decorateFollowUp);
}

async function listDueFollowUps() {
  const result = await query(
    `SELECT f.*,
            l.phone AS lead_phone,
            l.whatsapp_id,
            l.whatsapp_lid,
            l.display_phone,
            l.name,
            l.email,
            l.username,
            l.bot_paused,
            l.human_takeover
     FROM followups f
     LEFT JOIN leads l ON l.id = f.lead_id
     WHERE f.status = 'pending'
       AND f.scheduled_at <= NOW()
       AND COALESCE(l.bot_paused, FALSE) = FALSE
       AND COALESCE(l.human_takeover, FALSE) = FALSE
     ORDER BY f.scheduled_at ASC
     LIMIT 50`
  );

  return result.rows.map(decorateFollowUp);
}

async function getFollowUpById(id) {
  if (!isUuid(id)) return null;

  const result = await query('SELECT * FROM followups WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function updateFollowUp(id, fields) {
  const allowed = new Set(['type', 'scheduled_at', 'sent_at', 'status', 'message', 'whatsapp_id']);
  const entries = Object.entries(fields || {}).filter(([key]) => allowed.has(key));

  if (entries.length === 0) return getFollowUpById(id);

  const params = [];
  const assignments = entries.map(([key, value], index) => {
    params.push(value);
    return `${key} = $${index + 1}`;
  });

  params.push(id);
  const result = await query(
    `UPDATE followups SET ${assignments.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );

  return result.rows[0] || null;
}

async function markFollowUpSent(id) {
  return updateFollowUp(id, {
    sent_at: new Date(),
    status: 'sent'
  });
}

module.exports = {
  createFollowUp,
  createFollowUps,
  listFollowUps,
  listDueFollowUps,
  getFollowUpById,
  updateFollowUp,
  markFollowUpSent
};
