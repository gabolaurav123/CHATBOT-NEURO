const { query } = require('../config/db');
const { env } = require('../config/env');

function expiresAt() {
  return new Date(Date.now() + env.MEMORY_EXPIRATION_HOURS * 60 * 60 * 1000);
}

async function getMemoryByLeadId(leadId) {
  const result = await query(
    `SELECT *
     FROM conversation_memory
     WHERE lead_id = $1 AND expires_at > NOW()
     ORDER BY updated_at DESC
     LIMIT 1`,
    [leadId]
  );

  return result.rows[0] || null;
}

async function upsertMemory({ leadId, phone, memoryPatch, summary }) {
  const consent = await query('SELECT consent_24h FROM leads WHERE id = $1', [leadId]);
  if (consent.rows[0] && consent.rows[0].consent_24h === false) {
    return null;
  }

  const current = await getMemoryByLeadId(leadId);
  const mergedMemory = {
    ...(current && current.memory ? current.memory : {}),
    ...(memoryPatch || {})
  };

  const expires = expiresAt();

  if (current) {
    const result = await query(
      `UPDATE conversation_memory
       SET phone = $1,
           memory = $2::jsonb,
           summary = COALESCE($3, summary),
           expires_at = $4
       WHERE id = $5
       RETURNING *`,
      [phone, JSON.stringify(mergedMemory), summary || null, expires, current.id]
    );

    return result.rows[0];
  }

  const result = await query(
    `INSERT INTO conversation_memory (lead_id, phone, memory, summary, expires_at)
     VALUES ($1, $2, $3::jsonb, $4, $5)
     RETURNING *`,
    [leadId, phone, JSON.stringify(mergedMemory), summary || null, expires]
  );

  return result.rows[0];
}

async function deleteMemoryByLeadId(leadId) {
  await query('DELETE FROM conversation_memory WHERE lead_id = $1', [leadId]);
}

async function deleteExpiredMemories() {
  const result = await query(
    `DELETE FROM conversation_memory
     WHERE expires_at < NOW()
     RETURNING id`
  );

  return result.rowCount;
}

module.exports = {
  getMemoryByLeadId,
  upsertMemory,
  deleteMemoryByLeadId,
  deleteExpiredMemories
};
