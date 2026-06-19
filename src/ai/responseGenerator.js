const { generateText, safeGenerateText } = require('./geminiClient');
const { postLinkFallback } = require('../bot/flows');

async function generateHumanReply({ lead, memory, history, userMessage, stage, settings }) {
  const prompt = `Genera una respuesta corta, natural y empática para WhatsApp como Marisa, guía del programa Neurotraumas.

Contexto:
- Producto: ${settings.product_name || 'Neurotraumas'}.
- Precio normal: USD $${settings.product_normal_price || 360}.
- Precio especial por este canal: USD $${settings.product_special_price || settings.product_price || 270}.
- Video gratuito: ${settings.video_link || 'no configurado'}.
- PDF gratuito: ${settings.pdf_link || 'no configurado'}.
- Hotmart: ${settings.hotmart_link || 'https://pay.hotmart.com/T103515864E'}.
- Etapa actual: ${stage || 'inicio'}.
- No prometas curas, no diagnostiques, no reemplaces terapia, no inventes descuentos, no inventes cupos.
- No reinicies el flujo.
- No repitas el mismo mensaje.
- Si ya se envió video, PDF, oferta o link, no lo reenvíes salvo que el usuario lo pida.
- Si hay crisis emocional, detén la venta y prioriza seguridad.
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

async function generatePostLinkReply({ lead, memory, history, userMessage, settings }) {
  const hotmartLink = settings.hotmart_link || 'https://pay.hotmart.com/T103515864E';
  const prompt = `Estás hablando con una persona que ya recibió el link de pago de Neurotraumas.

Tu objetivo es ayudarle a resolver dudas, reducir objeciones y acompañarla a tomar la decisión de inscribirse. No reinicies el flujo. No vuelvas a preguntar todo el diagnóstico. Usa lo que ya sabes del lead: dolor principal, urgencia, objeción, nombre y etapa.

Reglas:
- Responde de forma humana, breve, clara y persuasiva.
- Si pregunta cómo pagar, reenvía este link oficial: ${hotmartLink}
- Si solo dice ok, gracias, lo veo, después te digo o algo de cierre, responde suave y NO reenvíes el link.
- Si duda por precio, tiempo o confianza, responde la objeción.
- Si dice que ya pagó, pide confirmación o comprobante.
- No prometas curas.
- No diagnostiques.
- No digas que reemplaza terapia.
- No inventes descuentos.
- No inventes cupos.

Lead:
${JSON.stringify(lead || {}, null, 2)}

Memoria:
${JSON.stringify(memory || {}, null, 2)}

Historial reciente:
${JSON.stringify(history || [], null, 2)}

Mensaje del usuario:
${userMessage}`;

  try {
    return await generateText({
      prompt,
      temperature: 0.7,
      maxOutputTokens: 350
    });
  } catch (error) {
    return postLinkFallback(lead, hotmartLink);
  }
}

module.exports = {
  generateHumanReply,
  generatePostLinkReply
};
