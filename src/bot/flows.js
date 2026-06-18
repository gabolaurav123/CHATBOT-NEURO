function withName(lead, fallback = '') {
  return lead && lead.name ? lead.name : fallback;
}

function firstMessage() {
  return `Hola 👋
Gracias por escribirme.

Vi tu interés en Neurotraumas™.

Antes de enviarte información, quiero entender algo importante para poder orientarte mejor.

Para darte una atención más personalizada, voy a recordar esta conversación durante las próximas 24 horas. Después de ese tiempo, el historial se elimina automáticamente y solo quedará un registro básico de seguimiento.

Si prefieres que no guardemos esta conversación, puedes escribir BORRAR en cualquier momento.

Dime, ¿qué sientes que hoy te está afectando más?

1️⃣ Ansiedad constante
2️⃣ Autosabotaje
3️⃣ Pensamientos repetitivos
4️⃣ Relaciones difíciles
5️⃣ Me siento bloqueado(a)
6️⃣ Solo quiero información`;
}

const painReplies = {
  ansiedad: `Gracias por compartirlo ❤️

Quiero decirte algo importante:

Sentir ansiedad no significa que seas débil.

Muchas veces el sistema nervioso sigue reaccionando como si todavía hubiera peligro, incluso cuando racionalmente sabes que no debería sentirse así.

Puede aparecer como mente acelerada, cansancio, miedo, tensión, dificultad para descansar o sensación de no poder desconectar.

¿Te pasa algo de eso?`,

  autosabotaje: `Gracias por compartirlo ❤️

Te pregunto algo:

¿Te ha pasado que sabes lo que deberías hacer, pero terminas postergando, frenándote o repitiendo el mismo patrón?

No porque no quieras cambiar, sino como si algo dentro de ti te detuviera.`,

  pensamientos_repetitivos: `Entiendo.

Cuando la mente no se detiene, puede sentirse agotador.

A veces uno intenta distraerse, dormir, trabajar o seguir con su día, pero los mismos pensamientos vuelven una y otra vez.

¿Sientes que esos pensamientos aparecen más cuando estás en calma, antes de dormir o después de alguna situación emocional?`,

  relaciones_dificiles: `Gracias por abrirlo.

Muchas veces las relaciones activan heridas, miedos, reacciones o patrones que uno no entiende del todo.

A veces no se trata solo de la otra persona, sino de lo que se activa dentro de nosotros.

¿Sientes que repites patrones en tus relaciones, como apego, miedo, distancia, discusiones o dificultad para poner límites?`,

  bloqueo: `Te entiendo.

Sentirse bloqueado puede ser muy frustrante, sobre todo cuando por dentro sabes que quieres avanzar, pero algo parece detenerte.

A veces no es falta de capacidad, sino una respuesta interna de protección, miedo o saturación emocional.

¿Sientes que ese bloqueo aparece más en decisiones, relaciones, trabajo, estudio o cambios personales?`,

  informacion: `Claro. Antes de enviarte información, quiero ubicarte un poco mejor para que no sea algo genérico.

Hoy, si pudieras cambiar una sola cosa, ¿qué te gustaría cambiar primero?`
};

function diagnosticQuestion1() {
  return `Hoy, si pudieras cambiar una sola cosa, ¿qué te gustaría cambiar primero?

A) Ansiedad
B) Autosabotaje
C) Paz mental
D) Relaciones
E) Recuperar seguridad
F) Entender qué me pasa`;
}

function diagnosticQuestion2() {
  return `¿Hace cuánto sientes que esto viene afectándote?

* Menos de 6 meses
* Más de 1 año
* Más de 3 años
* Casi toda mi vida`;
}

function diagnosticQuestion3() {
  return `¿Ya intentaste algo para cambiarlo?

* Terapia
* Cursos
* Meditación
* Nada todavía
* Muchas cosas y sigo igual`;
}

function diagnosticQuestion4() {
  return `Del 1 al 10, ¿qué tan urgente es para ti empezar a cambiar esto?`;
}

function askName() {
  return `Gracias por responderme con tanta honestidad.

Para enviarte la información correcta y dejar tu orientación registrada, ¿me dices tu nombre?`;
}

function askEmail(lead) {
  const name = withName(lead);
  return `Perfecto${name ? `, ${name}` : ''}.

¿A qué correo te puedo enviar también la información por si quieres revisarla con calma?`;
}

function askEmailAgain() {
  return `Creo que ese correo no quedó bien escrito.

¿Me lo puedes enviar nuevamente?`;
}

function askUsername() {
  return `Y para ubicarte bien en el registro, ¿cuál es tu usuario de Instagram o la red por donde llegaste?`;
}

function landingMessage(lead, landingLink) {
  const name = withName(lead);
  const link = landingLink || '[LANDING_LINK]';

  return `Gracias${name ? `, ${name}` : ''}.

Por lo que me cuentas, tiene sentido que veas primero esta explicación.

Creamos un video corto donde se explica por qué muchas personas siguen atrapadas en ansiedad, autosabotaje o patrones emocionales repetitivos incluso cuando intentan cambiar.

Míralo con calma aquí:

${link}

Después de verlo, puedo ayudarte a identificar si Neurotraumas™ realmente encaja contigo.`;
}

function offerMessage(settings) {
  const price = settings.product_price || '360';

  return `Por lo que me cuentas, Neurotraumas™ podría tener mucho sentido para ti.

Te explico de forma simple:

Neurotraumas™ es un entrenamiento de 12 semanas diseñado para ayudarte a comprender mejor tu sistema nervioso, identificar patrones automáticos y empezar a trabajar respuestas emocionales que muchas veces se repiten sin que sepas por qué.

Dentro del programa trabajarás:

✅ comprensión del sistema nervioso
✅ identificación de patrones automáticos
✅ ansiedad y respuestas de supervivencia
✅ autosabotaje y bloqueos internos
✅ herramientas prácticas para regularte mejor
✅ ejercicios aplicados
✅ acompañamiento
✅ comunidad
✅ claridad emocional y personal

La inversión es de USD $${price}.

También podemos ofrecer facilidades de pago si están disponibles.

Más que venderte algo rápido, quiero que tomes una decisión con claridad.

Por eso te pregunto:

Si dentro de 90 días sigues exactamente igual, ¿cómo te haría sentir?`;
}

function hotmartMessage(lead, hotmartLink) {
  const name = withName(lead);
  const link = hotmartLink || '[HOTMART_LINK]';

  return `Perfecto${name ? `, ${name}` : ''} 🙌

Te comparto el acceso para asegurar tu cupo en Neurotraumas™:

${link}

Cuando completes tu inscripción, guarda el comprobante o confirmación de Hotmart.

Después de eso te guiaremos con el acceso y los siguientes pasos.`;
}

const objectionReplies = {
  precio: `Te entiendo.

Y es válido pensarlo.

Más que verlo solo como un pago, míralo como una decisión sobre algo que lleva tiempo afectándote.

Si esto sigue igual 3, 6 o 12 meses más, también tiene un costo emocional.

La pregunta no es solo cuánto cuesta entrar.

También es cuánto te está costando seguir cargando con lo mismo.

Si quieres, puedo explicarte qué incluye exactamente para que veas si tiene sentido para ti.`,

  tiempo: `Te entiendo.

Y justo muchas personas llegan sintiendo que no tienen tiempo ni energía.

El programa está pensado para avanzar paso a paso, no para saturarte.

La idea no es exigirte más, sino darte estructura y herramientas para empezar a entender lo que te pasa.

¿Tu preocupación es más por horarios, constancia o energía emocional?`,

  confianza: `Es una duda completamente normal.

Nadie debería tomar una decisión importante solo por impulso.

Lo que sí puedo decirte es que Neurotraumas™ no se basa en prometer resultados mágicos.

Se basa en ayudarte a comprender tus patrones, trabajar con herramientas prácticas y acompañarte durante 12 semanas.

No se trata de cambiar de la noche a la mañana.

Se trata de empezar a dejar de repetir lo mismo sin entender por qué.`,

  indecision: `Claro, piénsalo con calma.

Solo te dejo una pregunta para que lo mires con honestidad:

¿Lo quieres pensar porque necesitas revisar algo concreto, o porque una parte de ti tiene miedo de empezar?`
};

function crisisMessage() {
  return `Siento mucho que estés pasando por algo así.

En este momento lo más importante es tu seguridad, no venderte nada.

Por favor busca ayuda inmediata con una persona cercana, un profesional de salud mental o servicios de emergencia de tu país. Si sientes que podrías hacerte daño, no te quedes solo(a) y acude a emergencias ahora mismo.

Puedo quedarme aquí para acompañarte con calma mientras buscas ayuda, pero esto no reemplaza apoyo profesional urgente.`;
}

function deleteMemoryMessage() {
  return `Entiendo. Voy a eliminar la memoria temporal de esta conversación.

Solo mantendremos el registro básico necesario para no volver a contactarte si no lo deseas.`;
}

function stopMessage() {
  return `Listo, no te volveremos a escribir por este medio.`;
}

function humanTakeoverMessage() {
  return `Claro. Voy a dejar esta conversación para que una persona del equipo pueda ayudarte directamente.`;
}

function fallbackMessage() {
  return `Gracias por escribirme. Quiero orientarte bien, pero necesito entender un poco mejor tu caso. ¿Qué sientes que hoy te está afectando más: ansiedad, autosabotaje, pensamientos repetitivos, relaciones difíciles o bloqueo?`;
}

module.exports = {
  firstMessage,
  painReplies,
  diagnosticQuestion1,
  diagnosticQuestion2,
  diagnosticQuestion3,
  diagnosticQuestion4,
  askName,
  askEmail,
  askEmailAgain,
  askUsername,
  landingMessage,
  offerMessage,
  hotmartMessage,
  objectionReplies,
  crisisMessage,
  deleteMemoryMessage,
  stopMessage,
  humanTakeoverMessage,
  fallbackMessage
};
