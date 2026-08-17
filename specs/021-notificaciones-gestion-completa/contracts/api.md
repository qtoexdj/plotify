# Contracts: Gestión completa de notificaciones

Los contratos son generados por FastAPI (`pnpm contracts:generate` → `packages/contracts/openapi/plotify-chat.v1.json` + `apps/web/src/lib/services/plotify-chat.generated.ts`). Este directorio documenta los cambios intencionales del SDD; el JSON canónico nunca se edita a mano.

## `GET /api/v1/notifications/` — `listNotifications` (modificado)

Headers: `X-User-Id`, `X-Organization-Id` (obligatorios).

Query params **nuevos**:

| Param    | Tipo | Default | Regla |
| -------- | ---- | ------- | ----- |
| `limit`  | int  | 50      | 1..50 |
| `offset` | int  | 0       | >= 0  |

Comportamiento: filtra `dismissed_at IS NULL`; orden `created_at desc`; los `counts` son globales del scope (excluyen descartadas), no de la página.

`NotificationItem` (campos nuevos marcados):

```ts
{
  id: string
  approval_id: string
  request_type: 'reservation' | 'sale'
  status: string
  title: string | null // copy servidor
  message: string | null
  action_label: string | null
  deep_link: string | null // ruta dashboard (mesa/borrador/proyecto)
  flow_state_label: string | null
  flow_state_description: string | null
  project_name: string
  lot_label: string
  client_name: string
  vendor_name: string
  created_at: string
  decided_at: string | null
  can_decide: boolean // admin && status === 'pending'
  read_at: string | null
  dismissed_at: string | null // NUEVO (siempre null en listado principal)
}
```

`NotificationListResponse` = `{ items: NotificationItem[], counts: NotificationCounts }` (sin cambios de forma).

## `POST /api/v1/notifications/{notification_id}/dismiss` — `dismissNotification` (NUEVO)

Headers: `X-User-Id`.

| Código | Caso                                                                                                      |
| ------ | --------------------------------------------------------------------------------------------------------- |
| 200    | `DismissResponse { success: true, dismissed_at: ISO }`                                                    |
| 400    | UUID inválido                                                                                             |
| 403    | Fuera de scope (no-admin con `recipient_id` ajeno; admin fuera de filas `recipient_role=admin` de su org) |
| 404    | No existe                                                                                                 |

Idempotente: si ya está descartada, responde 200 con la marca existente (no reescribe).

## `POST /api/v1/notifications/read-all` — `markAllNotificationsRead` (NUEVO)

Headers: `X-User-Id`, `X-Organization-Id`.

| Código | Caso                                                   |
| ------ | ------------------------------------------------------ |
| 200    | `BulkReadResponse { success: true, updated_count: N }` |
| 403    | El usuario no es miembro de la org                     |

Actualiza en UNA operación todas las filas del scope con `read_at IS NULL AND dismissed_at IS NULL`.

## `POST /api/v1/notifications/{approval_id}/decide` — `decideNotificationApproval` (sin cambios)

## Errores

Mismos patrones existentes: `HTTPException(400)` con `detail`, respuesta de decisión con `code: 'already_processed'` para idempotencia.
