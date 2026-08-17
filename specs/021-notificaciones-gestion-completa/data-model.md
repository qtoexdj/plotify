# Data Model: Gestión completa de notificaciones

**Fecha**: 2026-08-14 | **Feature**: `021-notificaciones-gestion-completa`

## Entidad: `notification_events` (existente — sin cambios de esquema)

Representa una entrega/aviso dirigido a un destinatario para una solicitud de aprobación. La única columna que cambia de uso es `dismissed_at` (huérfana → operativa).

| Columna            | Tipo                                               | Uso en este SDD                                                            |
| ------------------ | -------------------------------------------------- | -------------------------------------------------------------------------- |
| `id`               | uuid PK                                            | Identificador del ítem (dismiss, mark-read).                               |
| `approval_id`      | uuid FK → `approval_requests` (ON DELETE CASCADE)  | Origen; su `status` determina el copy y `can_decide`.                      |
| `organization_id`  | uuid FK → `organizations`                          | Tenant; el scope se valida contra la fila persistida.                      |
| `recipient_id`     | uuid FK → `profiles`                               | Destinatario; `vendor`/`user` solo operan sobre filas propias.             |
| `recipient_role`   | varchar(50) CHECK ('admin','vendor')               | Scope admin (org-wide) vs propio.                                          |
| `read_at`          | timestamptz NULL                                   | Escrita por mark-read individual y read-all.                               |
| `dismissed_at`     | timestamptz NULL                                   | **NUEVA operación**: escrita por dismiss; filtra el listado y los conteos. |
| `delivery_channel` | varchar(50) CHECK ('web','telegram')               | Sin cambios.                                                               |
| `delivery_status`  | varchar(50) CHECK ('pending','delivered','failed') | Sin cambios.                                                               |
| `failed_reason`    | text NULL                                          | Sin cambios.                                                               |
| `created_at`       | timestamptz NOT NULL DEFAULT now()                 | Orden (desc) y agrupación temporal.                                        |
| `updated_at`       | timestamptz NOT NULL                               | Trigger `handle_update_timestamp`.                                         |

**Índices relevantes**: `idx_notification_events_recipient (recipient_id)`, `idx_notification_events_org_role (organization_id, recipient_role)`, `idx_notification_events_unread (recipient_id) WHERE read_at IS NULL`. Suficientes para las consultas del SDD (≤ 100 filas activas por usuario).

**RLS** (sin cambios): admin → `is_org_admin(organization_id)` (SELECT/ALL); vendor → `recipient_id = (select auth.uid())` (SELECT/UPDATE). El endpoint usa service client y aplica el scope en capa de aplicación.

## Estados del ítem (matriz de visibilidad)

| `read_at` | `dismissed_at` | Listado principal     | Conteos                | Acciones                                            |
| --------- | -------------- | --------------------- | ---------------------- | --------------------------------------------------- |
| NULL      | NULL           | ✅ visible (no leída) | pending/unread ✅      | marcar leído, descartar, (decidir si admin+pending) |
| set       | NULL           | ✅ visible (leída)    | solo estados, unread ✗ | descartar                                           |
| NULL      | set            | ❌ oculta             | ❌ excluida            | ninguna (fuera de listado)                          |
| set       | set            | ❌ oculta             | ❌ excluida            | ninguna                                             |

## Transiciones de estado

- **Descarte (FR-002, suave)**: `dismissed_at: NULL → now()`, idempotente (si ya set, no se reescribe). No toca `approval_requests` (FR-004: la solicitud sigue decidible por Telegram/mesa).
- **Lectura masiva (FR-008)**: `read_at: NULL → now()` sobre todas las filas del scope con `read_at IS NULL AND dismissed_at IS NULL`, en UNA operación; retorna `updated_count`.
- **Decisión** (sin cambios): solo admin+pending vía `decideNotificationApproval` → `approve_sale`/`reject_sale` RPC + job ARQ de notificaciones.

## Entidad relacionada: `approval_requests` (existente, sin cambios)

`status` CHECK ('pending','approved','rejected'), `request_type` CHECK ('reservation','sale'), `resolved_at`, `payload` (cliente, etc.). El copy del ítem se deriva de `status` + `request_type` + `escritura_cases`/`escritura_matrices` (para ventas aprobadas: mesa del borrador vs matriz del proyecto).
