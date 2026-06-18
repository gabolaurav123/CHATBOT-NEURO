const { query } = require('../config/db');

async function logAdminAction({ leadId, action, details = {} }) {
  const result = await query(
    `INSERT INTO admin_actions (lead_id, action, details)
     VALUES ($1, $2, $3::jsonb)
     RETURNING *`,
    [leadId || null, action, JSON.stringify(details)]
  );

  return result.rows[0];
}

module.exports = {
  logAdminAction
};
