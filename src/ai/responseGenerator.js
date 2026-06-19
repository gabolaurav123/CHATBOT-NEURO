const { generateText } = require('./geminiClient');
const { logger } = require('../utils/logger');

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function stripCodeFence(value) {
  return String(value || '')
    .replace(/^```(?:text|markdown)?/i, '')
    .replace(/```$/i, '')
    .trim();
}

function isRepeatedReply(reply, lead) {
  const current = normalizeText(reply);
  const last = normalizeText(lead && lead.last_bot_message);
  if (!current || !last) return false;

  if (current === last) return true;
  if (last.length >= 80 && current.includes(last.slice(0, 80))) return true;
  if (current.length >= 80 && last.includes(current.slice(0, 80))) return true;

  return false;
}

function stageLabel(stage) {
  const labels = {
    inicio: 'inicio',
    video_ofrecido: 'video ofrecido',
    video_enviado: 'video enviado',
    diagnostico_orientativo: 'diagnostico orientativo',
    descubrimiento_emocional: 'descubrimiento emocional',
    pdf_ofrecido: 'PDF ofrecido',
    pdf_enviado: 'PDF enviado',
    programa: 'programa',
    oferta_presentada: 'oferta presentada',
    objecion: 'objecion',
    link_pago_enviado: 'link de pago enviado',
    post_link_conversacion: 'conversacion posterior al link',
    pago_reportado: 'pago reportado',
    cierre_frio: 'cierre',
    crisis: 'crisis'
  };

  return labels[stage] || stage || 'inicio';
}

function priceFromSettings(settings = {}) {
  return settings.product_special_price || settings.product_price || 270;
}

function hotmartFromSettings(settings = {}) {
  return settings.hotmart_link || 'https://pay.hotmart.com/T103515864E';
}

function deterministicFallback({ stage, intent, userMessage, settings, lastBotMessage, requiredFacts }) {
  const text = normalizeText(userMessage);
  const price = priceFromSettings(settings);
  const hotmart = hotmartFromSettings(settings);

  if (intent === 'crisis') {
    return [
      'Siento mucho que estes pasando por esto.',
      '',
      'Ahora lo mas importante es tu seguridad. Por favor busca a una persona de confianza y contacta emergencias o una linea de ayuda de tu pais si sientes que puedes hacerte dano.',
      '',
      'No tienes que atravesar esto a solas.'
    ].join('\n');
  }

  if (intent === 'delete') {
    return 'Entiendo. Voy a borrar la memoria temporal de esta conversacion para no seguir usando ese contexto.';
  }

  if (intent === 'stop') {
    return 'Esta bien, lo respeto. No voy a seguir insistiendo. Si en otro momento quieres retomar, puedes escribirme por aqui.';
  }

  if (intent === 'human') {
    return 'Claro. Dejo esta conversacion para que una persona del equipo pueda ayudarte directamente.';
  }

  if (intent === 'bot_identity') {
    return 'Soy el asistente del equipo de Marisa. Estoy aqui para orientarte con Neurotraumas y responder tus dudas de forma clara.';
  }

  if (intent === 'payment_reported') {
    return 'Perfecto. Enviame la confirmacion de Hotmart o el correo con el que hiciste la inscripcion para revisar el acceso.';
  }

  if ((intent === 'info' || intent === 'greeting' || intent === 'inicio') && (stage === 'inicio' || stage === 'video_ofrecido')) {
    return [
      'Hola, gracias por escribirme.',
      '',
      'Antes de darte informacion general sobre Neurotraumas, quiero entender un poco que estas buscando para orientarte mejor.',
      '',
      'Que sientes que hoy te esta afectando mas: ansiedad, autosabotaje, pensamientos repetitivos, relaciones dificiles, bloqueo o solo quieres informacion?'
    ].join('\n');
  }

  if (intent === 'payment_link') {
    return [
      'Claro. Te dejo el link seguro de Hotmart para revisar la inscripcion:',
      '',
      hotmart,
      '',
      `El precio especial por este canal es de $${price} USD y tienes garantia de 14 dias.`,
      '',
      'Si te surge una duda sobre pago, acceso o contenido, escribeme por aqui.'
    ].join('\n');
  }

  if (intent === 'send_video') {
    if (settings.video_link) {
      return [
        'Perfecto. Te dejo la clase corta para que la mires con calma:',
        '',
        settings.video_link,
        '',
        'Cuando la termines, cuentame que parte se parece mas a lo que vienes viviendo.'
      ].join('\n');
    }

    return 'Perfecto. Avancemos igual: para orientarte mejor, esto que te pasa viene desde hace mucho tiempo o empezo hace poco?';
  }

  if (intent === 'offer_pdf') {
    return 'Eso que cuentas tiene sentido con lo que venimos revisando. Tengo un PDF corto que puede ayudarte a ordenar mejor estas ideas. Quieres que te lo envie?';
  }

  if (intent === 'send_pdf') {
    if (settings.pdf_link) {
      return [
        'Claro. Te dejo el PDF para que lo revises con calma:',
        '',
        settings.pdf_link,
        '',
        'Cuando lo veas, cuentame que parte conecto mas con tu caso.'
      ].join('\n');
    }

    return 'Te acompano igual desde aqui. Para seguir ubicando tu caso, que sientes que mas se repite en ti: ansiedad, bloqueo, miedo, culpa o pensamientos repetitivos?';
  }

  if (intent === 'price') {
    return [
      `El valor normal es de $360 USD y por este canal tienes precio especial de $${price} USD.`,
      '',
      'Incluye 12 semanas, clases en vivo, acceso de por vida en Hotmart, grupo privado, materiales, seguimiento, certificado, actualizaciones y garantia de 14 dias.',
      '',
      'Quieres que te explique como esta organizado por dentro?'
    ].join('\n');
  }

  if (stage === 'inicio') {
    if (text === 'si' || text === 'ok' || text === 'dale') {
      return [
        'Perfecto. Vamos paso a paso.',
        '',
        'Para orientarte mejor, dime que es lo que mas te pesa hoy: ansiedad, bloqueo, pensamientos repetitivos, relaciones dificiles o sentir que no puedes avanzar?'
      ].join('\n');
    }

    return [
      'Hola, gracias por escribirme.',
      '',
      'Antes de enviarte informacion general, quiero entender que estas buscando para orientarte mejor.',
      '',
      'Que sientes que hoy te esta afectando mas?'
    ].join('\n');
  }

  if (stage === 'video_ofrecido') {
    if (text === 'si' || text === 'ok' || text === 'dale' || text === 'claro') {
      return [
        'Perfecto, avancemos.',
        '',
        'Antes de darte mas informacion, quiero ubicar tu caso: esto que te pasa viene desde hace mucho tiempo o empezo hace poco?'
      ].join('\n');
    }

    return 'Te respondo desde lo que me dices. Lo importante es entender primero que estas viviendo, y luego vemos que recurso de Neurotraumas te puede servir.';
  }

  if (stage === 'video_enviado') {
    return 'Miralo con calma. Cuando lo termines, cuentame que parte se parece a lo que vienes viviendo.';
  }

  if (stage === 'diagnostico_orientativo') {
    return [
      'Gracias por contarmelo.',
      '',
      'Para entenderlo mejor: esto viene de hace mucho tiempo o aparecio despues de algo especifico? Y cuando se activa, lo notas mas en la mente o en el cuerpo?'
    ].join('\n');
  }

  if (stage === 'descubrimiento_emocional') {
    return [
      'Lo que cuentas puede ser muy agotador.',
      '',
      'A veces el sistema nervioso sigue reaccionando como si tuviera que protegerte, aunque una parte de ti quiera estar tranquila.',
      '',
      'Sientes que esto se activa mas en relaciones, en soledad o cuando aparece algun recuerdo?'
    ].join('\n');
  }

  if (stage === 'pdf_ofrecido' || stage === 'pdf_enviado') {
    return 'Vamos con calma. De lo que has visto hasta ahora, que parte sientes mas presente en ti: ansiedad, bloqueo, culpa, miedo, apego o pensamientos repetitivos?';
  }

  if (stage === 'programa') {
    return [
      'Neurotraumas es un proceso de 12 semanas para entender y trabajar respuestas emocionales que se repiten, como ansiedad, bloqueo, miedo, apego, culpa o autosabotaje.',
      '',
      'La idea es que puedas comprender que se activa en ti y trabajar con herramientas practicas, paso a paso y con acompanamiento.',
      '',
      'Quieres que te explique que incluye y como esta organizado por dentro?'
    ].join('\n');
  }

  if (stage === 'oferta_presentada') {
    return [
      'Neurotraumas es un proceso de 12 semanas para entender y trabajar respuestas emocionales que se repiten, como ansiedad, bloqueo, miedo, apego, culpa o autosabotaje.',
      '',
      `El precio especial por este canal es de $${price} USD, con acceso de por vida en Hotmart y garantia de 14 dias.`,
      '',
      'Quieres que te explique que incluye o prefieres revisar el link de Hotmart?'
    ].join('\n');
  }

  if (stage === 'link_pago_enviado' || stage === 'post_link_conversacion') {
    return 'Como ya tienes el acceso de Hotmart, puedo ayudarte con una duda concreta: pago, contenido, acceso, garantia o si esto aplica para tu caso. Que parte quieres revisar?';
  }

  if (intent === 'thanks' || intent === 'farewell') {
    return 'Perfecto. Revisalo con calma y, si despues te surge una duda concreta, me escribes por aqui.';
  }

  if (lastBotMessage) {
    return 'Para avanzar sin repetir lo mismo, tomo lo ultimo que me dices. Que quieres revisar primero: lo que te esta pasando, como funciona Neurotraumas, el precio o el acceso?';
  }

  if (requiredFacts) {
    return `Gracias por escribirme. Para avanzar con precision, tomo este dato: ${requiredFacts}`;
  }

  return 'Gracias por escribirme. Cuentame que quieres revisar primero: lo que te esta pasando, como funciona Neurotraumas, el precio o el acceso.';
}

async function generateNeuroReply({
  lead,
  memory,
  history,
  userMessage,
  stage,
  nextStage,
  intent,
  objective,
  requiredFacts,
  settings = {}
}) {
  const lastBotMessage = lead && lead.last_bot_message ? lead.last_bot_message : '';
  const fallback = deterministicFallback({
    stage: nextStage || stage,
    intent,
    userMessage,
    settings,
    lastBotMessage,
    requiredFacts
  });

  const prompt = `Eres Marisa, guia humana y clara de Neurotraumas.

Responde SOLO con el mensaje final para WhatsApp. No expliques tu razonamiento.

MENSAJE ACTUAL DEL USUARIO:
${userMessage}

ETAPA ACTUAL: ${stageLabel(stage)}
SIGUIENTE ETAPA: ${stageLabel(nextStage)}
INTENCION DETECTADA: ${intent || 'otro'}

OBJETIVO EXACTO DE ESTA RESPUESTA:
${objective || 'Responder al usuario de forma natural y avanzar la conversacion sin repetir mensajes anteriores.'}

DATOS REALES DEL PROGRAMA:
- Nombre: Neurotraumas.
- Persona/marca: Marisa.
- Duracion: 12 semanas.
- Precio normal: $360 USD.
- Precio especial por este canal: $${priceFromSettings(settings)} USD.
- Plataforma de pago: Hotmart.
- Acceso de por vida.
- Garantia: 14 dias.
- Incluye clases en vivo, grupo privado, material practico, ejercicios, 2 lives grupales de seguimiento, certificado y actualizaciones.
- Link de video gratuito: ${settings.video_link || 'NO DISPONIBLE; no inventes enlace y no menciones configuracion interna'}.
- Link de PDF gratuito: ${settings.pdf_link || 'NO DISPONIBLE; no inventes enlace y no menciones configuracion interna'}.
- Link Hotmart: ${hotmartFromSettings(settings)}.

REGLAS OBLIGATORIAS:
- Responde a lo que el usuario acaba de decir, aunque sea "si", "no", "hola", "1" o una duda corta.
- Si el usuario dice "si", interpreta ese "si" segun la etapa actual. Nunca vuelvas al saludo inicial por un "si".
- No reinicies la conversacion.
- No repitas el ultimo mensaje del bot.
- No uses la frase "te leo" ni corazones como respuesta comodin.
- No uses plantillas literales ni mensajes largos de bienvenida si ya hubo conversacion.
- No vendas ni mandes Hotmart salvo que el objetivo lo pida o el usuario pida comprar/pagar/link.
- Si mandas Hotmart, incluye el link exacto y el precio especial.
- Si no toca vender, conversa, orienta y haz una sola pregunta util al final.
- En diagnostico puedes hacer maximo dos preguntas.
- Tono: humano, cercano, sobrio, sin presion.
- No prometas curas.
- No diagnostiques clinicamente.
- No inventes cupos, urgencia falsa ni descuentos.
- No digas que reemplaza terapia.
- Si faltan links de video o PDF, no digas que faltan y no menciones CRM/configuracion.

DATOS OBLIGATORIOS PARA INCLUIR SI CORRESPONDEN:
${requiredFacts || 'Ninguno.'}

ULTIMO MENSAJE DEL BOT:
${lastBotMessage || 'Sin mensaje previo'}

MEMORIA:
${JSON.stringify(memory || {}, null, 2)}

HISTORIAL RECIENTE:
${JSON.stringify(history || [], null, 2)}

Si Gemini no puede responder bien, la salida debe ser similar en intencion a este fallback, pero no lo copies literal:
${fallback}`;

  try {
    const reply = stripCodeFence(await generateText({
      prompt,
      model: settings.gemini_model,
      temperature: 0.8,
      maxOutputTokens: 550
    }));

    if (!reply || isRepeatedReply(reply, lead) || normalizeText(reply) === 'te leo' || /te leo\s*[\u2764\uFE0F]*/i.test(reply)) {
      return fallback;
    }

    return reply;
  } catch (error) {
    logger.warn('Gemini reply failed; using deterministic fallback', {
      error: error.message,
      stage,
      nextStage,
      intent
    });
    return fallback;
  }
}

async function generateHumanReply({ lead, memory, history, userMessage, stage, settings }) {
  return generateNeuroReply({
    lead,
    memory,
    history,
    userMessage,
    stage,
    nextStage: stage,
    intent: 'otro',
    objective: 'Responder el ultimo mensaje del usuario de forma natural, sin reiniciar el flujo y sin repetir mensajes anteriores.',
    settings
  });
}

async function generateStageReply({ lead, memory, history, userMessage, stage, settings, objective, fallback }) {
  return generateNeuroReply({
    lead,
    memory,
    history,
    userMessage,
    stage,
    nextStage: stage,
    intent: 'etapa',
    objective,
    requiredFacts: fallback,
    settings
  });
}

function contextualFallbackReply({ lead, userMessage, stage, settings }) {
  return deterministicFallback({
    stage,
    intent: 'otro',
    userMessage,
    settings,
    lastBotMessage: lead && lead.last_bot_message
  });
}

async function generatePostLinkReply({ lead, memory, history, userMessage, settings }) {
  return generateNeuroReply({
    lead,
    memory,
    history,
    userMessage,
    stage: 'post_link_conversacion',
    nextStage: 'post_link_conversacion',
    intent: 'post_link',
    objective: 'Responder la duda actual despues de haber enviado el link de Hotmart. No reenvies el link salvo que el usuario lo pida.',
    settings
  });
}

module.exports = {
  generateNeuroReply,
  generateHumanReply,
  generateStageReply,
  contextualFallbackReply,
  generatePostLinkReply
};
