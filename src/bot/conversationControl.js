function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isRestartMessage(body) {
  return /^(hola|buenas|buenos dias|buenas tardes|buenas noches|gimnasio|cerebro|gimnasio del cerebro|info|ayuda|inicio|empezar|reiniciar)$/
    .test(normalizeText(body));
}

function isOptedOutLead(lead) {
  if (!lead || lead.crisis_detected) return false;
  return Boolean(
    lead.closed_conversation
    || (lead.funnel_stage === 'pausado' && lead.lead_status === 'perdido')
  );
}

function shouldResumeOptedOutLead(lead, body) {
  return Boolean(lead && lead.bot_paused && isOptedOutLead(lead) && isRestartMessage(body));
}

function buildOptInResetFields(lead, memoryExpiresAt) {
  const paid = ['confirmado', 'confirmed', 'pagado'].includes(String(lead && lead.payment_status || '').toLowerCase())
    || (lead && lead.lead_status === 'comprador');

  return {
    bot_paused: false,
    human_takeover: false,
    closed_conversation: false,
    crisis_detected: false,
    consent_24h: true,
    memory_expires_at: memoryExpiresAt,
    selected_plan: null,
    crm_section: null,
    source: 'whatsapp_multi_plan',
    funnel_stage: 'inicio',
    lead_status: paid ? 'comprador' : 'frio',
    payment_status: paid ? lead.payment_status : 'pendiente',
    video_sent: false,
    video_sent_at: null,
    pdf_sent: false,
    pdf_sent_at: null,
    offer_presented: false,
    offer_presented_at: null,
    hotmart_link_sent: paid ? Boolean(lead.hotmart_link_sent) : false,
    hotmart_link_sent_at: paid ? lead.hotmart_link_sent_at : null,
    purchase_intent: paid,
    main_objection: null,
    objection_type: null
  };
}

module.exports = {
  buildOptInResetFields,
  isOptedOutLead,
  isRestartMessage,
  shouldResumeOptedOutLead
};
