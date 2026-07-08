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

## Resultados de validación real — 2026-07-08

### Preparación

- Proyecto real: Teno (`aad0fbf2-ceda-47bc-954a-b3f5f2ac8797`).
- Organización: Plotify (`7a0203ce-8b31-4661-a7b7-933613d49069`).
- Política inicial: `every_sale`.
- Warning legal por proyecto: estaba pendiente; se confirmó una vez para el proyecto con actor admin `4778854b-6dfd-4aad-8c9a-bd9f92bbb460` a las `2026-07-08T17:11:20.252397+00:00` y se registró audit log `minuta_warning_acknowledged`.

### Escenario ejecutado: venta real controlada sobre lote 10

- Lote: 10 (`6fa708c3-9f63-4672-bf9f-4104c3597d6b`), disponible y `verified_exact` antes de la prueba.
- Solicitud de aprobación creada: `82582429-44ec-4129-8ff9-75c2092966fd`.
- Venta aprobada por el camino real del backend (`execute_admin_decision_db` → RPC `approve_sale` → `handle_sale_validated_for_escritura` → `run_case_cascade`).
- Caso creado: `bbdc5998-d858-429a-9256-585e79e86451`.
- Matriz de caso creada: `a9c4945b-febb-4403-a4a0-77b019dfc95a`.
- Tiempo aprobación venta → corrida de cascada: ~8 segundos (`sold_at=2026-07-08T17:11:22.071058+00:00`, corrida `created_at=2026-07-08T17:11:30.04151+00:00`).
- Resultado de cascada: `exception`, no `completed`.
- Minutas generadas para ese caso: 0.

### Causas reales encontradas

La validación no pudo completar los Escenarios 1/2 de camino feliz porque Teno no está libre de blockers reales:

- `sii_verified`: falta rol en trámite del lote.
- Falta cláusula comprometida: Vigencia en el resto del predio.
- Falta cláusula comprometida: Título con múltiples inmuebles.
- Falta cláusula comprometida: Otra alerta del estudio de título.

Esto valida SC-004 parcialmente: la excepción quedó persistida en menos de 1 minuto, con causas accionables y sin generar documento parcial. Queda pendiente corregir esas causas de Teno (datos SII + cláusulas de alertas en plantilla) y repetir:

- Escenario 1 (`every_sale`): debe quedar `awaiting_review`, luego completar con 1 acción humana.
- Escenario 2 (`exceptions_only`): debe completar con 0 acciones humanas.
- Escenario 4: idempotencia sobre caso `completed` y regeneración explícita.

### Estado de cierre

La primera ejecución real encontró blockers de Teno y reveló dos ajustes de producto/código:

- El blocker `sii_verified/lote.rol_tramite` venía heredado desde la matriz proyecto, pero esa variable es de venta/lote y debe evaluarse en el caso. Se corrigió la cascada para ignorar variables `sale_gap`/`signing` cuando el gate viene heredado desde proyecto.
- La plantilla publicada era inmutable, así que las cláusulas faltantes no se parchearon en caliente. Se creó y publicó una nueva versión de plantilla (`5bb8ad07-0a8d-494f-95a8-81362b0052ac`, versión 4) con las tres cláusulas de alerta requeridas, y se aprobó una nueva matriz proyecto (`e5addbc2-63b6-4e13-8a5a-62b9965f90ac`) heredable por ventas futuras. La matriz proyecto anterior (`17f9ef2f-b1e9-4624-874c-985ea67a4221`) quedó `superseded`.

### Escenario 1 final — `every_sale`

- Lote: 11 (`90b47c05-bc27-4b07-a06e-f0084f2e85b1`).
- Approval request: `2c31bf35-c21c-448c-92d1-aa0514ad4728`.
- Caso: `8369fe60-52d0-4561-bd28-977760383392`.
- Matriz de caso: `0344cdd0-2c94-4185-82df-0afb88ab3dad`, heredada de matriz proyecto `e5addbc2-63b6-4e13-8a5a-62b9965f90ac`, template v4.
- Resultado tras aprobar venta: `awaiting_review`, steps `submit=executed`, `legal_review=skipped/pending_human`.
- Acción humana post-venta: 1, aprobación jurídica con comentario `Validación SDD17 every_sale`.
- Resultado tras aprobación jurídica: corrida `4fc681b8-f6e4-45b7-9ee2-60ce053cbae1`, `completed`, sin causas.
- Minuta generada: `383c96bb-be16-4224-a274-6ee8218e9ec3`, `generated_by=null`, `warning_acknowledged_by=4778854b-6dfd-4aad-8c9a-bd9f92bbb460`.
- Entrega: web y Telegram registradas.
- Medición SC-006: aprobación jurídica `2026-07-08T18:42:07Z` aprox. → corrida completed `2026-07-08T18:42:18.977898+00:00`, ~12 segundos (< 2 min).

PASS SC-002/SC-006: `every_sale` requiere exactamente 1 acción humana post-venta y entrega en menos de 2 minutos tras esa acción.

### Escenario 2 final — `exceptions_only`

- Política cambiada temporalmente de `every_sale` a `exceptions_only` y restaurada a `every_sale` al final.
- Lote: 12 (`11aeb827-71c8-47b4-96bc-af6e9ad9738d`).
- Approval request: `6a10c98c-2a99-4d6d-bf2c-933d53acab12`.
- Caso: `464b1b09-3301-4a97-aa8f-d596d7927df4`.
- Matriz de caso: `6cb0376b-36cc-4852-a00b-a1e02a6f9da0`, heredada de matriz proyecto `e5addbc2-63b6-4e13-8a5a-62b9965f90ac`, template v4.
- Resultado desde `sale_validated`: corrida `7ae5ffae-a5c2-4a9c-9eab-adb07ef3b151`, `completed`, sin causas.
- Steps: `submit=executed`, `legal_review=executed/system_approved`, `approve=executed`, `generate=executed`.
- Acciones humanas post-venta: 0.
- Minuta generada: `c45cb582-8147-48a7-a8e0-f1573f80f039`, `generated_by=null`, `warning_acknowledged_by=4778854b-6dfd-4aad-8c9a-bd9f92bbb460`.
- Entrega: web y Telegram registradas.
- Medición SC-006: venta aprobada `2026-07-08T18:42:54Z` aprox. → corrida completed `2026-07-08T18:43:16.55894+00:00`, ~23 segundos (< 2 min).

PASS SC-001/SC-006: `exceptions_only` completó con 0 acciones humanas y entrega en menos de 2 minutos.

### Escenario 3 final — excepción accionable

- La primera venta controlada del lote 10 produjo `exception` en ~8 segundos, con causas humanizadas y 0 minutas generadas.
- Reintento después del fix heredado quitó la falsa causa `sii_verified/lote.rol_tramite`; persistieron solo causas reales de plantilla hasta publicar la v4.

PASS SC-004: excepción persistida en menos de 1 minuto, causas accionables, sin minuta parcial.

### Escenario 4 final — idempotencia

- Retry sobre el caso completed del Escenario 2 (`464b1b09-3301-4a97-aa8f-d596d7927df4`) con política restaurada a `every_sale`.
- Antes del retry: 1 generación. Después del retry: 1 generación.
- Corrida: `3e7a5843-1d61-432e-9e16-589dd6af93b3`, `completed`.
- Steps: `submit=skipped/approved`, `legal_review=skipped/already_approved`, `approve=skipped/already_approved`, `generate=skipped/already_generated`.
- Generación reutilizada: `c45cb582-8147-48a7-a8e0-f1573f80f039`.

PASS D6/SC-003: retry sobre completed no duplicó minuta ni entrega; también se corrigió el bug donde, bajo política actual `every_sale`, un retry completed volvía a quedar `awaiting_review`.

### Estado de cierre actualizado

T033/T034 quedan completos. T036 se cierra solo después de repetir los gates finales de este pase (`test:api`, web tests, typecheck, build, migrations, contracts, format y CodeGraph sync).
