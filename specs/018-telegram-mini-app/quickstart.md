# Quickstart: validar la mini app de Telegram (SDD018)

Validación end-to-end contra Supabase real y Telegram real. Regla de la casa (memoria del proyecto): los tests con fakes ocultan bugs reales de PostgREST — **ninguna user story se declara lista sin su escenario de aquí**. Usar el proyecto Teno real (`aad0fbf2-ceda-47bc-954a-b3f5f2ac8797`) y las cuentas admin/vendedor de la auditoría E2E de julio 2026.

## Prerequisitos

- Rama `018-telegram-mini-app`; API y web locales corriendo.
- Túnel HTTPS: [update_ngrok_webhook.py](../../apps/api/scripts/dev-only/update_ngrok_webhook.py) apuntando el webhook del bot de dev al API local. La MISMA URL de ngrok (o un segundo túnel al puerto de Next.js) sirve la mini app: exportar `TELEGRAM_MINI_APP_URL=https://<ngrok>/`.
- `MINIAPP_SESSION_SECRET` seteada en el API.
- Bot de desarrollo con la mini app registrada en @BotFather (`/newapp` o menu button apuntando a `{TELEGRAM_MINI_APP_URL}/mini?org=<org_id>`).
- Dos teléfonos (o Telegram Desktop + móvil): uno con la cuenta Telegram vinculada al admin, otro al vendedor. Un tercer chat NO vinculado para las pruebas negativas.

## Escenario 0 — Regresión del chat (correr al cierre de CADA historia)

1. Enviar un mensaje de texto al bot → el agente responde como siempre.
2. Generar una aprobación y decidirla con los botones inline `approve/reject` clásicos → funciona igual que antes del SDD.
3. **PASS si**: cero cambios de comportamiento en el chat (FR-013).

## Escenario 1 — Sesión y apertura contextual (US1) → SC-001, SC-004

1. Desde el chat NO vinculado, abrir la mini app → pantalla de vinculación con instrucciones; verificar en la respuesta de red que no viajó ningún dato de la org. Verificar `miniapp.session_rejected` en `audit_logs`.
2. Desde el admin vinculado, abrir la mini app por el menú del bot → entra sin credenciales, saludo con su nombre, rol admin. Verificar `miniapp.session_issued` auditado.
3. Generar una notificación real (reserva pendiente) → el mensaje trae el botón "Abrir en la app"; tocarlo → aterriza en el detalle de ESA reserva (contar taps: debe ser ≤ 2 desde la notificación, SC-001).
4. Cambiar el tema de Telegram (claro↔oscuro) con la mini app abierta → la UI reacciona.
5. Manipular el `initData` (repetir la petición de sesión con el hash alterado, vía curl) → 401 genérico, auditado.
6. **PASS si**: los 5 pasos se comportan como se describe.

## Escenario 2 — Bandeja del admin (US2) → SC-003 parcial

1. Tener en la base: 1 reserva pendiente + 1 caso en excepción de cascada (crear la excepción con el método del quickstart del SDD017: lote sin verificar o dato faltante).
2. Abrir la bandeja como admin → ambos ítems visibles con causa y antigüedad; comparar contra la mesa web: misma información.
3. Abrir el detalle del caso en excepción → causas humanizadas de la cascada, conflicto de variables lado a lado, evidencia accesible.
4. Aprobar la reserva desde la mini app → verificar en la base el mismo efecto que el botón inline (estado, `audit_logs` con actor real y origen `miniapp`).
5. Corregir la causa de la excepción y tocar "Reintentar cascada" → la cascada del SDD017 continúa y el estado se refleja en la mini app.
6. Como VENDEDOR, intentar abrir `/mini/bandeja` y llamar el endpoint de decisión por curl con su token → 403 en ambos.
7. **PASS si**: decisiones idénticas al camino existente, autorización server-side verificada, cero divergencia con la mesa web.

## Escenario 3 — Mis ventas y documentos del vendedor (US3) → SC-005

1. Como vendedor con ≥2 casos en estados distintos, abrir "mis ventas" → cada caso con su etapa correcta (verificar contra la base) y blockers en lenguaje claro (mostrar el texto a un no-programador: debe entenderlo).
2. Verificar que NO aparecen casos de otros vendedores (crear uno con la otra cuenta si hace falta).
3. Abrir "mis documentos" → las entregas del vendedor con descarga funcionando (enlace firmado). Forzar/simular un enlace vencido → estado claro + regeneración del enlace.
4. Cronometrar: responder "¿en qué va el lote X?" mirando la pantalla → < 30 s (SC-005).
5. **PASS si**: filtrado por autoría correcto, blockers legibles, documentos descargables.

## Escenario 4 — Visor de parcelas (US4) → SC-006

1. Abrir el mapa de Teno como vendedor → los polígonos y estados coinciden con `geometries` + `lots` (muestrear 3 lotes contra la base).
2. Tocar un lote → ficha con superficie, rol, precio y estado reales; lote no disponible NO ofrece reservar.
3. "Compartir ficha" → enviar el link a otro chat; abrirlo → aterriza en la ficha correcta.
4. En un teléfono real con 4G: apertura del mapa → primer toque respondido en < 3 s (SC-006).
5. Verificar que un vendedor sin el proyecto asignado no lo ve en el selector.
6. **PASS si**: datos reales, restricción por proyecto, performance dentro del criterio.

## Escenario 5 — Ciclo completo de reserva (US5) → SC-002, SC-003

1. Desde la ficha de un lote disponible, abrir el formulario; probar un RUT inválido → error inmediato en el campo; corregirlo → check verde.
2. Enviar → verificar el `approval_request` en la base: datos EXACTOS a lo tecleado (SC-002), `idempotency_key` presente, auditoría con origen `miniapp`.
3. Reenviar (simular doble tap repitiendo el POST con la misma clave) → una sola solicitud.
4. En el teléfono del admin: llega la notificación con botón → abrir → aprobar → en el teléfono del vendedor, "mis ventas" refleja el avance. Ciclo completo sin salir de Telegram (SC-003).
5. Intentar reservar un lote NO disponible por curl directo → 409, sin solicitud creada.
6. **PASS si**: validación dual (cliente Y servidor), idempotencia real, ciclo completo auditado.

## Cierre del SDD

- Los 6 escenarios PASS con evidencia anotada (qué se hizo, qué se observó, ids relevantes).
- `pnpm test:api`, `pnpm test:web`, `pnpm typecheck:web`, `pnpm build:web` verdes.
- Checklist de seguridad del [agent-guide.md](agent-guide.md) §5 revisado punto por punto.
