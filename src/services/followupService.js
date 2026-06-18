const { query } = require('../config/db');

async function createFollowUp({ leadId, phone, type, scheduledAt, message }) {
  const result = await query(
    `INSERT INTO followups (lead_id, phone, type, scheduled_at, message)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [leadId, phone, type, scheduledAt, message]
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

async function listFollowUps({ limit = 100, offset = 0, status } = {}) {
  const params = [];
  const clauses = [];

  if (status) {
    params.push(status);
    clauses.push(`f.status = $${params.length}`);
  }

  params.push(Math.min(Number(limit) || 100, 500));
  const limitIndex = params.length;
  params.push(Number(offset) || 0);
  const offsetIndex = params.length;

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await query(
    `SELECT f.*, l.name, l.email, l.bot_paused, l.human_takeover
     FROM followups f
     LEFT JOIN leads l ON l.id = f.lead_id
     ${where}
     ORDER BY f.scheduled_at ASC
     LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    params
  );

  return result.rows;
}

async function listDueFollowUps() {
  const result = await query(
    `SELECT f.*, l.name, l.email, l.bot_paused, l.human_takeover
     FROM followups f
     LEFT JOIN leads l ON l.id = f.lead_id
     WHERE f.status = 'pending'
       AND f.scheduled_at <= NOW()
       AND COALESCE(l.bot_paused, FALSE) = FALSE
       AND COALESCE(l.human_takeover, FALSE) = FALSE
     ORDER BY f.scheduled_at ASC
     LIMIT 50`
  );

  return result.rows;
}

async function getFollowUpById(id) {
  const result = await query('SELECT * FROM followups WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function updateFollowUp(id, fields) {
  const allowed = new Set(['type', 'scheduled_at', 'sent_at', 'status', 'message']);
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
