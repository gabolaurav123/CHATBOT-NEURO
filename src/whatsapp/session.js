const { query } = require('../config/db');

async function getLatestSession() {
  const result = await query(
    `SELECT *
     FROM whatsapp_sessions
     ORDER BY created_at DESC
     LIMIT 1`
  );

  return result.rows[0] || null;
}

async function updateSessionSnapshot({
  status,
  qrCode,
  connectedPhone,
  sessionInfo,
  setQrTimestamp = false,
  setConnectedTimestamp = false,
  setDisconnectedTimestamp = false,
  clearConnectedPhone = false
}) {
  const latest = await getLatestSession();

  if (!latest) {
    const result = await query(
      `INSERT INTO whatsapp_sessions (
         status,
         qr_code,
         connected_phone,
         last_qr_at,
         last_connected_at,
         last_disconnected_at,
         session_info
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       RETURNING *`,
      [
        status || 'disconnected',
        qrCode || null,
        connectedPhone || null,
        setQrTimestamp ? new Date() : null,
        setConnectedTimestamp ? new Date() : null,
        setDisconnectedTimestamp ? new Date() : null,
        JSON.stringify(sessionInfo || {})
      ]
    );

    return result.rows[0];
  }

  const result = await query(
    `UPDATE whatsapp_sessions
     SET status = COALESCE($1, status),
         qr_code = COALESCE($2, qr_code),
         connected_phone = CASE WHEN $8::boolean THEN NULL ELSE COALESCE($3, connected_phone) END,
         last_qr_at = CASE WHEN $4::boolean THEN NOW() ELSE last_qr_at END,
         last_connected_at = CASE WHEN $5::boolean THEN NOW() ELSE last_connected_at END,
         last_disconnected_at = CASE WHEN $6::boolean THEN NOW() ELSE last_disconnected_at END,
         session_info = COALESCE($7::jsonb, session_info)
     WHERE id = $9
     RETURNING *`,
    [
      status || null,
      qrCode || null,
      connectedPhone || null,
      Boolean(setQrTimestamp),
      Boolean(setConnectedTimestamp),
      Boolean(setDisconnectedTimestamp),
      JSON.stringify(sessionInfo || {}),
      Boolean(clearConnectedPhone),
      latest.id
    ]
  );

  return result.rows[0];
}

async function clearQr() {
  const latest = await getLatestSession();
  if (!latest) return null;

  const result = await query(
    `UPDATE whatsapp_sessions
     SET qr_code = NULL
     WHERE id = $1
     RETURNING *`,
    [latest.id]
  );

  return result.rows[0] || null;
}

async function getLatestAuthState() {
  const result = await query(
    `SELECT auth_state
     FROM whatsapp_sessions
     WHERE auth_state IS NOT NULL
     ORDER BY updated_at DESC, created_at DESC
     LIMIT 1`
  );

  return (result.rows[0] && result.rows[0].auth_state) || null;
}

async function hasAuthState() {
  const result = await query(
    `SELECT EXISTS (
       SELECT 1
       FROM whatsapp_sessions
       WHERE auth_state IS NOT NULL
     ) AS available`
  );

  return Boolean(result.rows[0] && result.rows[0].available);
}

async function saveAuthState(authState) {
  const latest = await getLatestSession();

  if (!latest) {
    const result = await query(
      `INSERT INTO whatsapp_sessions (status, session_info, auth_state)
       VALUES ('initializing', $1::jsonb, $2::jsonb)
       RETURNING auth_state`,
      [
        JSON.stringify({ reason: 'auth-backup', provider: 'baileys' }),
        JSON.stringify(authState)
      ]
    );

    return result.rows[0] && result.rows[0].auth_state;
  }

  const result = await query(
    `UPDATE whatsapp_sessions
     SET auth_state = $1::jsonb
     WHERE id = $2
     RETURNING auth_state`,
    [JSON.stringify(authState), latest.id]
  );

  return result.rows[0] && result.rows[0].auth_state;
}

async function clearAuthState() {
  await query(
    `UPDATE whatsapp_sessions
     SET auth_state = NULL
     WHERE auth_state IS NOT NULL`
  );
}

module.exports = {
  getLatestSession,
  updateSessionSnapshot,
  clearQr,
  getLatestAuthState,
  hasAuthState,
  saveAuthState,
  clearAuthState
};
