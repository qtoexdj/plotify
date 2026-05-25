---
aliases:
- ADR-006
- Service Role con Validacion Tenant Explicita
date: 2026-04-14
status: accepted
tags:
- adr
- seguridad
- supabase
- tenant
title: ADR-006 - Service Role con Validacion Tenant Explicita
---
# ADR-006 - Service Role con Validacion Tenant Explicita

## Status

Accepted

## Context

El microservicio usa `SUPABASE_SERVICE_ROLE_KEY`, lo que bypassea RLS. Si un endpoint confia en `organization_id` enviado desde frontend, existe riesgo cross-tenant.

## Decision

Todo endpoint FastAPI que use service role debe validar tenant en backend.

Regla:

- No confiar en `organization_id` enviado por frontend.
- Derivar organizacion desde recursos como `lot_id`, `template_id`, `project_id` y usuario autenticado.
- Validar que el usuario tiene permiso sobre esa organizacion antes de leer/escribir.

## Alternatives Considered

### Confiar en Next.js como proxy seguro

Pros:

- Menos consultas backend.

Cons:

- Un bug en Next.js expone datos entre tenants.
- Service role elimina proteccion RLS.

Rejected.

## Consequences

- Endpoints pueden necesitar consultas extra.
- Tests deben cubrir intentos cross-tenant.
- `organization_id` en payload puede existir solo como dato auxiliar, no como autoridad.

## Implementacion 2026-04-15

- `plotify_chat/api/deps.py` centraliza `get_lot_organization_id` y `require_lot_organization`.
- `documents/preview`, `documents/generate` y `approvals/request-reservation` validan `organization_id` contra el tenant real del lote.
- Tests backend cubren rechazo 403 ante `organization_id` cruzado.

## Relacionado

- [[Riesgos y Brechas Tecnicas]]
- [[Seguridad Backend]]
