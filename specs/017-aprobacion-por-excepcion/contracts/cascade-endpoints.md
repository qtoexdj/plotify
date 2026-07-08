# Contracts: endpoints de la cascada (SDD017)

Principio IV: todos entran al OpenAPI de FastAPI y el frontend consume el cliente regenerado (`pnpm contracts:generate`). El tenant se infiere server-side del JWT + relaciones persistidas — `organization_id` nunca se confía del frontend en rutas administrativas.

## 1. `POST /api/v1/escritura-cases/{case_id}/retry-cascade`

Reintenta la cascada de un caso (gatillo `manual_retry`). Idempotente: sobre un caso ya completado responde el estado final sin efectos.

**Auth**: admin de la organización del caso.

**Response 200** (`CascadeRunResult`):

```json
{
  "run_id": "uuid",
  "outcome": "completed | exception | awaiting_review",
  "causes": [ { "kind": "...", "title": "...", "description": "...", "fix_url": "..." } ],
  "steps": [ { "step": "approve", "action": "skipped", "detail": "already approved" } ],
  "generation_id": "uuid | null",
  "created_at": "iso8601"
}
```

**Errores**: 404 caso fuera de la organización; 409 caso legacy sin corrida previa y matriz en flujo manual intermedio (usar el flujo manual o migrarlo con el primer retry — decidir en tasks).

## 2. `GET | PATCH /api/v1/organizations/{organization_id}/escritura-review-policy`

Lee/cambia la política de revisión jurídica.

**Auth**: GET miembro; PATCH solo admin.

**PATCH body**: `{ "policy": "every_sale" | "exceptions_only" }`

**Response 200**: `{ "policy": "...", "changed_by": "uuid", "changed_at": "iso8601" }`

El PATCH registra el cambio en la auditoría (valor anterior → nuevo). Aplica a ventas posteriores (FR-003).

## 3. `POST /api/v1/projects/{project_id}/minuta-warning-ack`

Confirma el aviso legal de borrador para el proyecto (una vez; FR-009).

**Auth**: admin. **Response 200**: `{ "acknowledged_by": "uuid", "acknowledged_at": "iso8601" }`. Repetir la llamada responde la confirmación vigente (idempotente, no la sobre-escribe).

## 4. Cambios en `MatrizCaseResponse` (existente)

Campos nuevos (aditivos, no breaking):

```json
{
  "cascade_status": "completed | exception | awaiting_review | legacy",
  "cascade_causes": [ /* blockers humanizados de la última corrida */ ],
  "cascade_last_run_at": "iso8601 | null",
  "approval_origin": "human | system"
}
```

La mesa decide su vista con `cascade_status` (reemplaza la lógica actual de `decideMesaVista` para casos con corridas; `legacy` conserva el comportamiento actual).

## 5. Notificación de excepción (Telegram, no HTTP)

Mensaje nuevo del canal de `escritura_delivery` (best-effort):

```text
⚠️ Escritura del Lote {N} necesita tu atención
{causa 1 título}
{causa 2 título}
→ {link a la mesa del caso}
```

Registrado como delivery con tipo `exception_notice` para trazabilidad (no reintenta solo; el retry de cascada re-notifica si vuelve a caer en excepción).
