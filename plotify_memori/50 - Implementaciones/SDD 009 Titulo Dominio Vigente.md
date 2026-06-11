---
title: SDD 009 Titulo Dominio Vigente
aliases:
  - SDD 009 Titulo
  - Resolucion de Titulo de Dominio Vigente
date: 2026-06-10
status: completado
tags:
  - implementacion
  - sdd
  - documentos
  - escrituras
  - legal
  - titulo
related:
  - "[[SDD 007 Escrituras Variable Resolution]]"
  - "[[SDD 008 Creador de Matriz - Handoff]]"
  - "[[Dominio Vigente Agent - direccion post-SDD 007]]"
---

# SDD 009 Titulo Dominio Vigente

## Resumen

SDD 009 reemplaza la extraccion regex de dominio vigente (SDD 007) por un
agente LLM (`titulo_agent_v1`) que resuelve el titulo de dominio a nivel
proyecto: clasifica la estructura (dominio unico, compra de derechos,
herencia, mixto), extrae la cadena de inscripciones con datos registrales,
propietarios actuales e identidad del predio, y genera los bloques narrativos
Comparecencia y Clausula PRIMERO.

Cada hecho extraido pasa por un verificador deterministico (snippet literal
contra `legal_document_pages` + consistencia valor-cita); lo no verificado se
degrada a `manual_review`, nunca a `proposed`. Las alertas tipificadas
(DL 3.516, derechos de aguas, vigente en el resto, multi-inmueble, gravamen,
personeria) bloquean la aprobacion hasta resolverse con auditoria. El caso
aprobado alimenta el gate `title_verified`, las variables `titulo.*` /
`vendedor.*` / identidad de matriz y los snapshots de casos de escritura que
consume SDD 008.

## Artefactos SDD

- `specs/009-titulo-dominio-vigente/spec.md`
- `specs/009-titulo-dominio-vigente/plan.md`
- `specs/009-titulo-dominio-vigente/agent-execution.md`
- `specs/009-titulo-dominio-vigente/research.md`
- `specs/009-titulo-dominio-vigente/data-model.md`
- `specs/009-titulo-dominio-vigente/contracts/`
- `specs/009-titulo-dominio-vigente/quickstart.md` (incluye runbook operativo)
- `specs/009-titulo-dominio-vigente/handoff-sdd-008-addendum.md`
- `specs/009-titulo-dominio-vigente/tasks.md`

## Decisiones incorporadas

- **No LLM en tests**: pytest corre solo sobre fixtures grabados. Las llamadas
  en vivo viven unicamente en `apps/api/scripts/titulo_live_eval.py` detras de
  `RUN_TITLE_LIVE_EVAL=1`.
- **El verificador es sagrado**: ninguna tarea puede debilitar la verificacion
  de evidencia para hacer pasar un test. Si el modelo falla verificacion, el
  resultado correcto es `manual_review`.
- **Feature flag con rollout limpio**: `LEGAL_TITLE_AGENT_ENABLED=false`
  produce corridas `llm_disabled` con entrada manual auditada. Las corridas
  `llm_disabled` (igual que `failed`) no satisfacen idempotencia, de modo que
  al activar el flag el siguiente analisis las supersede automaticamente.
- **Catalogo por supersede**: `matriz.inscripcion_*` / `matriz.adquisicion_*`
  se retiraron superseding filas existentes, nunca borrando. El path regex
  `dominio_vigente_rules_v1` fue eliminado.
- **Pureza de snapshot**: `escritura_cases.variable_snapshot` lleva solo
  valores de dominio aprobados (`titulo.*`, identidad matriz, `vendedor.*`),
  sin metadatos de parser/verificador.
- **Idempotencia por contenido**: cada corrida se identifica por
  `source_content_hash` + extractor + prompt version; reemplazar un documento
  de titulo supersede el analisis y re-encola automaticamente.

## Fases

| Fase | Entregable                                                       | Estado     |
| ---- | ---------------------------------------------------------------- | ---------- |
| 1    | Migracion `title_analyses`, catalogo `titulo.*`, fixtures Teno   | Completado |
| 2    | Schemas, router, orquestador, LLM client, verificador, worker    | Completado |
| 3    | US1: pipeline de analisis a nivel proyecto + retiro path regex   | Completado |
| 4    | US2: verificador de evidencia, bloques narrativos, staging       | Completado |
| 5    | US3: revision/edicion/aprobacion en Centro de Control Legal      | Completado |
| 6    | US4: alertas legales tipificadas con resolucion auditada         | Completado |
| 7    | US5: readiness `title_verified` y snapshot para SDD 008          | Completado |
| 8    | Polish: live eval, contratos, tests de rollout/tenant, handoff   | Completado |
| 9    | Correccion producto: cardinalidad multi-documento (FR-031..034)  | Completado |

## Corpus de prueba (Teno)

`apps/api/tests/fixtures/titulo/` contiene los dos titulos CBR Curico del caso
Teno (1996 y 2023), el golden de cadena (`teno_golden_chain.json`), los bloques
golden corregidos por abogado (`teno_golden_blocks.md`), una respuesta LLM
limpia que verifica 100% y una respuesta alucinada (fechas 2023, apellido
alterado) que la regresion exige degradar a `manual_review`.

La evaluacion en vivo se corre manualmente:

```bash
cd apps/api
RUN_TITLE_LIVE_EVAL=1 LEGAL_TITLE_AGENT_ENABLED=true \
  ./.venv/bin/python scripts/titulo_live_eval.py --report /tmp/titulo-eval.json
```

## Handoff a SDD 008

`specs/009-titulo-dominio-vigente/handoff-sdd-008-addendum.md` extiende el
handoff de SDD 007 con:

- tokens `titulo.*` disponibles en `variable_snapshot` (estructura,
  inscripciones repetibles, propietarios, comparecencia y clausula PRIMERO);
- bloques narrativos aprobados como texto efectivo (editado > generado);
- reglas de clausulas derivadas de alertas resueltas (`clause_added`).

SDD 008 sigue consumiendo solo snapshots aprobados; cualquier correccion de
titulo vuelve al panel de titulo del Centro de Control Legal.

## Correccion producto 2026-06-10

La prueba manual detecto que la ingesta SDD 007 supersedia por tipo de
documento y la pestania de documentos modelaba un slot unico, impidiendo subir
mas de un dominio vigente (FR-001 exige todos los dominios activos). Fase 9
incorporo cardinalidad por tipo: `dominio_vigente`, `personeria`,
`hipoteca_gravamen`, `plano_oficial` y `otro` son multi-documento activo
(agregar coexiste; reemplazar via `replaces_legal_document_id` supersede solo
al documento referenciado); los certificados SII/SAG, RNDA e instruccion de
pago mantienen reemplazo por tipo. La pestania de documentos lista los
documentos activos por tipo con agregar/reemplazar y suma la fila Personerias
(sin columna en `projects`).

## Estado final

SDD 009 completado (58/58 tareas, fases 1-9). El pipeline corre end-to-end con
LLM mockeado en CI; la precision en vivo se mide con el script de evaluacion
del corpus Teno antes de habilitar el flag por ambiente.

## Relacionado

- [[SDD 007 Escrituras Variable Resolution]]
- [[SDD 008 Creador de Matriz - Handoff]]
