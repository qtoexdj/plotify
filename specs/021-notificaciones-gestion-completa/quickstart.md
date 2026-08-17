# Quickstart: Gestión completa de notificaciones

**Feature**: `021-notificaciones-gestion-completa` | **Rama**: `021-notificaciones-gestion-completa`

## Requisitos

- API corriendo (FastAPI, puerto 8005) y worker ARQ para la parte de decisión.
- Web dev (Next.js) con `INTERNAL_API_SECRET` configurado.
- Supabase linked (solo para verificación manual de datos; NO hay migraciones en este SDD).

## Verificación funcional manual

### US1 — Descartar

1. Abrir el dashboard con una cuenta admin con notificaciones.
2. En la campana, activar el control de descartar de un ítem → desaparece al instante.
3. Recargar la página → no reaparece ni cuenta en el contador.
4. Verificar en BD: `SELECT id, dismissed_at FROM notification_events WHERE id = '<id>'` → marca temporal set, fila intacta.

### US2 — Contador numérico

1. Crear 3 solicitudes pendientes (reserva o venta) → la campana muestra "3".
2. Aprobar una desde la campana → el contador baja (tras el refresh de 60 s o al reabrir).
3. Con 0 pendientes → sin número ni punto.

### US3 — Copy + CTA

1. Con una venta aprobada y borrador listo → el ítem muestra "Borrador por revisar" y el botón "Abrir borrador"; un clic lleva a `/documentos/matriz/{caseId}`.
2. Con una venta rechazada (sin destino) → sin botón de navegación.
3. Con cuenta vendedora → nunca se ven controles de decisión administrativa; el CTA (si aplica) lleva a `/mis-documentos`.

### US4 — Lectura masiva

1. Con 10+ sin leer, pulsar "Marcar todo como leído" → una sola petición (`read-all`), contador 0, lista actualizada.

### US5 — Refresco proactivo

1. Con la página abierta, crear una solicitud desde otro canal (Telegram/webhook) → el contador se actualiza solo en ≤ 60 s.
2. Cambiar de pestaña y volver → refresh inmediato.

### US6 — Historial acotado

1. Con más de 50 notificaciones, abrir la campana → 50 más recientes; "Cargar más" agrega las siguientes.

### US7 — Accesibilidad

1. Navegar la campana solo con Tab/Enter/Escape; verificar que todos los controles son alcanzables y que Escape devuelve el foco al botón.

## Verificación técnica

```bash
pnpm test:api                       # pytest incluye nuevos tests de dismiss/read-all/paginación
pnpm contracts:generate             # regenera OpenAPI + client TS (verificar diff acotado)
pnpm test:web                       # Vitest service layer + componentes
pnpm typecheck:web && pnpm format:check && pnpm build:web
pnpm verify:migrations              # sin cambios de esquema
```

## Restauración

El descarte es suave: `UPDATE notification_events SET dismissed_at = NULL WHERE id = '<id>'` para revertir una fila descartada durante pruebas. No hay migraciones que revertir.
