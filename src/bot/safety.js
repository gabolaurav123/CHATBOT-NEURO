const CRISIS_PATTERNS = [
  /suicid/i,
  /me quiero morir/i,
  /no quiero vivir/i,
  /me voy a matar/i,
  /matarme/i,
  /hacerme daño/i,
  /hacerme dano/i,
  /autolesi[oó]n/i,
  /crisis fuerte/i
];

function detectCrisis(message) {
  return CRISIS_PATTERNS.some((pattern) => pattern.test(message || ''));
}

module.exports = {
  detectCrisis
};
