const { env } = require('../config/env');
const { addHours, addDays } = require('../utils/date');

function paymentFollowUp1(lead) {
  const name = lead.name || '';
  return `Hola${name ? ` ${name}` : ''}, paso por aquí para confirmar algo.

¿Pudiste revisar el enlace de inscripción?

Si tienes alguna duda antes de tomar la decisión, puedo ayudarte a resolverla.`;
}

function paymentFollowUp2() {
  return `Solo quiero dejarte una pregunta importante:

¿Qué es lo que más te está frenando para empezar ahora?`;
}

function paymentFollowUp3(hotmartLink) {
  return `A veces uno espera sentirse completamente listo para cambiar.

Pero muchas veces la claridad aparece cuando das el primer paso con acompañamiento.

Si todavía quieres avanzar, te dejo nuevamente el acceso oficial:

${hotmartLink || 'https://pay.hotmart.com/T103515864E'}`;
}

function finalFollowUp(lead) {
  const name = lead.name || '';
  return `Hola${name ? ` ${name}` : ''}.

No quiero insistirte, solo cerrar bien esta conversación.

Por lo que me contaste, esto sí parecía importante para ti.

¿Quieres que dejemos tu proceso en pausa por ahora o todavía te interesa recibir orientación para entrar a Neurotraumas?`;
}

function buildPaymentFollowUps(lead, hotmartLink) {
  const now = new Date();

  return [
    {
      type: 'payment_6h',
      scheduledAt: addHours(now, env.FOLLOWUP_PAYMENT_1_HOURS),
      message: paymentFollowUp1(lead)
    },
    {
      type: 'payment_24h',
      scheduledAt: addHours(now, env.FOLLOWUP_PAYMENT_2_HOURS),
      message: paymentFollowUp2()
    },
    {
      type: 'payment_48h',
      scheduledAt: addHours(now, env.FOLLOWUP_PAYMENT_3_HOURS),
      message: paymentFollowUp3(hotmartLink)
    },
    {
      type: 'final_7d',
      scheduledAt: addDays(now, env.FOLLOWUP_4_DAYS),
      message: finalFollowUp(lead)
    }
  ];
}

module.exports = {
  buildPaymentFollowUps
};
