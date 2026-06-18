const { safeGenerateText } = require('./geminiClient');

async function generateHumanReply({ lead, memory, history, userMessage, stage, settings }) {
  const prompt = `Genera una respuesta corta, natural y empática para WhatsApp.

Contexto:
- Producto: ${settings.product_name || 'Neurotraumas™'}.
- Precio fijo: USD $${settings.product_price || 360}.
- Etapa actual: ${stage || 'captacion'}.
- No prometas curas, no diagnostiques, no reemplaces terapia, no inventes descuentos, no inventes cupos.
- Haz una sola pregunta al final.
- Mantén el objetivo comercial, pero sin presión agresiva.

Lead:
${JSON.stringify(lead || {}, null, 2)}

Memoria:
${JSON.stringify(memory || {}, null, 2)}

Historial reciente:
${JSON.stringify(history || [], null, 2)}

Mensaje del usuario:
${userMessage}`;

  return safeGenerateText({
    prompt,
    temperature: 0.7,
    maxOutputTokens: 350
  });
}

module.exports = {
  generateHumanReply
};
