# Contrato: entrega de la escritura al administrador por Telegram

**Relacionado**: FR-009, FR-010, US1. Archivos: `apps/api/api/v1/endpoints/escritura_matrices.py` (~1356, 1680), `apps/api/services/escritura_delivery.py`.

## Resolución de destinatarios

Al generar la minuta (`_generate_minuta_row`/trigger de entrega), resolver **todos** los destinatarios:

- **Admin(s) de la organización** — nuevo helper `_resolve_org_admin_user_ids(org)`: usuarios con rol admin en `organization_members` que tengan `profiles.telegram_chat_id`. **Siempre** se entrega al admin.
- **Vendedor de la venta** — `_resolve_case_vendor_user_id` (existente, `:1356`): solo si tiene Telegram vinculado.

Se genera **una fila `escritura_deliveries` por destinatario** (la tabla ya soporta N filas auditadas).

## Regla de estado (FR-010)

- `recipient_user_id` NUNCA nulo en una fila marcada `sent`.
- Si no hay destinatario resoluble → estado `unavailable` (cae a "mis documentos" web) + log de alerta. Nunca `sent` hacia nadie.

## Canales por destinatario

- **Telegram** (best-effort): `send_document` si el destinatario tiene `telegram_chat_id`.
- **Web** (siempre): enlace firmado con vencimiento (7 días, ya implementado) → visible en "mis documentos" del destinatario.

## HG-1 (confirmar con el usuario)

- ¿Vendedor recibe copia además del admin? (default propuesto: sí, si tiene Telegram).

## Test

- Generar minuta con admin que tiene `telegram_chat_id` → fila `sent` con `recipient_user_id` = admin, documento enviado.
- Vendedor sin Telegram → fila `unavailable` para el vendedor, NO `sent`.
- Ninguna fila `sent` con `recipient_user_id` nulo.
