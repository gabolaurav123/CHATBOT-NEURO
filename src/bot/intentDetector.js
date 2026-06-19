const { KEYWORDS } = require('./prompts');
const { detectCrisis } = require('./safety');
const { detectObjection } = require('./objectionDetector');

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  const left = normalizeText(a);
  const right = normalizeText(b);
  const matrix = Array.from({ length: left.length + 1 }, () => []);

  for (let i = 0; i <= left.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= right.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[left.length][right.length];
}

function isFuzzyKeyword(text, keyword) {
  const normalizedKeyword = normalizeText(keyword);
  const words = text.split(' ').filter(Boolean);

  if (normalizedKeyword.includes(' ')) {
    const keywordWords = normalizedKeyword.split(' ');
    return keywordWords.every((word) => words.some((candidate) => levenshtein(candidate, word) <= 1));
  }

  return words.some((word) => {
    const maxDistance = normalizedKeyword.length >= 8 ? 2 : 1;
    return levenshtein(word, normalizedKeyword) <= maxDistance;
  });
}

function detectInitialKeyword(message) {
  const text = normalizeText(message);
  if (!text) return null;

  const found = KEYWORDS.find((keyword) => text.includes(normalizeText(keyword)));
  if (found) return found;

  const fuzzy = KEYWORDS.find((keyword) => isFuzzyKeyword(text, keyword));
  if (fuzzy) return fuzzy;

  if (/quiero (info|informacion|empezar|inscribirme)/i.test(text)) return 'quiero informacion';
  if (/me interesa/i.test(text)) return 'info';
  if (/como me inscribo/i.test(text)) return 'inscripcion';

  return null;
}

function detectGreeting(message) {
  const text = normalizeText(message);
  return /^(hola|buenas|buenos dias|buen dia|buenas tardes|buenas noches|hello|hi)$/.test(text);
}

function detectPain(message) {
  const text = normalizeText(message);

  if (/^1$|ansiedad|miedo|nervios|panico|p[aá]nico/.test(text)) return 'ansiedad';
  if (/^2$|autosabotaje|posterg|procrast|freno/.test(text)) return 'autosabotaje';
  if (/^3$|pensamientos|mente|rumia|repetitiv/.test(text)) return 'pensamientos_repetitivos';
  if (/^4$|relacion|pareja|apego|limites|l[ií]mites/.test(text)) return 'relaciones_dificiles';
  if (/^5$|bloqueo|bloquead|estancad/.test(text)) return 'bloqueo';
  if (/^6$|solo info|informacion|información|info/.test(text)) return 'informacion';

  return null;
}

function detectPurchaseIntent(message) {
  const text = normalizeText(message);
  return /(quiero comprar|quiero inscribirme|me inscribo|pasame el link|mandame el link|enviame el link|pasame acceso|quiero pagar|donde pago|link de pago|quiero el link|pagar ahora|hacer el pago|como pago|inscripcion)/.test(text);
}

function detectDeleteRequest(message) {
  const text = normalizeText(message);
  return /(borrar|eliminar datos|no guardar)/.test(text);
}

function detectStopRequest(message) {
  const text = normalizeText(message);
  return /^(stop|cancelar|no me escribas|no quiero mensajes|no me contacten)/.test(text);
}

function detectHumanRequest(message) {
  const text = normalizeText(message);
  return /(humano|asesor|persona real|hablar con alguien|quiero que me llamen)/.test(text);
}

function detectPriceIntent(message) {
  const text = normalizeText(message);
  return /(precio|cuanto cuesta|cuánto cuesta|valor|inversion|inversión|costo|cuesta)/.test(text);
}

function detectPaymentReported(message) {
  const text = normalizeText(message);
  return /(ya pague|listo pagado|ya me inscribi|acabo de pagar|pago realizado|ya compre)/.test(text);
}

function detectAffirmative(message) {
  const text = normalizeText(message);
  return /^(si|sí|ok|okay|dale|claro|envialo|enviamelo|mandalo|mandamelo|pasalo|pasamelo|quiero verlo|por favor|va|bueno|listo)$/.test(text)
    || /(si quiero|sí quiero|quiero verlo|me gustaria verlo|me gustaría verlo|envia|envía|manda|pasame|pásame)/.test(text);
}

function detectNegative(message) {
  const text = normalizeText(message);
  return /^(no|ahora no|despues|después|no quiero|no me interesa|no tengo tiempo|paso)$/.test(text);
}

function detectThanksOrOk(message) {
  const text = normalizeText(message);
  return /^(ok|okay|gracias|perfecto|lo veo|luego lo miro|ya lo reviso|lo voy a ver|despues te digo|después te digo|te aviso|dale gracias|bueno gracias)$/.test(text);
}

function detectViewedVideo(message) {
  const text = normalizeText(message);
  return /(ya lo vi|lo vi|ya vi el video|vi el video|ya termine|ya termine de verlo|me resono|me hizo sentido|me identifico|entendi|si me pasa)/.test(text);
}

function detectViewedPdf(message) {
  const text = normalizeText(message);
  return /(ya lo lei|ya lei|lo lei|ya vi el pdf|lei el pdf|leí el pdf|que hago ahora|como lo trabajo|como puedo sanar|como empiezo|quiero solucion|necesito ayuda|quiero cambiar)/.test(text);
}

function detectProgramDetailsIntent(message) {
  const text = normalizeText(message);
  return /(como funciona|que incluye|qué incluye|de que trata|programa|neurotraumas|cuanto dura|duracion|clases|certificado|garantia|garantía|resumen)/.test(text);
}

function detectFreeMaterialIntent(message) {
  const text = normalizeText(message);
  return /(gratis|gratuito|video|pdf|material gratuito|solo gratis)/.test(text);
}

function detectSummaryIntent(message) {
  const text = normalizeText(message);
  return /(resumen|resumeme|resúmeme|explicamelo simple|explicame simple)/.test(text);
}

function detectBotIdentityQuestion(message) {
  const text = normalizeText(message);
  return /(eres bot|sos bot|eres una ia|sos una ia|inteligencia artificial|robot|quien eres|quién eres)/.test(text);
}

function detectFarewell(message) {
  const text = normalizeText(message);
  return /^(chau|adios|adiós|hasta luego|hablamos luego|luego escribo|despues veo|después veo|te aviso|no me interesa|gracias)$/.test(text);
}

function detectUrgency(message) {
  const match = String(message || '').match(/\b(10|[1-9])\b/);
  if (!match) return null;
  return Number(match[1]);
}

function detectLeadIntent(message) {
  if (detectCrisis(message)) return 'crisis';
  if (detectDeleteRequest(message)) return 'borrar';
  if (detectHumanRequest(message)) return 'humano';
  if (detectPurchaseIntent(message)) return 'compra';
  if (detectPriceIntent(message)) return 'precio';

  const pain = detectPain(message);
  if (pain === 'ansiedad') return 'ansiedad';
  if (pain === 'autosabotaje') return 'autosabotaje';

  const objection = detectObjection(message);
  if (objection !== 'ninguna') return 'objecion';

  return detectInitialKeyword(message) ? 'info' : 'otro';
}

module.exports = {
  normalizeText,
  detectInitialKeyword,
  detectGreeting,
  detectPain,
  detectPurchaseIntent,
  detectDeleteRequest,
  detectStopRequest,
  detectHumanRequest,
  detectPriceIntent,
  detectPaymentReported,
  detectAffirmative,
  detectNegative,
  detectThanksOrOk,
  detectViewedVideo,
  detectViewedPdf,
  detectProgramDetailsIntent,
  detectFreeMaterialIntent,
  detectSummaryIntent,
  detectBotIdentityQuestion,
  detectFarewell,
  detectUrgency,
  detectLeadIntent
};
