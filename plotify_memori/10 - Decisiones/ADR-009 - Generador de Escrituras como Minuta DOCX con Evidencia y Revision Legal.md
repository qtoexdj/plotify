---
title: ADR-009 - Generador de Escrituras como Minuta DOCX con Evidencia y Revision Legal
aliases:
  - ADR-009
  - Minuta DOCX con Evidencia
date: 2026-06-03
status: proposed
tags:
  - adr
  - documentos
  - escrituras
  - legal
related:
  - "[[Generador de Escrituras de Compraventa]]"
  - "[[SDD 006 Escrituras Lab - Minuta DOCX y Readiness]]"
  - "[[ADR-004 - Variables Documentales Canonicas Anidadas]]"
  - "[[Rol de Avaluo en Tramite - Fuentes SII]]"
---

# ADR-009 - Generador de Escrituras como Minuta DOCX con Evidencia y Revision Legal

## Status

Proposed.

## Context

El laboratorio de escrituras permitio reconstruir template, variables y fuentes
para escrituras de compraventa. La revision contra `COMPRAVENTA LOTE 29.docx`
mostro que el entregable esperado por Plotify no es el PDF final certificado,
sino una minuta Word/DOCX editable que sigue la estructura de una escritura
inscrita por el Conservador.

El sistema actual de documentos usa bloques/Jinja/PDF, pero el flujo de
escrituras requiere evidencia documental, variables editables, resolucion desde
documentos fuente y aprobacion juridica.

## Decision

Adoptar un generador productivo de escrituras basado en:

- Minuta DOCX como formato principal.
- Variables canonicas anidadas.
- Evidencia por variable: documento, pagina/chunk, confianza, estado y decision.
- Ingesta de documentos fuente con OCR/conversion/chunks.
- Readiness gates antes de generar o aprobar la minuta.
- Revision legal obligatoria antes de `minuta_approved`.

El PDF solo sera preview o copia interna. No se generaran CVE, sellos, repertorio
real, certificaciones finales ni elementos propios de notaria/CBR posterior al
otorgamiento.

## Consequences

- Se debe crear una feature SDD productiva separada del laboratorio.
- Se deben modelar `escritura_cases`, `document_ingestion_jobs`,
  `legal_documents`, `document_evidence`, `variable_resolutions`,
  `lot_legal_data`, `notarial_context` opcional y `legal_review_decisions`.
- `rol de avaluo en tramite` debe ser tratado como dato valido cuando existe
  respaldo SII.
- La estructura final del texto debe respetar el DOCX inscrito usado como
  ejemplo, especialmente las clausulas `CUARTO` y `QUINTO`.
- El abogado redactor/revisor es un gate de workflow, no necesariamente una
  clausula visible dentro del template.

## Alternatives Considered

### Generar PDF final

Rejected. Confunde la minuta de Plotify con capas finales de notaria y CBR.

### Usar solo template Jinja sin evidencia

Rejected. Las variables juridicas deben tener fuente y revision trazable.

### Tratar rol de avaluo en tramite como faltante

Rejected. Para primera transferencia de lotes de subdivision, el certificado SII
de roles/preroles permite individualizar el bien como rol de avaluo en tramite.

## Relacionado

- [[Generador de Escrituras de Compraventa]]
- [[SDD 006 Escrituras Lab - Minuta DOCX y Readiness]]
- [[Generacion de Documentos]]
- [[ADR-004 - Variables Documentales Canonicas Anidadas]]
- [[Rol de Avaluo en Tramite - Fuentes SII]]

