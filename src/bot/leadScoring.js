function computeLeadScore(lead) {
  let score = 0;

  if (lead.name) score += 10;
  if (lead.email) score += 10;
  if (lead.main_pain) score += 10;
  if (lead.problem_duration && lead.tried_before && lead.urgency !== null && lead.urgency !== undefined) score += 20;
  if (Number(lead.urgency) >= 7) score += 20;
  if (lead.last_user_message && /precio|cu[aá]nto cuesta|costo|inversi[oó]n/i.test(lead.last_user_message)) score += 15;
  if (lead.hotmart_link_sent) score += 20;
  if (lead.funnel_stage === 'post_link_conversacion') score += 10;
  if (lead.last_user_message && /quiero empezar|quiero comprar|me inscribo|p[aá]same el link|pagar/i.test(lead.last_user_message)) score += 15;
  if (lead.notes && /respondio follow-up|respondió follow-up/i.test(lead.notes)) score += 10;
  if (lead.lead_status === 'perdido' || /no estoy interesado|no me interesa/i.test(lead.last_user_message || '')) score -= 10;
  if (lead.bot_paused && /stop|no me escribas|no quiero mensajes/i.test(lead.last_user_message || '')) score -= 20;

  return Math.max(0, Math.min(100, score));
}

function statusFromScore(score, urgency) {
  if (Number(urgency) >= 7) return 'caliente';
  if (Number(urgency) >= 5) return 'tibio';
  if (score >= 70) return 'caliente';
  if (score >= 40) return 'tibio';
  return 'frio';
}

module.exports = {
  computeLeadScore,
  statusFromScore
};
