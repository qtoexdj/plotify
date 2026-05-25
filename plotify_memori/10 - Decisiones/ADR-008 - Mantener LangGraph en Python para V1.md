---
aliases:
- ADR-008
- Mantener LangGraph en Python para V1
date: 2026-04-14
status: accepted
tags:
- adr
- langgraph
- python
- ia
- documentos
title: ADR-008 - Mantener LangGraph en Python para V1
---
# ADR-008 - Mantener LangGraph en Python para V1

## Status

Accepted

## Context

El usuario pidio recomendacion entre mantener LangGraph en Python o migrarlo a TypeScript para alinear el monorepo. El backend actual en Python ya contiene:

- FastAPI.
- LangGraph.
- Telegram.
- Workers.
- Motor documental Jinja2.
- PDF/DOCX con librerias Python.
- Tests backend pasando con `./venv/bin/pytest -q`; `pytest.ini` configura `pythonpath = .`.

## Decision

Mantener LangGraph en Python para V1.

El monorepo no implica un solo lenguaje. Implica una sola unidad de producto, contratos compartidos y comandos reproducibles.

## Alternatives Considered

### Migrar LangGraph a TypeScript ahora

Pros:

- Un solo stack JS/TS.
- Tipos compartidos mas directos.

Cons:

- Alto costo de reescritura.
- Riesgo de romper Telegram/documentos.
- Retrasa piloto con clientes.

Rejected para V1.

### Mantener Python indefinidamente sin contrato formal

Pros:

- No se toca lo existente.

Cons:

- Sigue drift con frontend.

Rejected. Python se mantiene, pero con OpenAPI y contratos.

## Consequences

- `apps/api` tendra entorno Python propio.
- `apps/web` y paquetes JS usan pnpm.
- Contrato entre ambos se resuelve con OpenAPI.
- Reevaluar TypeScript despues del piloto, no antes.

## Relacionado

- [[ADR-001 - Adoptar Monorepo pnpm]]
- [[ADR-003 - Contrato Next FastAPI via OpenAPI]]
