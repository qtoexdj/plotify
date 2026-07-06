# Quickstart: verificar el feature de punta a punta

Cómo comprobar, como humano o agente, que cada user story funciona. Requiere el entorno local corriendo.

## Levantar el entorno

```bash
# Web (Next.js, puerto 3000)
pnpm --filter web dev
# API (FastAPI, puerto 8005 según .env API_PORT)
pnpm dev:api
# Worker (arq) — necesario para el hook post-venta y la entrega
pnpm dev:worker
```

Cuentas de prueba (backend `swkrnjdpnlrgxgotmfxy`): admin `prueba@plotify.com`, vendedor `10mibl@gmail.com`. Proyecto Teno `aad0fbf2-ceda-47bc-954a-b3f5f2ac8797`. Login por magic link (admin genera link con service_role → `/auth/callback#access_token=...`).

## US1 — Pipeline de punta a punta (MVP)

1. Con el molde de Teno aprobado, como vendedor: registrar una **venta directa** de un lote verificado (Visor → clic en el lote → "Venta Directa" → completar → Confirmar).
2. Como admin: aprobar la venta (notificación / Telegram).
3. Verificar en la mesa del caso (`/documentos/matriz/{caseId}`): los datos del comprador/precio/lote aparecen "Verificado" (poblados por el puente), NO "Falta …".
4. El único pendiente humano es "Esperando revisión jurídica".
5. Como abogado/admin: clic "Aprobar revisión jurídica" → el caso pasa a "Listo para generar".
6. Clic "Generar minuta" → se genera el DOCX.
7. Verificar que llega el documento al Telegram del admin y que hay fila `sent` con `recipient_user_id` = admin en `escritura_deliveries`.

**Verify SQL (solo lectura)**:

```sql
select variable_key, state from variable_resolutions
 where lot_id = '<lotId>' and variable_key like 'comprador.%';  -- debe haber filas con valor
select case_status, readiness_status from escritura_cases where id = '<caseId>';  -- ready_for_minuta
select channel, status, recipient_user_id is not null from escritura_deliveries
 where escritura_case_id = '<caseId>';  -- sent con recipient no nulo
```

## US2 — Molde en un clic

1. Proyecto con variables extraídas: Legal → "Aprobar molde".
2. Confirmar en el diálogo que lista las variables confidence ≥0,9.
3. Verificar matriz `approved` y header "Molde aprobado · esperando ventas".
4. Abrir un caso → la mesa muestra ≤2 pendientes (no ~35).

## US3 — Reserva/venta con prefill + delta

1. Reservar un lote con datos mínimos → aprobar la reserva.
2. Abrir "Solicitar Venta" en ese lote → el formulario llega **pre-cargado** con nombre/RUT/contacto, editables, aviso "Datos cargados desde la reserva".
3. Enviar → como admin, la notificación muestra el **delta** (valor final), no el formulario completo.
4. Intentar una transición inválida de estado de lote → error visible; nunca `sold_at` con `estado='disponible'`.

## US4 — Camino guiado + config + roles

1. Vista general de un proyecto → checklist con pasos (Documentos/Título/Variables/Molde/Lotes/Ventas) y estado real.
2. Configuración → "Datos de la organización para escrituras": cargar razón social/RUT/banco/mandatario/abogado.
3. Configuración → "Conectar Telegram": deep link → tras `/start`, recibir notificación de prueba.
4. Login como vendedor → el sidebar NO muestra Mesa/Plantillas/Vendedores; las rutas están bloqueadas.
5. Intentar vender un lote no verificado → aviso previo.

## US5 — Verificación masiva

1. Pestaña Lotes / checklist → "Verificar los lotes que coinciden con el plano" (tolerancia 0,5%).
2. Verificar resumen "N verificados · M desviados · K sin geometría".
3. Los N quedan `verified_exact` con `verified_by` admin; los M en el panel de revisión manual.

## US6 — Seguridad (gate de piloto, tras HG-2)

```bash
# Debe fallar (permiso denegado) con la anon key:
curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/get_decrypted_bot_token" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
  -H 'Content-Type: application/json' -d '{"p_org_id":"7a0203ce-8b31-4661-a7b7-933613d49069"}'
```

- Verificar que `project-files` es privado y que ver/descargar documentos legales sigue funcionando (URLs firmadas).

## US7 — Salud de código

```bash
pnpm --filter web build   # verde tras borrar generation-wizard.tsx y reserve-lot.action.ts
pnpm --filter web typecheck
pnpm test:api             # verde tras extraer el helper de aprobación
```

## Gates de calidad al cierre de cada US

```bash
pnpm --filter web lint && pnpm format:check && pnpm build:web
pnpm typecheck:web   # si tocó contratos/tipos
pnpm test:api        # si tocó API
pnpm verify:migrations  # si tocó la migración
```
