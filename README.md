# Chatbot Neurotraumas

Backend independiente para un chatbot vendedor de Neurotraumas™ conectado a WhatsApp por QR, PostgreSQL y Gemini API. El CRM puede leer leads, conversaciones, mensajes, pagos, follow-ups, settings y controlar el bot desde endpoints protegidos.

## Variables de entorno

Copia `.env.example` a `.env` solo en tu entorno local o configura las variables directamente en Seenode. No subas `.env` reales a GitHub.

Variables críticas:

- `DATABASE_URL`: conexión PostgreSQL. Es la única fuente de conexión a base de datos.
- `GEMINI_API_KEY`: API key de Gemini. Es la única fuente de credenciales de IA.
- `ADMIN_API_KEY`: clave que debe enviar el CRM en `x-admin-api-key`.
- `HOTMART_LINK`: link de pago, también editable desde `bot_settings`.
- `LANDING_LINK`: link de landing/video, también editable desde `bot_settings`.
- `WHATSAPP_SESSION_PATH`: carpeta local para guardar sesión de WhatsApp.

## Instalación local

```bash
npm install
cp .env.example .env
npm run dev
```

En Windows PowerShell con scripts bloqueados puedes usar:

```powershell
npm.cmd install
npm.cmd run dev
```

## Ejecución en producción

```bash
npm install --omit=dev
npm start
```

El servidor escucha en `process.env.PORT || 3000`.

## Despliegue en Seenode

1. Conecta este repositorio en Seenode.
2. Configura `DATABASE_URL` con la URL PostgreSQL real.
3. Configura `GEMINI_API_KEY`.
4. Configura `ADMIN_API_KEY`.
5. Configura `HOTMART_LINK` y `LANDING_LINK`, o actualízalos luego desde `/api/settings`.
6. Usa `npm start` como comando de inicio.
7. Abre `/api/whatsapp/qr` o `POST /api/whatsapp/generate-qr` desde el CRM para vincular WhatsApp.

## WhatsApp QR

El bot usa `whatsapp-web.js` con `LocalAuth`. La sesión se guarda en `WHATSAPP_SESSION_PATH`, por lo que no debería pedir QR en cada reinicio si el almacenamiento persiste.

Endpoints:

- `GET /api/whatsapp/status`
- `GET /api/whatsapp/qr`
- `POST /api/whatsapp/generate-qr`
- `POST /api/whatsapp/restart`
- `POST /api/whatsapp/logout`

## CRM

Todos los endpoints administrativos requieren:

```http
x-admin-api-key: TU_ADMIN_API_KEY
```

`GET /api/health` también requiere `x-admin-api-key`.

Endpoints principales:

- `GET /api/leads`
- `GET /api/leads/:id`
- `PATCH /api/leads/:id`
- `GET /api/conversations`
- `GET /api/conversations/:leadId`
- `GET /api/messages/:leadId`
- `POST /api/leads/:id/pause-bot`
- `POST /api/leads/:id/resume-bot`
- `POST /api/leads/:id/takeover`
- `POST /api/leads/:id/release-takeover`
- `POST /api/leads/:id/send-message`
- `POST /api/leads/:id/send-hotmart-link`
- `POST /api/leads/:id/mark-paid`
- `POST /api/leads/:id/delete-memory`
- `GET /api/settings`
- `PATCH /api/settings`
- `GET /api/payments`
- `PATCH /api/payments/:id`
- `GET /api/followups`
- `PATCH /api/followups/:id`
- `POST /api/followups/:id/send-now`

## Base de datos

Al iniciar, el servidor ejecuta `src/database/migrations/schema.sql` con `CREATE TABLE IF NOT EXISTS` y crea:

- `leads`
- `conversations`
- `messages`
- `conversation_memory`
- `bot_settings`
- `whatsapp_sessions`
- `payments`
- `followups`
- `admin_actions`

El teléfono normalizado (`+591...`) es el identificador principal del lead y evita duplicados.

## Memoria 24 horas

La memoria detallada se guarda en `conversation_memory` y se renueva por 24 horas con cada mensaje cuando `consent_24h = true`. El job `cleanExpiredMemory` corre cada hora y elimina solo memoria vencida, no leads ni mensajes comerciales básicos.

Si el usuario escribe `BORRAR`, `ELIMINAR DATOS` o `NO GUARDAR`, se elimina la memoria temporal y se desactiva el consentimiento de memoria.

## Follow-ups

El job `scheduledFollowUps` corre cada 5 minutos y envía follow-ups pendientes si:

- `scheduled_at <= NOW()`
- `status = pending`
- el lead no tiene `bot_paused = true`
- el lead no tiene `human_takeover = true`

Se crean follow-ups después de enviar landing y después de enviar el link de Hotmart.

## Gemini API

La integración está en:

- `src/ai/geminiClient.js`
- `src/ai/intentClassifier.js`
- `src/ai/responseGenerator.js`
- `src/ai/systemPrompt.js`

Gemini se usa en dos capas:

1. Clasificación interna en JSON.
2. Respuesta humana controlada por reglas del backend.

Si Gemini falla o no responde, el bot usa respuestas fallback y no se cae.

## Seguridad conversacional

El bot no diagnostica, no promete curas, no reemplaza terapia, no inventa descuentos ni cupos y no usa urgencia falsa. Si detecta crisis emocional, autolesión o suicidio, deja de vender, pausa el bot y activa takeover humano.
