# Contrato: acción de revisión jurídica del caso

**Relacionado**: FR-007, FR-008, US1. Archivos: `apps/api/api/v1/endpoints/escritura_matrices.py`, mesa (`apps/web/src/components/documents/mesa/`).

## Endpoint nuevo

```
POST /api/v1/escritura-matrices/case/{caseId}/legal-review?organization_id={org}
```

**Auth**: rol admin/abogado de la organización (validar server-side con RPC `is_org_admin`; nunca confiar en el frontend — Principio V).

**Request body**:

```json
{ "decision": "aprobada" | "rechazada", "comentario": "string opcional (obligatorio si rechazada)" }
```

**Efecto (decision = aprobada)**:

- Escribe como resolución `legal_review` scope lote del caso:
  - `revision_juridica.estado = "aprobada"`
  - `revision_juridica.aprobada_por = <user_id>`
  - `revision_juridica.aprobada_at = now()`
- Audita en `legal_review_decisions` (reusar `_insert_legal_review_decision`, `legal_variable_resolution.py:1788`).
- Refresca el snapshot del caso (`create_escritura_case_snapshot(stage_operational=False)`) para que `legal_review_ready` pase a `ready`.

**Efecto (decision = rechazada)**:

- Registra el rechazo + comentario, deja `revision_juridica.estado = "rechazada"`, el caso NO avanza a `ready_for_minuta`.

**Response**: `MatrizCaseResponse` (o el DTO del caso) con los gates refrescados.

## Ruta proxy web

`apps/web/src/app/api/escritura-matrices/case/[caseId]/legal-review/route.ts` — inyecta `reviewed_by` del usuario autenticado, valida rol, reenvía al backend.

## UI (mesa)

- El caso muestra "Esperando revisión jurídica" como paso visible (no como variable críptica faltante).
- Botón "Aprobar revisión jurídica" (solo admin/abogado) + acción secundaria "Rechazar" con campo de comentario.
- Tras aprobar, el estado del caso pasa a "Listo para generar".

## Prerrequisito de datos

`documento.abogado_redactor.nombre/rut` deben existir como default de organización (ver contrato `organizacion-config.md`); se pueblan al aprobar el molde o desde Configuración.

## Test (obligatorio)

- Caso con datos de venta poblados y molde aprobado → `legal_review_ready` = blocked.
- POST legal-review aprobada → gate pasa a ready, caso a `ready_for_minuta`.
- POST con rol vendedor → 403.
