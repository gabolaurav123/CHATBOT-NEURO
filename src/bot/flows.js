function withName(lead, fallback = '') {
  return lead && lead.name ? lead.name : fallback;
}

function prices(settings = {}) {
  return {
    normal: settings.product_normal_price || '360',
    special: settings.product_special_price || settings.product_price || '270'
  };
}

function hotmartLink(settings = {}) {
  return settings.hotmart_link || 'https://pay.hotmart.com/T103515864E';
}

function videoLink(settings = {}) {
  return settings.video_link || '';
}

function pdfLink(settings = {}) {
  return settings.pdf_link || '';
}

function firstMessage(settings = {}, lead = null) {
  const name = withName(lead);
  return `Hola${name ? ` ${name}` : ''} 👋 Qué bueno que estés acá.

Soy Marisa. Desde el 2014 acompaño a personas a entender sus heridas emocionales, liberar cargas internas y recuperar más calma en su mente y en su cuerpo.

Para empezar de una forma simple, quiero regalarte una clase corta de 12 minutos donde te explico cómo funciona el cerebro cuando se activa una herida emocional o un trauma.

Voy a recordar esta conversación durante 24 horas para no repetirte lo mismo. Si prefieres borrar esa memoria temporal, escribí BORRAR.

¿Querés que te envíe el video ahora?`;
}

function greetingMessage(settings = {}, lead = null) {
  return firstMessage(settings, lead);
}

function infoWelcomeMessage(settings = {}, lead = null) {
  const name = withName(lead);
  return `Claro${name ? `, ${name}` : ''} ❤️ Te cuento.

Neurotraumas es un proceso de 12 semanas para aprender a identificar y empezar a desactivar heridas emocionales o reacciones internas que se repiten, como miedo, ansiedad, bloqueo, culpa, apego, rechazo o sensación de no poder avanzar.

Antes de hablarte del programa, me gusta regalar una clase corta de 12 minutos para que entiendas cómo funciona esto en el cerebro y en el cuerpo.

¿Querés que te la envíe?`;
}

function problemWelcomeMessage() {
  return `Gracias por escribirme y contarme eso ❤️

Lo que describís puede sentirse muy agotador, sobre todo cuando la mente intenta estar bien pero el cuerpo reacciona con miedo, tensión, ansiedad o bloqueo.

Antes de hablarte del programa, quiero regalarte una clase corta de 12 minutos para que entiendas por qué el cuerpo puede seguir reaccionando a experiencias que no terminó de procesar.

¿Querés que te la envíe?`;
}

function videoSentMessage(settings = {}) {
  const link = videoLink(settings);

  if (!link) {
    return `Perfecto ❤️ Vamos paso a paso.

Para conocerte mejor, te hago dos preguntitas:

1. ¿Esto que te pasa viene desde hace mucho tiempo o empezó hace poco?
2. Cuando aparece, ¿lo sentís fuerte en el cuerpo? Por ejemplo: taquicardia, presión en el pecho, nudo en la garganta, tensión, bloqueo, ganas de llorar o miedo.`;
  }

  return `Perfecto, te lo dejo acá 🎁

Video gratuito:
${link}

Miralo tranquila cuando puedas. No hace falta que lo veas perfecto ni que entiendas todo de una vez.

Cuando termines, contame qué parte te resonó o si sentiste que algo se parece a lo que te pasa.`;
}

function videoDeclinedMessage() {
  return `Está bien, lo respeto totalmente 🌿

Si en otro momento querés entender por qué ciertas emociones, miedos o reacciones del cuerpo se repiten, podés escribirme por acá y te lo envío sin problema.

Te mando un abrazo.`;
}

function videoWaitingMessage() {
  return `Perfecto ❤️ Miralo con calma.

Y cuando lo termines, contame si hubo alguna parte que te hizo sentido o si conectó con algo que venís viviendo.

Cuando lo termines, contame que parte te hizo sentido.`;
}

function diagnosticIntroMessage() {
  return `Gracias por verlo ❤️

Me alegra que te haya hecho sentido. Ahora quiero conocerte un poquito mejor para poder orientarte con más cuidado.

Te hago dos preguntitas rápidas:

1. ¿Esto que te pasa viene desde hace mucho tiempo o empezó hace poco?
2. Cuando aparece, ¿lo sentís fuerte en el cuerpo? Por ejemplo: taquicardia, presión en el pecho, nudo en la garganta, tensión, bloqueo, ganas de llorar o miedo.

Contame como puedas, no hace falta explicarlo perfecto.`;
}

function directPainDiagnosticMessage() {
  return `Gracias por contarme eso ❤️

Lo que decís es importante, porque muchas veces el cuerpo expresa algo que la mente todavía no pudo ordenar. Puede aparecer como ansiedad, miedo, presión en el pecho, ganas de llorar, bloqueo o una reacción que se repite aunque una parte tuya no quiera.

Para orientarte mejor, te hago dos preguntitas:

1. ¿Esto viene desde hace mucho tiempo o empezó hace poco?
2. Cuando te pasa, ¿sentís una reacción fuerte en el cuerpo?

Con eso puedo decirte mejor por dónde puede venir.`;
}

function diagnosticLongMessage() {
  return `Gracias por abrirte y contármelo ❤️

Por lo que me decís, suena a que tu cuerpo aprendió una forma de reaccionar para protegerte. A veces, cuando vivimos algo intenso, doloroso o repetido, el cerebro guarda esa experiencia como una alerta.

Entonces, aunque hoy la situación sea diferente, el sistema nervioso puede activarse como si siguieras en peligro.

No significa que estés mal ni que seas débil. Significa que hay una reacción interna que se puede comprender, trabajar y empezar a liberar.

¿Tiene sentido esto con lo que venís sintiendo?`;
}

function diagnosticRecentMessage() {
  return `Gracias por contármelo ❤️

Si esto empezó hace poco, puede estar relacionado con una situación reciente que tu sistema nervioso todavía está intentando procesar. A veces una experiencia no necesita ser enorme para dejar una marca; basta con que haya sido intensa para vos.

Lo importante es observar cómo responde tu cuerpo y qué situaciones activan esa reacción.

¿Sentís que esto empezó después de algo específico?`;
}

function diagnosticUnknownMessage() {
  return `Está bien no saberlo. A muchas personas les pasa que sienten ansiedad, miedo, bloqueo o tristeza, pero no logran identificar exactamente de dónde viene.

El primer paso no es tener todas las respuestas, sino aprender a observar cómo reacciona tu cuerpo y en qué momentos se activa.

Eso ya empieza a darte claridad.

¿Querés que te ayude a identificar qué tipo de situación suele activarlo más?`;
}

function pdfOfferMessage() {
  return `Me alegra que te haga sentido 🌿

Para ayudarte a entenderlo mejor, te preparé un PDF corto y práctico con información clara sobre cómo se activan estas memorias emocionales y qué podés empezar a observar en vos desde hoy.

No es algo pesado ni complicado. Es una guía simple para que puedas empezar a mirar tu caso con más claridad.

¿Querés que te lo envíe?`;
}

function pdfSentMessage(settings = {}) {
  const link = pdfLink(settings);

  if (!link) {
    return `Claro ❤️

Lo importante ahora es que empieces a reconocer cómo reacciona tu cuerpo y qué situaciones activan esa respuesta.

¿Querés que te cuente cómo funciona el programa Neurotraumas?`;
  }

  return `Claro, te lo dejo acá ❤️

PDF gratuito:
${link}

Leelo con calma. Lo importante no es que entiendas todo perfecto, sino que empieces a reconocer cómo reacciona tu cuerpo y qué situaciones activan esa respuesta.

Cuando lo veas, contame qué parte sentiste más cercana a tu caso.`;
}

function pdfWaitingMessage() {
  return `Perfecto ❤️ Revisalo tranquila.

Después de leerlo, fijate especialmente si identificás alguna reacción que se repite en vos: miedo, bloqueo, ansiedad, culpa, apego, rechazo, tensión o ganas de llorar.

Cuando quieras, me contás qué parte sentiste más cercana a tu caso.`;
}

function programIntroMessage() {
  return `Me alegra que estés tomando esto en serio ❤️

Cuando una reacción emocional se repite, normalmente no alcanza solo con entenderla. Hay que aprender a identificar cuándo se activa, qué la detona, cómo responde el cuerpo y cómo empezar a regularla desde la raíz.

Justamente para eso existe Neurotraumas. Es un programa de 12 semanas donde te acompaño paso a paso a entender y trabajar esas reacciones internas que se activan automáticamente.

¿Querés que te cuente cómo funciona el programa?`;
}

function offerMessage(settings = {}, lead = null) {
  const name = withName(lead);
  const product = settings.product_name || 'Neurotraumas';
  const { normal, special } = prices(settings);

  return `Me alegra mucho que hayas llegado hasta acá${name ? `, ${name}` : ''} ❤️

${product} es un programa de 12 semanas diseñado para ayudarte a identificar, comprender y empezar a desactivar esas reacciones emocionales que se activan automáticamente en tu mente y en tu cuerpo.

No es solo teoría. Es un proceso práctico para que puedas entender qué pasa dentro de vos, reconocer tus patrones y aplicar herramientas concretas para recuperar más calma y control interno.

El valor normal es de $${normal} USD, pero por este canal tenés un precio especial de $${special} USD.

Incluye:

✅ 12 semanas de entrenamiento
✅ Clases en vivo
✅ Acceso de por vida en Hotmart
✅ Grupo privado de acompañamiento
✅ Material práctico y ejercicios
✅ 2 lives grupales de seguimiento
✅ Certificado
✅ Actualizaciones
✅ Garantía de 14 días

La idea es que no atravieses esto sola, sino con una estructura clara y acompañamiento.

¿Querés que te pase el link de Hotmart para verlo con calma?`;
}

function priceOnlyMessage(settings = {}) {
  const { normal, special } = prices(settings);
  return `Claro. El programa Neurotraumas tiene un valor normal de $${normal} USD, pero por este canal está con precio especial de $${special} USD.

Incluye 12 semanas de entrenamiento, clases en vivo, acceso de por vida, grupo privado, materiales, lives de seguimiento, certificado, actualizaciones y garantía de 14 días.

Si querés, también puedo pasarte el link para que veas todo con detalle en Hotmart.`;
}

function summaryMessage(settings = {}) {
  const { special } = prices(settings);
  return `Claro. Te lo resumo simple:

Neurotraumas es un programa de 12 semanas para aprender a identificar y empezar a desactivar heridas emocionales o traumas que se activan automáticamente en tu cuerpo y en tu mente.

Incluye clases, ejercicios, grupo privado, seguimiento, acceso de por vida y garantía de 14 días.

El precio especial por este canal es de $${special} USD.`;
}

function freeMaterialsMessage(settings = {}) {
  const video = videoLink(settings);
  const pdf = pdfLink(settings);

  if (!video && !pdf) {
    return `Claro, podés empezar con material gratuito sin problema ❤️

Podemos empezar simple: ¿lo que más te pesa ahora es ansiedad, miedo, tristeza, culpa o sentir que no podés soltar algo?`;
  }

  return `Claro, podés empezar con el material gratuito sin problema ❤️

Te recomiendo ver primero el video de 12 minutos y luego revisar el PDF. Eso ya te va a dar claridad sobre cómo se activan ciertas heridas emocionales y por qué el cuerpo puede reaccionar con ansiedad, miedo o bloqueo.

${video ? `Video:\n${video}\n\n` : ''}${pdf ? `PDF:\n${pdf}` : ''}`.trim();
}

function hotmartMessage(lead = null, linkValue = null, settings = {}) {
  const name = withName(lead);
  const link = linkValue || hotmartLink(settings);
  const { special } = prices(settings);

  return `Claro${name ? `, ${name}` : ''} ❤️ Te dejo el link seguro de Hotmart para que puedas ver toda la información y hacer tu inscripción:

${link}

Recordá que por este canal tenés el precio especial de $${special} USD y garantía de 14 días.

Cuando entres, si te surge alguna duda sobre el pago, el acceso o el contenido, escribime por acá y te ayudo.`;
}

const objectionReplies = {
  precio: `Te entiendo ❤️ Es una inversión importante, y está bien mirarlo con cuidado.

No quiero que lo tomes desde presión. Más que verlo solo como un gasto, pensalo como una decisión sobre algo que lleva tiempo afectándote.

También tenés garantía de 14 días, para entrar, revisar el contenido y sentir si realmente conecta con vos.

¿Querés que te explique exactamente qué incluye para que puedas decidir con más claridad?`,

  tiempo: `Te entiendo. Muchas personas llegan sintiendo que no tienen tiempo ni energía.

Por eso Neurotraumas está pensado para avanzar paso a paso, sin saturarte. La idea no es exigirte más, sino darte una estructura para empezar a comprender y regular lo que se activa en vos.

¿Tu preocupación es más por horarios, constancia o energía emocional?`,

  confianza: `Es normal tener dudas.

Nadie debería tomar una decisión importante solo por impulso. Neurotraumas no se basa en prometer resultados mágicos, sino en ayudarte a comprender tus patrones, trabajar con herramientas prácticas y acompañarte durante 12 semanas.

Además, el pago se hace por Hotmart y tenés garantía de 14 días.

¿Querés que te explique cómo funciona el acceso después del pago?`,

  indecision: `Claro, está bien pensarlo con calma 🌿

No quiero que compres desde presión. Solo te dejo una pregunta para mirarlo con honestidad:

¿Lo querés pensar porque necesitás revisar algo concreto, o porque una parte tuya tiene miedo de empezar?`
};

function crisisMessage() {
  return `Siento mucho que estés pasando por esto. Lo más importante ahora es tu seguridad.

Por favor, no te quedes sola con esto: buscá a una persona de confianza ahora mismo o comunicate con emergencias o una línea de ayuda de tu país.

Si sentís que podés hacerte daño o estás en peligro inmediato, llamá a emergencias en este momento.

Yo puedo acompañarte con palabras, pero en una situación así necesitás apoyo humano directo y urgente.`;
}

function deleteMemoryMessage() {
  return `Entiendo. Voy a eliminar la memoria temporal de esta conversación.

Solo mantendremos el registro básico necesario para no volver a contactarte si no lo deseas.`;
}

function stopMessage() {
  return `Está bien, lo respeto totalmente.

Gracias por haber escrito y te deseo mucha calma en tu proceso 🌿`;
}

function humanTakeoverMessage() {
  return `Claro. Voy a dejar esta conversación para que una persona del equipo pueda ayudarte directamente.`;
}

function botIdentityMessage() {
  return `Soy el asistente virtual del equipo de Marisa, pero estoy acá para orientarte con mucho cuidado y ayudarte a resolver tus dudas.`;
}

function softCloseMessage() {
  return `Perfecto ❤️ Revisalo con calma.

No tenés que decidir desde la presión. Si te surge alguna duda sobre el contenido, el acceso o el pago, me escribís por acá y te ayudo.`;
}

function farewellMessage() {
  return `Perfecto ❤️ Gracias por escribirme.

Revisalo con calma y, si en otro momento querés retomar o te surge alguna duda, podés escribirme por acá.

Te mando un abrazo.`;
}

function unclearMessage() {
  return `Te entiendo. A veces cuesta poner en palabras lo que uno siente.

Podemos ir simple: ¿lo que más te pesa ahora es ansiedad, miedo, tristeza, culpa o sentir que no podés soltar algo?`;
}

function postLinkFallback(lead = null) {
  const name = withName(lead);
  return `Perfecto${name ? `, ${name}` : ''} ❤️

Revisalo tranquila. Si al entrar te surge alguna duda sobre el pago, el acceso o el contenido, me escribís por acá y te ayudo.`;
}

function paymentReportedMessage(lead = null) {
  const name = withName(lead);
  return `Excelente${name ? `, ${name}` : ''} 🙌

Me alegra mucho que hayas tomado la decisión de empezar.

Para ayudarte con el acceso, por favor envíame la confirmación de Hotmart o el correo/comprobante de inscripción.

Luego te guiaremos con los siguientes pasos.`;
}

const painReplies = {
  ansiedad: directPainDiagnosticMessage(),
  autosabotaje: directPainDiagnosticMessage(),
  pensamientos_repetitivos: directPainDiagnosticMessage(),
  relaciones_dificiles: directPainDiagnosticMessage(),
  bloqueo: directPainDiagnosticMessage(),
  informacion: infoWelcomeMessage()
};

function diagnosticQuestion1() {
  return directPainDiagnosticMessage();
}

function diagnosticQuestion2() {
  return `¿Hace cuánto sentís que esto viene afectándote: empezó hace poco, hace más de un año o viene desde hace mucho tiempo?`;
}

function diagnosticQuestion3() {
  return `¿Ya intentaste algo para trabajarlo, como terapia, cursos, meditación o alguna herramienta emocional?`;
}

function diagnosticQuestion4() {
  return `Del 1 al 10, ¿qué tan urgente es para vos empezar a cambiar esto?`;
}

function askName() {
  return `Para orientarte mejor, ¿me decís tu nombre?`;
}

function askEmail(lead) {
  const name = withName(lead);
  return `Perfecto${name ? `, ${name}` : ''}. ¿A qué correo te puedo enviar la información si querés revisarla con calma?`;
}

function askEmailAgain() {
  return `Creo que ese correo no quedó bien escrito. ¿Me lo podés enviar nuevamente?`;
}

function askUsername() {
  return `¿Y por qué red llegaste o cuál es tu usuario? Puede ser Instagram, Facebook, TikTok o WhatsApp.`;
}

function askPhone() {
  return `Para dejar tu registro completo y poder darte seguimiento si se corta la conversación, ¿me compartís tu número de WhatsApp con código de país?`;
}

module.exports = {
  firstMessage,
  greetingMessage,
  infoWelcomeMessage,
  problemWelcomeMessage,
  videoSentMessage,
  videoDeclinedMessage,
  videoWaitingMessage,
  diagnosticIntroMessage,
  directPainDiagnosticMessage,
  diagnosticLongMessage,
  diagnosticRecentMessage,
  diagnosticUnknownMessage,
  pdfOfferMessage,
  pdfSentMessage,
  pdfWaitingMessage,
  programIntroMessage,
  priceOnlyMessage,
  summaryMessage,
  freeMaterialsMessage,
  painReplies,
  diagnosticQuestion1,
  diagnosticQuestion2,
  diagnosticQuestion3,
  diagnosticQuestion4,
  askName,
  askEmail,
  askEmailAgain,
  askUsername,
  askPhone,
  offerMessage,
  hotmartMessage,
  objectionReplies,
  crisisMessage,
  deleteMemoryMessage,
  stopMessage,
  humanTakeoverMessage,
  botIdentityMessage,
  softCloseMessage,
  farewellMessage,
  unclearMessage,
  postLinkFallback,
  paymentReportedMessage
};
