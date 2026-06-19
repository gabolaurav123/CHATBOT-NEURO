const { generateText } = require('./geminiClient');
const { postLinkFallback } = require('../bot/flows');

function contextualFallbackReply({ lead, userMessage, stage, settings }) {
  const text = String(userMessage || '').trim();
  const lower = text.toLowerCase();
  const price = settings.product_special_price || settings.product_price || 270;

  if (/^s[ií]$|^ok$|^dale$|^claro$/i.test(text)) {
    if (stage === 'video_ofrecido' || stage === 'inicio') {
      return `Perfecto ❤️ Vamos paso a paso.

Para orientarte mejor, contame algo simple: ¿esto que te pasa viene desde hace mucho tiempo o empezó hace poco?`;
    }

    if (stage === 'pdf_ofrecido') {
      return `Perfecto ❤️ Te acompaño con eso.

Mientras revisás el material, fijate especialmente si aparece ansiedad, bloqueo, culpa, miedo o una reacción fuerte en el cuerpo. ¿Cuál de esas sentís más cercana a tu caso?`;
    }

    if (stage === 'program_intro') {
      return `Claro ❤️ Te cuento de forma simple.

Neurotraumas es un proceso de 12 semanas para comprender qué se activa dentro de vos, reconocer patrones emocionales repetidos y empezar a trabajarlos con herramientas prácticas.

¿Querés que te explique qué incluye y cómo funciona?`;
    }
  }

  if (/precio|cu[aá]nto|costo|valor|inversi[oó]n/.test(lower)) {
    return `Claro. El programa tiene un valor normal de $360 USD, pero por este canal está con precio especial de $${price} USD.

Incluye 12 semanas de entrenamiento, clases en vivo, acceso de por vida, grupo privado, materiales, seguimiento, certificado, actualizaciones y garantía de 14 días.

¿Querés que te cuente cómo está organizado por dentro?`;
  }

  if (/gracias|ok|perfecto|lo veo|despu[eé]s/.test(lower)) {
    return `Perfecto ❤️ Revisalo con calma.

Si te surge una duda concreta sobre el contenido, el acceso o el proceso, me escribís por acá y lo vemos paso a paso.`;
  }

  return `Te leo ❤️

Para responderte bien y no darte algo genérico, contame un poquito más: ¿qué es lo que más te está pesando ahora con esto?`;
}

async function generateHumanReply({ lead, memory, history, userMessage, stage, settings }) {
  const prompt = `Genera una respuesta corta, natural y empática para WhatsApp como Marisa, guía del programa Neurotraumas.

Contexto:
- Producto: ${settings.product_name || 'Neurotraumas'}.
- Precio normal: USD $${settings.product_normal_price || 360}.
- Precio especial por este canal: USD $${settings.product_special_price || settings.product_price || 270}.
- Video gratuito: ${settings.video_link || 'sin enlace disponible; no lo menciones al usuario'}.
- PDF gratuito: ${settings.pdf_link || 'sin enlace disponible; no lo menciones al usuario'}.
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

  try {
    const reply = await generateText({
      prompt,
      temperature: 0.7,
      maxOutputTokens: 350
    });

    return reply && reply.trim()
      ? reply.trim()
      : contextualFallbackReply({ lead, userMessage, stage, settings });
  } catch (error) {
    return contextualFallbackReply({ lead, userMessage, stage, settings });
  }
}

async function generateStageReply({
  lead,
  memory,
  history,
  userMessage,
  stage,
  settings,
  objective,
  fallback
}) {
  const prompt = `Redacta la respuesta de WhatsApp como Marisa para esta etapa exacta del flujo Neurotraumas.

Mensaje del usuario:
${userMessage}

Etapa que debe respetarse:
${stage || 'inicio'}

Objetivo de esta respuesta:
${objective}

Reglas obligatorias:
- Responde directamente a lo que el usuario acaba de decir.
- No reinicies la conversación.
- No repitas el último mensaje del bot.
- No copies literalmente plantillas ni mensajes previos.
- No mandes Hotmart salvo que el objetivo diga explícitamente que corresponde enviar el link de pago.
- Si el usuario solo dice "sí", interpreta ese "sí" según la etapa actual.
- Avanza solo un paso del flujo.
- Máximo una pregunta al final, salvo diagnóstico donde puedes hacer dos.
- Tono: Marisa, cálida, humana, clara y contenedora.
- No prometas curas, no diagnostiques y no digas que reemplaza terapia.
- No inventes descuentos, cupos ni urgencia falsa.
- Precio normal: USD $${settings.product_normal_price || 360}.
- Precio especial: USD $${settings.product_special_price || settings.product_price || 270}.
- Video gratuito: ${settings.video_link || 'sin enlace disponible; no lo menciones al usuario'}.
- PDF gratuito: ${settings.pdf_link || 'sin enlace disponible; no lo menciones al usuario'}.
- Hotmart: ${settings.hotmart_link || 'https://pay.hotmart.com/T103515864E'}.

Último mensaje del bot:
${lead && lead.last_bot_message ? lead.last_bot_message : 'Sin mensaje previo'}

Lead:
${JSON.stringify(lead || {}, null, 2)}

Memoria:
${JSON.stringify(memory || {}, null, 2)}

Historial reciente:
${JSON.stringify(history || [], null, 2)}

Contenido mínimo que debe cubrir si aplica, pero sin copiarlo literal:
${fallback || ''}`;

  try {
    const reply = await generateText({
      prompt,
      temperature: 0.85,
      maxOutputTokens: 450
    });

    if (!reply || !reply.trim()) return fallback;
    return reply.trim();
  } catch (error) {
    return fallback;
  }
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
  generateStageReply,
  contextualFallbackReply,
  generatePostLinkReply
};
