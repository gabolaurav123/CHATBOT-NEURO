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
- `GEMINI_MODEL`: modelo de Gemini, recomendado `gemini-2.5-flash`.
- `HOTMART_LINK`: link de pago, tambien editable desde `bot_settings`.
- `VIDEO_LINK`: clase gratuita de 12 minutos que ofrece Marisa al inicio del flujo.
- `PDF_LINK`: PDF gratuito que se ofrece despues del diagnostico orientativo.
- `PRODUCT_NORMAL_PRICE`: precio normal mostrado al usuario, por defecto `360`.
- `PRODUCT_SPECIAL_PRICE`: precio especial por este canal, por defecto `270`.
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
GEMINI_MODEL=gemini-2.5-flash
GEMINI_TEMPERATURE=0.7
GEMINI_MAX_OUTPUT_TOKENS=800
HOTMART_LINK=https://pay.hotmart.com/T103515864E
VIDEO_LINK=
PDF_LINK=
PRODUCT_NORMAL_PRICE=360
PRODUCT_SPECIAL_PRICE=270
PRODUCT_PRICE=270
WHATSAPP_SESSION_PATH=.baileys_auth
PORT=80
NODE_ENV=production
TIMEZONE=America/La_Paz
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
  "leadId": "uuid-del-lead",
  "text": "Mensaje de prueba"
}
```

Este endpoint envia el mensaje con Baileys al `whatsapp_id` del lead. Tambien acepta `jid` para pruebas directas.

### Notas Para El CRM

- `GET /api/leads` y endpoints relacionados devuelven `display_contact` y `phone_is_real`.
- Para mostrar contacto usa esta prioridad: `phone` solo si `phone_is_real = true`; luego `display_phone`; luego `whatsapp_lid` o `whatsapp_id`.
- Si `whatsapp_id` o `whatsapp_lid` termina en `@lid`, muestralo como `ID WhatsApp: ...` y no lo formatees como telefono.
- No uses `parseInt` para telefonos, JIDs ni IDs. Todos deben tratarse como `string`.
- `GET /api/leads/:id`, `GET /api/conversations/:leadId` y `GET /api/messages/:leadId` requieren UUID real. Si no es UUID, el backend responde `400 { "error": "Invalid lead id" }`.
- Para busqueda textual de conversaciones usa `GET /api/conversations?search=texto`; el backend no compara `uuid = text`.
- Para editar follow-ups usa `PATCH /api/followups/:id` con `message`, `scheduled_at`, `type` y `status`.
- Para enviar un follow-up ahora usa `POST /api/followups/:id/send-now`; el backend solo marca `sent` despues de que Baileys confirma el envio.

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

`whatsapp_id` es el JID real de Baileys y es el identificador usado para enviar mensajes. `phone` solo se guarda cuando se obtiene un numero real con seguridad, por ejemplo `+59171234567`. Si Baileys entrega un `@lid`, el backend guarda `phone = null`, `whatsapp_lid = ...@lid` y `display_phone = ID WhatsApp: ...`.

El flujo conversa como Marisa y avanza por etapas: bienvenida, video gratuito, diagnostico orientativo, PDF gratuito, oferta, objeciones y link oficial de Hotmart. El bot guarda en el lead si ya envio video, PDF, oferta y link para no repetirlos en bucle.

El acceso oficial de Hotmart es:

```text
https://pay.hotmart.com/T103515864E
```

## Memoria 24 Horas

La memoria detallada se guarda en `conversation_memory` y se renueva por 24 horas con cada mensaje cuando `consent_24h = true`. El job `cleanExpiredMemory` corre cada hora y elimina solo memoria vencida, no leads ni mensajes comerciales basicos.

Si el usuario escribe `BORRAR`, `ELIMINAR DATOS` o `NO GUARDAR`, se elimina la memoria temporal y se desactiva el consentimiento de memoria.

## Follow-Ups

El job `scheduledFollowUps` corre cada 5 minutos y envia follow-ups pendientes si:

- `scheduled_at <= NOW()`
- `status = pending`
- el lead no tiene `bot_paused = true`
- el lead no tiene `human_takeover = true`

Se crean follow-ups despues de enviar el link de Hotmart.

## Gemini API

La integracion esta en:

- `src/ai/geminiClient.js`
- `src/ai/intentClassifier.js`
- `src/ai/responseGenerator.js`
- `src/ai/systemPrompt.js`

Gemini se usa para redactar respuestas humanas con contexto de etapa, memoria e historial reciente. La decision de etapa se hace en el backend para evitar bucles cuando falla la IA.

Usa `gemini-2.5-flash`. Si en Seenode queda configurado un modelo viejo como `gemini-1.5-flash` o `gemini-2.0-flash`, el backend lo reemplaza en runtime por `gemini-2.5-flash`. Si Gemini falla o no responde, el bot usa un fallback corto segun la etapa y no vuelve al saludo inicial.

## Seguridad Conversacional

El bot no diagnostica, no promete curas, no reemplaza terapia, no inventa descuentos ni cupos y no usa urgencia falsa. Si detecta crisis emocional, autolesion o suicidio, deja de vender, pausa el bot y activa takeover humano.
