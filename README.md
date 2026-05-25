# Plotify Monorepo

Workspace principal de Plotify.

## Estructura

```text
apps/web              Next.js 16 + React 19
apps/api              FastAPI + LangGraph Python
packages/database     Supabase migrations, seed y tipos canonicos
packages/contracts    OpenAPI y clientes generados
```

## Setup

```bash
pnpm install
```

El backend Python mantiene su propio entorno virtual:

```bash
cd apps/api
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Comandos canonicos

```bash
pnpm dev:web
pnpm build:web
pnpm test:web
pnpm typecheck:web
pnpm test:api
pnpm contracts:generate
pnpm verify:migrations
```

## Rutas canonicas

- Migraciones Supabase: `packages/database/supabase/migrations`.
- Tipos Supabase generados: `packages/database/types/database.generated.ts`.
- Wrapper de tipos en frontend: `apps/web/src/types/supabase.ts`.
- Contrato OpenAPI: `packages/contracts/openapi/plotify-chat.v1.json`.
- Cliente TS generado: `apps/web/src/lib/services/plotify-chat.generated.ts`.

## No crear nuevas migraciones en `apps/web/supabase/migrations` ni en

`apps/api/supabase/migrations`.

Desde la raíz del monorepo, corre estos 3:

pnpm dev:web

pnpm dev:api

pnpm dev:worker

## Comando completo, todo en una línea

1. Registrar el webhook:

curl -X POST "https://api.telegram.org/bot<TU_TELEGRAM_BOT_TOKEN>/setWebhook" -d "url=https://<TU_NGROK_URL>/api/v1/webhook/telegram/<TU_WEBHOOK_SECRET>"

2. Respuesta esperada:

{"ok":true,"result":true,"description":"Webhook was set"}

3. Confirmar que quedó bien:

curl "https://api.telegram.org/bot<TU_TELEGRAM_BOT_TOKEN>/getWebhookInfo"

Respuesta esperada (lo importante):

"url": "https://<TU_NGROK_URL>/api/v1/webhook/telegram/<TU_WEBHOOK_SECRET>"
Sin last_error_message, o con un last_error_date viejo
"pending_update_count": 0 o 1
