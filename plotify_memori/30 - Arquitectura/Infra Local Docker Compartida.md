---
title: Infra Local Docker Compartida
date: 2026-04-15
tags:
  - infraestructura
  - docker
  - supabase
  - redis
status: active
---

# Infra Local Docker Compartida

Plotify debe usar la infraestructura local ya instalada en contenedores Docker.
No crear un stack Supabase nuevo para tareas normales de desarrollo, tipos,
tests o ejecucion local.

## Supabase

Stack activo esperado:

- `supabase-kong`: gateway HTTP en `http://127.0.0.1:8000`.
- `supabase-db`: PostgreSQL del stack.
- `supabase-pooler`: pooler PostgreSQL con puertos publicados `5432` y `6543`.
- `supabase-rest`
- `supabase-auth`
- `supabase-storage`
- `supabase-realtime`
- `supabase-meta`
- `supabase-studio`
- `supabase-analytics`
- `supabase-vector`
- `supabase-mail`
- `supabase-imgproxy`
- `supabase-edge-functions`

El codigo obtiene las credenciales desde:

- `plotify/.env`
- `plotify_chat/.env`

No documentar claves reales en notas ni READMEs.

## Redis

Redis tambien corre en Docker:

- Contenedor: `redis`.
- URL para Plotify Chat: `redis://localhost:6379/0`.
- Variable: `REDIS_URL`.

No ejecutar `redis-server` manualmente si el contenedor `redis` esta corriendo.

## Reglas operativas

- No ejecutar `supabase start` desde este repo salvo instruccion explicita.
- No crear contenedores `supabase_*_plotify`.
- No usar el stack Supabase CLI en puertos `54321`, `54322`, `54323` o `54324`
  para el desarrollo normal de Plotify.
- Para regenerar tipos, usar la conexion existente indicada por `.env` y
  escribir en `packages/database/types/database.generated.ts`.
- `plotify/src/types/supabase.ts` debe seguir siendo un wrapper que reexporta
  los tipos canonicos desde `packages/database/types/database.generated.ts`.

## Estado 2026-04-15

Se eliminaron los 12 contenedores del stack accidental `supabase_*_plotify`.
Queda como objetivo usar el stack compartido de 14 contenedores Supabase y el
contenedor Redis existente.

Normalizacion aplicada:

- `plotify_chat/.env` apunta `SUPABASE_URL` a `http://127.0.0.1:8000`.
- `plotify_chat/.env` mantiene `SUPABASE_DB_URL` contra el pooler local
  `supabase-pooler` en `localhost:6543`.
- `plotify_chat/.env` usa `REDIS_URL=redis://localhost:6379/0`.
- `plotify_chat/.env.example` documenta el formato local correcto y la variable
  esperada por el codigo: `SUPABASE_SERVICE_ROLE_KEY`.

Verificacion aplicada:

- Redis Docker existente responde con `PING`.
- LangGraph checkpointer inicializa tablas en PostgreSQL y no cae a memoria RAM.
- Backend tests: `./venv/bin/pytest -q` pasa con 72 tests y 2 skipped.

## Relacionado

- [[Implementacion Infra Local Docker Compartida]]
- [[Setup Local]]
- [[Variables de Entorno]]
- [[Backlog Implementable - Cierre Plotify]]
