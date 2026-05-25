---
title: Implementacion Infra Local Docker Compartida
date: 2026-04-15
status: done
tags:
  - implementacion
  - infraestructura
  - docker
  - supabase
  - redis
---

# Implementacion Infra Local Docker Compartida

Implementacion completada el 2026-04-15.

## Estado

Status: done.

Plotify queda configurado para usar la infraestructura local compartida ya
instalada en Docker:

- Supabase: stack existente de 14 contenedores.
- Redis: contenedor existente `redis`.

No se debe crear un segundo stack Supabase para desarrollo normal, generacion de
tipos, tests o ejecucion local.

## Cambios aplicados

### Contenedores

Se eliminaron los 12 contenedores accidentales del stack `supabase_*_plotify`.

Queda activo el stack compartido:

- `supabase-kong` como gateway HTTP en `http://127.0.0.1:8000`.
- `supabase-db` como PostgreSQL del stack.
- `supabase-pooler` para conexion PostgreSQL/pooler en `localhost:6543`.
- `redis` para arq y cache del microservicio en `redis://localhost:6379/0`.

### Variables de entorno

`plotify_chat/.env` fue normalizado para usar:

- `SUPABASE_URL=http://127.0.0.1:8000`
- `SUPABASE_DB_URL` contra el pooler Docker existente en `localhost:6543`
- `REDIS_URL=redis://localhost:6379/0`

`plotify_chat/.env.example` fue actualizado para:

- Usar `SUPABASE_SERVICE_ROLE_KEY`, que es la variable leida por el codigo.
- Mostrar el formato local del pooler Docker.
- Mantener las credenciales como placeholders.

No se copiaron credenciales reales a la documentacion.

### Documentacion actualizada

- [[Infra Local Docker Compartida]]
- [[Setup Local]]
- [[Variables de Entorno]]
- [[Backlog Implementable - Cierre Plotify]]
- `packages/database/README.md`
- `plotify_chat/README.md`
- `plotify/plan-frontend.md`
- `plotify/src/context/architecture-chat-microservicio.md`

## Verificacion realizada

Infra:

- No quedan contenedores `supabase_*_plotify`.
- El stack Supabase compartido sigue corriendo.
- El contenedor `redis` sigue corriendo en `localhost:6379`.

Smoke tests:

- Redis respondio `PING`.
- LangGraph checkpointer inicializo tablas en PostgreSQL real mediante
  `SUPABASE_DB_URL`.
- El checkpointer no cayo a memoria RAM.

Tests backend:

```bash
cd plotify_chat
./venv/bin/pytest -q
```

Resultado:

```text
72 passed, 2 skipped
```

## Reglas futuras

- No ejecutar `supabase start` desde este repo salvo instruccion explicita.
- No crear contenedores `supabase_*_plotify`.
- No ejecutar `redis-server` si el contenedor `redis` esta corriendo.
- Las credenciales reales viven solo en `.env`.
- Para regenerar tipos Supabase, escribir en
  `packages/database/types/database.generated.ts`.

## Relacionado

- [[Infra Local Docker Compartida]]
- [[Variables de Entorno]]
- [[Setup Local]]
- [[Backlog Implementable - Cierre Plotify]]
