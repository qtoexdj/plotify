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

No crear nuevas migraciones en `apps/web/supabase/migrations` ni en
`apps/api/supabase/migrations`.
