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
  'inicio',
  'video_ofrecido',
  'video_enviado',
  'diagnostico_orientativo',
  'descubrimiento_emocional',
  'pdf_ofrecido',
  'pdf_enviado',
  'oferta_presentada',
  'link_pago_enviado',
  'objecion',
  'cierre_positivo',
  'cierre_frio',
  'crisis',
  'post_link_conversacion',
  'pago_reportado',
  'onboarding'
];

module.exports = {
  KEYWORDS,
  INTENTS,
  STAGES
};
