const { generateText } = require('./geminiClient');
const { logger } = require('../utils/logger');
const { postLinkFallback } = require('../bot/flows');

function normalizeReply(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function isRepeatedReply(reply, lead) {
  const current = normalizeReply(reply);
  const last = normalizeReply(lead && lead.last_bot_message);
  if (!current || !last) return false;
  return current === last || current.includes(last.slice(0, 120)) || last.includes(current.slice(0, 120));
}

function contextualFallbackReply({ lead, userMessage, stage, settings }) {
  const text = String(userMessage || '').trim();
  const lower = text.toLowerCase();
  const currentStage = stage || (lead && lead.funnel_stage) || 'inicio';
  const price = settings.product_special_price || settings.product_price || 270;

  if (/^s[ií]$|^ok$|^dale$|^claro$/i.test(text)) {
    if (currentStage === 'inicio' || currentStage === 'video_ofrecido') {
      return `Perfecto ❤️ Vamos paso a paso.

Para orientarte mejor, contame algo simple: ¿esto que te pasa viene desde hace mucho tiempo o empezó hace poco?`;
    }

    if (currentStage === 'diagnostico_orientativo') {
      return `Gracias por responderme.

Para ubicarte mejor, contame esto: cuando aparece lo que estás sintiendo, ¿lo notás más en la mente, con pensamientos repetitivos, o más en el cuerpo, como presión, tensión, nudo en la garganta o ansiedad?`;
    }

    if (currentStage === 'descubrimiento_emocional') {
      return `Tiene sentido que lo sientas así ❤️

Lo importante ahora es empezar a mirar qué se activa en vos y en qué momentos aparece con más fuerza.

¿Querés que te comparta una guía breve para ayudarte a identificarlo con más claridad?`;
    }

    if (currentStage === 'pdf_ofrecido' || currentStage === 'pdf_enviado') {
      return `Perfecto ❤️ Revisalo con calma.

Mientras lo mirás, fijate qué parte sentís más cercana a tu caso: ansiedad, bloqueo, miedo, culpa, apego o sensación de no poder avanzar.`;
    }

    if (currentStage === 'program_intro') {
      return `Claro ❤️ Te cuento de forma simple.

Neurotraumas es un proceso de 12 semanas para comprender qué se activa dentro de vos, reconocer patrones emocionales repetidos y empezar a trabajarlos con herramientas prácticas.

¿Querés que te explique qué incluye y cómo funciona?`;
    }

    if (currentStage === 'oferta_presentada') {
      return `Perfecto ❤️

Si sentís que esto conecta con lo que venís viviendo, puedo pasarte el link seguro de Hotmart para que lo revises con calma y veas las opciones de pago.`;
    }

    if (currentStage === 'link_pago_enviado' || currentStage === 'post_link_conversacion') {
      return `Perfecto ❤️ Revisalo tranquila.

Si al entrar te surge alguna duda sobre el pago, el acceso o el contenido, me escribís por acá y te ayudo.`;
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

  if (currentStage === 'inicio' || currentStage === 'video_ofrecido') {
    return `Gracias por escribirlo.

Antes de hablarte del programa, quiero entender un poquito mejor qué estás buscando para no darte información genérica.

¿Lo que más te pesa hoy es ansiedad, bloqueo, pensamientos repetitivos, relaciones difíciles o sentir que no podés avanzar?`;
  }

  if (currentStage === 'diagnostico_orientativo') {
    return `Gracias por contármelo.

Eso que mencionás merece mirarse con cuidado, porque muchas veces no es solo una idea: también hay una reacción emocional o corporal que se activa.

¿Sentís que esto viene de hace tiempo o empezó después de algo específico?`;
  }

  if (currentStage === 'descubrimiento_emocional') {
    return `Lo que decís es importante.

A veces el cuerpo sigue reaccionando como si tuviera que protegerte, aunque racionalmente sepas que hoy la situación es distinta.

¿Sentís que esta reacción aparece más en relaciones, en momentos de soledad o cuando recordás algo específico?`;
  }

  if (currentStage === 'pdf_ofrecido' || currentStage === 'pdf_enviado') {
    return `Vamos con calma ❤️

Lo importante no es entenderlo todo de golpe, sino empezar a reconocer qué se repite en vos y cuándo se activa.

¿Qué parte sentís más presente ahora: ansiedad, bloqueo, culpa, apego, miedo o pensamientos repetitivos?`;
  }

  if (currentStage === 'program_intro' || currentStage === 'oferta_presentada') {
    return `Te cuento de forma clara.

Neurotraumas es un proceso de 12 semanas para comprender y trabajar respuestas emocionales que se repiten, como ansiedad, bloqueo, apego, miedo, culpa o autosabotaje.

Incluye clases, ejercicios, acompañamiento, acceso de por vida y garantía de 14 días. El precio especial por este canal es de $${price} USD.

¿Querés que te explique qué incluye paso a paso?`;
  }

  if (currentStage === 'link_pago_enviado' || currentStage === 'post_link_conversacion') {
    return `Entiendo.

Como ya tenés el acceso de Hotmart, puedo ayudarte a resolver cualquier duda concreta antes de que decidas: pago, contenido, acceso, garantía o si esto es para tu caso.

¿Qué parte querés revisar primero?`;
  }

  return `Gracias por escribirlo.

Para orientarte bien y no responderte en automático, contame qué parte querés revisar primero: lo que te pasa, cómo funciona Neurotraumas, el precio o el acceso.`;
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

    if (!reply || !reply.trim() || isRepeatedReply(reply, lead)) {
      return contextualFallbackReply({ lead, userMessage, stage, settings });
    }

    return reply.trim();
  } catch (error) {
    logger.warn('Gemini human reply failed; using contextual fallback', { error: error.message, stage });
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

    if (!reply || !reply.trim() || isRepeatedReply(reply, lead)) {
      return contextualFallbackReply({ lead, userMessage, stage, settings });
    }

    return reply.trim();
  } catch (error) {
    logger.warn('Gemini stage reply failed; using contextual fallback', { error: error.message, stage });
    return contextualFallbackReply({ lead, userMessage, stage, settings });
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
    const reply = await generateText({
      prompt,
      temperature: 0.7,
      maxOutputTokens: 350
    });

    if (!reply || !reply.trim() || isRepeatedReply(reply, lead)) {
      return contextualFallbackReply({ lead, userMessage, stage: 'post_link_conversacion', settings });
    }

    return reply.trim();
  } catch (error) {
    logger.warn('Gemini post-link reply failed; using contextual fallback', { error: error.message });
    return postLinkFallback(lead, hotmartLink);
  }
}

module.exports = {
  generateHumanReply,
  generateStageReply,
  contextualFallbackReply,
  generatePostLinkReply
};
