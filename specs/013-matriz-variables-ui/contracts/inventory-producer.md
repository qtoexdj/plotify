# Contract: Inventario de variables con `producer`

**Feature**: 013-matriz-variables-ui · **Date**: 2026-06-30

Único cambio de contrato del feature. Todo lo demás reutiliza endpoints existentes sin modificarlos.

## Cambio: `GET /projects/{id}/legal-variables`

Cada item de `groups[*]` (tipo `VariableResolutionResponse`) gana un campo:

```diff
 {
   "id": "uuid",
   "variable_key": "vendedor.nombre",
   "variable_group": "vendedor",
   "value_text": "JUAN DE DIOS GALAZ ABARCA",
   "state": "proposed",
   "source_type": "document",
   "confidence": 0.98,
+  "producer": "extracted",
   "evidence": [ ... ]
 }
```

- `producer`: `"extracted" | "manual" | "authored" | "sale_gap" | "signing"` (siempre presente; el catálogo nunca devuelve `null`, default `extracted`).
- Derivado de `legal_variable_catalog.variable_producer(variable_key)` vía `computed_field` en `VariableResolutionResponse`; **aditivo** (no rompe consumidores).
- **Estado: implementado.** `pnpm contracts:generate` ya propagó el campo al cliente generado (`plotify-chat.generated.ts` → `VariableResolutionResponse.producer: string`) y al `plotify-chat.v1.json`. El frontend consume el **tipo generado** (Principio IV); el mirror manual `variable-resolution-types.ts` debe migrar a/alinear con el generado (ver tasks).

### Test de contrato
- `apps/api/tests/test_escrituras_variable_inventory.py`: cada grupo devuelve `producer` correcto (`vendedor → extracted`, `sag.plano_cbr_numero → manual`, `comprador.* → sale_gap`, `clausulas.* → authored`, `documento.* → signing`).

## Endpoints reutilizados (sin cambios)

| Acción en la UI | Endpoint existente |
|---|---|
| Aprobar / corregir / no aplica (1 variable) | `PATCH /projects/{id}/legal-variables/{variableId}` |
| Aprobar en bloque (grupo / claves) | `POST /projects/{id}/legal-variables/bulk-approve` |
| Ingresar dato manual por clave | `PUT /projects/{id}/legal-variables/by-key` |
| Detalle por lote + override manual de rol SII (FR-013) | `PATCH /projects/{id}/legal-roles/{lotId}` |
| Inventario del borrador de venta (scope lote) | `GET /projects/{id}/legal-variables?lot_id=...` (o el caso) |

**No se crean endpoints nuevos. No hay migración.**
