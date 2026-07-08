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

## 2. Política de revisión — Server Action (patrón casa, no OpenAPI)

La configuración de organización de SDD016 vive en Server Actions de Next
(`apps/web/src/app/(dashboard)/settings/actions.ts`) que escriben directo a
Supabase con chequeo de membresía admin (`organization_members`) — se sigue el
mismo patrón: `updateEscrituraReviewPolicyAction(orgId, policy)`.

- **Valida**: rol admin del solicitante en la org; `policy ∈ {'every_sale','exceptions_only'}`.
- **Escribe**: `organizations.escritura_review_policy`.
- **Audita**: `logAudit` (`apps/web/src/lib/services/audit.service.ts` → tabla `audit_logs`) con valor anterior → nuevo (Principio V).
- El microservicio (cascada) solo LEE la columna al correr; aplica a ventas posteriores (FR-003).

## 3. Warning legal del proyecto — Server Action (patrón casa, no OpenAPI)

`acknowledgeMinutaWarningAction(projectId)`:

- **Valida**: rol admin; si el proyecto ya tiene confirmación vigente, responde la existente sin sobre-escribir (idempotente, FR-009).
- **Escribe**: `projects.minuta_warning_acknowledged_by/_at`.
- **Audita**: `logAudit` con el evento de confirmación.
- FastAPI la consume en `generate_case_minuta` (exige el amparo y lo copia a la generación).

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
