function normalizePhone(value) {
  if (!value) return null;

  const raw = String(value).trim();
  const withoutDomain = raw.includes('@') ? raw.split('@')[0] : raw;
  const digits = withoutDomain.replace(/\D/g, '');

  if (!digits) return null;
  return `+${digits}`;
}

function toWhatsAppId(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  return `${digits}@c.us`;
}

module.exports = {
  normalizePhone,
  toWhatsAppId
};
