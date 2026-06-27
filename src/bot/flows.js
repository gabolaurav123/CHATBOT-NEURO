const BOT_NAME = 'Priscila';
const PRODUCT_NAME = 'Gimnasio del Cerebro';
const VIDEO_LINK = 'https://youtu.be/btHy8kSC4E4';
const PRICE_USD = '72';
const HOTMART_PLACEHOLDER = 'https://pay.hotmart.com/W101807995K';
const LEGACY_HOTMART_LINK = 'https://pay.hotmart.com/T103515864E';

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
    normal: cleanSetting(settings.product_normal_price, PRICE_USD, ['360']),
    special: cleanSetting(settings.product_special_price || settings.product_price, PRICE_USD, ['270'])
  };
}

function hotmartLink(settings = {}) {
  return cleanSetting(settings.hotmart_link, HOTMART_PLACEHOLDER, [LEGACY_HOTMART_LINK]);
}

function videoLink(settings = {}) {
  return cleanSetting(settings.video_link, VIDEO_LINK);
}

function pdfLink(settings = {}) {
  return settings.pdf_link || '';
}

function firstMessage() {
  return `Hola 🌿 soy ${BOT_NAME}, del ${PRODUCT_NAME} 🧠

Que bueno que llegaste hasta aqui.

Este espacio es para personas que sienten que hay algo en su vida que se repite, aunque intenten cambiarlo.

Puede ser ansiedad, bloqueos, relaciones dificiles, miedo, heridas emocionales, problemas con el dinero o sensacion de no avanzar.

Para orientarte mejor, elegi la opcion que mas se parece a lo que estas viviendo ahora:

1️⃣ Ansiedad o pensamientos que no paran
2️⃣ Miedos o inseguridad
3️⃣ Bloqueos con el dinero
4️⃣ Relaciones o heridas emocionales
5️⃣ Traumas o cargas del pasado
6️⃣ Falta de proposito o sensacion de estar estancad@

Respondeme solo con el numero o con una palabra ❤️`;
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

En el ${PRODUCT_NAME} trabajamos con herramientas para empezar a mirar eso desde la raiz y reconfigurar tu mundo interno.

Mira este video para entender como funciona el metodo:

🎥 ${VIDEO_LINK}

Cuando lo termines, escribime "YA LO VI" 🌿`;
}

function videoSentMessage(settings = {}) {
  return `Perfecto ❤️

Mira este video para entender como funciona el metodo:

🎥 ${videoLink(settings)}

Cuando lo termines, escribime "YA LO VI" y te explico como entrar al entrenamiento.`;
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

El primer paso para entender como trabajarlo es mirar este video:

🎥 ${VIDEO_LINK}

Cuando lo termines, escribime "YA LO VI".`;
}

function diagnosticRecentMessage() {
  return diagnosticLongMessage();
}

function diagnosticUnknownMessage() {
  return `Esta bien no tener todo claro todavia ❤️

Justamente el entrenamiento te ayuda a observar patrones, emociones y cargas que quizas venis repitiendo sin darte cuenta.

Mira este video primero:

🎥 ${VIDEO_LINK}

Cuando lo termines, escribime "YA LO VI".`;
}

function pdfOfferMessage() {
  return `En esta memoria no usamos PDF.

El primer paso es mirar el video gratuito:

🎥 ${VIDEO_LINK}`;
}

function pdfSentMessage(settings = {}) {
  const link = pdfLink(settings);
  return link ? `Te dejo el material:\n\n${link}` : pdfOfferMessage();
}

function pdfWaitingMessage() {
  return videoWaitingMessage();
}

function programIntroMessage() {
  return `Que bueno que lo viste ❤️

Entonces ya entendiste algo importante:

No se trata solo de pensar positivo.
Tampoco se trata solo de fuerza de voluntad.

Muchas veces lo que vivimos esta conectado con patrones emocionales que se repiten en automatico.

El entrenamiento del ${PRODUCT_NAME} esta creado para que puedas trabajar paso a paso tus bloqueos, heridas, miedos y patrones internos con herramientas practicas.

Queres que te pase el acceso para entrar al entrenamiento? 🌿`;
}

function offerMessage(settings = {}, lead = null) {
  const name = withName(lead);
  const { special } = prices(settings);

  return `Que bueno que lo viste${name ? `, ${name}` : ''} ❤️

Entonces ya entendiste algo importante:

No se trata solo de pensar positivo.
Tampoco se trata solo de fuerza de voluntad.

Muchas veces lo que vivimos esta conectado con patrones emocionales que se repiten en automatico.

El entrenamiento del ${PRODUCT_NAME} incluye:

✔️ 45 clases
✔️ Material descargable
✔️ Reloj Emocional
✔️ Rueda del Alma
✔️ Tarjetas Holograficas
✔️ Herramientas practicas
✔️ Acceso de por vida
✔️ Aplicacion inmediata

La inversion es de ${special} USD.

Queres que te pase el acceso para entrar al entrenamiento? 🌿`;
}

function priceOnlyMessage(settings = {}) {
  const { special } = prices(settings);
  return `La inversion es de ${special} USD ❤️

Incluye acceso de por vida a las clases, materiales y herramientas.

Pero antes de decidir, te recomiendo ver el video para entender bien como funciona el metodo:

🎥 ${videoLink(settings)}

Si despues sentis que es para vos, te paso el acceso 🌿`;
}

function summaryMessage(settings = {}) {
  const { special } = prices(settings);
  return `El ${PRODUCT_NAME} es un entrenamiento para trabajar bloqueos, heridas, miedos y patrones emocionales desde una metodologia paso a paso.

Incluye clases, materiales, herramientas practicas y acceso de por vida.

La inversion es de ${special} USD.`;
}

function freeMaterialsMessage(settings = {}) {
  return `El primer paso gratuito es mirar este video:

🎥 ${videoLink(settings)}

Cuando lo termines, escribime "YA LO VI" y te explico como entrar al entrenamiento.`;
}

function hotmartMessage(lead = null, linkValue = null, settings = {}) {
  const name = withName(lead);
  const link = linkValue || hotmartLink(settings);
  const { special } = prices(settings);

  return `Me alegra mucho que lo sientas asi${name ? `, ${name}` : ''} ❤️

Este puede ser el primer paso para dejar de repetir lo mismo y empezar a trabajar en vos desde otro lugar.

No estas comprando solo un curso.

Estas tomando una decision para cambiar tu relacion con tus emociones, tus patrones y tu historia.

La inversion es de ${special} USD y el acceso es de por vida.

Entras desde aqui:

${link}

Cuando hagas la compra, escribime "YA COMPRE" y te doy la bienvenida.`;
}

const objectionReplies = {
  precio: `Te entiendo ❤️

Y no quiero que decidas desde presion.

Pero si te invito a preguntarte algo:

Cuanto te esta costando seguir con el mismo problema?

A veces el costo de no trabajar nuestros patrones termina siendo mas alto que la inversion.

El entrenamiento cuesta ${PRICE_USD} USD y tenes acceso de por vida.`,

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

Por favor busca ayuda profesional inmediata o comunicate con una linea de emergencia de tu pais.

Este entrenamiento puede acompanar procesos personales, pero no reemplaza atencion psicologica, medica o terapeutica en una situacion urgente.

Ahora lo mas importante es tu seguridad.`;
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

Para orientarte mejor, decime que es lo que mas queres cambiar ahora mismo: ansiedad, miedo, dinero, relaciones, traumas, bloqueo o proposito?`;
}

function postLinkFallback(lead = null) {
  const name = withName(lead);
  return `Perfecto${name ? `, ${name}` : ''} ❤️

Revisalo con calma. Si te surge alguna duda sobre el pago, el acceso o el contenido, escribime por aca y te ayudo.`;
}

function paymentReportedMessage(lead = null) {
  const name = withName(lead);
  return `Bienvenid@${name ? `, ${name}` : ''}!! 🧠✨

Acabas de tomar una decision muy importante.

No compraste solo un curso.

Elegiste empezar a trabajar en vos, en tus patrones, en tus emociones y en todo eso que queres transformar.

Estoy feliz de acompanarte en este camino.

🌿 Nos vemos dentro.`;
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
  return `Que problema queres transformar primero: ansiedad, miedo, dinero, relaciones, trauma, bloqueo o proposito?`;
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
