const OBJECTION_PATTERNS = [
  {
    objection: 'precio',
    patterns: [/car[oa]/i, /no tengo dinero/i, /cuesta mucho/i, /precio/i, /rebaja/i, /descuento/i]
  },
  {
    objection: 'tiempo',
    patterns: [/no tengo tiempo/i, /horario/i, /ocupad/i, /constancia/i, /energ[ií]a/i]
  },
  {
    objection: 'confianza',
    patterns: [/no conf[ií]o/i, /estafa/i, /seguro/i, /garant[ií]a/i, /testimonio/i]
  },
  {
    objection: 'indecision',
    patterns: [/lo voy a pensar/i, /pensarlo/i, /no s[eé]/i, /duda/i, /despu[eé]s/i]
  }
];

function detectObjection(message) {
  const text = message || '';
  const found = OBJECTION_PATTERNS.find((entry) => entry.patterns.some((pattern) => pattern.test(text)));
  return found ? found.objection : 'ninguna';
}

module.exports = {
  detectObjection
};
