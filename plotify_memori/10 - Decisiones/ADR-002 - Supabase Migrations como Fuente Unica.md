---
aliases:
- ADR-002
- Supabase Migrations como Fuente Unica
date: 2026-04-14
status: accepted
tags:
- adr
- supabase
- migraciones
- db
title: ADR-002 - Supabase Migrations como Fuente Unica
---
# ADR-002 - Supabase Migrations como Fuente Unica

## Status

Accepted

## Context

La DB local registra 60 migraciones aplicadas, pero los repos actuales contienen 29 archivos `.sql`. La DB tiene tablas y buckets que no estan completamente representados en archivos versionados actuales.

Esto bloquea reproducibilidad y aumenta riesgo al pasar a monorepo.

## Decision

Supabase migrations viviran en una sola carpeta canonica:

```text
packages/database/supabase/migrations
```

Ninguna app debe agregar migraciones en carpetas propias.

## Alternatives Considered

### Mantener migraciones divididas por app

Pros:

- Cada app controla sus tablas.

Cons:

- Orden incierto.
- Drift confirmado.
- Tipos generados inconsistentes.

Rejected.

### Usar solo DB remota como verdad

Pros:

- Menos trabajo inicial.

Cons:

- No permite levantar entornos limpios.
- No sirve para CI confiable.

Rejected.

## Consequences

- Toda modificacion de schema debe entrar por `packages/database`.
- Los tipos TS se generan desde esa DB.
- El backend Python consume el mismo contrato, aunque no tenga tipos TS nativos.
- Cualquier migration nueva debe incluir criterio de rollback o nota de irreversibilidad.

## Relacionado

- [[Revision Base de Datos Supabase 2026-04-14]]
- [[ADR-007 - Baseline DB para Monorepo]]



## Implementacion 2026-04-14

Implementado en [[Implementacion Punto 1 - Congelar DB Supabase]].

Fuente unica activa: packages/database/supabase/migrations.

Las carpetas legacy plotify/supabase/migrations y plotify_chat/supabase/migrations fueron eliminadas despues de validar el baseline con Supabase CLI. Desde este punto, cualquier migracion nueva debe ir solo en la carpeta canonica.