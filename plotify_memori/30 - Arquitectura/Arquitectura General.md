# Arquitectura General

**Tag:** #arquitectura
**Relacionado:** [[00 - Home]], [[Vision y Alcance]], [[Comunicacion entre Servicios]], [[Schema General BD]]

---

## Diagrama de alto nivel

```
Usuario (Browser)
  → Next.js 16 App (puerto 3000)
    → Server Components + Client Components + Server Actions + API Routes
      → Supabase (PostgreSQL :8000) + Auth + Storage
      → plotify_chat (FastAPI :8005 + LangGraph + Redis/arq + Telegram/WhatsApp)
```

## Componentes

### 1. Frontend (Next.js App Router)

- **Server Components** por defecto, Client Components solo para interactividad.
- **Route Groups** para aislar layouts: `(auth)`, `(dashboard)`, `(super-admin)`.
- **Services layer** (`src/lib/services/`) — 17 archivos que abstraen queries a Supabase.
- **Server Actions** (`src/actions/`) — 9 archivos para mutaciones con validacion Zod.
- **API Routes** (`src/app/api/`) — Endpoints REST para CRUD, uploads, onboarding, viewer.

### 2. Base de Datos (Supabase)

- PostgreSQL con **29 tablas** en schema public.
- **Multitenancy** via `organization_id` en todas las tablas core.
- **~70 politicas RLS** en 21 tablas para aislamiento.
- **Procedimientos atomicos** PL/pgSQL (`reserve_lot`, `direct_sale_lot`) con `FOR UPDATE` locks.
- **Storage buckets**: `avatars`, `documents`.
- **pgvector** para embeddings del agente IA.
- **pgcrypto** para encriptacion de credenciales MCP.

### 3. Microservicio de Chat (plotify_chat)

- FastAPI con LangGraph para orquestacion de agentes IA.
- Cola asincrona con Redis + arq.
- Bots de Telegram/WhatsApp por organizacion (multi-tenant).
- Generacion de documentos PDF/DOCX con Jinja2 + WeasyPrint + python-docx.
- Se comunica con el frontend via HTTP con header `X-Internal-Secret`.

## Flujo de datos

1. Usuario interactua con UI → Server Action o API Route.
2. Service layer consulta Supabase (cliente browser o server).
3. Si necesita IA → `microservice.client.ts` llama a plotify_chat :8005.
4. Plotify_chat consulta Supabase + ejecuta LangGraph → responde.
5. Si necesita documento → genera PDF/DOCX → guarda en Supabase Storage.

## Relacionado
- [[Comunicacion entre Servicios]] — Detalle del puente HTTP
- [[Schema General BD]] — Estructura de la base de datos
- [[Patrones de Diseno]] — Patrones de diseno aplicados
