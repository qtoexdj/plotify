# Quickstart: validar la aprobación por excepción (SDD017)

Validación end-to-end contra el proyecto Teno real (`aad0fbf2-ceda-47bc-954a-b3f5f2ac8797`). Regla de la casa (memoria del proyecto): los tests con FakeStore ocultan bugs reales de PostgREST — nada se declara listo sin este recorrido contra Supabase real.

## Prerequisitos

- Rama `017-aprobacion-por-excepcion`, API local corriendo con las 3 migraciones aplicadas (`supabase db push`; recordar la trampa: nunca `apply_migration` vía MCP).
- Teno con molde aprobado, lotes verificados, Telegram de la organización configurado.
- Cuentas: admin y vendedor (las mismas de la auditoría E2E de julio 2026).

## Escenario 1 — Camino feliz en modo default (`every_sale`) → SC-002

1. Como vendedor, registrar la venta de un lote disponible y verificado (formulario con prefill si estaba reservado).
2. Como admin, aprobar la venta (Telegram o web). **Cronometrar desde aquí.**
3. NO tocar nada más en la plataforma. Verificar que llega la notificación de revisión pendiente y que la mesa muestra el caso `awaiting_review` sin botones de enviar/aprobar.
4. Aprobar la revisión jurídica (única acción humana).
5. Esperar: la minuta debe llegar por Telegram al admin sin más actos. Verificar en la mesa: `completed`, "Minuta entregada", descarga funciona, trazabilidad muestra aprobación `system` con molde y versión heredados (SC-005).
6. **PASS si**: exactamente 1 acción humana post-venta y entrega < 2 min desde la aprobación de la revisión (SC-006).

## Escenario 2 — Modo `exceptions_only` → SC-001

1. Como admin, cambiar la política en configuración de la organización; verificar que el cambio queda auditado.
2. Repetir venta + aprobación con otro lote verificado.
3. **PASS si**: la minuta llega por Telegram con 0 acciones humanas post-venta y el caso queda `completed` con toda la cadena auditada.

## Escenario 3 — Excepción con causa accionable → SC-004

1. Elegir un lote SIN verificar (o borrar un dato del comprador en el formulario, ej. estado civil).
2. Vender + aprobar la venta.
3. **PASS si**: en < 1 min el admin recibe la notificación de excepción por Telegram con el lote y la causa; la mesa muestra `exception` con la causa y su link de corrección; NO existe ninguna minuta parcial generada.
4. Corregir la causa (verificar el lote / completar el dato) y pulsar "Reintentar".
5. **PASS si**: la cascada termina sola desde donde quedó (según la política vigente) sin pasos repetidos (revisar `steps` de la corrida: pasos previos `skipped`).

## Escenario 4 — Idempotencia y no-regresión

1. Pulsar "Reintentar" sobre el caso ya `completed` del Escenario 2 → responde `completed`, sin minuta nueva ni entrega duplicada.
2. Corregir un dato del lote del Escenario 1 después de la entrega → el caso marca desactualización pero NO regenera solo (FR-011); regenerar es acción explícita.
3. Casos previos a SDD017 (lote 1 de Teno, approved con 2 minutas) → aparecen como `legacy` y su flujo manual sigue operativo.
4. Warning legal: verificar que se pidió UNA vez por proyecto y que ambas generaciones registran el amparo (FR-009).

## Cierre (gates SC-007)

```bash
pnpm test:api && pnpm --filter web test && pnpm typecheck:web && pnpm build:web
pnpm verify:migrations && pnpm contracts:generate   # sin diffs pendientes tras regenerar
```

Registrar resultados (tiempos medidos de SC-004/006, conteo de acciones de SC-001/002/003) al pie de este archivo al ejecutar.
