# Data Model: Matriz de Variables por Productor

**Feature**: 013-matriz-variables-ui · **Date**: 2026-06-30

**Sin cambios de esquema. Sin migración.** Este feature solo expone un dato derivado ya existente y deriva agrupaciones/conteos en el cliente.

## Cambio de contrato (único toque de backend)

### VariableResolutionResponse — campo nuevo `producer`

- **Tipo**: `string` (enum lógico abajo).
- **Origen**: `legal_variable_catalog.variable_producer(variable_key)` — ya implementado; hoy se usa en los bloqueadores pero no se serializa en el inventario.
- **Dónde**: `apps/api/schemas/legal_variables.py` (`VariableResolutionResponse`) + `apps/api/services/legal_variable_resolution.py` (`get_project_variable_inventory`, al mapear cada fila).
- **Compatibilidad**: aditivo y derivado → no rompe consumidores existentes.

### Enum lógico `producer`

| valor       | significado                                | acción en la UI                                                                         |
| ----------- | ------------------------------------------ | --------------------------------------------------------------------------------------- |
| `extracted` | la produce la extracción/agente            | revisar + aprobar (con evidencia)                                                       |
| `manual`    | la ingresa el operador (plano/CBR)         | ingresar / confirmar                                                                    |
| `authored`  | texto estándar con default de organización | informativo ("usa plantilla")                                                           |
| `sale_gap`  | la aporta la venta de cada lote            | informativo ("se completa en la venta"); al generar escritura se rellena desde la venta |
| `signing`   | dato de firma/notaría                      | no bloquea el molde                                                                     |

## Entidades (de presentación, derivadas — no persistidas)

### Variable (item del inventario)

Campos consumidos: `id`, `variable_key`, `variable_group`, `value_text|value_json`, `state`, `source_type`, `confidence`, `producer` (nuevo), `evidence[]`, `reviewed_by`, `reviewed_at`, `approval_required`, `correction_reason`.

### ProducerGroup (derivado en cliente)

Agrupa las variables por `producer`. Orden de presentación: `extracted` → `manual` → `authored` → `sale_gap`. `signing` se pliega bajo autoría/firma (no bloqueante).

### SiiLotGroup (colapso, derivado en cliente)

- **Regla**: filas con `variable_key ∈ {sii.unidad_nombre, sii.pre_rol_lote}` se agrupan por lote en una sola entrada "Roles SII · N lotes".
- **N** = número de lotes distintos representados.
- **Detalle**: lista por lote (unidad + pre-rol) con acceso al ajuste manual (FR-013) vía `legal-roles/[lotId]`.

### MoldeProgress (derivado en cliente)

- **porRevisar** = nº de variables con `producer ∈ {extracted, manual}` y `state ∉ {approved, derived, not_applicable}`, contando el `SiiLotGroup` colapsado como **1**.
- **listas** = nº de variables revisables en estado resuelto/aprobado.
- **moldeAprobable** = `porRevisar == 0`.
- **excluidas del conteo**: `sale_gap` y `signing` (informativas).

## Estados (sin cambios)

Se conservan los 9 estados del motor (`missing/proposed/resolved/approved/manual_review/conflict/derived/not_applicable/superseded`). En la UI se colapsan visualmente a 3 cubos —**Listo** (`approved/derived/not_applicable`), **Por revisar** (`proposed/manual_review/conflict/missing` de productores accionables), **No editable** (`sale_gap/signing`)— manteniendo el estado fino como detalle secundario. El backend no cambia.

## Scope principal y salida por venta

- **Proyecto (molde)**: inventario con `escritura_case_id = null`. Los `sale_gap` están ausentes → se muestran como "se completa en la venta" y no bloquean aprobación.
- **Venta/lote (salida automática)**: al aprobar una venta, el caso/documento del lote recibe `sale_gap` desde el snapshot/puente operacional. SDD 013 no exige una matriz editable por lote para cerrar el flujo; cualquier vista posterior debe ser lectura/trazabilidad con origen "desde la venta".
