const { query } = require('../config/db');
const { env } = require('../config/env');
const { computeLeadScore, statusFromScore } = require('../bot/leadScoring');

const ALLOWED_UPDATE_FIELDS = new Set([
  'name',
  'email',
  'username',
  'phone',
  'whatsapp_id',
  'whatsapp_lid',
  'display_phone',
  'first_contact_at',
  'last_contact_at',
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
  'objection_type',
  'video_sent',
  'video_sent_at',
  'pdf_sent',
  'pdf_sent_at',
  'offer_presented',
  'offer_presented_at',
  'hotmart_link_sent',
  'hotmart_link_sent_at',
  'purchase_intent',
  'closed_conversation',
  'crisis_detected',
  'payment_status',
  'human_takeover',
  'bot_paused',
  'consent_24h',
  'memory_expires_at',
  'last_user_message',
  'last_bot_message',
  'notes'
]);

function looksLikeRealPhone(value) {
  return /^\+\d{8,15}$/.test(String(value || ''));
}

function decorateLeadContact(lead) {
  if (!lead) return null;

  const phoneIsReal = looksLikeRealPhone(lead.phone);
  let displayContact = null;

  if (phoneIsReal) {
    displayContact = lead.phone;
  } else if (lead.display_phone) {
    displayContact = lead.display_phone;
  } else if (lead.whatsapp_lid || String(lead.whatsapp_id || '').endsWith('@lid')) {
    const lid = lead.whatsapp_lid || lead.whatsapp_id;
    displayContact = `ID WhatsApp: ${String(lid).split('@')[0]}`;
  } else if (lead.whatsapp_id) {
    displayContact = lead.whatsapp_id;
  } else {
    displayContact = lead.phone;
  }

  return {
    ...lead,
    phone_is_real: phoneIsReal,
    display_contact: displayContact
  };
}

function getLeadRecipient(lead) {
  return lead && lead.whatsapp_id ? lead.whatsapp_id : null;
}

async function findLeadByWhatsAppIdentity(identity) {
  if (identity.whatsapp_id) {
    const byWhatsAppId = await query('SELECT * FROM leads WHERE whatsapp_id = $1 ORDER BY updated_at DESC LIMIT 1', [identity.whatsapp_id]);
    if (byWhatsAppId.rows[0]) return decorateLeadContact(byWhatsAppId.rows[0]);
  }

  if (identity.phone) {
    const byPhone = await query('SELECT * FROM leads WHERE phone = $1 ORDER BY updated_at DESC LIMIT 1', [identity.phone]);
    if (byPhone.rows[0]) return decorateLeadContact(byPhone.rows[0]);
  }

  return null;
}

async function upsertLeadByWhatsAppIdentity({ identity, sourceKeyword }) {
  const existing = await findLeadByWhatsAppIdentity(identity);

  if (existing) {
    return updateLead(existing.id, {
      phone: identity.phone || (looksLikeRealPhone(existing.phone) ? existing.phone : null),
      whatsapp_id: identity.whatsapp_id || existing.whatsapp_id,
      whatsapp_lid: identity.whatsapp_lid || existing.whatsapp_lid,
      display_phone: identity.display_phone || existing.display_phone,
      source_keyword: existing.source_keyword || sourceKeyword || null,
      first_contact_at: existing.first_contact_at || new Date(),
      last_contact_at: new Date(),
      memory_expires_at: existing.consent_24h
        ? new Date(Date.now() + env.MEMORY_EXPIRATION_HOURS * 60 * 60 * 1000)
        : existing.memory_expires_at
    });
  }

  const result = await query(
    `INSERT INTO leads (
       phone,
       whatsapp_id,
       whatsapp_lid,
       display_phone,
       source_keyword,
       first_contact_at,
       last_contact_at,
       memory_expires_at
     )
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), NOW() + ($6::int * INTERVAL '1 hour'))
     RETURNING *`,
    [
      identity.phone || null,
      identity.whatsapp_id || null,
      identity.whatsapp_lid || null,
      identity.display_phone || null,
      sourceKeyword || null,
      env.MEMORY_EXPIRATION_HOURS
    ]
  );

  return decorateLeadContact(result.rows[0]);
}

async function upsertLeadByPhone({ phone, whatsappId, sourceKeyword }) {
  return upsertLeadByWhatsAppIdentity({
    identity: {
      phone: looksLikeRealPhone(phone) ? phone : null,
      whatsapp_id: whatsappId || null,
      whatsapp_lid: String(whatsappId || '').endsWith('@lid') ? whatsappId : null,
      display_phone: looksLikeRealPhone(phone)
        ? phone
        : (String(whatsappId || '').endsWith('@lid') ? `ID WhatsApp: ${String(whatsappId).split('@')[0]}` : whatsappId)
    },
    sourceKeyword
  });
}

async function getLeadById(id) {
  const result = await query('SELECT * FROM leads WHERE id = $1', [id]);
  return decorateLeadContact(result.rows[0] || null);
}

async function getLeadByPhone(phone) {
  const result = await query('SELECT * FROM leads WHERE phone = $1', [phone]);
  return decorateLeadContact(result.rows[0] || null);
}

async function listLeads({ limit = 100, offset = 0, status, q, search } = {}) {
  const params = [];
  const clauses = [];
  const searchText = q || search;

  if (status) {
    params.push(status);
    clauses.push(`lead_status = $${params.length}`);
  }

  if (searchText) {
    params.push(`%${searchText}%`);
    clauses.push(`(
      phone ILIKE $${params.length}
      OR name ILIKE $${params.length}
      OR email ILIKE $${params.length}
      OR username ILIKE $${params.length}
      OR whatsapp_id ILIKE $${params.length}
      OR whatsapp_lid ILIKE $${params.length}
      OR display_phone ILIKE $${params.length}
    )`);
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

  return result.rows.map(decorateLeadContact);
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

  return decorateLeadContact(result.rows[0] || null);
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

  return decorateLeadContact(result.rows[0] || null);
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
  upsertLeadByWhatsAppIdentity,
  findLeadByWhatsAppIdentity,
  getLeadById,
  getLeadByPhone,
  listLeads,
  updateLead,
  updateLastUserMessage,
  updateLastBotMessage,
  refreshLeadScore,
  setManualControl,
  decorateLeadContact,
  getLeadRecipient,
  looksLikeRealPhone
};
