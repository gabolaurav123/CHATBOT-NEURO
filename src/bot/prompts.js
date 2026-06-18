const KEYWORDS = [
  'neuro',
  'ansiedad',
  'info',
  'ayuda',
  'cambio',
  'paz',
  'trauma',
  'autosabotaje',
  'bloqueo',
  'quiero informacion',
  'quiero información',
  'precio',
  'inscripcion',
  'inscripción',
  'quiero empezar',
  'quiero comprar',
  'hola'
];

const INTENTS = [
  'info',
  'ansiedad',
  'autosabotaje',
  'precio',
  'compra',
  'objecion',
  'crisis',
  'borrar',
  'humano',
  'otro'
];

const STAGES = [
  'captacion',
  'diagnostico',
  'datos_solicitados',
  'oferta_presentada',
  'link_pago_enviado',
  'post_link_conversacion',
  'pago_reportado',
  'onboarding'
];

module.exports = {
  KEYWORDS,
  INTENTS,
  STAGES
};
