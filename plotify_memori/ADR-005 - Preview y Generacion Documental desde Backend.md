---
title: ADR-005 - Preview y Generacion Documental desde Backend
date: 2026-04-14
tags:
  - adr
  - documentos
  - backend
  - preview
status: accepted
---

# ADR-005 - Preview y Generacion Documental desde Backend

## Status

Accepted

## Context

El preview local del frontend y el generador backend pueden divergir. Para documentos legales, esa diferencia es riesgosa porque el usuario podria aprobar algo que no coincide con el PDF/DOCX final.

## Decision

El backend sera la fuente canonica de preview y generacion.

Evaluacion pendiente:

- Usar preview backend siempre.
- O usar modo hibrido con cache local, siempre validando contra backend antes de aprobacion final.

Para V1, ningun documento final se aprueba sin render backend.

## Alternatives Considered

### Preview solo local

Pros:

- Rapido.
- Menor carga al backend.

Cons:

- Riesgo de divergencia legal.
- Duplica motor de variables.

Rejected para aprobacion final.

## Consequences

- El backend debe responder errores claros de variables faltantes.
- El frontend puede editar bloques, pero la renderizacion final la confirma FastAPI.
- La UX debe tolerar latencia con estados de carga claros.

## Relacionado

- [[ADR-004 - Variables Documentales Canonicas Anidadas]]
- [[PRD - Cierre Plotify Piloto Clientes]]
