# Chatbot Neurotraumas

Backend independiente para un chatbot vendedor de Neurotraumas conectado a WhatsApp por QR, PostgreSQL y Gemini API. El CRM puede leer leads, conversaciones, mensajes, pagos, follow-ups, settings y controlar el bot desde endpoints protegidos.

## WhatsApp Sin Chrome

La conexion de WhatsApp usa Baileys (`@whiskeysockets/baileys`). No usa Chrome, Chromium, Puppeteer, `executablePath` ni flags de navegador.

La sesion se guarda en `WHATSAPP_SESSION_PATH`, por defecto `.baileys_auth`, para evitar pedir QR en cada reinicio cuando el almacenamiento persiste.

## Variables De Entorno

Copia `.env.example` a `.env` solo en tu entorno local o configura las variables directamente en Seenode. No subas `.env` reales a GitHub.

Variables criticas:

- `DATABASE_URL`: conexion PostgreSQL. Es la unica fuente de conexion a base de datos.
- `GEMINI_API_KEY`: API key de Gemini. Es la unica fuente de credenciales de IA.
- `ADMIN_API_KEY`: clave que debe enviar el CRM en `x-admin-api-key`.
- `GEMINI_MODEL`: modelo de Gemini, por ejemplo `gemini-1.5-flash`.
- `HOTMART_LINK`: link de pago, tambien editable desde `bot_settings`.
- `LANDING_LINK`: link de landing/video, tambien editable desde `bot_settings`.
- `WHATSAPP_SESSION_PATH`: carpeta local de sesion Baileys, recomendado `.baileys_auth`.
- `PORT`: puerto HTTP. En Seenode usa `80`.

## Instalacion Local

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

## Produccion

```bash
npm install
npm start
```

El servidor escucha en `process.env.PORT || 80` y se enlaza a `0.0.0.0`.

## Deploy En Seenode

Runtime:

```text
Node.js 20
```

Build command:

```bash
npm install
```

Start command:

```bash
npm start
```

Port:

```text
80
```

Variables:

```env
DATABASE_URL=
ADMIN_API_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-1.5-flash
HOTMART_LINK=
LANDING_LINK=
WHATSAPP_SESSION_PATH=.baileys_auth
PORT=80
NODE_ENV=production
```

## WhatsApp QR

Endpoints del CRM:

- `GET /api/whatsapp/status`
- `GET /api/whatsapp/qr`
- `POST /api/whatsapp/generate-qr`
- `POST /api/whatsapp/restart`
- `POST /api/whatsapp/logout`

`POST /api/whatsapp/generate-qr` inicia Baileys, genera un QR real y lo guarda en `whatsapp_sessions.qr_code` como base64.

`GET /api/whatsapp/qr` devuelve:

```json
{
  "qr": "data:image/png;base64,...",
  "status": "qr_pending"
}
```

Al conectar, el backend guarda `status = connected`, `connected_phone` si esta disponible y `last_connected_at`. Al desconectar, guarda `status = disconnected` y `last_disconnected_at`.

## CRM

Todos los endpoints administrativos requieren:

```http
x-admin-api-key: TU_ADMIN_API_KEY
```

`GET /api/health` tambien requiere `x-admin-api-key`.

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
- `POST /api/test/send-message`

Endpoint de prueba de WhatsApp:

```http
POST /api/test/send-message
x-admin-api-key: TU_ADMIN_API_KEY
Content-Type: application/json

{
  "jid": "591XXXXXXXX@s.whatsapp.net",
  "text": "Mensaje de prueba"
}
```

Este endpoint envia el mensaje directamente con Baileys al JID indicado y sirve para validar que `sendMessage` funciona.

## Base De Datos

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

El telefono normalizado (`+591...`) es el identificador principal del lead y evita duplicados. Con Baileys, el numero se extrae desde `remoteJid`, por ejemplo `591XXXXXXXX@s.whatsapp.net`.

## Memoria 24 Horas

La memoria detallada se guarda en `conversation_memory` y se renueva por 24 horas con cada mensaje cuando `consent_24h = true`. El job `cleanExpiredMemory` corre cada hora y elimina solo memoria vencida, no leads ni mensajes comerciales basicos.

Si el usuario escribe `BORRAR`, `ELIMINAR DATOS` o `NO GUARDAR`, se elimina la memoria temporal y se desactiva el consentimiento de memoria.

## Follow-Ups

El job `scheduledFollowUps` corre cada 5 minutos y envia follow-ups pendientes si:

- `scheduled_at <= NOW()`
- `status = pending`
- el lead no tiene `bot_paused = true`
- el lead no tiene `human_takeover = true`

Se crean follow-ups despues de enviar landing y despues de enviar el link de Hotmart.

## Gemini API

La integracion esta en:

- `src/ai/geminiClient.js`
- `src/ai/intentClassifier.js`
- `src/ai/responseGenerator.js`
- `src/ai/systemPrompt.js`

Gemini se usa en dos capas:

1. Clasificacion interna en JSON.
2. Respuesta humana controlada por reglas del backend.

Si Gemini falla o no responde, el bot usa respuestas fallback y no se cae.

## Seguridad Conversacional

El bot no diagnostica, no promete curas, no reemplaza terapia, no inventa descuentos ni cupos y no usa urgencia falsa. Si detecta crisis emocional, autolesion o suicidio, deja de vender, pausa el bot y activa takeover humano.
