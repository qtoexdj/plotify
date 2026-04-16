---
title: ADR-007 - Baseline DB para Monorepo
date: 2026-04-14
tags:
  - adr
  - db
  - baseline
  - migraciones
status: accepted
---

# ADR-007 - Baseline DB para Monorepo

## Status

Accepted

## Context

No hay datos productivos criticos que impidan resetear o migrar. La DB local tiene estado avanzado y el repo no contiene todas las migraciones historicas exactas.

## Decision

Crear una migracion baseline limpia para arrancar el monorepo desde un estado conocido.

## Alternatives Considered

### Recuperar todas las migraciones historicas exactas

Pros:

- Mejor historia granular.

Cons:

- Mas lento.
- Puede perpetuar migraciones experimentales.
- No aporta tanto si no hay datos productivos criticos.

Rejected para el cierre inmediato.

### Seguir con drift actual

Pros:

- Cero trabajo inicial.

Cons:

- Entornos limpios no confiables.
- Bloquea CI y onboarding.

Rejected.

## Consequences

- La historia anterior queda documentada en Obsidian.
- El baseline debe reflejar solo el estado deseado, no todo experimento pasado.
- Desde el baseline en adelante, toda migracion debe ser incremental y versionada.

## Relacionado

- [[Revision Base de Datos Supabase 2026-04-14]]
- [[ADR-002 - Supabase Migrations como Fuente Unica]]



## Implementacion 2026-04-14

Implementado en [[Implementacion Punto 1 - Congelar DB Supabase]].

Resultado: baseline generado desde DB local validada, ubicado en packages/database/supabase/migrations/20260414000100_baseline_local_validated.sql. Se agregaron hardening de search_path e indices FK faltantes. Supabase db reset --no-seed y supabase db reset fueron validados desde packages/database.

Nota operativa: la raiz actual no es repo git; packages/database queda implementado en disco, pero falta decidir versionado raiz o ubicacion final dentro de un repo.