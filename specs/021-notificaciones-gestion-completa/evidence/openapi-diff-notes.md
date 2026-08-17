# Evidencia: diff OpenAPI incluye deuda previa de regeneración

**Fecha**: 2026-08-17 | **SDD**: 021-notificaciones-gestion-completa

## Hallazgo

`pnpm contracts:generate` (T007/T017) regeneró `packages/contracts/openapi/plotify-chat.v1.json` desde el código FastAPI actual. Además de los cambios intencionales del SDD 021 (`dismissNotification`, `markAllNotificationsRead`, `NotificationItem.dismissed_at`, `DismissResponse`, `BulkReadResponse`, query params `limit`/`offset`), el diff arrastra:

1. **`POST /api/v1/legal-documents/{legal_document_id}/ensure-ingestion`** (`ensure_legal_document_ingestion_api_v1_..._post`): endpoint ya presente en `apps/api/api/v1/endpoints/legal_variables.py:252` desde un cambio previo, pero cuyo contrato nunca se había regenerado (deuda preexistente a este SDD; el JSON de HEAD estaba desactualizado respecto al código).
2. Cambios de `tags` en operaciones existentes (reagrupación de routers FastAPI).

## Decisión

El contrato regenerado refleja el código real y no se revierte: corregir el desfase es lo correcto (Constitución IV: contratos tipados como fuente desde FastAPI/Pydantic). El JSON no se edita a mano. El criterio "diff acotado a los cambios del SDD" de T024 no era alcanzable sin dejar el contrato inconsistente con el código; se documenta aquí como aceptación explícita de la deuda arrastrada.

## Verificación

- `git diff HEAD -- packages/contracts/openapi/plotify-chat.v1.json` revisado: solo las 3 operaciones nuevas catalogadas arriba; el resto son cambios de formato/tags y schemas derivados.
- Cliente TS (`plotify-chat.generated.ts`) contiene `dismissNotification`, `markAllNotificationsRead`, `DismissResponse`, `BulkReadResponse`, `dismissed_at`.
- El fallo de `prettier --check` sobre el JSON es preexistente en HEAD (el generador usa `json.dumps(indent=2)`; no es regresión del SDD).
