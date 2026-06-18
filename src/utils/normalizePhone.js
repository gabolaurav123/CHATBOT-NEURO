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

function normalizeWhatsAppIdentity(remoteJid) {
  const raw = String(remoteJid || '').trim();

  if (!raw) {
    return {
      phone: null,
      whatsapp_id: null,
      whatsapp_lid: null,
      display_phone: null
    };
  }

  const [localPart] = raw.split('@');
  const cleanLocal = String(localPart || '').split(':')[0];
  const isPhoneJid = raw.endsWith('@s.whatsapp.net') && /^\d{8,15}$/.test(cleanLocal);
  const isLid = raw.endsWith('@lid');

  if (isPhoneJid) {
    const phone = `+${cleanLocal}`;
    return {
      phone,
      whatsapp_id: raw,
      whatsapp_lid: null,
      display_phone: phone
    };
  }

  if (isLid) {
    return {
      phone: null,
      whatsapp_id: raw,
      whatsapp_lid: raw,
      display_phone: `ID WhatsApp: ${cleanLocal || raw}`
    };
  }

  return {
    phone: null,
    whatsapp_id: raw,
    whatsapp_lid: null,
    display_phone: `ID WhatsApp: ${cleanLocal || raw}`
  };
}

function normalizeUserProvidedPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
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
  normalizeWhatsAppIdentity,
  normalizeUserProvidedPhone,
  toWhatsAppId
};
