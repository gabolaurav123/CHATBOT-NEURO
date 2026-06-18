function normalizePhone(value) {
  if (!value) return null;

  const raw = String(value).trim();
  if (raw.endsWith('@lid')) return null;

  const withoutDomain = raw.includes('@') ? raw.split('@')[0] : raw;
  const withoutDevice = withoutDomain.split(':')[0];
  const digits = withoutDevice.replace(/\D/g, '');

  if (!digits) return null;
  return `+${digits}`;
}

function toWhatsAppId(phone) {
  const value = String(phone || '').trim();
  if (value.endsWith('@s.whatsapp.net')) return value;
  if (value.endsWith('@lid')) return value;

  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  return `${digits}@s.whatsapp.net`;
}

module.exports = {
  normalizePhone,
  toWhatsAppId
};
