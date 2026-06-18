const whatsappClient = require('../whatsapp/client');

async function getStatus() {
  return whatsappClient.getStatus();
}

async function getQr() {
  return whatsappClient.getQr();
}

async function generateQr() {
  return whatsappClient.generateQr();
}

async function restart() {
  return whatsappClient.restart();
}

async function logout() {
  return whatsappClient.logout();
}

async function sendMessage(phone, message) {
  return whatsappClient.sendMessage(phone, message);
}

module.exports = {
  getStatus,
  getQr,
  generateQr,
  restart,
  logout,
  sendMessage
};
