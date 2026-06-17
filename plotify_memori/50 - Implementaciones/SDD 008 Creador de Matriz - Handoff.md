---
title: SDD 008 Creador de Matriz - Handoff
aliases:
  - SDD 008 Creador de Matriz
  - Creador de Matriz Escrituras
date: 2026-06-11
status: implementado
tags:
  - implementacion
  - sdd
  - documentos
  - escrituras
  - legal
  - ux
related:
  - "[[SDD 007 Escrituras Variable Resolution]]"
  - "[[SDD 010 Mesa de Escritura - Handoff]]"
  - "[[Generador de Escrituras de Compraventa]]"
  - "[[Variables Escritura Compraventa - Fuentes de Obtencion]]"
  - "[[ADR-009 - Generador de Escrituras como Minuta DOCX con Evidencia y Revision Legal]]"
---

# SDD 008 Creador de Matriz - Handoff

## Estado

Implementado en `specs/008-creador-matriz`. La matriz consume los contratos
cerrados de SDD 007/009, opera desde snapshots del caso de escritura y genera
minutas DOCX solo desde matrices aprobadas con warning legal aceptado.

La consolidacion del 2026-06-11 cerro el polish cross-cutting:

- Rutas MVP retiradas del build web: `/documentos/generar`,
  `/documentos/bloques` y el builder legacy
  `/documentos/plantillas/[templateId]/builder`.
- `document_engine.py` y `document_generator.py` marcados como deprecated y
  sin superficies web nuevas.
- Regresion tenant agregada para `escritura_templates`,
  `escritura_template_clauses`, `escritura_matrices` y
  `escritura_minuta_generations`.
- OpenAPI y cliente TypeScript regenerados desde FastAPI.
- Quickstart E2E Teno documentado en
  `specs/008-creador-matriz/quickstart.md`.

Verificaciones de cierre:

```bash
pnpm test:api          # 493 passed, 2 skipped
pnpm build:web         # OK
pnpm contracts:generate
pnpm typecheck:web     # OK
```

## Punto de partida

SDD 008 debe partir desde ambos contratos:

- `specs/007-escrituras-variable-resolution/handoff-sdd-008.md` (contrato base)
- `specs/009-titulo-dominio-vigente/handoff-sdd-008-addendum.md` (tokens de
  titulo, bloques narrativos, reglas de clausulas por alertas y lista de los 7
  entregables para cerrar la generacion de documentos)

Cambio de catalogo a tener presente: las claves `matriz.inscripcion_*` y
`matriz.adquisicion_*` ya no existen; todo template debe usar
`titulo.inscripciones[]` y los bloques `titulo.comparecencia_vendedor_texto` /
`titulo.clausula_primero_texto` aprobados. La clausula SEXTO (servidumbre)
renderiza sus referencias registrales desde `titulo.inscripciones[]`.

La consolidacion UX legal por caso quedo implementada tecnicamente en
[[SDD 010 Mesa de Escritura - Handoff]]. El siguiente pendiente de producto es
el rediseno completo del Centro de Control Legal y la matriz del proyecto en
SDD 011.

## Regla de arquitectura

El creador de matriz no resuelve variables desde documentos fuente. Consume:

- `escritura_cases.variable_snapshot`
- `escritura_cases.evidence_snapshot`
- `escritura_cases.readiness_gates`
- catalogo canonico de variables
- decisiones de revision legal

Si una variable esta mal, el usuario vuelve al Centro de Control Legal del SDD
007, corrige la variable y crea un nuevo snapshot.

## Alcance implementado

- Interfaz profesional nueva de matriz/minuta DOCX, construida desde cero.
- Bloques y clausulas versionadas.
- Tokens de variables estructurados.
- Insercion de variables aprobadas.
- Reordenamiento de clausulas permitido.
- Vistas de template, resuelto y evidencia.
- Generacion DOCX desde snapshot aprobado.
- Flujo de revision juridica antes de uso externo.

## Handoff de consolidacion UX legal

SDD 010 ya reemplazo la cabina de matriz por la mesa de escritura. Lo que queda
para SDD 011 y posteriores es unir las superficies legales en una sola ruta
operativa por proyecto/lote:

- Desde el Centro de Control Legal, mostrar el caso de escritura activo y un
  CTA directo a `/documentos/matriz/[caseId]`.
- Reemplazar botones deshabilitados de "Documento legal desde caso" por enlaces
  al caso real cuando el frontend tenga `escritura_case_id` en el contexto del
  lote.
- Unificar estados visibles: readiness gates, titulo aprobado, matriz draft /
  pending / approved, snapshot stale y ultima generacion DOCX.
- Mantener la regla snapshot-only: cualquier correccion de datos vuelve al CCL;
  la matriz solo re-renderiza desde el snapshot vigente.

## No alcance

- OCR.
- Extraccion de dominio vigente, SII, SAG o plano.
- Matching de roles por lote.
- Correccion/aprobacion de variables extraidas.
- Aprobacion juridica implicita por IA.
- Generacion de sellos, CVE, repertorio final o certificaciones de notaria/CBR.

## Relacion con SDD 007

La visualizacion, correccion y aprobacion de variables extraidas vive en el
Centro de Control Legal del SDD 007. SDD 008 puede mostrar valores, estado y
evidencia dentro de la matriz, pero consume snapshots y no debe mutar
`variable_resolutions` directamente.

Si en la matriz se detecta un dato malo, se vuelve al SDD 007, se corrige la
variable y se crea un nuevo snapshot del caso de escritura.

## Decision tecnica principal del SDD 008

ProseMirror JSON quedo como fuente canonica de clausulas y matriz. El export
DOCX es server-side, deterministico y pasa por `matriz_token_resolution` y
`matriz_docx_renderer`; no hay HTML/Jinja nuevo para escrituras.
