---
title: Operacion Escrituras Variables
date: 2026-06-05
status: operativo SDD 007
tags:
  - guia
  - operaciones
  - escrituras
  - legal
related:
  - "[[Generador de Escrituras de Compraventa]]"
  - "[[SDD 007 Escrituras Variable Resolution]]"
  - "[[SDD 008 Creador de Matriz - Handoff]]"
---

# Operacion Escrituras Variables

Esta guia define como operar el flujo productivo de variables legales de SDD
007: documentos fuente, extraccion, evidencia, revision, roles SII y readiness
de caso de escritura.

## Principios operativos

- No borrar documentos legales ni evidencia historica que ya haya alimentado un
  snapshot de caso de escritura.
- Un documento reemplazado se marca como `superseded`; la nueva version crea sus
  propias propuestas y evidencia.
- Un reintento debe crear un nuevo `document_ingestion_jobs.attempt_number`, no
  reutilizar silenciosamente intentos anteriores.
- Variables equivocadas se corrigen en Centro de Control Legal. SDD 008 consume
  snapshots y no corrige OCR ni propuestas vivas.
- Toda operacion debe preservar tenant scope por `organization_id`, `project_id`
  y, cuando aplica, `lot_id`.

## Estados a monitorear

| Superficie | Estado esperado | Accion |
| --- | --- | --- |
| `legal_documents.extraction_status` | `queued`, `processing`, `text_extracted`, `variables_proposed`, `needs_review`, `failed`, `superseded` | Identificar avance o bloqueo por documento. |
| `document_ingestion_jobs.status` | `queued`, `processing`, `text_extracted`, `variables_proposed`, `failed`, `cancelled` | Revisar intentos y errores por job. |
| `variable_resolutions.state` | `missing`, `proposed`, `resolved`, `approved`, `manual_review`, `conflict`, `derived`, `not_applicable`, `superseded` | Determinar si readiness bloquea o requiere revision. |
| `lot_legal_data.matching_status` | `matched`, `ambiguous`, `missing`, `manual_override` | Revisar asignacion SII por lote. |
| `escritura_cases.readiness_status` | `blocked`, `needs_review`, `ready` | Decidir si se puede crear o usar snapshot preliminar. |

## Reintento de extraccion fallida

1. Confirmar que el documento pertenece al proyecto y organizacion esperados.
2. Verificar que `legal_documents.extraction_status` sea `failed` o
   `needs_review`.
3. Revisar el ultimo `document_ingestion_jobs.error_code` y `error_message`.
4. Encolar retry mediante el endpoint o tarea operacional cuando este expuesto.
5. Confirmar que se crea un nuevo job con `attempt_number` incrementado.
6. Confirmar que el documento vuelve a `queued` y luego avanza a
   `text_extracted`, `variables_proposed` o `needs_review`.

No forzar reintentos cuando el documento ya esta `queued` o `processing`; eso
duplica trabajo y puede crear propuestas competidoras.

## Superseding documental

Cuando el usuario reemplaza dominio vigente, certificado SII, SAG, plano u otro
documento legal:

1. Subir el nuevo archivo al bucket `project-files`.
2. Registrar una nueva fila `legal_documents` con `version_number` mayor para el
   mismo `project_id` y `document_type`.
3. Marcar versiones activas anteriores como `superseded` y guardar
   `superseded_by`.
4. Crear un nuevo `document_ingestion_jobs` para la nueva version.
5. Mantener la evidencia anterior para snapshots ya creados.
6. En Centro de Control Legal, revisar conflictos entre la version nueva y
   valores aprobados anteriores antes de generar un nuevo caso.

Superseding no es rollback. Es una nueva fuente documental que debe volver a
resolver variables.

## Rollback operativo

Si una nueva version documental fue subida por error:

1. No borrar inmediatamente la version nueva.
2. Marcar o documentar la version nueva como no confiable mediante revision
   legal o decision administrativa.
3. Subir nuevamente la version correcta, aunque sea el mismo archivo anterior,
   para crear una nueva version activa trazable.
4. Reprocesar extraccion y resolver conflictos en Centro de Control Legal.
5. Crear un nuevo `escritura_case` o refrescar el snapshot antes de que SDD 008
   consuma los datos.

Evitar reactivar manualmente una version `superseded` sin migracion o decision
auditada; rompe la historia de evidencia.

## Inspeccion de evidencia

Para revisar una variable:

1. Abrir Centro de Control Legal y filtrar por estado `manual_review`,
   `conflict` o `missing`.
2. Seleccionar la variable y revisar `document_evidence` asociado.
3. Confirmar documento, pagina/logical page, snippet, confidence y hash.
4. Si el valor esta correcto, aprobar o resolver segun corresponda.
5. Si el valor esta mal, corregir con razon explicita y mantener evidencia o
   declarar fuente manual.
6. Si falta evidencia, dejar `manual_review` o `missing`; no aprobar sin respaldo
   legal o decision humana trazable.

Las URLs de evidencia deben entregarse como `source_url` materializadas por el
backend/proxy. La UI no debe derivar enlaces publicos desde `storage_path`.

## Observabilidad esperada

Los logs estructurados deben permitir correlacionar:

- `legal_document_registered`
- `legal_document_previous_versions_superseded`
- `legal_document_retry_queued`
- `legal_document_ingestion_started`
- `legal_document_ingestion_completed`
- `legal_variable_proposals_persisted`
- `legal_variable_review_decision_persisted`
- `escritura_readiness_calculated`
- `escritura_case_snapshot_persisted`

Los logs no deben incluir snippets completos, texto OCR bruto, RUTs, precios ni
datos personales sensibles. Usar ids, estados, conteos y nombres de gate.

## Cierre antes de SDD 008

Antes de iniciar o refrescar el creador de matriz:

1. `escritura_cases.variable_snapshot` existe.
2. `escritura_cases.evidence_snapshot` existe.
3. `readiness_gates` explica blockers o queda `ready`.
4. Roles SII por lote estan `matched` o `manual_override`.
5. La advertencia de revision legal y gate de abogado/redactor siguen visibles.

Si una variable esta mal en SDD 008, volver a SDD 007, corregir en Centro de
Control Legal y crear un nuevo snapshot.
