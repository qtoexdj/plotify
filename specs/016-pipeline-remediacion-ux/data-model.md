# Data Model: cambios de esquema (Phase 1)

Todos los cambios son **aditivos** o de **seguridad** (revocaciones/privacidad). Ninguna columna se elimina ni se renombra. Una sola migración agrupa todo para minimizar pasos de despliegue.

**Archivo de migración**: `packages/database/supabase/migrations/20260706000100_pipeline_remediacion.sql`
(el timestamp exacto lo define el implementador según la fecha real; debe ser posterior a `20260701000100`).

**Regla (Principio III)**: migraciones solo en `packages/database/supabase/migrations`. Tras aplicar: `pnpm verify:migrations` + regenerar tipos DB (`packages/database/types/database.generated.ts`).

---

## §1 · `lot_records` — columnas nuevas (FR-003, FR-004)

```sql
ALTER TABLE public.lot_records
  ADD COLUMN IF NOT EXISTS cliente_nacionalidad text,
  ADD COLUMN IF NOT EXISTS cliente_region       text,
  ADD COLUMN IF NOT EXISTS cliente_comuna        text;
```

- Nullable, sin default. Se pueblan vía RPC de aprobación (§3).
- `notaria` y `fecha_firma` ya existen en los payloads de reserva/venta y representan "dónde/cuándo podría firmar el cliente". NO crear columnas nuevas para esos nombres: `lot_records` ya tiene `firma_lugar` y `firma_fecha`, que son las columnas canónicas para esa semántica. El RPC debe mapear `payload.notaria` → `firma_lugar` y `payload.fecha_firma` → `firma_fecha`.

**Verificar antes de escribir**: `select column_name from information_schema.columns where table_schema='public' and table_name='lot_records';` — no duplicar columnas existentes (`cliente_direccion`, `cliente_estado_civil`, `cliente_ocupacion`, `cliente_telefono`, `cliente_email`, `firma_estado`, `firma_fecha`, `firma_lugar` ya existen).

---

## §2 · Máquina de estados de `lots.estado` (FR-018)

No requiere columna nueva. Se implementa como **función de validación de transición** invocada por los caminos de mutación (reserva/venta/liberación), o como CHECK/trigger si se prefiere en DB. Transiciones válidas:

| Desde      | Hacia      | Camino                                      |
| ---------- | ---------- | ------------------------------------------- |
| disponible | reservado  | aprobar reserva                             |
| disponible | vendido    | aprobar venta directa                       |
| reservado  | vendido    | aprobar venta desde reserva                 |
| reservado  | disponible | liberar reserva (auditado)                  |
| vendido    | disponible | liberación explícita auditada (excepcional) |

Cualquier otra transición se rechaza. La implementación por defecto (R9) es server-side en la capa de servicio; si se opta por trigger, va en esta migración con su test.

---

## §3 · RPC `approve_sale` / `approve_reservation` — copiar campos nuevos (FR-004)

Reescribir ambas funciones (patrón de la migración `20260701000100_sale_approval_full_buyer_data.sql`) para incluir en el `INSERT ... ON CONFLICT (lot_id) DO UPDATE` los campos:
`cliente_nacionalidad`, `cliente_region`, `cliente_comuna`, `firma_lugar`, `firma_fecha`.

```sql
-- dentro del INSERT INTO public.lot_records (...):
cliente_nacionalidad, cliente_region, cliente_comuna, firma_lugar, firma_fecha
-- VALUES:
v_payload->>'cliente_nacionalidad', v_payload->>'cliente_region',
v_payload->>'cliente_comuna', v_payload->>'notaria',
(v_payload->>'fecha_firma')::date
-- ON CONFLICT DO UPDATE SET con COALESCE(EXCLUDED.x, lot_records.x)
```

**Cuidado**: mantener el `COALESCE` para no borrar datos existentes al re-aprobar. Conservar la validación `is_org_admin`/`auth.role()` intacta.

---

## §4 · Seguridad — revocar grants (FR-027)

```sql
REVOKE EXECUTE ON FUNCTION public.get_decrypted_bot_token(uuid)                    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_credential(text)                          FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_mcp_credentials(uuid, uuid, text)             FROM anon, authenticated;
```

- Verificar las firmas exactas antes (`\df` o `pg_proc`), porque el `REVOKE` debe coincidir en tipos de argumento.
- El backend las llama con service_role (que conserva el privilegio por ser owner/superuser-equivalente) → no hay regresión de funcionalidad.
- **HG-2** aprueba antes de aplicar.

---

## §5 · Seguridad — bucket privado (FR-028)

```sql
UPDATE storage.buckets SET public = false WHERE id = 'project-files';
```

- Requiere que TODO acceso a objetos de `project-files` pase a URLs firmadas (`create_signed_url`) en el backend/web. Revisar las policies de `storage.objects` para lectura autenticada por organización.
- Verificar en la tarea que ver/descargar documentos legales sigue funcionando (US6-AS3).
- **HG-2** aprueba.

---

## §6 · Entidades tocadas (sin cambio de esquema)

- **variable_resolutions**: se escribe `revision_juridica.estado/aprobada_por/aprobada_at` scope lote (source_type `legal_review`). Ya tiene `confidence NUMERIC (0–1)` usado como umbral del molde. Sin DDL.
- **escritura_cases.readiness_gates**: el JSONB sigue igual; cambia la **presentación** (gates heredados no se cuentan como pendientes). Sin DDL.
- **escritura_deliveries**: se insertan N filas (admin + vendedor). Sin DDL; ya tiene RLS por organización/vendedor.
- **escritura_matrices**: la aprobación colapsa submit+approve; el workflow de estados (`draft → legal_review_pending → approved`) no cambia en DB. Sin DDL.
- **organization_payment_info**: gana UI (§ no-DDL); su schema actual (razon_social, rut, banco, tipo_cuenta, numero_cuenta, email_transferencia) es suficiente.
- **telegram_bots / profiles.telegram_chat_id**: ganan UI de conexión. Sin DDL (ya existen).

---

## §7 · Orden de aplicación y rollback

1. `§1` columnas `lot_records` (seguro, aditivo).
2. `§3` RPCs (reescritura idempotente).
3. `§2` transición de estado (si se implementa en DB).
4. `§4`/`§5` seguridad — **solo tras HG-2**.

**Rollback**: las columnas nuevas se pueden dejar (aditivas, sin efecto si no se usan). El `REVOKE` se revierte con `GRANT EXECUTE ... TO ...` si algo se rompiera (no debería, el backend usa service_role). El bucket se revierte con `public = true`.

**Verify de la migración**: `pnpm verify:migrations` + regenerar tipos + `pnpm typecheck:web` + advisors sin ERROR nuevo (RLS/grants).
