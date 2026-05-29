# Telegram Command Contracts

## Supported Commands

- `/pendientes`: list role-scoped pending approval requests.
- `/aprobadas`: list recent role-scoped approved requests.
- `/rechazadas`: list recent role-scoped rejected requests.
- `/docs`: return approved vendor-facing documentation/help shortcuts.

## Actor Resolution

Every command resolves the Telegram sender into an application actor before
returning protected data.

```json
{
  "telegram_chat_id": "123456",
  "organization_id": "org-id",
  "role": "vendor",
  "profile_id": "profile-id",
  "vendor_id": "vendor-id",
  "is_authorized": true
}
```

## `/pendientes` Response: Admin

The admin receives pending organization approvals with decision actions.

```text
Pendientes de aprobación

1. Reserva · Proyecto Los Castaños · Lote 12
Cliente: María Pérez
Vendedor: Juan Vendedor
Monto: $500.000
```

Inline actions may be attached for each item when the actor is an authorized
admin.

## `/pendientes` Response: Vendor

The vendor receives only their own pending requests and no decision actions.

```text
Tus solicitudes pendientes

1. Reserva · Proyecto Los Castaños · Lote 12
Cliente: María Pérez
Estado: pendiente de aprobación
```

## `/aprobadas` And `/rechazadas`

Returns a bounded recent list scoped to the actor role.

```text
Tus solicitudes aprobadas recientes

1. Venta · Proyecto Los Castaños · Lote 9
Cliente: Carlos Díaz
Decidida: 29-05-2026
```

## `/docs`

Returns safe documentation shortcuts.

```text
Documentación para vendedores

- Guía rápida de reservas
- Cómo revisar estados de solicitudes
- Contacto de soporte interno
```

## Error And Empty States

- Unlinked user: explain how to link Telegram from the web app.
- Unauthorized user: do not expose data; record the attempt.
- No pending items: return a short empty-state message.
- Telegram not configured: web remains functional; command cannot be delivered
  until bot setup is complete.
