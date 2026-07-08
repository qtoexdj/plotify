# Implementation Plan: Mini App de Telegram — sala de operaciones de bolsillo

**Branch**: `018-telegram-mini-app` | **Spec**: [spec.md](spec.md) | **Guía del agente**: [agent-guide.md](agent-guide.md)

## Summary

Agregar una Telegram Mini App como cliente nuevo del backend existente: rutas `/mini` en `apps/web` (Next.js 16, mobile-first, SDK `telegram-web-app.js`), un router `miniapp` en FastAPI con sesión propia basada en la validación server-side del `initData`, y botones `web_app` en las notificaciones que ya envía el bot. Cero cambios al motor de negocio (cascada SDD017, decisiones, reservas, entregas): la mini app compone y dispara servicios existentes.

## Technical Context

**Frontend**: Next.js 16.2 App Router (`apps/web`), React 19, Tailwind, componentes del SDD015 (dirección monocroma), MapLibre GL 5 (visor de geometrías existente en `components/projects/geometry-viewer/`), react-hook-form + zod.

**Backend**: FastAPI (`apps/api`), Supabase Postgres (proyecto `swkrnjdpnlrgxgotmfxy`), Redis/arq para jobs, `httpx` para Bot API. Auth actual del CRM: el frontend Next.js es el perímetro confiable (`X-Internal-Secret` + `X-User-Id`); la mini app introduce un segundo perímetro: sesión firmada emitida tras validar `initData`.

**Telegram**: un bot por organización (`telegram_bots`, RPC `get_decrypted_bot_token`, cache TTL 1h en `integrations/telegram_client.py`). Webhook por org en `api/v1/endpoints/webhook.py`. Vinculación por deep link `/start TOKEN` → `profiles.telegram_chat_id`.

**Sin migraciones previstas**: la sesión es stateless (firmada), las vistas son proyecciones de tablas existentes. Si un contrato terminara exigiendo DDL, aplica la política de migraciones del agent-guide (§4.4).

**Env nuevas**: `TELEGRAM_MINI_APP_URL` (API — para armar botones `web_app`), `MINIAPP_SESSION_SECRET` (API — firma de sesión; independiente de `INTERNAL_API_SECRET` para poder rotarla sola).

## Constitution Check

- **La mini app es un cliente, no un motor**: ninguna regla de negocio nueva en frontend ni endpoints que dupliquen servicios; solo lecturas agregadas + disparo de servicios existentes.
- **Registro inmutable intacto**: nada de este SDD toca snapshots, versiones ni hashes de escrituras.
- **Autorización en el servidor** con tenant derivado de la base (patrón `api/deps.py`).
- **Auditoría**: emisión/rechazo de sesión y toda mutación con origen `miniapp` en `audit_logs`.

## Project Structure

### Documentation (this feature)

```
specs/018-telegram-mini-app/
├── spec.md
├── plan.md
├── agent-guide.md          # vinculante para el agente implementador
├── quickstart.md           # validación E2E contra Supabase + Telegram reales
├── contracts/
│   ├── miniapp-auth.md
│   ├── deep-links-notificaciones.md
│   └── reserva-desde-miniapp.md
└── tasks.md                # generar con /speckit-tasks
```

### Source Code (repository root)

```
apps/api/
├── api/v1/endpoints/miniapp.py        # NUEVO router: sesión + lecturas + acciones
├── api/v1/router.py                   # registrar router (prefix /miniapp)
├── core/miniapp_session.py            # NUEVO: firma/verificación de sesión + validación initData
├── schemas/miniapp.py                 # NUEVO: modelos Pydantic del contrato
├── workers/tasks/approval_notifier.py # MOD: botón web_app en notificaciones de aprobación
├── services/escritura_notifications.py# MOD: botón web_app en excepciones/entregas
├── integrations/telegram_client.py    # MOD mínima: permitir web_app en reply_markup (ya soporta reply_markup)
└── tests/
    ├── test_miniapp_auth.py           # NUEVO: vectores HMAC, expiración, roles, 401/403
    ├── test_miniapp_endpoints.py      # NUEVO: bandeja, mis ventas, documentos, autorización
    └── test_miniapp_reserva.py        # NUEVO: validación, idempotencia, flujo completo

apps/web/src/app/mini/
├── layout.tsx                         # SDK telegram-web-app.js, theme, force-dynamic
├── page.tsx                           # router por rol (vendedor→ventas, admin→bandeja)
├── vincular/page.tsx                  # pantalla de no-vinculado (US1)
├── ventas/page.tsx                    # US3: mis ventas
├── ventas/[caseId]/page.tsx           # US3: detalle con pipeline y blockers
├── documentos/page.tsx                # US3: mis documentos
├── bandeja/page.tsx                   # US2: sala de excepciones (admin)
├── bandeja/[id]/page.tsx              # US2: detalle con evidencia y decisión
├── mapa/page.tsx                      # US4: visor MapLibre + ficha (bottom sheet)
└── reservar/[lotId]/page.tsx          # US5: formulario de reserva

apps/web/src/lib/miniapp/
├── telegram.ts                        # hook useTelegram (SDK typing, MainButton, theme)
└── session.ts                         # obtención/refresh de sesión contra el API
```

Nota: rutas y nombres exactos pueden ajustarse a las convenciones que el agente encuentre en `apps/web` (verificar con graphify antes); la estructura de responsabilidades es la fija.

## Fase 0 — Research

Resolver con context7 + lectura del código (no asumir):

1. Algoritmo vigente de validación de `initData` (campos, orden, `WebAppData`) y ventana recomendada de `auth_date`.
2. Comportamiento de botones `web_app` en mensajes de bot (chats privados) vs. `startapp` links para compartir.
3. Cómo consume el visor MapLibre existente las geometrías (`geometry-viewer/MapPanel.tsx`) y qué endpoint las sirve, para reutilizar y no duplicar.
4. Qué expone hoy el API para: casos por vendedor, causas de cascada, `escritura_deliveries` por usuario — decidir por contrato qué lecturas nuevas necesita el router `miniapp`.

## Fase 1 — Diseño y contratos

Los tres contratos de `contracts/` son el diseño detallado. Decisión de arquitectura ya tomada (registrarla como ADR si el repo lo pide):

- **La mini app llama directo a FastAPI** con su token de sesión (`Authorization: Bearer`), sin pasar por route handlers de Next.js como proxy. Razón: el perímetro `X-Internal-Secret` existe porque el CRM web no tenía identidad propia hacia el API; la sesión de mini app SÍ es una identidad verificable end-to-end, y el proxy solo agregaría latencia y un segundo lugar donde autorizar. CORS del API se abre solo para el origen de `TELEGRAM_MINI_APP_URL`.

## Orden de implementación sugerido (para /speckit-tasks)

1. **US1** — `core/miniapp_session.py` + endpoint de sesión (tests negativos primero) → layout `/mini` + hook SDK + pantalla de vinculación → botones `web_app` en un notificador (aprobaciones) → quickstart escenario 1.
2. **US2** — lecturas de bandeja/detalle + acciones (decisión, reintento) → pantallas bandeja → quickstart escenario 2.
3. **US3** — lecturas mis-ventas/documentos + humanización de blockers → pantallas vendedor → quickstart escenario 3.
4. **US4** — endpoint/reuso de geometrías + mapa + ficha + compartir → quickstart escenario 4.
5. **US5** — contrato de reserva (validación + idempotencia) + formulario → botón web_app en la notificación resultante → quickstart escenario 5 (ciclo completo).
6. Cierre: regresión del chat (escenario 0), barrido de auditoría, `setChatMenuButton`, checklist de seguridad del agent-guide.

## Complexity Tracking

Riesgos conocidos y su mitigación:

- **Validación HMAC sutilmente mal** (orden de campos, encoding): vectores de test generados con token conocido + verificación cruzada con la doc vigente vía context7.
- **Fuga de tenant** (mini app multi-org): tenant SIEMPRE derivado de la sesión, y la sesión del `initData` validado contra el bot de UNA org; tests de acceso cruzado obligatorios.
- **Cache de Next.js sirviendo estado viejo dentro de Telegram**: `force-dynamic` en `/mini` + verificación explícita en quickstart.
- **Doble fuente de verdad de pantallas vs. mesa web**: las pantallas de la mini app leen los mismos servicios; si un dato difiere de la mesa, es bug de la mini app por definición.
