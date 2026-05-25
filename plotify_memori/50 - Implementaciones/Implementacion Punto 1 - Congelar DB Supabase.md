---
title: Implementacion Punto 1 - Congelar DB Supabase
date: 2026-04-14
status: done
tags: implementacion, db, supabase, migraciones, baseline
---
# Implementacion Punto 1 - Congelar DB Supabase

Punto 1 completado el 2026-04-14.


## Estado

Status: done.

El punto 1 quedo implementado como baseline reproducible para Supabase local.

Fuente canonica actual:
/Users/matiasburgos/Desktop/SaaS/antigravity/plotify/packages/database/supabase/migrations

Esto ejecuta las decisiones de [[ADR-002 - Supabase Migrations como Fuente Unica]] y [[ADR-007 - Baseline DB para Monorepo]].

Rutas antiguas eliminadas despues de validar resets limpios, antes del monorepo:
/Users/matiasburgos/Desktop/SaaS/antigravity/plotify/plotify/supabase/migrations
/Users/matiasburgos/Desktop/SaaS/antigravity/plotify/plotify_chat/supabase/migrations

Rutas legacy actuales que deben seguir sin archivos `.sql`:
/Users/matiasburgos/Desktop/SaaS/antigravity/plotify/apps/web/supabase/migrations
/Users/matiasburgos/Desktop/SaaS/antigravity/plotify/apps/api/supabase/migrations

Regla futura: toda migracion nueva va solo en packages/database/supabase/migrations.


## Archivos implementados

- packages/database/README.md
- packages/database/package.json
- packages/database/scripts/assert-canonical-migrations.mjs
- packages/database/supabase/.gitignore
- packages/database/supabase/config.toml
- packages/database/supabase/seed.sql
- packages/database/supabase/migrations/20260414000100_baseline_local_validated.sql
- packages/database/supabase/migrations/20260414000200_fix_security_definer_search_path.sql
- packages/database/supabase/migrations/20260414000300_add_missing_fk_indexes.sql

## Contenido del baseline

El baseline fue generado desde la DB local validada. Incluye schema publico, constraints, indices, funciones, triggers, RLS policies, grants y objetos necesarios para reconstruir el estado aceptado.

Incluye datos base deterministas de storage: buckets avatars, project-files y documents. El bucket documents queda privado, con limite 10 MB y MIME types PDF/DOCX.

No versiona datos reales o demo de negocio: proyectos, lotes, geometrias, leads, audit logs, documentos generados, conexiones MCP ni credenciales.


## Migraciones post-baseline

### 20260414000200_fix_security_definer_search_path.sql

Fija search_path en funciones SECURITY DEFINER reportadas por advisors: MCP, Telegram, reservas, notificaciones, seeds documentales y helpers de permisos.

### 20260414000300_add_missing_fk_indexes.sql

Agrega indices IF NOT EXISTS para FKs reportadas por advisors, especialmente documentos, MCP, orgs, vendors, leads, approvals y audit logs.

## Validacion realizada

Nota 2026-04-15: esta seccion describe la validacion historica del baseline.
No es el flujo operativo actual. El desarrollo local debe usar el stack Docker
compartido documentado en [[Infra Local Docker Compartida]] y no crear
contenedores `supabase_*_plotify`.

Guardrail agregado el 2026-04-15:

- `npm --prefix packages/database run verify:migrations`
- Verifica que existan las 3 migraciones baseline canonicas.
- Falla si reaparecen archivos `.sql` bajo `apps/web/supabase/migrations` o `apps/api/supabase/migrations`.
- No bloquea carpetas temporales del Supabase CLI, como `.temp` o `.branches`.

Ejecutado desde /Users/matiasburgos/Desktop/SaaS/antigravity/plotify/packages/database:

- supabase start
- supabase db reset --no-seed
- supabase db reset
- supabase migration list --local
- supabase db dump --local -f /tmp/plotify_post_reset.sql
- supabase db lint --local

Resultados:

- reset sin seed paso.
- reset con seed paso despues de reiniciar el stack CLI local.
- migration list muestra solo 3 migraciones canonicas.
- dump posterior generado en /tmp/plotify_post_reset.sql.
- db lint ya no reporta function_search_path_mutable.
- queda solo un warning no bloqueante: public.approve_reservation declara v_lot y no lo usa.


## Verificaciones funcionales del dump

Se confirmo en el dump posterior:

- Tablas core y agente.
- Tablas de documentos: document_blocks, document_templates, template_block_items, generated_documents.
- Tabla MCP: mcp_connections.
- Telegram: telegram_bots.
- Trigger de notificacion: trg_notify_stage_change.
- Indices para FKs criticas, incluyendo generated_documents y mcp_connections.
- Buckets storage: avatars, project-files y documents.

## Caveat de versionado

Nota historica: antes del monorepo, la raiz no era repo git y los repos detectados eran `plotify` y `plotify_chat`.

Actualizacion 2026-04-15: el workspace monorepo vive en la raiz con `apps/web`, `apps/api`, `packages/database` y `packages/contracts`. Los `.git` internos se conservaron para no destruir historial ni cambios locales; la consolidacion de Git raiz queda como decision operativa separada.

## Impacto para futuros cambios

- El punto 2 debe partir desde esta DB congelada.
- No inferir schema desde migraciones antiguas; ya fueron eliminadas.
- No recuperar datos reales desde el baseline.
- La generacion de tipos TypeScript queda para un punto posterior, cuando se decida donde versionar packages/database.
- Si aparece una nueva migracion, debe ir despues de 20260414000300 en la carpeta canonica.

## Relacionado

- [[Revision Base de Datos Supabase 2026-04-14]]
- [[Migraciones]]
- [[Schema General BD]]
- [[Tablas Documentos BD]]
- [[Tablas MCP]]
- [[Storage Buckets]]
- [[Politicas RLS]]
- [[Triggers de la DB]]
- [[Tipos TypeScript]]
