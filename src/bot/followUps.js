const { env } = require('../config/env');
const { addHours, addDays } = require('../utils/date');

const VIDEO_LINK = 'https://youtu.be/btHy8kSC4E4';
const HOTMART_PLACEHOLDER = '(LINK HOTMART)';
const LEGACY_HOTMART_LINK = 'https://pay.hotmart.com/T103515864E';

function cleanHotmartLink(hotmartLink) {
  const link = String(hotmartLink || '').trim();
  if (!link || link === LEGACY_HOTMART_LINK) return HOTMART_PLACEHOLDER;
  return link;
}

function paymentFollowUp1(lead, hotmartLink) {
  const name = lead.name || '';
  const link = cleanHotmartLink(hotmartLink);

  return `Hola${name ? ` ${name}` : ''} ❤️

Solo queria preguntarte algo:

Pudiste ver el video?

Si realmente queres cambiar lo que venis repitiendo, no lo dejes para despues.

A veces una sola decision cambia anos de patrones.

Te dejo nuevamente el video:

🎥 ${VIDEO_LINK}

Y si ya queres entrar al entrenamiento, este es el acceso:

${link}`;
}

function paymentFollowUp2(hotmartLink) {
  const link = cleanHotmartLink(hotmartLink);

  return `Te dejo esto con mucho respeto ❤️

Hay personas que siguen esperando el momento perfecto.

Y hay personas que deciden empezar incluso con miedo.

Si queres sacar cargas emocionales, trabajar tus patrones y empezar a cambiar radicalmente tu vida, este puede ser tu momento.

El acceso al entrenamiento esta aqui:

${link}`;
}

function paymentFollowUp3(hotmartLink) {
  const link = cleanHotmartLink(hotmartLink);

  return `No quiero presionarte ❤️

Solo recordarte que el entrenamiento cuesta 72 USD, el acceso es de por vida y podes volver al contenido cada vez que lo necesites.

Si sentis que ya es momento, entras desde aqui:

${link}`;
}

function finalFollowUp(lead, hotmartLink) {
  const name = lead.name || '';
  const link = cleanHotmartLink(hotmartLink);

  return `${name ? `${name}, ` : ''}pensarlo esta bien ❤️

Solo te diria algo:

No lo pienses desde el miedo.
Pensalo desde la vida que queres construir.

Te dejo el acceso por si decidis empezar:

${link}`;
}

function buildPaymentFollowUps(lead, hotmartLink) {
  const now = new Date();

  return [
    {
      type: 'payment_6h',
      scheduledAt: addHours(now, env.FOLLOWUP_PAYMENT_1_HOURS),
      message: paymentFollowUp1(lead, hotmartLink)
    },
    {
      type: 'payment_24h',
      scheduledAt: addHours(now, env.FOLLOWUP_PAYMENT_2_HOURS),
      message: paymentFollowUp2(hotmartLink)
    },
    {
      type: 'payment_48h',
      scheduledAt: addHours(now, env.FOLLOWUP_PAYMENT_3_HOURS),
      message: paymentFollowUp3(hotmartLink)
    },
    {
      type: 'final_7d',
      scheduledAt: addDays(now, env.FOLLOWUP_4_DAYS),
      message: finalFollowUp(lead, hotmartLink)
    }
  ];
}

module.exports = {
  buildPaymentFollowUps
};
