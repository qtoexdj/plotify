# Setup Local

**Tag:** #guia #setup
**Relacionado:** [[00 - Home]], [[Feature Flags]], [[Variables de Entorno]]

---

## Requisitos

- Node.js 22.13+
- pnpm 11+
- Docker con los contenedores compartidos ya levantados
- Python 3.13+ (para microservicio)
- Redis en contenedor Docker existente

## Frontend (Next.js)

```bash
pnpm install
cp .env.example .env
# Editar .env con valores locales
pnpm dev:web
```

Abre `http://localhost:3000`

## Supabase local

Plotify usa el stack Supabase Docker existente. No levantar un stack nuevo con
`supabase start` desde este repo salvo que se pida explicitamente.

Contenedores esperados del stack compartido:

- `supabase-kong`: API gateway en `http://127.0.0.1:8000`.
- `supabase-db`: PostgreSQL interno del stack.
- `supabase-pooler`: puertos publicados `5432` y `6543`.
- `supabase-rest`, `supabase-auth`, `supabase-storage`, `supabase-realtime`,
  `supabase-meta`, `supabase-studio`, `supabase-analytics`,
  `supabase-vector`, `supabase-mail`, `supabase-imgproxy`,
  `supabase-edge-functions`.

Supabase corre para la app en `http://127.0.0.1:8000`.

Las variables en `.env` del frontend:
- `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:8000`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: usar la clave existente en `apps/web/.env`.
- `SUPABASE_SERVICE_ROLE_KEY`: usar la clave existente en `apps/web/.env`.

## Microservicio (apps/api)

```bash
cd apps/api
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Editar .env con credenciales de Supabase + OpenAI/Anthropic
```

Desde la raiz del monorepo:

```bash
pnpm dev:api
```

API local:

- `http://localhost:8005`
- `http://localhost:8005/docs`

Redis debe usar el contenedor Docker existente:

- Contenedor: `redis`.
- Puerto publicado: `localhost:6379`.
- Variable del microservicio: `REDIS_URL=redis://localhost:6379/0`.

No iniciar `redis-server` manualmente si el contenedor `redis` ya esta corriendo.

Worker ARQ desde la raiz:

```bash
pnpm dev:worker
```

Nota: despues de mover `plotify_chat/` a `apps/api`, el wrapper
`apps/api/venv/bin/arq` puede conservar un shebang absoluto antiguo. El script
raiz evita ese wrapper y llama ARQ con `apps/api/venv/bin/python`.

Solucion limpia si aparece `bad interpreter`:

```bash
cd apps/api
rm -rf venv
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Variables compartidas

El `INTERNAL_API_SECRET` debe ser el mismo en ambos `.env`:
```bash
openssl rand -hex 32
```

## Verificar setup

```bash
pnpm dev:web
pnpm dev:api
pnpm dev:worker
pnpm test:web
pnpm typecheck:web
pnpm test:api
pnpm contracts:generate
pnpm verify:migrations
```

## Troubleshooting

- Si Supabase no responde: verificar que `supabase-kong` este corriendo y que
  `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_URL` apunten a `http://127.0.0.1:8000`
  o `http://localhost:8000`.
- Si Redis no responde: verificar que el contenedor `redis` este corriendo en
  `localhost:6379`.
- Si el microservicio no conecta: verificar que INTERNAL_API_SECRET coincida.
- Si hay errores de tipos: `pnpm typecheck:web` para ver detalles.

## Relacionado
- [[Variables de Entorno]] — Referencia completa de variables
- [[Feature Flags]] — Flags que se pueden togglear
- [[Testing Frontend]] — Como correr los tests
