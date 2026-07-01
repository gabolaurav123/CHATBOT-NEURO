const { generateBotDecision } = require('../services/aiService');
const { PROMPT_VERSION } = require('./systemPrompt');

const BOT_NAME = 'Marisa';
const PRODUCT_NAME = 'Neurotraumas';
const VIDEO_LINK = 'https://drive.google.com/file/d/1gpukjlEwfQMXHN8LD_GN2-IEncwZ3wFy/view?usp=drive_link';
const NORMAL_PRICE_USD = '360';
const PRICE_USD = '270';
const HOTMART_LINK = 'https://pay.hotmart.com/T103515864E';
const HOTMART_PLACEHOLDER = HOTMART_LINK;
const LEGACY_HOTMART_LINK = 'https://pay.hotmart.com/W101807995K';
const LEGACY_VIDEO_LINK = 'https://youtu.be/btHy8kSC4E4';
const HOTMART_PLACEHOLDERS = [
  '(LINK HOTMART)',
  '[LINK HOTMART]',
  'LINK HOTMART',
  '(HOTMART_LINK)',
  '[HOTMART_LINK]',
  'HOTMART_LINK'
];

const VALID_STAGES = [
  'inicio',
  'captacion',
  'diagnostico',
  'datos_solicitados',
  'oferta_presentada',
  'objecion',
  'link_pago_enviado',
  'post_link_conversacion',
  'pago_reportado',
  'onboarding',
  'crisis',
  'humano',
  'pausado',
  'cierre_frio'
];

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function configuredHotmartLink(settings = {}) {
  const link = String(settings.hotmart_link || '').trim();
  if (!link || link === LEGACY_HOTMART_LINK || HOTMART_PLACEHOLDERS.includes(link)) return HOTMART_PLACEHOLDER;
  return link;
}

function configuredVideoLink(settings = {}) {
  const link = String(settings.video_link || '').trim();
  if (!link || link === LEGACY_VIDEO_LINK) return VIDEO_LINK;
  return link;
}

function isRepeatedReply(reply, lead) {
  const current = normalizeText(reply);
  const last = normalizeText(lead && lead.last_bot_message);
  if (!current || !last) return false;

  if (current === last) return true;
  if (last.length >= 80 && current.includes(last.slice(0, 80))) return true;
  if (current.length >= 80 && last.includes(current.slice(0, 80))) return true;

  return false;
}

function userWantsFreshStart(message) {
  const text = normalizeText(message);
  return /desde cero|desde 0|empezar de cero|empezar desde cero|empezar de 0|empezar desde 0|\breinicia\b|\breiniciar\b|\btest\b|\bprueba\b/.test(text);
}

function isColdStartMessage(message) {
  const text = normalizeText(message);
  return /^(hola|buenas|buen dia|buenos dias|buenas tardes|buenas noches|info|ayuda|inicio|empezar|quiero informacion|quiero info|quiero empezar|informacion|neuro|neurotraumas|cuentame|cuéntame|dime)$/.test(text);
}

function hasForbiddenFormatting(reply) {
  return /[*#]/.test(String(reply || ''));
}

function initialOptionsReply(prefix = '') {
  const lines = [
    `Hola, soy ${BOT_NAME} 👋🌿`,
    '',
    'Gracias por escribirnos.',
    '',
    `${PRODUCT_NAME} es para personas que sienten que algo se repite en su vida y quieren empezar a trabajarlo desde la raiz.`,
    '',
    'Decime, que te gustaria mejorar primero?',
    '',
    '1️⃣ Ansiedad o pensamientos que no paran',
    '2️⃣ Miedos o inseguridad',
    '3️⃣ Autosabotaje',
    '4️⃣ Relaciones dificiles',
    '5️⃣ Bloqueos emocionales',
    '6️⃣ Cargas del pasado',
    '',
    'Respondeme solo con el numero ❤️'
  ];

  if (prefix) {
    lines.unshift(prefix, '');
  }

  return lines.join('\n');
}

function shouldUseInitialOptions(context = {}) {
  if (userWantsFreshStart(context.userMessage)) return true;

  const stage = normalizeStage(context.currentStage, 'inicio');
  const lead = context.lead || {};
  const hasCoreContext = Boolean(lead.name || lead.main_pain || lead.emotional_response);
  const earlyStage = ['inicio', 'captacion'].includes(stage);
  return earlyStage && !hasCoreContext && (
    isColdStartMessage(context.userMessage)
    || userWantsFreshStart(context.userMessage)
  );
}

function includesInitialOptions(reply) {
  const text = normalizeText(reply);
  return text.includes('soy marisa')
    && text.includes('neurotraumas')
    && text.includes('ansiedad o pensamientos')
    && text.includes('miedos o inseguridad')
    && text.includes('respondeme solo');
}

function isOverloadedFirstContact(reply, context = {}) {
  if (!shouldUseInitialOptions(context)) return false;

  const raw = String(reply || '');
  const text = normalizeText(raw);
  const asksPersonalData = /(tu nombre|cual es tu nombre|como te llamas|pais|celular|telefono|numero de celular|numero telefonico)/.test(text);
  const sendsLinksOrPrice = /drive\.google|youtu\.be|youtube|hotmart|pay\.hotmart|270\s*usd|360\s*usd|link de pago|\(link hotmart\)/.test(text);

  return asksPersonalData || sendsLinksOrPrice;
}

function isMetaReply(reply) {
  const text = normalizeText(reply);
  return /puedo hacerlo|puedo responder|puedo adapt|segun la memoria|segun el prompt|deberia responder|debo responder|instrucciones|configuracion interna/.test(text);
}

function isPrematurePaymentDump(reply, context = {}) {
  if (!shouldUseInitialOptions(context)) return false;

  const text = normalizeText(reply);
  const userText = normalizeText(context.userMessage);
  const askedCommercial = /precio|cuanto cuesta|valor|comprar|pagar|link|hotmart|inscrib|acceso/.test(userText);
  return !askedCommercial && (/270\s*usd|360\s*usd|hotmart|link de pago|\(link hotmart\)/.test(text));
}

function hasHotmartLink(reply) {
  const text = normalizeText(reply);
  return /hotmart|pay\.hotmart|link de pago|\(link hotmart\)|entras desde aqui|podes entrar desde aqui/.test(text);
}

function hasVideoLink(reply) {
  const text = normalizeText(reply);
  return /drive\.google|youtu\.be|youtube|video/.test(text);
}

function isViewedVideoMessage(message) {
  const text = normalizeText(message);
  return /(ya lo vi|lo vi|ya vi el video|vi el video|ya termine|ya termine de verlo|ya lo mire|lo mire completo)/.test(text);
}

function isInterestBeforeVideo(message) {
  const text = normalizeText(message);
  return /(me interesa|estoy interesad|quiero saber|quiero informacion|quiero info)/.test(text);
}

function isPriceQuestionOnly(message) {
  const text = normalizeText(message);
  return /(precio|cuanto cuesta|valor|inversion|costo|cuesta)/.test(text)
    && !/(link|pagar|pago|comprar|inscrib|acceso directo|pasame el acceso|mandame el acceso)/.test(text);
}

function wantsDirectPaymentLink(message) {
  const text = normalizeText(message);
  return /(link directo|pasame el link|mandame el link|enviame el link|quiero el link|link de pago|donde pago|quiero pagar|pagar ahora|hacer el pago)/.test(text);
}

function refusesToShareData(message) {
  const text = normalizeText(message);
  return /(no quiero dar datos|sin datos|no te doy mis datos|no quiero pasar datos|no quiero dar mi numero|no quiero pasar mi numero|pasame el link igual|dame el link igual|mandame el link igual)/.test(text);
}

function isAccessAffirmative(message) {
  const text = normalizeText(message);
  return /^(si|sí|sii|claro|dale|ok|okay|quiero|quiero el acceso|pasame el acceso|mandame el acceso|enviame el acceso|me interesa entrar|lo quiero)$/.test(text)
    || /(si quiero|quiero el acceso|pasame el acceso|mandame el acceso|enviame el acceso)/.test(text);
}

function isAskingForAccessAfterOffer(context = {}) {
  const stage = normalizeStage(context.currentStage, 'inicio');
  return ['oferta_presentada', 'datos_solicitados'].includes(stage) && isAccessAffirmative(context.userMessage);
}

function sentHotmartTooEarly(decision, context = {}) {
  if (shouldUseInitialOptions(context)) return false;

  const reply = decision && decision.reply;
  const actions = (decision && decision.actions) || {};

  if (isViewedVideoMessage(context.userMessage)) {
    return hasHotmartLink(reply) || actions.send_hotmart_link || actions.create_payment || actions.create_payment_followups;
  }

  if ((isAskingForAccessAfterOffer(context) || wantsDirectPaymentLink(context.userMessage)) && !refusesToShareData(context.userMessage)) {
    return hasHotmartLink(reply) || actions.send_hotmart_link || actions.create_payment || actions.create_payment_followups;
  }

  if (isInterestBeforeVideo(context.userMessage) && !(context.lead && context.lead.video_sent)) {
    return hasHotmartLink(reply) || actions.send_hotmart_link || actions.create_payment || actions.create_payment_followups;
  }

  if (isPriceQuestionOnly(context.userMessage)) {
    return hasHotmartLink(reply) || actions.send_hotmart_link || actions.create_payment || actions.create_payment_followups;
  }

  return false;
}

function problemChoiceSentVideoTooEarly(decision, context = {}) {
  if (shouldUseInitialOptions(context)) return false;
  if (context.lead && context.lead.video_sent) return false;
  if (!detectProblemChoice(context.userMessage)) return false;

  const actions = (decision && decision.actions) || {};
  return hasVideoLink(decision && decision.reply) || actions.send_video_link;
}

function detectProblemChoice(message) {
  const text = normalizeText(message);

  if (/^1$|ansiedad|pensamientos|mente|no paran|rumia|repetitiv/.test(text)) return 'ansiedad';
  if (/^2$|miedo|miedos|inseguridad|insegur|culpa/.test(text)) return 'miedos';
  if (/^3$|autosabotaje|sabotaje|posterg|procrast|freno/.test(text)) return 'autosabotaje';
  if (/^4$|relacion|relaciones|pareja|apego|herida emocional|abandono|rechazo/.test(text)) return 'relaciones';
  if (/^5$|bloqueo|bloqueos|bloquead|estancad/.test(text)) return 'bloqueos';
  if (/^6$|trauma|traumas|pasado|carga|cargas/.test(text)) return 'cargas';

  return null;
}

function problemConnectionReply(problem) {
  const replies = {
    ansiedad: [
      'Te entiendo ❤️',
      '',
      'La ansiedad muchas veces no es solo pensar demasiado. A veces hay emociones, recuerdos o patrones internos que se activan en automatico.',
      '',
      `${PRODUCT_NAME} trabaja justamente eso: identificar que se activa en ti y empezar a trabajarlo con herramientas practicas 🌿`,
      '',
      'Quieres que te muestre como funciona o prefieres que te explique directo el programa?'
    ],
    miedos: [
      'Te entiendo ❤️',
      '',
      'Muchas veces el miedo no significa que no puedas avanzar.',
      'A veces significa que hay una parte interna intentando protegerte desde experiencias pasadas.',
      '',
      `${PRODUCT_NAME} esta diseñado para ayudarte a trabajar esos patrones y empezar a responder distinto 🌿`,
      '',
      'Quieres que te muestre como funciona o prefieres que te explique directo el programa?'
    ],
    autosabotaje: [
      'Te entiendo ❤️',
      '',
      'El autosabotaje suele aparecer cuando una parte de ti quiere avanzar, pero otra parte se frena por miedo, culpa o experiencias no resueltas.',
      '',
      `En ${PRODUCT_NAME} trabajamos esos patrones para que puedas empezar a romper ese ciclo 🌿`,
      '',
      'Quieres que te muestre como funciona o prefieres que te explique directo el programa?'
    ],
    relaciones: [
      'Te entiendo ❤️',
      '',
      'Las relaciones muchas veces activan heridas antiguas: abandono, rechazo, dependencia, culpa o miedo a no ser suficiente.',
      '',
      `${PRODUCT_NAME} te ayuda a identificar esas heridas y trabajar lo que se repite en tus vinculos 🌿`,
      '',
      'Quieres que te muestre como funciona o prefieres que te explique directo el programa?'
    ],
    bloqueos: [
      'Te entiendo ❤️',
      '',
      'A veces una persona no esta perdida. Solo esta atrapada en patrones emocionales que no le permiten avanzar.',
      '',
      `${PRODUCT_NAME} trabaja justamente esos bloqueos para que empieces a entender que pasa dentro de ti y como transformarlo 🌿`,
      '',
      'Quieres que te muestre como funciona o prefieres que te explique directo el programa?'
    ],
    cargas: [
      'Te entiendo ❤️',
      '',
      'Muchas veces lo que vivimos en el pasado sigue afectando decisiones, emociones, relaciones y la forma en que reaccionamos.',
      '',
      `${PRODUCT_NAME} esta creado para ayudarte a identificar esas cargas y empezar a trabajarlas desde la raiz 🌿`,
      '',
      'Quieres que te muestre como funciona o prefieres que te explique directo el programa?'
    ]
  };

  return (replies[problem] || replies.bloqueos).join('\n');
}

function postVideoOfferReply() {
  return [
    'Que bueno ❤️',
    '',
    'Entonces ya viste que no se trata solo de fuerza de voluntad, sino de trabajar los patrones que estan detras de lo que repetimos.',
    '',
    `${PRODUCT_NAME} es un proceso de 12 semanas con clases en vivo, ejercicios, acompanamiento y herramientas practicas 🌿`,
    '',
    `El valor normal es USD ${NORMAL_PRICE_USD}, pero por este canal queda en USD ${PRICE_USD}.`,
    '',
    'Quieres que te pase el acceso oficial?'
  ].join('\n');
}

function accessDataRequestReply() {
  return [
    'Perfecto ❤️',
    '',
    `Para dejarte registrad@ en el CRM de ${PRODUCT_NAME} y poder acompanarte si tienes dudas, pasame por favor:`,
    '',
    '1️⃣ Tu nombre',
    '2️⃣ Tu pais',
    '3️⃣ Tu numero de celular',
    '',
    'Y te paso el acceso al entrenamiento 🌿'
  ].join('\n');
}

function directLinkReply(settings = {}) {
  const link = configuredHotmartLink(settings);
  return [
    'No hay problema ❤️',
    '',
    'Te dejo igual el acceso oficial para que puedas revisarlo con calma:',
    '',
    link,
    '',
    `Ahi puedes hacer tu inscripcion con el precio especial de USD ${PRICE_USD} y garantia de 14 dias 🌿`,
    '',
    'Si decides entrar, escribime "ya pague" y te ayudo con el siguiente paso.'
  ].join('\n');
}

function replaceHotmartPlaceholders(reply, link) {
  let text = String(reply || '');
  for (const placeholder of HOTMART_PLACEHOLDERS) {
    text = text.split(placeholder).join(link);
  }
  return text
    .replace(/https:\/\/pay\.hotmart\.com\/W101807995K/gi, link)
    .replace(/\(\s*link\s+de\s+hotmart\s*\)/gi, link)
    .replace(/\[\s*link\s+de\s+hotmart\s*\]/gi, link)
    .replace(/\(\s*link\s+de\s+pago\s*\)/gi, link)
    .replace(/\[\s*link\s+de\s+pago\s*\]/gi, link)
    .trim();
}

function shouldForceHotmartUrl(decision, context = {}) {
  const actions = (decision && decision.actions) || {};
  const reply = String((decision && decision.reply) || '');
  const text = normalizeText(reply);

  return Boolean(
    actions.send_hotmart_link
    || actions.create_payment
    || actions.create_payment_followups
    || (wantsDirectPaymentLink(context.userMessage) && refusesToShareData(context.userMessage))
    || /te dejo.*(acceso|link)|aqui.*(acceso|link)|hotmart|link de pago|donde pago|pagar/.test(text)
  );
}

function ensureHotmartUrlInDecision(decision, context = {}) {
  if (!decision || !decision.reply || !shouldForceHotmartUrl(decision, context)) {
    return decision;
  }

  const link = configuredHotmartLink(context.settings);
  let reply = replaceHotmartPlaceholders(decision.reply, link);

  if (!/https:\/\/pay\.hotmart\.com\/T103515864E/i.test(reply) && !/https?:\/\/pay\.hotmart\.com\//i.test(reply)) {
    reply = `${reply}\n\n${link}`.trim();
  }

  return {
    ...decision,
    reply,
    actions: {
      ...emptyActions(),
      ...(decision.actions || {}),
      send_hotmart_link: true,
      create_payment: true,
      create_payment_followups: true
    }
  };
}

function badDecisionReason(decision, context) {
  if (!decision || !decision.reply) return 'La respuesta quedo vacia. Debes responder con texto natural.';
  if (isRepeatedReply(decision.reply, context.lead)) return 'La respuesta repite demasiado el ultimo mensaje del bot.';
  if (isMetaReply(decision.reply)) return 'La respuesta habla sobre instrucciones internas en vez de contestar como Marisa.';
  if (hasForbiddenFormatting(decision.reply)) return 'No uses asteriscos, simbolos # ni formato Markdown. Responde con texto simple de WhatsApp.';
  if (shouldUseInitialOptions(context) && !includesInitialOptions(decision.reply)) return 'Primer contacto frio: usa la bienvenida de Marisa para Neurotraumas con las 6 opciones de problema. No pidas datos personales.';
  if (isOverloadedFirstContact(decision.reply, context)) return 'Primer contacto corregido: no pidas nombre, pais ni celular, y no mandes video, precio ni Hotmart en el primer mensaje.';
  if (isPrematurePaymentDump(decision.reply, context)) return 'En primer contacto frio no mandes precio ni Hotmart antes de pedir datos y problema, salvo que el usuario lo pida.';
  if (problemChoiceSentVideoTooEarly(decision, context)) return 'La persona ya eligio un problema. Valida brevemente, conecta con Neurotraumas y pregunta si quiere ver como funciona o si prefiere explicacion directa. No mandes video todavia.';
  if (sentHotmartTooEarly(decision, context)) return 'No mandes Hotmart todavia. Si dijo YA LO VI, presenta el entrenamiento y pregunta si quiere el acceso. Si solo dijo SI al acceso, pide nombre, pais y celular. Si pregunto precio o dijo me interesa antes del video, manda el video y no Hotmart.';
  return null;
}

function fallbackFreshStartDecision(context = {}) {
  return {
    reply: initialOptionsReply(userWantsFreshStart(context.userMessage) ? 'Claro, empecemos desde cero.' : ''),
    next_stage: 'captacion',
    lead_fields: {
      funnel_stage: 'captacion'
    },
    memory_patch: {
      last_intent: 'fresh_start'
    },
    actions: emptyActions()
  };
}

function fallbackGenericDecision(context = {}) {
  const problem = detectProblemChoice(context.userMessage);
  const viewedVideo = isViewedVideoMessage(context.userMessage);
  const wantsAccess = isAskingForAccessAfterOffer(context);
  const directPaymentLink = wantsDirectPaymentLink(context.userMessage);
  const priceOnly = isPriceQuestionOnly(context.userMessage);
  const interestBeforeVideo = isInterestBeforeVideo(context.userMessage) && !(context.lead && context.lead.video_sent);

  if (directPaymentLink && !refusesToShareData(context.userMessage)) {
    return {
      reply: accessDataRequestReply(),
      next_stage: 'datos_solicitados',
      lead_fields: {
        purchase_intent: true,
        funnel_stage: 'datos_solicitados'
      },
      memory_patch: {
        last_intent: 'access_requested'
      },
      actions: emptyActions()
    };
  }

  if (directPaymentLink) {
    return {
      reply: directLinkReply(context.settings),
      next_stage: 'link_pago_enviado',
      lead_fields: {
        purchase_intent: true,
        funnel_stage: 'link_pago_enviado'
      },
      memory_patch: {
        last_intent: 'direct_payment_link'
      },
      actions: {
        ...emptyActions(),
        send_hotmart_link: true,
        create_payment: true,
        create_payment_followups: true
      }
    };
  }

  if (viewedVideo) {
    return {
      reply: postVideoOfferReply(),
      next_stage: 'oferta_presentada',
      lead_fields: {
        funnel_stage: 'oferta_presentada'
      },
      memory_patch: {
        last_intent: 'video_viewed'
      },
      actions: emptyActions()
    };
  }

  if (wantsAccess) {
    return {
      reply: accessDataRequestReply(),
      next_stage: 'datos_solicitados',
      lead_fields: {
        purchase_intent: true,
        funnel_stage: 'datos_solicitados'
      },
      memory_patch: {
        last_intent: 'access_requested'
      },
      actions: emptyActions()
    };
  }

  if (problem || interestBeforeVideo || priceOnly) {
    const reply = priceOnly
      ? [
        `El valor normal es USD ${NORMAL_PRICE_USD} ❤️`,
        '',
        `Por este canal queda en USD ${PRICE_USD}.`,
        '',
        'Incluye el programa completo de 12 semanas, acompanamiento, ejercicios, acceso de por vida y garantia de 14 dias 🌿',
        '',
        'Quieres que te pase el link oficial?'
      ].join('\n')
      : (interestBeforeVideo
        ? [
          'Me alegra que te interese ❤️',
          '',
          `${PRODUCT_NAME} puede ayudarte a trabajar patrones que se repiten desde la raiz, con herramientas practicas y acompanamiento.`,
          '',
          'Quieres que te muestre como funciona o prefieres que te explique directo el programa?'
        ].join('\n')
        : problemConnectionReply(problem || 'bloqueos'));

    return {
      reply,
      next_stage: 'diagnostico',
      lead_fields: {
        main_pain: problem || undefined,
        funnel_stage: 'diagnostico'
      },
      memory_patch: {
        last_intent: priceOnly ? 'price_question' : 'problem_connection'
      },
      actions: emptyActions()
    };
  }

  return {
    reply: shouldUseInitialOptions(context)
      ? initialOptionsReply()
      : [
        'Entiendo ❤️',
        '',
        'Para orientarte mejor, decime que te gustaria mejorar primero:',
        '',
        '1️⃣ Ansiedad o pensamientos que no paran',
        '2️⃣ Miedos o inseguridad',
        '3️⃣ Autosabotaje',
        '4️⃣ Relaciones dificiles',
        '5️⃣ Bloqueos emocionales',
        '6️⃣ Cargas del pasado'
      ].join('\n'),
    next_stage: normalizeStage(context.currentStage, 'captacion'),
    lead_fields: {},
    memory_patch: {
      last_intent: 'safe_conversation_fallback'
    },
    actions: emptyActions()
  };
}

function normalizeStage(stage, fallback = 'inicio') {
  const value = String(stage || '').trim();
  return VALID_STAGES.includes(value) ? value : fallback;
}

function compactLeadContext(lead = {}) {
  return {
    name: lead.name,
    email: lead.email,
    username: lead.username,
    display_phone: lead.display_phone,
    main_pain: lead.main_pain,
    emotional_response: lead.emotional_response,
    problem_duration: lead.problem_duration,
    tried_before: lead.tried_before,
    urgency: lead.urgency,
    lead_status: lead.lead_status,
    funnel_stage: lead.funnel_stage,
    main_objection: lead.main_objection,
    objection_type: lead.objection_type,
    video_sent: lead.video_sent,
    pdf_sent: lead.pdf_sent,
    purchase_intent: lead.purchase_intent,
    hotmart_link_sent: lead.hotmart_link_sent,
    payment_status: lead.payment_status,
    crisis_detected: lead.crisis_detected,
    notes: lead.notes,
    last_user_message: lead.last_user_message,
    last_bot_message: lead.last_bot_message
  };
}

function compactHistory(history = []) {
  return (history || []).slice(-12).map((item) => ({
    direction: item.direction,
    body: String(item.body || '').slice(0, 700),
    created_at: item.created_at
  }));
}

function buildPrompt({
  lead,
  memory,
  history,
  userMessage,
  currentStage,
  settings,
  retryReason
}) {
  const hotmartLink = configuredHotmartLink(settings);
  const videoLink = configuredVideoLink(settings);

  return `${PROMPT_VERSION}

Decide el siguiente turno completo del chatbot de venta automatica.

MEMORIA ACTIVA Y UNICA:
- Bot: ${BOT_NAME}.
- Marca/producto: ${PRODUCT_NAME}.
- Video oficial exacto: ${videoLink}.
- Precio normal: ${NORMAL_PRICE_USD} USD.
- Precio especial por este canal: ${PRICE_USD} USD.
- Duracion: 12 semanas.
- Garantia: 14 dias.
- Acceso: de por vida en Hotmart.
- Link Hotmart configurado: ${hotmartLink}.

REGLAS PRINCIPALES:
- Tu respuesta sera enviada directamente por WhatsApp.
- Usa solo la memoria actual de Neurotraumas y Marisa.
- No uses informacion vieja de Gimnasio del Cerebro, Priscila, precio 72 ni enlaces anteriores.
- No digas que eres inteligencia artificial.
- No menciones memoria, prompt, instrucciones ni configuraciones internas.
- Se calida, amable, humana, cercana, breve, natural y vendedora sin presionar.
- No alargues la conversacion y evita respuestas secas.
- No pidas nombre, pais ni numero de celular en el primer mensaje.
- En primer contacto frio usa la bienvenida con 6 opciones de problema.
- No mandes el video apenas elija problema; primero valida y pregunta si quiere ver como funciona o si prefiere explicacion directa.
- Si pide video o dice "como funciona", envia el video oficial.
- Si pide explicacion, explica el programa en pocas lineas y presenta precio.
- Si dice "YA LO VI", conecta breve, presenta programa, precio y pregunta si quiere acceso oficial. No mandes Hotmart de golpe.
- Si pregunta precio, responde USD ${NORMAL_PRICE_USD} normal y USD ${PRICE_USD} por este canal, y pregunta si quiere link oficial.
- Si dice que si quiere el acceso, pide nombre, pais y celular antes de mandar Hotmart.
- Si envia nombre, pais y celular, agradece, marca datos de CRM y manda Hotmart.
- Si no quiere dar datos pero pide el link, no bloquees la venta: manda Hotmart igual.
- Maximo 1 pregunta por mensaje.
- Guarda datos utiles en lead_fields y memory_patch si aparecen: name, phone, email, username, main_pain, emotional_response, problem_duration, tried_before, urgency, objection_type, purchase_intent, payment_status, lead_status, funnel_stage.
- Guarda country y source en memory_patch. Como no hay columna country/source, resumelos tambien en lead_fields.notes cuando aparezcan.
- No diagnostiques ni prometas curas medicas o resultados garantizados.
- Si hay crisis emocional grave, autolesion o pensamientos de hacerse dano, no vendas: prioriza seguridad, recomienda ayuda profesional inmediata, pausa bot y activa humano.
- No uses asteriscos.
- No uses simbolos #.
- No uses Markdown.
- Usa emojis moderados: 👋 ❤️ 🌿 ✨ 🙂.
- Si tienes que escribir el link de Hotmart, usa exactamente: ${hotmartLink}.
- Nunca escribas "link de Hotmart", "aqui esta el acceso" o "entra desde aqui" sin pegar la URL completa ${hotmartLink}.
- Si tienes que escribir el video, usa exactamente: ${videoLink}.

FLUJO:
1. Primer contacto frio: bienvenida calida con opciones 1 a 6. No pedir datos.
2. Si elige problema por numero o palabra: valida breve, conecta con Neurotraumas y pregunta si quiere ver como funciona o explicacion directa. No mandes video todavia.
3. Si pide video / como funciona / muestrame: envia el video oficial y marca send_video_link=true.
4. Si pide explicacion / dime / cuentame / quiero saber: explica que Neurotraumas dura 12 semanas, incluye clases en vivo, grupo privado, ejercicios, material practico, 2 lives, acceso de por vida y garantia de 14 dias. Presenta precio ${NORMAL_PRICE_USD}/${PRICE_USD} y pregunta si quiere link oficial.
5. Si dice "YA LO VI": NO mandes Hotmart. Conecta breve, presenta programa, precio ${NORMAL_PRICE_USD}/${PRICE_USD} y pregunta si quiere acceso oficial.
6. Si pregunta precio: responde precio ${NORMAL_PRICE_USD}/${PRICE_USD}, incluye resumen y pregunta si quiere link oficial.
7. Si despues de eso dice "si", "quiero", "quiero entrar", "quiero comprar", "mandame el link" o similar: pide nombre, pais y numero de celular. No mandes Hotmart en ese turno salvo que rechace dar datos y pida link igual.
8. Si ya envio nombre, pais y celular: agradece, marca lead_status=interesado, purchase_intent=true, source=whatsapp_neurotraumas en memoria/notas, y manda Hotmart.
9. Si no quiere dar datos pero pide link: manda Hotmart igual.
10. Si dice "YA PAGUE", "YA COMPRE" o reporta pago: marca payment_reported=true, payment_status=reported, lead_status=comprador y funnel_stage=pago_reportado.
11. Si dice que no tiene dinero o lo va a pensar: responde sin presionar y no mandes Hotmart salvo que pida el link.

ACCIONES DISPONIBLES:
- send_video_link: true cuando la respuesta incluye el video oficial.
- send_pdf_link: mantener false; esta memoria no usa PDF.
- send_hotmart_link: true solo cuando la respuesta incluye Hotmart.
- create_payment: true solo cuando se envia Hotmart por primera vez.
- create_payment_followups: true solo cuando se envia Hotmart por primera vez.
- En "YA LO VI", send_hotmart_link=false, create_payment=false y create_payment_followups=false.
- En "SI QUIERO EL ACCESO", send_hotmart_link=false hasta que entregue nombre, pais y celular, salvo que no quiera dar datos y pida link igual.
- payment_reported: true si el usuario dice que compro, pago o se inscribio.
- pause_bot: true si pide no recibir mas mensajes o hay crisis.
- human_takeover: true si pide humano o hay crisis.
- delete_memory: true si pide BORRAR / eliminar datos / no guardar.
- stop_contact: true si pide STOP / cancelar / no me escribas.

FORMATO OBLIGATORIO:
Devuelve SOLO JSON valido.
{
  "reply": "texto final para WhatsApp o null si no debe responder",
  "next_stage": "uno de los valores validos",
  "lead_fields": {},
  "memory_patch": {},
  "actions": {
    "send_video_link": false,
    "send_pdf_link": false,
    "send_hotmart_link": false,
    "create_payment": false,
    "create_payment_followups": false,
    "payment_reported": false,
    "pause_bot": false,
    "human_takeover": false,
    "delete_memory": false,
    "stop_contact": false
  }
}

ETAPAS VALIDAS:
${VALID_STAGES.join(', ')}

${retryReason ? `CORRECCION OBLIGATORIA POR REINTENTO: ${retryReason}` : ''}

ESTADO ACTUAL DEL LEAD:
${JSON.stringify(compactLeadContext(lead), null, 2)}

MEMORIA 24H:
${JSON.stringify(memory || {}, null, 2)}

ETAPA ACTUAL:
${currentStage || 'inicio'}

HISTORIAL RECIENTE:
${JSON.stringify(compactHistory(history), null, 2)}

MENSAJE ACTUAL DEL USUARIO:
${userMessage}`;
}

function normalizeDecision(raw, currentStage) {
  const decision = raw && typeof raw === 'object' ? raw : {};
  const actions = decision.actions && typeof decision.actions === 'object' ? decision.actions : {};
  const leadFields = decision.lead_fields && typeof decision.lead_fields === 'object' ? decision.lead_fields : {};
  const memoryPatch = decision.memory_patch && typeof decision.memory_patch === 'object' ? decision.memory_patch : {};
  const reply = typeof decision.reply === 'string' && decision.reply.trim() ? decision.reply.trim() : null;
  const replyIncludesVideo = /drive\.google\.com|youtu\.be|youtube\.com/i.test(reply || '');
  const replyIncludesHotmart = /pay\.hotmart\.com/i.test(reply || '');

  return {
    reply,
    next_stage: normalizeStage(decision.next_stage, normalizeStage(currentStage, 'inicio')),
    lead_fields: leadFields,
    memory_patch: memoryPatch,
    actions: {
      send_video_link: Boolean(actions.send_video_link || replyIncludesVideo),
      send_pdf_link: Boolean(actions.send_pdf_link),
      send_hotmart_link: Boolean(actions.send_hotmart_link || replyIncludesHotmart),
      create_payment: Boolean(actions.create_payment || replyIncludesHotmart),
      create_payment_followups: Boolean(actions.create_payment_followups || replyIncludesHotmart),
      payment_reported: Boolean(actions.payment_reported),
      pause_bot: Boolean(actions.pause_bot),
      human_takeover: Boolean(actions.human_takeover),
      delete_memory: Boolean(actions.delete_memory),
      stop_contact: Boolean(actions.stop_contact)
    }
  };
}

function cleanTextReply(value) {
  const text = String(value || '').trim();
  if (!text) return null;

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed.reply === 'string' && parsed.reply.trim()) {
      return parsed.reply.trim();
    }
  } catch (error) {
    // Fallback responses may return plain WhatsApp text instead of JSON.
  }

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      const parsed = JSON.parse(fenced[1].trim());
      if (parsed && typeof parsed.reply === 'string' && parsed.reply.trim()) {
        return parsed.reply.trim();
      }
    } catch (error) {
      return fenced[1].trim();
    }
  }

  return text;
}

function parseJsonObjectFromText(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    // Continue with best-effort extraction below.
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch (error) {
      // Continue with object extraction below.
    }
  }

  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[0]);
    } catch (error) {
      return null;
    }
  }

  return null;
}

function extractReplyFromMalformedJson(text) {
  const value = String(text || '');
  const match = value.match(/"reply"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (!match) return null;

  try {
    return JSON.parse(`"${match[1]}"`).trim();
  } catch (error) {
    return match[1].replace(/\\"/g, '"').trim();
  }
}

function decisionFromText(rawText, currentStage) {
  const parsed = parseJsonObjectFromText(rawText);
  if (parsed) {
    return normalizeDecision(parsed, currentStage);
  }

  const reply = extractReplyFromMalformedJson(rawText) || cleanTextReply(rawText);
  return {
    reply,
    next_stage: normalizeStage(currentStage, 'inicio'),
    lead_fields: {},
    memory_patch: {
      last_intent: 'ai_text_rescue'
    },
    actions: emptyActions()
  };
}

function emptyActions() {
  return {
    send_video_link: false,
    send_pdf_link: false,
    send_hotmart_link: false,
    create_payment: false,
    create_payment_followups: false,
    payment_reported: false,
    pause_bot: false,
    human_takeover: false,
    delete_memory: false,
    stop_contact: false
  };
}

async function requestDecision(context, retryReason = '') {
  const rawText = await generateBotDecision({
    prompt: buildPrompt({
      ...context,
      retryReason: [
        retryReason,
        'Usa una sola respuesta.',
        'Devuelve JSON valido.',
        'reply debe tener texto natural, util y en personaje como Marisa.',
        'No devuelvas reply null.'
      ].join(' ')
    }),
    model: context.settings && context.settings.openai_model,
    maxOutputTokens: context.settings && context.settings.openai_max_output_tokens
  });

  return decisionFromText(rawText, context.currentStage);
}

async function generateAIConversationTurn(context) {
  let decision = await requestDecision(context);
  const firstReason = badDecisionReason(decision, context);
  if (!firstReason) {
    return ensureHotmartUrlInDecision(decision, context);
  }

  console.warn('AI decision rejected; retrying', {
    reason: firstReason,
    leadId: context.lead && context.lead.id,
    currentStage: context.currentStage
  });

  decision = await requestDecision(context, [
    firstReason,
    'Corrige de inmediato.',
    'Usa solo la memoria nueva de Marisa y Neurotraumas.',
    'No menciones Gimnasio del Cerebro, Priscila, precio 72 ni enlaces anteriores.',
    'No expliques como vas a responder; responde como Marisa.',
    'No uses asteriscos, simbolos # ni Markdown.'
  ].join(' '));

  const secondReason = badDecisionReason(decision, context);
  if (!secondReason) {
    return ensureHotmartUrlInDecision(decision, context);
  }

  console.warn('AI decision rejected after retry; using guarded fallback', {
    reason: secondReason,
    leadId: context.lead && context.lead.id,
    currentStage: context.currentStage
  });

  if (userWantsFreshStart(context.userMessage)) {
    return fallbackFreshStartDecision(context);
  }

  return ensureHotmartUrlInDecision(fallbackGenericDecision(context), context);
}

module.exports = {
  generateAIConversationTurn,
  initialOptionsReply,
  VALID_STAGES,
  normalizeStage
};
