const BOT_NAME = 'Marisa';
const PRODUCT_NAME = 'Neurotraumas';
const VIDEO_LINK = 'https://drive.google.com/file/d/1gpukjlEwfQMXHN8LD_GN2-IEncwZ3wFy/view?usp=drive_link';
const NORMAL_PRICE_USD = '360';
const PRICE_USD = '270';
const PROGRAM_START = '28 de julio a las 14:00, horario argentino';
const GUARANTEE_DAYS = '7';
const HOTMART_PLACEHOLDER = 'https://pay.hotmart.com/T103515864E';
const LEGACY_HOTMART_LINK = 'https://pay.hotmart.com/W101807995K';
const LEGACY_VIDEO_LINK = 'https://youtu.be/btHy8kSC4E4';
const HOTMART_PLACEHOLDERS = [
  '(LINK HOTMART)',
  '[LINK HOTMART]',
  'LINK HOTMART',
  '(HOTMART_LINK)',
  '[HOTMART_LINK]',
  'HOTMART_LINK'
];

const PROGRAM_MODULES = [
  '1. Que es el trauma',
  '2. El cerebro reptil',
  '3. El cerebro y el trauma',
  '4. Herramientas aplicadas al trauma',
  '5. Desensibilizacion del trauma',
  '6. Casos reales y plan de accion'
];

function programModulesText() {
  return PROGRAM_MODULES.join('\n');
}

function withName(lead, fallback = '') {
  return lead && lead.name ? lead.name : fallback;
}

function cleanSetting(value, fallback, legacyValues = []) {
  const text = value === undefined || value === null ? '' : String(value).trim();
  if (!text || legacyValues.includes(text)) return fallback;
  return text;
}

function prices(settings = {}) {
  return {
    normal: cleanSetting(settings.product_normal_price, NORMAL_PRICE_USD, ['72']),
    special: cleanSetting(settings.product_special_price || settings.product_price, PRICE_USD, ['72'])
  };
}

function hotmartLink(settings = {}) {
  return cleanSetting(settings.hotmart_link, HOTMART_PLACEHOLDER, [LEGACY_HOTMART_LINK, ...HOTMART_PLACEHOLDERS]);
}

function videoLink(settings = {}) {
  return cleanSetting(settings.video_link, VIDEO_LINK, [LEGACY_VIDEO_LINK]);
}

function pdfLink(settings = {}) {
  return settings.pdf_link || '';
}

function firstMessage() {
  return `Hola, soy ${BOT_NAME} 👋🌿

Gracias por escribirnos.

${PRODUCT_NAME} es para personas que sienten que algo se repite en su vida y quieren empezar a trabajarlo desde la raiz.

Decime, que te gustaria mejorar primero?

1️⃣ Ansiedad o pensamientos que no paran
2️⃣ Miedos o inseguridad
3️⃣ Autosabotaje
4️⃣ Relaciones dificiles
5️⃣ Bloqueos emocionales
6️⃣ Cargas del pasado

Respondeme solo con el numero ❤️`;
}

function greetingMessage(settings = {}, lead = null) {
  return firstMessage(settings, lead);
}

function infoWelcomeMessage() {
  return firstMessage();
}

function problemWelcomeMessage() {
  return `Te entiendo ❤️

Eso que contas puede estar conectado con patrones emocionales que se repiten en automatico.

${PRODUCT_NAME} puede ayudarte a trabajar eso desde la raiz con herramientas practicas y acompanamiento.

Quieres que te muestre como funciona o prefieres que te explique directo el programa?`;
}

function videoSentMessage(settings = {}) {
  return `Perfecto ❤️

Te dejo este video donde se explica como funciona ${PRODUCT_NAME} y por que muchas veces repetimos patrones aunque queramos cambiar:

${videoLink(settings)}

Podes verlo con calma. Si sentis que conecta con lo que estas viviendo, te explico como entrar al programa 🌿`;
}

function videoDeclinedMessage() {
  return `Te entiendo ❤️

No quiero presionarte.

Solo te invito a preguntarte si esto que venis repitiendo merece seguir igual o si ya es momento de mirarlo desde otro lugar.`;
}

function videoWaitingMessage() {
  return `Perfecto ❤️ Miralo con calma.

Cuando lo termines, escribime "YA LO VI" y te explico como entrar al entrenamiento.`;
}

function diagnosticIntroMessage() {
  return problemWelcomeMessage();
}

function directPainDiagnosticMessage() {
  return problemWelcomeMessage();
}

function diagnosticLongMessage() {
  return `Lo que contas puede sentirse muy agotador ❤️

Muchas veces no se trata de falta de voluntad, sino de patrones emocionales funcionando en automatico.

Si queres ver como funciona, te dejo el video oficial:

${VIDEO_LINK}

Si preferis, tambien puedo explicarte directo el programa.`;
}

function diagnosticRecentMessage() {
  return diagnosticLongMessage();
}

function diagnosticUnknownMessage() {
  return `Esta bien no tener todo claro todavia ❤️

Justamente el entrenamiento te ayuda a observar patrones, emociones y cargas que quizas venis repitiendo sin darte cuenta.

Puedo explicarte el programa o dejarte el video oficial para que lo revises con calma:

${VIDEO_LINK}`;
}

function pdfOfferMessage() {
  return `En esta memoria no usamos PDF.

Puedo dejarte el video oficial o explicarte el programa directo.`;
}

function pdfSentMessage(settings = {}) {
  const link = pdfLink(settings);
  return link ? `Te dejo el material:\n\n${link}` : pdfOfferMessage();
}

function pdfWaitingMessage() {
  return videoWaitingMessage();
}

function programIntroMessage() {
  return `Que bueno ❤️

Entonces ya viste que no se trata solo de fuerza de voluntad, sino de trabajar los patrones que estan detras de lo que repetimos.

${PRODUCT_NAME} es un plan de entrenamiento de 12 semanas. Inicia el ${PROGRAM_START}.

Esta dividido en 6 partes:
${programModulesText()}

Incluye clases en vivo, grupo privado de acompanamiento, material practico, ejercicios guiados, acceso de por vida y garantia de ${GUARANTEE_DAYS} dias 🌿

El valor normal es USD ${NORMAL_PRICE_USD}, pero por este canal queda en USD ${PRICE_USD}.

Quieres que te pase el acceso oficial?`;
}

function offerMessage(settings = {}, lead = null) {
  const name = withName(lead);
  const { normal, special } = prices(settings);

  return `Que bueno${name ? `, ${name}` : ''} ❤️

Entonces ya viste que no se trata solo de fuerza de voluntad, sino de trabajar los patrones que estan detras de lo que repetimos.

${PRODUCT_NAME} es un plan de entrenamiento de 12 semanas para trabajar ansiedad, miedos, autosabotaje, bloqueos, heridas emocionales y cargas del pasado. Inicia el ${PROGRAM_START}.

Esta dividido en 6 partes:
${programModulesText()}

Incluye clases en vivo, grupo privado de acompanamiento, material practico, ejercicios guiados, acceso de por vida y garantia de ${GUARANTEE_DAYS} dias 🌿

El valor normal es USD ${normal}, pero por este canal queda en USD ${special}.

Quieres que te pase el acceso oficial?`;
}

function priceOnlyMessage(settings = {}) {
  const { normal, special } = prices(settings);
  return `El valor normal es USD ${normal} ❤️

Por este canal queda en USD ${special}.

Incluye el programa completo de 12 semanas, acompanamiento, ejercicios, acceso de por vida y garantia de ${GUARANTEE_DAYS} dias 🌿

Quieres que te pase el link oficial?`;
}

function summaryMessage(settings = {}) {
  const { normal, special } = prices(settings);
  return `${PRODUCT_NAME} es un plan de entrenamiento de 12 semanas para trabajar ansiedad, miedos, autosabotaje, bloqueos, heridas emocionales y cargas del pasado. Inicia el ${PROGRAM_START}.

Esta dividido en 6 partes:
${programModulesText()}

Incluye clases en vivo, grupo privado de acompanamiento, material practico, ejercicios guiados, acceso de por vida y garantia de ${GUARANTEE_DAYS} dias.

El valor normal es USD ${normal}, pero por este canal queda en USD ${special}.`;
}

function freeMaterialsMessage(settings = {}) {
  return `Te dejo el video oficial para que veas como funciona:

${videoLink(settings)}

Si sentis que conecta con lo que estas viviendo, te explico como entrar al programa 🌿`;
}

function hotmartMessage(lead = null, linkValue = null, settings = {}) {
  const name = withName(lead);
  const link = linkValue || hotmartLink(settings);
  const { special } = prices(settings);

  return `Gracias${name ? `, ${name}` : ''} ❤️

Ya deje tus datos registrados para poder acompanarte mejor.

Te dejo el acceso oficial por Hotmart:

${link}

Ahi puedes hacer tu inscripcion con el precio especial de USD ${special} y garantia de ${GUARANTEE_DAYS} dias 🌿

Cuando completes tu inscripcion, escribime "ya pague" y te ayudo con el siguiente paso.`;
}

const objectionReplies = {
  precio: `Te entiendo ❤️

Y no quiero que decidas desde presion.

Pero si te invito a preguntarte algo:

Cuanto te esta costando seguir con el mismo problema?

A veces el costo de no trabajar nuestros patrones termina siendo mas alto que la inversion.

El programa queda en USD ${PRICE_USD} por este canal y tiene garantia de ${GUARANTEE_DAYS} dias.`,

  tiempo: `Te entiendo ❤️

No se trata de hacerlo perfecto, sino de empezar a mirar lo que venis repitiendo desde otro lugar.

El acceso es de por vida, asi que podes avanzar a tu ritmo.`,

  confianza: `Es normal querer estar segura ❤️

El entrenamiento no es magia ni una promesa vacia.

Es una metodologia con herramientas para identificar patrones, mirar heridas emocionales y trabajar en una reconfiguracion interna.`,

  indecision: `Claro ❤️ Pensarlo esta bien.

Solo te diria algo:

No lo pienses desde el miedo.
Pensalo desde la vida que queres construir.`
};

function crisisMessage() {
  return `Siento mucho que estes pasando por esto ❤️

En este momento lo mas importante es que no estes sol@.

Por favor busca ayuda inmediata con una persona de confianza, un profesional de salud o emergencias de tu pais.

${PRODUCT_NAME} puede acompanar procesos personales, pero no reemplaza ayuda profesional en una situacion urgente 🌿`;
}

function deleteMemoryMessage() {
  return `Entiendo. Voy a eliminar la memoria temporal de esta conversacion.`;
}

function stopMessage() {
  return `Esta bien, lo respeto totalmente.

Gracias por haber escrito y te deseo mucha calma en tu proceso 🌿`;
}

function humanTakeoverMessage() {
  return `Claro. Voy a dejar esta conversacion para que una persona del equipo pueda ayudarte directamente.`;
}

function botIdentityMessage() {
  return `Soy ${BOT_NAME}, asistente del ${PRODUCT_NAME}. Estoy aca para orientarte con cuidado y ayudarte a resolver tus dudas.`;
}

function softCloseMessage() {
  return `Perfecto ❤️ Revisalo con calma.

Si te surge alguna duda sobre el acceso, el pago o el contenido, escribime por aca y te ayudo.`;
}

function farewellMessage() {
  return `Gracias por escribir ❤️

Cuando sientas que es tu momento, podes retomar por aca.`;
}

function unclearMessage() {
  return `Te entiendo ❤️

Para orientarte mejor, decime que te gustaria mejorar primero:

1️⃣ Ansiedad o pensamientos que no paran
2️⃣ Miedos o inseguridad
3️⃣ Autosabotaje
4️⃣ Relaciones dificiles
5️⃣ Bloqueos emocionales
6️⃣ Cargas del pasado`;
}

function postLinkFallback(lead = null) {
  const name = withName(lead);
  return `Perfecto${name ? `, ${name}` : ''} ❤️

Revisalo con calma. Si te surge alguna duda sobre el pago, el acceso o el contenido, escribime por aca y te ayudo.`;
}

function paymentReportedMessage(lead = null) {
  const name = withName(lead);
  return `Que alegria${name ? `, ${name}` : ''} ❤️

Gracias por avisarme.

Ya diste un paso importante para empezar a trabajar en ti y en eso que vienes cargando 🌿

El equipo revisara tu inscripcion y te acompanara con el siguiente paso.`;
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
  return `Que te gustaria mejorar primero: ansiedad, miedos, autosabotaje, relaciones dificiles, bloqueos emocionales o cargas del pasado?`;
}

function diagnosticQuestion3() {
  return `Ya intentaste trabajarlo antes o seria la primera vez que lo miras desde este enfoque?`;
}

function diagnosticQuestion4() {
  return `Del 1 al 10, que tan importante es para vos empezar a cambiar esto ahora?`;
}

function askName() {
  return `Me ayudas con tu nombre? Asi puedo hablarte de una forma mas cercana.`;
}

function askEmail() {
  return `Si queres, tambien podes dejarme tu correo para registrar mejor tu interes.`;
}

function askEmailAgain() {
  return `Creo que ese correo no quedo bien escrito. Me lo podes enviar nuevamente?`;
}

function askUsername() {
  return `Por que red llegaste o cual es tu usuario? Puede ser Instagram, Facebook, TikTok o WhatsApp.`;
}

function askPhone() {
  return `Cual es tu numero de celular con codigo de pais?`;
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
