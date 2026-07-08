# Guía del agente implementador — SDD018 Telegram Mini App

Este documento es **vinculante** para cualquier agente de IA que implemente este SDD. Define las herramientas, skills y políticas de calidad que aseguran una implementación correcta. Si una instrucción de aquí entra en conflicto con una preferencia genérica del agente, gana esta guía.

## 0. Orden de lectura obligatorio

1. [spec.md](spec.md) — qué se construye y por qué.
2. Esta guía — cómo se trabaja.
3. [plan.md](plan.md) — arquitectura y estructura de archivos.
4. [contracts/](contracts/) — los tres contratos (auth, deep links, reserva).
5. [quickstart.md](quickstart.md) — cómo se valida contra el mundo real.
6. Código existente citado en cada contrato — **leerlo antes de escribir el propio**.

## 1. Codegraph (graphify): revisar el código antes de tocarlo

Antes de implementar cada user story, usar la skill **graphify** (`/graphify`) para construir/consultar el grafo de conocimiento del código y responder, como mínimo:

- ¿Quién llama hoy a la pieza que voy a reutilizar? (ej.: `process_admin_decision`, `get_telegram_client_for_org`, el servicio de reservas de `agent/tools/reservations.py`, la entrega de `escritura_delivery.py`).
- ¿Qué módulos dependen del archivo que voy a modificar? (ej.: agregar `reply_markup` en `approval_notifier.py` — ¿qué tests lo cubren?).
- ¿Existe ya un helper para lo que estoy por escribir? (ej.: resolución de actor por chat_id ya existe: `resolve_telegram_actor_context` en `message_processor.py`; validación de tenant ya existe: `api/deps.py`).

Regla: **ningún helper nuevo sin antes consultar el grafo** por uno existente. La duplicación de lógica de autorización o de resolución de actores es un defecto de revisión, no una preferencia de estilo.

## 2. Context7: documentación actual, no memoria de entrenamiento

Para cualquier API externa o librería, consultar **context7** (MCP `resolve-library-id` + `query-docs`) antes de escribir código que dependa de detalles finos. Obligatorio para:

- **Telegram Web Apps / Bot API**: campos y algoritmo de validación de `initData`, `web_app` buttons, `setChatMenuButton`, `startapp`/`start_param`, eventos del SDK (`themeChanged`, `MainButton`, `BackButton`). La plataforma de mini apps cambia rápido; no confiar en el conocimiento entrenado.
- **Next.js 16 (App Router)**: route groups, `force-dynamic`, route handlers, scripts de terceros en layouts.
- **MapLibre GL**: render de GeoJSON táctil, eventos de tap en polígonos, performance en móvil.
- **react-hook-form + zod**: integración de resolvers y validación asíncrona.

Regla: si un detalle de API externa no fue verificado contra context7 (o la doc oficial vía WebFetch), se considera no verificado.

## 3. Skills de `.agents/skills/` por área de trabajo

Invocar la skill ANTES de trabajar en su área. Este mapeo es parte del contrato:

| Área | Skills obligatorias | Cuándo |
|---|---|---|
| Todo lo Telegram | `telegram-mini-app`, `telegram-integration` | Antes de la US1; releer la sección de validación de initData y la de Mini App |
| Sesión / initData | `auth-implementation-patterns`, `security-and-hardening` | Antes de diseñar el endpoint de sesión y la dependencia FastAPI |
| Endpoints FastAPI | `fastapi-templates`, `api-design-principles`, `async-python-patterns`, `error-handling-patterns` | Antes de crear el router `miniapp` |
| Frontend mini app | `nextjs-app-router-patterns`, `next-best-practices`, `react-best-practices`, `frontend-ui-engineering`, `tailwind-v4-shadcn` | Antes de la estructura `/mini` y de cada pantalla |
| Formulario reserva | `react-hook-form`, `zod` | US5 |
| Tests API | `python-testing-patterns`, `test-driven-development` | Antes de escribir el primer test de cada endpoint |
| Tests web | `javascript-testing-patterns`, `vitest`, `e2e-testing-patterns` | Antes de los tests de componentes/flujo |
| Migraciones (si hubiera) | `supabase-postgres-best-practices`, `postgresql-table-design` | Solo si un contrato exige DDL (este SDD no debería necesitarlo) |
| Flujo de trabajo | `speckit-implement`, `incremental-implementation`, `code-review-and-quality` | Al partir y al cerrar cada user story |
| Monorepo | `monorepo-management` | Si se tocan configs de workspace |

## 4. Tests de funcionalidad real (regla de la casa, no negociable)

Memoria del proyecto: **los tests de API con fakes (FakeStore) ocultan bugs reales de PostgREST**. La auditoría de julio 2026 lo demostró. Por lo tanto:

1. **Cada user story cierra con el escenario correspondiente del [quickstart.md](quickstart.md) ejecutado contra Supabase real y Telegram real** (bot de desarrollo + ngrok). Un test unitario verde NO declara una historia lista.
2. Los tests automatizados prueban **comportamiento, no mocks de sí mismos**: la validación HMAC se prueba con vectores generados con un token conocido (casos: válido, hash alterado, `auth_date` viejo, campo extra, orden distinto); la autorización se prueba con actores reales de los tres roles; la idempotencia de la reserva se prueba con doble envío.
3. Tests negativos primero en seguridad: para el endpoint de sesión, escribir ANTES los tests de rechazo (401/403) que los de éxito.
4. Migraciones: **siempre `supabase db push`, nunca `apply_migration` vía MCP** (trampa documentada del SDD016 — deja el historial de migraciones inconsistente).
5. Comandos que deben quedar verdes al cierre de cada historia: `pnpm test:api`, `pnpm test:web`, `pnpm typecheck:web`, `pnpm build:web`.

## 5. Buenas prácticas específicas de este SDD

- **`initDataUnsafe` jamás como identidad**. Solo para render optimista (nombre en el saludo); toda decisión de datos pasa por la sesión emitida por el servidor.
- **Comparación en tiempo constante** (`hmac.compare_digest`) para el hash del `initData`.
- **El servidor deriva el tenant, nunca lo recibe**: seguir el patrón de `require_lot_organization` / `get_lot_organization_id` en [deps.py](../../apps/api/api/deps.py).
- **Cero lógica de negocio en el frontend**: la mini app compone datos y dispara servicios existentes. Si una pantalla "necesita" una regla nueva, la regla va al API y se contrasta con el contrato.
- **Estilo del código existente**: la API está en español (docstrings, logs, mensajes); mantenerlo. El frontend sigue las convenciones de `apps/web` (componentes existentes, `database.types.ts`, dirección de diseño monocroma del SDD015).
- **Español chileno en todo texto visible al usuario**. Nunca voseo argentino.
- **UX Telegram nativa**: `MainButton` para la acción principal (no botones propios flotantes), `BackButton` para navegación, tema de `themeParams`. Mobile-first ~380 px.
- **No inventar endpoints**: si el dato que una pantalla necesita no existe expuesto, primero buscar con graphify el servicio interno que lo produce, y recién entonces agregar el endpoint de lectura en el router `miniapp`, con su test.
- **Commits por user story** siguiendo la convención del repo (`feat(sdd18): ...`), sin mezclar historias.

## 6. Definición de terminado (por user story y global)

Una user story está terminada cuando:

1. Sus acceptance scenarios del spec pasan.
2. Sus tests automatizados existen y pasan (incluyendo los negativos).
3. El escenario del quickstart correspondiente pasa contra Supabase + Telegram reales, con evidencia (qué se hizo, qué se observó).
4. Los cuatro comandos del punto 4.5 están verdes.
5. No hay regresión del chat existente (FR-013): el escenario 0 del quickstart pasa.

El SDD está terminado cuando además: los tres contratos están implementados tal como se escribieron (o el contrato fue actualizado con la desviación justificada ANTES de implementarla), y `tasks.md` (generado con `/speckit-tasks`) está completamente marcado.
