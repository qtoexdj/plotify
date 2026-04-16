---
title: ADR-004 - Variables Documentales Canonicas Anidadas
date: 2026-04-14
tags:
  - adr
  - documentos
  - variables
  - contratos
status: accepted
---

# ADR-004 - Variables Documentales Canonicas Anidadas

## Status

Accepted

## Context

El sistema documental tiene tres modelos en conflicto:

- DB seeds con variables anidadas como `vendedor.nombre`.
- Backend con variables planas como `cliente_nombre`.
- Frontend con estructura tipo `EscrituraVariables`.

Esto puede hacer que el preview no coincida con el PDF/DOCX final.

## Decision

Adoptar variables anidadas canonicas.

Ejemplos:

```text
cliente.nombre_completo
cliente.rut
vendedor.nombre
proyecto.nombre
lote.numero
lote.deslindes.norte
servidumbre.superficie
matriz.nombre_predio
sag.certificado_numero
```

## Alternatives Considered

### Variables planas

Pros:

- Simples para Jinja inicial.

Cons:

- Escalan mal.
- Mezclan dominios.
- Dificultan UI de insercion de variables.

Rejected.

### Mantener ambos modelos

Pros:

- Menos migracion inmediata.

Cons:

- Mantiene ambiguedad.
- Multiplica bugs de preview/generacion.

Rejected como modelo permanente.

## Consequences

- Backend debe resolver un objeto anidado.
- Seeds deben usar nombres canonicos.
- Frontend debe mostrar variables agrupadas por dominio.
- Puede existir capa temporal de aliases durante migracion.

## Relacionado

- [[PRD - Cierre Plotify Piloto Clientes]]
- [[Generacion de Documentos]]
