---
aliases:
- ADR-001
- Adoptar Monorepo pnpm
date: 2026-04-14
status: accepted
tags:
- adr
- arquitectura
- monorepo
title: ADR-001 - Adoptar Monorepo pnpm
---
# ADR-001 - Adoptar Monorepo pnpm

## Status

Accepted

## Context

Plotify vive hoy como repos/carpetas hermanas:

- `plotify/`: Next.js.
- `plotify_chat/`: FastAPI, LangGraph, Telegram, documentos.
- `plotify_memori/`: Obsidian como memoria central.

Ambas apps comparten Supabase, contratos de datos, flujos de documentos y decisiones de producto. El drift de migraciones y contratos ya esta generando riesgo.

## Decision

Adoptar monorepo con pnpm workspaces despues de estabilizar migraciones y contratos.

Estructura objetivo:

```text
apps/web              Next.js
apps/api              FastAPI/LangGraph Python
packages/database     Supabase migrations, seeds, tipos generados
packages/ui           UI compartida si aplica
packages/contracts    OpenAPI y clientes generados
plotify_memori        Obsidian como cerebro documental
```

## Alternatives Considered

### Mantener repos separados

Pros:

- Menos trabajo inmediato.
- Deploy separado natural.

Cons:

- Mantiene drift de migraciones.
- Dificulta contratos compartidos.
- Aumenta costo de contexto para agentes y desarrolladores.

Rejected: para el cierre del producto, el costo de coordinacion ya supera el beneficio.

### Migrar todo a TypeScript

Pros:

- Un solo lenguaje.
- Tipos compartidos mas simples.

Cons:

- Reescribir LangGraph/documentos/Telegram ahora retrasa el piloto.
- Python ya tiene tests y librerias maduras para PDF/DOCX.

Rejected para V1. Puede reevaluarse despues del piloto.

## Consequences

- pnpm sera el package manager JS.
- Python se mantiene para `apps/api`.
- Supabase se centraliza en `packages/database`.
- La migracion a monorepo debe ocurrir despues del baseline DB.
- Railway puede desplegar web y api desde el mismo repo con servicios separados.

## Relacionado

- [[Hoja de Ruta - Cierre Plotify Piloto Clientes]]
- [[ADR-008 - Mantener LangGraph en Python para V1]]
