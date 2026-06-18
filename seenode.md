# Seenode

## Runtime

```text
Node.js 20
```

## Build Command

```bash
npm install
```

## Start Command

```bash
npm start
```

## Port

```text
80
```

## Variables

Configura estas variables en el panel de Seenode:

```env
DATABASE_URL=
ADMIN_API_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-1.5-flash
HOTMART_LINK=https://pay.hotmart.com/T103515864E
WHATSAPP_SESSION_PATH=.baileys_auth
PORT=80
NODE_ENV=production
GEMINI_TEMPERATURE=0.7
GEMINI_MAX_OUTPUT_TOKENS=800
MEMORY_EXPIRATION_HOURS=24
TIMEZONE=America/La_Paz
```

No pongas `DATABASE_URL` ni `GEMINI_API_KEY` dentro del codigo.

## WhatsApp

El backend usa Baileys para WhatsApp. No usa Chrome, Chromium, Puppeteer ni navegador.

Para vincular WhatsApp desde el CRM:

1. Llama `POST /api/whatsapp/generate-qr` con `x-admin-api-key`.
2. Muestra el campo `qr` como imagen base64.
3. Escanea el QR con WhatsApp.
4. Verifica `GET /api/whatsapp/status`.

Si la carpeta `.baileys_auth` persiste, WhatsApp no deberia pedir QR en cada reinicio.

## Health Check

```http
GET /api/health
x-admin-api-key: TU_ADMIN_API_KEY
```

Este endpoint sigue la misma proteccion administrativa que el resto de la API.
