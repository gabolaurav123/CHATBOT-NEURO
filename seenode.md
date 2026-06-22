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
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.4-mini
OPENAI_MAX_OUTPUT_TOKENS=250
HOTMART_LINK=https://pay.hotmart.com/T103515864E
VIDEO_LINK=
PDF_LINK=
PRODUCT_NORMAL_PRICE=360
PRODUCT_SPECIAL_PRICE=270
PRODUCT_PRICE=270
WHATSAPP_SESSION_PATH=.baileys_auth
PORT=80
NODE_ENV=production
MEMORY_EXPIRATION_HOURS=24
TIMEZONE=America/La_Paz
```

No pongas `DATABASE_URL` ni `OPENAI_API_KEY` dentro del codigo. Usa `gpt-5.4-mini` como modelo principal.

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
```

Este endpoint muestra estado basico sin exponer secretos. Si agregas `x-admin-api-key`, tambien devuelve el estado administrativo completo de WhatsApp.
