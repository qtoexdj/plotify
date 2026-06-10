---
title: SDD 007 Escrituras Variable Resolution
aliases:
  - SDD 007 Escrituras Variables
  - Escrituras Variable Resolution
date: 2026-06-03
status: completado
tags:
  - implementacion
  - sdd
  - documentos
  - escrituras
  - legal
related:
  - "[[Generador de Escrituras de Compraventa]]"
  - "[[Plan Logica Productiva Generador Escrituras - Variables y Editor]]"
  - "[[Variables Escritura Compraventa - Fuentes de Obtencion]]"
  - "[[ADR-009 - Generador de Escrituras como Minuta DOCX con Evidencia y Revision Legal]]"
  - "[[SDD 006 Escrituras Lab - Minuta DOCX y Readiness]]"
  - "[[SDD 008 Creador de Matriz - Handoff]]"
  - "[[Rol de Avaluo en Tramite - Fuentes SII]]"
---

# SDD 007 Escrituras Variable Resolution

## Resumen

SDD 007 convierte el analisis del laboratorio de escrituras en un plan
productivo por fases para resolver variables legales con evidencia antes de
construir la minuta DOCX.

El foco inicial no es el constructor visual de minuta. El foco es:

1. Registrar documentos legales subidos en onboarding o en el proyecto.
2. Disparar extraccion automatica en segundo plano.
3. Extraer texto y proponer variables canonicas con evidencia.
4. Revisar, corregir y aprobar variables en el Centro de Control Legal.
5. Asociar roles SII y roles de avaluo en tramite a lotes.
6. Crear readiness y snapshot de caso de escritura por lote vendido.

## Artefactos SDD

- `specs/007-escrituras-variable-resolution/spec.md`
- `specs/007-escrituras-variable-resolution/plan.md`
- `specs/007-escrituras-variable-resolution/agent-execution.md`
- `specs/007-escrituras-variable-resolution/research.md`
- `specs/007-escrituras-variable-resolution/data-model.md`
- `specs/007-escrituras-variable-resolution/contracts/api-contracts.md`
- `specs/007-escrituras-variable-resolution/contracts/ui-contracts.md`
- `specs/007-escrituras-variable-resolution/handoff-sdd-008.md`
- `specs/007-escrituras-variable-resolution/quickstart.md`
- `specs/007-escrituras-variable-resolution/tasks.md`

## Decisiones incorporadas

- Onboarding solo sube archivos y arranca extraccion; no revisa variables.
- El Centro de Control Legal concentra revision, evidencia, brechas y aprobacion.
- El laboratorio 006 queda como insumo de conocimiento, no runtime productivo.
- `Rol de avaluo en tramite` es valido cuando tiene evidencia SII o aprobacion
  legal.
- El certificado de roles SII se extrae primero por regla deterministica:
  `numero de lote + rol/pre-rol + comuna`. Esa tupla alimenta el matching por
  lote y el texto `Rol de avaluo en tramite numero [rol] de la comuna de
  [comuna]`.
- La correccion real de certificados SII debe cubrir comuna y rol matriz de
  encabezado, filas con `LOTE`, `PARCELA ... LT`, prefijos de proyecto y PDFs
  escaneados con OCR. El rol matriz comun se propaga a cada lote del
  certificado cuando la evidencia lo respalda.
- La variable de abogado redactor/revisor es un gate de workflow antes de
  aprobacion externa.
- La minuta automatica debe mostrar advertencia de revision y aprobacion por
  abogado antes de usarse ante notaria o como instrumento final.

## Fases

| Fase | Entregable | Estado |
| --- | --- | --- |
| 1 | Migracion, tipos y catalogo de variables | Completado |
| 2 | Schemas, servicios y worker base | Completado |
| 3 | Registro de documentos legales desde onboarding/proyecto | Completado |
| 4 | Extraccion de variables y evidencia | Completado |
| 5 | Centro de Control Legal | Completado |
| 6 | Matching SII por lote | Completado |
| 7 | Readiness y casos de escritura | Completado |
| 8 | Contratos, documentacion, produccion y handoff SDD 008 | Completado |
| 9 | Correccion producto: extraccion deterministica de roles SII | Completado |
| 10 | Correccion producto: corpus real SII, OCR y UX de roles | Completado |
| 11 | Endurecimiento produccion: hallazgos senior de roles SII, certificados activos y OCR | Completado |
| 12 | Alineacion source-of-truth: project_legal_data para matriz/comun, lot_legal_data para por lote | Completado |

## Correccion producto 2026-06-05

La propuesta inicial de extraccion de roles quedaba demasiado generica. Para los
certificados SII usados en esta feature, el patron principal es simple:

```text
numero de lote + rol/pre-rol + comuna
```

Reglas incorporadas al SDD:

- El parser de certificado de roles debe intentar esa tupla antes de cualquier
  fallback LLM.
- El matching automatico de lotes se hace con el numero de lote normalizado.
- El rol y la comuna deben venir del mismo bloque/fila documental; si faltan o
  aparecen separados, el caso queda en `manual_review`, `ambiguous` o `missing`.
- El texto de minuta se deriva de la tupla: `Rol de avaluo en tramite numero
  [rol] de la comuna de [comuna]`.
- Rol matriz y roles de lote extraidos del certificado quedan como avaluo en
  tramite mientras no exista certificado SII definitivo o valor post-inscripcion
  aprobado.

## Correccion producto 2026-06-07

La revision de certificados reales agrego nuevos requisitos al SDD 007:

- Los certificados textuales pueden declarar `LA COMUNA` y `Rol(es)
  Matriz(ces)` en el encabezado; esos valores se deben asociar a las filas del
  mismo certificado/pagina con evidencia.
- Las filas reales no siempre empiezan con `LOTE`: pueden venir como `PROY.
  PARC... LOTE N [rol]`, `PARCELA X LT N ... [rol]` o `SAN JOSE LOTE N ...
  [rol]`.
- Los certificados escaneados con cero texto extraible requieren OCR. Si OCR no
  esta configurado o falla, el sistema debe marcar `ocr_required`/`needs_review`
  sin inventar roles.
- El Centro de Control Legal debe mostrar resumen del certificado, rol matriz,
  comuna, origen texto/OCR, filas extraidas, filas por revisar y evidencia por
  fila antes de permitir overrides manuales.

## Correccion produccion 2026-06-08

La revision senior de lo implementado en Phase 10 detecto bloqueos para producir:

- El matching automatico no puede mirar cualquier numero visible en
  `sii_unit_name`; debe usar solo `sii_lot_number_normalized`.
- Una fila SII extraida se puede consumir automaticamente por un solo lote. Si
  dos lotes compiten por la misma fila, el resultado queda en revision.
- Los certificados SII reemplazados quedan como evidencia historica, pero no
  participan en matching actual ni readiness.
- La comuna, solicitud y rol matriz pueden propagarse entre paginas solo cuando
  existe identidad documental/certificado y evidencia de encabezado.
- Varios roles matriz se preservan como lista y bloquean propagacion automatica
  si no se puede probar que aplican globalmente.
- El texto `Rol de avaluo en tramite numero [rol] de la comuna de [comuna]` lo
  deriva el backend desde rol/pre-rol y comuna aprobados; el cliente no es fuente
  de verdad para ese texto compuesto.
- OCR debe tener dependencias, timeout y clasificacion de error explicitos para
  evitar fallas silenciosas o datos inventados.

Estos puntos quedaron reflejados en `spec.md`, `plan.md`, `data-model.md`,
`contracts/api-contracts.md`, `research.md`, `quickstart.md` y `tasks.md` como
Phase 11 (T084-T096).

## Alineacion source-of-truth 2026-06-09

La revision de producto/senior establecio el split definitivo entre datos comunes
de proyecto/matriz y datos por lote:

- `project_legal_data` es la fuente autoritativa para valores SII comunes a todos
  los lotes del proyecto: `sii_comuna`, `sii_role_matrix`,
  `sii_roles_source_legal_document_id` y `sii_roles_status`. Migration:
  `20260608000100_align_sii_matriz_lot_source_of_truth.sql`.
- `lot_legal_data` es la fuente autoritativa para valores SII por lote,
  identificados por `lot_id`: `sii_pre_role`, `sii_unit_name`,
  `sii_lot_number_normalized`, `sii_role_in_process_text`, `matching_status`.
- Un certificado de roles SII activo implica `rol_en_tramite` para todos los
  lotes con fila extraida. Sin certificado activo, la readiness SII queda
  bloqueada salvo override manual auditado.
- La generacion de minuta y escritura case snapshots leen valores de dominio
  (`project_legal_data`, `lot_legal_data`), nunca metadatos de parser ni
  propuestas vivas de extraccion.
- `variable_resolutions` es el espacio de staging para revision/auditoria.
  `escritura_cases.variable_snapshot` es el snapshot inmutable para SDD 008.

Estos puntos quedaron reflejados en `data-model.md`, `contracts/api-contracts.md`,
`contracts/ui-contracts.md`, `quickstart.md` y `tasks.md` como Phase 12
(T097-T112).

## Handoff a SDD 008

El SDD 008 debe ser el `Creador de Matriz y Minuta DOCX`. Su punto de partida
sera `specs/007-escrituras-variable-resolution/handoff-sdd-008.md`.

Regla principal: el creador de matriz consume `variable_snapshot`,
`evidence_snapshot` y `readiness_gates` del caso de escritura. No debe leer OCR
bruto ni propuestas vivas de extraccion.

SDD 008 debe ocuparse de:

- Interfaz nueva de matriz construida desde cero con ProseKit + dnd-kit.
- Bloques/clausulas versionadas.
- Tokens de variables estructurados.
- Reordenamiento de clausulas permitido.
- Preview por template/resuelto/evidencia.
- Generacion DOCX desde snapshot aprobado.

Si una variable esta mal, el usuario vuelve al Centro de Control Legal del SDD
007, corrige y crea un nuevo snapshot.

La visualizacion, correccion y aprobacion de variables extraidas queda en SDD
007. SDD 008 solo muestra/inserta variables desde snapshots aprobados.

## Protocolo de agentes

El SDD 007 queda alineado con GitHub Spec Kit como flujo base:
`specify -> plan -> tasks -> implement`.

Ademas se agrega `agent-execution.md` como capa operativa propia de Plotify para
agentes y subagentes. Ese documento define:

- contexto obligatorio antes de tocar codigo;
- roles por tipo de trabajo;
- limites de archivos y lineas por tarea;
- reglas de paralelizacion;
- gates de revision;
- formato de handoff;
- condiciones de detencion.

Las reglas globales `.agents/rules/sdd-implementation.md`,
`.agents/rules/plotify-rules.md` y `.agents/rules/plotify-chat.md` deben apuntar
a SDD 007 mientras esta feature este activa.

## Estado final

SDD 007 esta completado (112/112 tareas). Todas las fases de implementacion,
correccion de producto y endurecimiento de produccion estan cerradas.

El proximo paso es iniciar SDD 008 desde
`specs/007-escrituras-variable-resolution/handoff-sdd-008.md`. SDD 008 consume
`escritura_cases.variable_snapshot`, readiness gates y variable catalog de SDD 007
para construir el Creador de Matriz y Minuta DOCX.

## Relacionado

- [[Variables Escritura Compraventa - Fuentes de Obtencion]]
- [[Plan Logica Productiva Generador Escrituras - Variables y Editor]]
- [[Generador de Escrituras de Compraventa]]
- [[ADR-009 - Generador de Escrituras como Minuta DOCX con Evidencia y Revision Legal]]
- [[SDD 008 Creador de Matriz - Handoff]]
