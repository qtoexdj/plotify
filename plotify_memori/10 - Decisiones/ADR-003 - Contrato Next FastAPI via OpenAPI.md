---
aliases:
- ADR-003
- Contrato Next FastAPI via OpenAPI
date: 2026-04-14
status: accepted
tags:
- adr
- api
- fastapi
- nextjs
- contratos
title: ADR-003 - Contrato Next FastAPI via OpenAPI
---
# ADR-003 - Contrato Next FastAPI via OpenAPI

## Status

Accepted

## Context

Hay drift entre rutas frontend y backend, especialmente en documentos y Prompt Ops. FastAPI ya genera OpenAPI, por lo que el contrato puede formalizarse sin inventar otro sistema.

## Decision

Usar OpenAPI generado por FastAPI como contrato formal entre `apps/api` y `apps/web`.

El frontend debe consumir cliente/tipos generados desde OpenAPI para endpoints del microservicio.

## Alternatives Considered

### Cliente manual

Pros:

- Rapido al inicio.

Cons:

- Ya produjo rutas/metodos/respuestas inconsistentes.

Rejected.

### tRPC

Pros:

- Muy buen DX en TypeScript.

Cons:

- No encaja naturalmente con FastAPI Python.

Rejected para V1.

## Consequences

- Cambiar un endpoint requiere actualizar OpenAPI y regenerar cliente.
- Los errores 422 por payload incorrecto se detectan antes.
- Prompt Ops y documentos deben corregirse contra este contrato.

## Implementacion 2026-04-15

- Contrato versionado: `packages/contracts/openapi/plotify-chat.v1.json`.
- Tipos frontend generados: `plotify/src/lib/services/plotify-chat.generated.ts`.
- Script canonico: `cd plotify && npm run contracts:generate`.
- Endpoints con `operation_id` estable para cliente tipado: `previewDocument`, `generateDocument`, `requestReservationApproval`.

## Relacionado

- [[Riesgos y Brechas Tecnicas]]
- [[Backlog Implementable - Cierre Plotify]]
