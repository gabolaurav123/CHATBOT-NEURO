# Seenode

## Comando de inicio

```bash
npm start
```

## Variables obligatorias

Configura estas variables en el panel de Seenode:

```env
DATABASE_URL=
ADMIN_API_KEY=
GEMINI_API_KEY=
HOTMART_LINK=
LANDING_LINK=
PORT=3000
NODE_ENV=production
GEMINI_MODEL=gemini-1.5-flash
GEMINI_TEMPERATURE=0.7
GEMINI_MAX_OUTPUT_TOKENS=800
MEMORY_EXPIRATION_HOURS=24
WHATSAPP_SESSION_PATH=.wwebjs_auth
TIMEZONE=America/La_Paz
```

No pongas `DATABASE_URL` ni `GEMINI_API_KEY` dentro del código.

## PostgreSQL

El backend toma la conexión únicamente desde `DATABASE_URL`. Al iniciar, ejecuta la migración idempotente de `src/database/migrations/schema.sql`.

## WhatsApp

Para vincular WhatsApp desde el CRM:

1. Llama `POST /api/whatsapp/generate-qr` con `x-admin-api-key`.
2. Muestra el campo `qr` como imagen base64.
3. Escanea el QR con WhatsApp.
4. Verifica `GET /api/whatsapp/status`.

Si la sesión local persiste, WhatsApp no pedirá QR en cada reinicio.

## Health check

```http
GET /api/health
x-admin-api-key: TU_ADMIN_API_KEY
```

Este endpoint sigue la misma protección administrativa que el resto de la API.
