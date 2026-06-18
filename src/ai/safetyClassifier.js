const { detectCrisis } = require('../bot/safety');

function classifySafety(message) {
  return {
    isCrisis: detectCrisis(message)
  };
}

module.exports = {
  classifySafety
};
