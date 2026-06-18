const { query } = require('../config/db');
const { env } = require('../config/env');

async function createPayment({ leadId, phone, paymentLink, amount, currency = 'USD', metadata = {} }) {
  const result = await query(
    `INSERT INTO payments (lead_id, phone, payment_link, amount, currency, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     RETURNING *`,
    [leadId, phone, paymentLink || null, amount || env.PRODUCT_PRICE, currency, JSON.stringify(metadata)]
  );

  return result.rows[0];
}

async function listPayments({ limit = 100, offset = 0, status } = {}) {
  const params = [];
  const clauses = [];

  if (status) {
    params.push(status);
    clauses.push(`p.status = $${params.length}`);
  }

  params.push(Math.min(Number(limit) || 100, 500));
  const limitIndex = params.length;
  params.push(Number(offset) || 0);
  const offsetIndex = params.length;

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await query(
    `SELECT p.*, l.name, l.email
     FROM payments p
     LEFT JOIN leads l ON l.id = p.lead_id
     ${where}
     ORDER BY p.created_at DESC
     LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    params
  );

  return result.rows;
}

async function updatePayment(id, fields) {
  const allowed = new Set([
    'status',
    'provider',
    'amount',
    'currency',
    'payment_link',
    'reported_by_user',
    'confirmed_manually',
    'confirmed_at',
    'metadata'
  ]);
  const entries = Object.entries(fields || {}).filter(([key]) => allowed.has(key));

  if (entries.length === 0) {
    const result = await query('SELECT * FROM payments WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  const params = [];
  const assignments = entries.map(([key, value], index) => {
    params.push(key === 'metadata' ? JSON.stringify(value || {}) : value);
    return `${key} = $${index + 1}`;
  });

  params.push(id);
  const result = await query(
    `UPDATE payments SET ${assignments.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );

  return result.rows[0] || null;
}

async function markLeadPaid(leadId) {
  const payment = await query(
    `UPDATE payments
     SET status = 'paid',
         confirmed_manually = TRUE,
         confirmed_at = NOW()
     WHERE lead_id = $1
     RETURNING *`,
    [leadId]
  );

  await query(
    `UPDATE leads
     SET payment_status = 'confirmado',
         funnel_stage = 'onboarding'
     WHERE id = $1`,
    [leadId]
  );

  return payment.rows[0] || null;
}

async function reportPaymentByUser({ leadId, phone, paymentLink, amount, metadata = {} }) {
  const updated = await query(
    `UPDATE payments
     SET status = 'reported',
         reported_by_user = TRUE,
         payment_link = COALESCE(payment_link, $2),
         metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb
     WHERE lead_id = $1
       AND status IN ('pending', 'reported')
     RETURNING *`,
    [leadId, paymentLink || null, JSON.stringify(metadata)]
  );

  if (updated.rows[0]) return updated.rows[0];

  return createPayment({
    leadId,
    phone,
    paymentLink,
    amount,
    metadata: {
      ...metadata,
      reported_by_user: true
    }
  }).then((payment) => updatePayment(payment.id, {
    status: 'reported',
    reported_by_user: true
  }));
}

module.exports = {
  createPayment,
  listPayments,
  updatePayment,
  markLeadPaid,
  reportPaymentByUser
};
