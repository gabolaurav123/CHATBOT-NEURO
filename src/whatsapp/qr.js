const qrcode = require('qrcode');

async function qrToDataUrl(qr) {
  if (!qr) return null;
  return qrcode.toDataURL(qr);
}

module.exports = {
  qrToDataUrl
};
