# Feature Specification: Mini App de Telegram — la sala de operaciones de bolsillo

**Feature Branch**: `018-telegram-mini-app`

**Created**: 2026-07-08

**Status**: Especificado (propuesta y wireframes aprobados por el usuario, 2026-07-08)

**Input**: User description: "Hoy el pipeline permite al usuario (administrador y vendedor) interactuar con Telegram, pero de una forma muy básica. Crear una mini app de Telegram para que los usuarios puedan interactuar de mejor manera: formularios, visor de parcelas, visor de ventas, y todo lo que podamos agregarle."

> **Para el agente implementador**: antes de escribir una línea de código, leer [agent-guide.md](agent-guide.md). Define qué skills de `.agents/skills/` usar en cada área, cómo usar codegraph (graphify) para revisar el código existente, cómo usar context7 para documentación actualizada, y la política de tests de funcionalidad real. No es opcional: es parte del contrato de este SDD.

## Contexto

La integración actual de Telegram ([webhook.py](../../apps/api/api/v1/endpoints/webhook.py), [telegram_client.py](../../apps/api/integrations/telegram_client.py)) tiene tres capacidades: chat de texto libre con el agente LangGraph, botones inline `approve:{uuid}`/`reject:{uuid}` para decisiones del admin, y entrega de minutas DOCX (`sendDocument`). Todo pasa por texto plano:

- El **admin decide a ciegas**: aprueba reservas y ve excepciones de cascada (SDD017) con el contexto que quepa en un mensaje, sin blockers, sin evidencia, sin el conflicto lado a lado.
- El **vendedor dicta datos al LLM**: una reserva es texto libre que el agente parsea — errores de RUT, nombres y montos que después revientan como "hueco de venta" en la matriz de escritura (SDD011).
- Hay **264 geometrías GeoJSON** en la base y un visor MapLibre en la web, pero por Telegram los lotes son una lista de texto.

Este feature agrega una Mini App de Telegram (TWA) que convierte el bot en una sala de operaciones: los mismos usuarios ya vinculados (deep link `/start TOKEN`, `profiles.telegram_chat_id`), la misma API FastAPI, el mismo RLS — con una capa visual móvil dentro de Telegram. El chat con el agente **no se reemplaza**: se complementa (el agente sigue siendo mejor para preguntas abiertas).

La visión de fondo es la del SDD017: la mesa es una sala de excepciones. La mini app es esa sala en el bolsillo — cada notificación deja de ser un aviso y pasa a ser una acción en un tap.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Sesión sin fricción y apertura contextual desde notificaciones (Priority: P1)

Como usuario ya vinculado (admin o vendedor), cuando toco el botón de una notificación del bot quiero aterrizar dentro de la mini app **directamente en la entidad notificada** (el caso, la reserva, el documento), ya autenticado con mi rol, sin login ni contraseña. Si abro la mini app sin estar vinculado, veo instrucciones claras de vinculación (el flujo QR del CRM existente), no un error.

**Why this priority**: Es la fundación técnica de todo lo demás (validación de `initData`, sesión, ruteo profundo) y el cambio de mayor palanca por costo: convertir las notificaciones existentes en accionables solo requiere agregar botones `web_app` a mensajes que ya se envían.

**Independent Test**: Con un admin vinculado, disparar una notificación real (aprobación pendiente), tocar el botón, y verificar que la mini app abre en el detalle correcto con el rol correcto. Con un chat no vinculado, abrir la mini app y verificar la pantalla de vinculación.

**Acceptance Scenarios**:

1. **Given** un usuario con `telegram_chat_id` vinculado, **When** abre la mini app (menú del bot o botón de notificación), **Then** el backend valida el `initData` (HMAC contra el token del bot de SU organización), resuelve su perfil y rol, y emite una sesión — sin pedir credenciales.
2. **Given** una notificación del bot con botón "Abrir caso", **When** el usuario lo toca, **Then** la mini app abre en el detalle de esa entidad exacta (no en el home).
3. **Given** un chat de Telegram sin vínculo a ningún perfil, **When** abre la mini app, **Then** ve la pantalla de vinculación con las instrucciones del flujo QR existente y ninguna data de la organización.
4. **Given** un `initData` alterado, expirado o firmado con otro token, **When** llega al endpoint de sesión, **Then** se rechaza con 401, se audita el intento y no se filtra información.
5. **Given** el tema oscuro o claro de Telegram, **When** la mini app abre, **Then** respeta `themeParams` y reacciona a `themeChanged`.

---

### User Story 2 - Admin decide con contexto: sala de excepciones (Priority: P1)

Como administradora, quiero una bandeja con todo lo que espera mi decisión — reservas por aprobar y casos en excepción de la cascada — y un detalle por caso que muestre los blockers con su evidencia (el conflicto certificado vs. vendedor lado a lado, el enlace al documento fuente) antes de aprobar, rechazar o devolver. Hoy decido con dos botones inline y un párrafo de texto.

**Why this priority**: Es el corazón del valor para el admin y la continuación natural del SDD017: la cascada ya detiene los casos con causas humanizadas (`escritura_cascade_runs`); esta historia las hace visibles y accionables desde el teléfono.

**Independent Test**: Con una reserva pendiente y un caso en excepción reales, abrir la bandeja, entrar a cada detalle, verificar que blockers y evidencia corresponden a los datos reales, y ejecutar una decisión de cada tipo verificando su efecto en la base y en la mesa web.

**Acceptance Scenarios**:

1. **Given** un admin autenticado en la mini app, **When** abre la bandeja, **Then** ve las reservas pendientes (`approval_requests` en estado pendiente) y los casos en excepción (resultado de cascada `exception`) de su organización, con antigüedad y causa resumida.
2. **Given** el detalle de un caso en excepción, **When** el admin lo abre, **Then** ve las causas accionables de la cascada, los conflictos de variables con ambos valores lado a lado y el acceso a la evidencia documental de cada uno.
3. **Given** el detalle de una reserva pendiente, **When** el admin aprueba o rechaza, **Then** la decisión ejecuta el mismo camino que el botón inline actual (`process_admin_decision`), queda auditada con el actor real, y la UI refleja el resultado sin recargar.
4. **Given** un caso en excepción con la causa corregida, **When** el admin toca "Reintentar cascada", **Then** se invoca el reintento idempotente del SDD017 y el estado del caso se actualiza en la mini app.
5. **Given** un usuario con rol vendedor, **When** intenta acceder a la bandeja o decidir, **Then** el backend lo rechaza con 403 (la autorización es del servidor, jamás de la UI).

---

### User Story 3 - Vendedor: mis ventas y mis documentos (Priority: P2)

Como vendedor, quiero ver mis ventas con el punto exacto del pipeline donde está cada una (venta → validación → revisión → minuta), los blockers que dependen de mí en lenguaje claro ("falta el estado civil del comprador", no jerga del motor), y mis documentos entregados (minutas) siempre disponibles — sin bucear en el historial del chat.

**Why this priority**: Le da al vendedor visibilidad que hoy solo obtiene preguntándole al LLM, y reduce las consultas "¿en qué va mi venta?" al admin. Depende de la US1 (sesión) pero es independiente de la US2.

**Independent Test**: Con un vendedor real que tenga casos en distintos estados, abrir "mis ventas" y verificar que cada caso muestra la etapa y los blockers correctos contra la base real; abrir "mis documentos" y descargar una minuta con enlace firmado vigente.

**Acceptance Scenarios**:

1. **Given** un vendedor autenticado, **When** abre "mis ventas", **Then** ve SOLO los casos de sus ventas (autorización por vendedor en el servidor), cada uno con su etapa del pipeline y sus blockers en lenguaje de negocio.
2. **Given** un caso con minuta entregada, **When** el vendedor abre "mis documentos", **Then** ve las entregas de `escritura_deliveries` que le corresponden, con descarga vía enlace firmado (vigencia 7 días, mecanismo existente) y estado claro cuando el enlace venció (con regeneración del enlace, no del documento).
3. **Given** un blocker del tipo "dato del comprador faltante", **When** el vendedor lo ve, **Then** el texto dice qué falta y qué hacer, y nunca expone jerga interna (`variable_resolutions`, estados de máquina).

---

### User Story 4 - Visor de parcelas con ficha de lote (Priority: P2)

Como vendedor, quiero un mapa táctil del proyecto con los lotes coloreados por estado (disponible / reservado / vendido) y una ficha por lote (superficie, rol, precio, estado) al tocarlo, con la opción de compartir la ficha a un comprador por Telegram. Hoy esa información existe (tabla `geometries` + visor MapLibre web) pero por Telegram es texto.

**Why this priority**: Es la herramienta de venta en terreno. Depende de la US1 y reutiliza el visor de geometrías existente; se separa de la US5 para que el mapa tenga valor aunque la reserva siga saliendo por otro canal.

**Independent Test**: Abrir el mapa de un proyecto real (Teno), verificar que los polígonos y estados coinciden con `geometries` + `lots` en la base, tocar un lote y verificar su ficha, y compartir la ficha verificando que el link recibido abre el contexto correcto.

**Acceptance Scenarios**:

1. **Given** un vendedor con proyectos asignados (`vendor_projects`), **When** abre el mapa, **Then** ve los lotes del proyecto seleccionado con su estado actual, y solo proyectos a los que tiene acceso.
2. **Given** un lote tocado en el mapa, **When** se abre la ficha, **Then** muestra los datos reales del lote (superficie, rol, precio, estado) y las acciones según estado (reservar solo si está disponible).
3. **Given** la acción "Compartir ficha", **When** el vendedor la usa, **Then** se comparte por Telegram un enlace con el contexto del lote (mecánica `startapp`/`openTelegramLink`), sin exponer datos de otros lotes ni del pipeline interno.
4. **Given** un proyecto con decenas de lotes en un teléfono de gama media, **When** el mapa abre, **Then** carga y responde de forma fluida (ver SC-006).

---

### User Story 5 - Reserva estructurada desde la ficha del lote (Priority: P3)

Como vendedor, quiero crear la reserva desde la ficha del lote con un formulario validado (RUT chileno con dígito verificador, teléfono, correo), en vez de dictarle los datos al LLM. La solicitud entra al mismo flujo de aprobación existente y el admin la recibe como notificación accionable (US1+US2).

**Why this priority**: Cierra el círculo y ataca el hueco de venta desde el origen, pero requiere US1+US4 y un contrato nuevo de API; el flujo por chat sigue existiendo como alternativa.

**Independent Test**: Crear una reserva real desde la mini app con datos válidos, verificar el `approval_request` creado en la base (datos idénticos, sin parseo LLM de por medio), verificar la notificación al admin con botón contextual, y aprobar desde la mini app cerrando el ciclo completo sin salir de Telegram.

**Acceptance Scenarios**:

1. **Given** la ficha de un lote disponible, **When** el vendedor completa el formulario con un RUT inválido, **Then** la validación es inmediata en el cliente Y el servidor re-valida (la validación de cliente es UX, la de servidor es la real).
2. **Given** un formulario válido enviado, **When** el servidor procesa, **Then** re-verifica disponibilidad del lote y pertenencia del vendedor al proyecto, crea el `approval_request` por el mismo servicio del flujo actual, y responde con el estado — todo auditado.
3. **Given** dos envíos del mismo formulario (doble tap, reintento por red), **When** llegan al servidor, **Then** solo se crea UNA solicitud (idempotencia).
4. **Given** la reserva creada, **When** el admin recibe la notificación, **Then** trae el botón "Abrir caso" que aterriza en el detalle (US2) y el ciclo completo venta→aprobación ocurre sin salir de Telegram.

---

### Edge Cases

- **`initData` expirado o de replay**: `auth_date` fuera de la ventana aceptada → 401 y re-autenticación transparente (la mini app vuelve a pedir sesión con el `initData` fresco del SDK). Nunca sesiones eternas basadas en un `initData` viejo.
- **Token del bot rotado**: la validación HMAC usa el token vigente de la org (cache TTL 1h existente en `get_telegram_client_for_org` / RPC `get_decrypted_bot_token`); tras una rotación, las sesiones emitidas siguen válidas hasta su expiración pero los `initData` nuevos se validan contra el token nuevo.
- **Usuario vinculado que fue desactivado de la org**: la sesión se emite contra el estado ACTUAL de `organization_members`; un usuario removido recibe 403 aunque su `telegram_chat_id` siga en `profiles`.
- **Enlace de minuta vencido (7 días)**: la mini app muestra el estado vencido y ofrece regenerar el ENLACE (no el documento) por el mecanismo de entrega existente.
- **Telegram Desktop / tablets**: la mini app es mobile-first (~380 px) pero no debe romperse en viewports anchos; el mapa y las listas se adaptan.
- **Sin conexión a mitad de una decisión**: las acciones muestran estado pendiente/error explícito; jamás optimismo silencioso en decisiones (aprobar/rechazar).
- **Dos admins deciden el mismo caso a la vez**: gana el primero (comportamiento actual de `process_admin_decision`); el segundo recibe el estado ya resuelto, no un error críptico.
- **Next.js cachea la mini app**: las rutas `/mini` se sirven con rendering dinámico (`force-dynamic`) — trampa conocida de mini apps detrás de Vercel/Railway.
- **Organización sin bot configurado**: la mini app no es alcanzable para esa org (no hay bot que la lance); ninguna ruta debe asumir bot global.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: La mini app DEBE autenticar exclusivamente validando el `initData` de Telegram **en el servidor**: HMAC-SHA256 según la especificación oficial de Web Apps, contra el token del bot de la organización, con verificación de frescura de `auth_date` y comparación en tiempo constante. `initDataUnsafe` NUNCA es fuente de identidad.
- **FR-002**: Tras validar el `initData`, el sistema DEBE resolver el perfil por `telegram_chat_id` y el rol por membresía vigente (`organization_members` / `vendors`), y emitir una sesión de corta duración con `org_id`, `user_id` y rol. Toda emisión y todo rechazo de sesión DEBE quedar auditado (patrón `log_agent_action` existente).
- **FR-003**: Toda autorización DEBE ejecutarse en el servidor por sesión (rol y organización), reutilizando los patrones de [deps.py](../../apps/api/api/deps.py) (`require_admin_role`, derivar el tenant desde la base y no del payload). La UI puede ocultar acciones, pero el servidor es quien niega.
- **FR-004**: Las notificaciones existentes del bot (aprobaciones, excepciones de cascada, entregas de minuta) DEBEN incorporar un botón `web_app` que abra la mini app en la entidad exacta notificada. El bot DEBE exponer además el botón de menú persistente (`setChatMenuButton`) hacia la mini app.
- **FR-005**: La bandeja del admin DEBE unificar reservas pendientes y casos en excepción de su organización; el detalle de un caso DEBE mostrar las causas de `escritura_cascade_runs` humanizadas, los conflictos de variables con ambos valores y acceso a la evidencia documental.
- **FR-006**: Las decisiones desde la mini app DEBEN reutilizar los caminos existentes (`process_admin_decision`, reintento de cascada del SDD017) — la mini app es un cliente más, no una segunda máquina de estados. Ninguna lógica de negocio nueva vive en el frontend.
- **FR-007**: "Mis ventas" del vendedor DEBE filtrar por autoría en el servidor y traducir blockers a lenguaje de negocio; "mis documentos" DEBE listar las `escritura_deliveries` del usuario con enlaces firmados y manejo de vencimiento.
- **FR-008**: El visor de parcelas DEBE renderizar las geometrías reales (`geometries` + estado de `lots`) del proyecto, restringido a los proyectos del usuario, con ficha por lote y acción de compartir por Telegram.
- **FR-009**: La reserva desde la mini app DEBE validarse en cliente (UX inmediata) y re-validarse en servidor (RUT con dígito verificador, disponibilidad del lote, pertenencia del vendedor al proyecto), crear la solicitud por el servicio existente de reservas y ser idempotente ante reenvíos. El formulario NO DEBE ofrecer carga de imágenes de la cédula de identidad ni de ningún documento de identidad: por ley de protección de datos no se almacenan; solo se capturan los datos tipeados.
- **FR-010**: La mini app DEBE integrarse con la UX nativa de Telegram: `ready()` temprano, `expand()`, `MainButton` para la acción principal de cada pantalla, `BackButton`, `themeParams` con reacción a `themeChanged`, y `enableClosingConfirmation` en formularios con datos sin guardar.
- **FR-011**: Las rutas de la mini app DEBEN servirse con rendering dinámico y NO DEBEN depender de cookies del CRM web: la sesión de mini app es independiente de la sesión Supabase del navegador.
- **FR-012**: Toda acción de escritura originada en la mini app DEBE quedar auditada con el actor real (usuario resuelto, no el chat_id crudo) y el origen `miniapp`, distinguible del chat y de la web en `audit_logs`.
- **FR-013**: El chat con el agente LangGraph DEBE seguir funcionando sin regresión: mismos comandos, mismos flujos de vinculación, mismas decisiones por botón inline (conviven con los botones `web_app`).
- **FR-014**: Ningún secreto (token del bot, `INTERNAL_API_SECRET`, claves de firma de sesión) DEBE llegar al cliente; la mini app solo maneja su token de sesión de corta duración.

### Key Entities

- **Sesión de mini app**: credencial de corta duración emitida tras validar `initData`; porta usuario, organización, rol y chat_id. Sin estado en base de datos (verificable por firma); su emisión/rechazo se audita.
- **Notificación accionable**: mensaje existente del bot + botón `web_app` con deep link a una entidad (`caso`, `reserva`, `documento`). No es una entidad nueva de datos: es un contrato de URL.
- **Bandeja de decisión (admin)**: vista unificada de `approval_requests` pendientes + casos con resultado de cascada `exception`. Solo lectura agregada; las decisiones mutan por los servicios existentes.
- **Ficha de lote**: proyección pública-interna de `lots` + `geometries` + precio para el visor; no expone datos del pipeline legal.
- **Reserva estructurada**: mismo `approval_request` actual, originado por formulario validado en vez de parseo LLM, con clave de idempotencia.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Un admin vinculado pasa de la notificación de Telegram al detalle del caso con contexto completo en **≤ 2 taps** (botón de la notificación + nada más), contra el flujo actual de decidir a ciegas o abrir el CRM web en el navegador del teléfono.
- **SC-002**: Una reserva creada desde la mini app llega al `approval_request` con **0 errores de parseo** (RUT válido, datos idénticos a lo tecleado) en el 100% de los casos — contra el dictado al LLM, que no ofrece esa garantía.
- **SC-003**: El ciclo completo reserva (vendedor) → notificación → aprobación con contexto (admin) ocurre **sin salir de Telegram** y queda 100% auditado con actores reales y origen `miniapp`.
- **SC-004**: Un intento de sesión con `initData` inválido, expirado o de un usuario no vinculado es rechazado en el 100% de los casos, auditado, y sin filtrar datos de la organización.
- **SC-005**: El vendedor responde "¿en qué va la venta del lote X?" mirando "mis ventas" en **< 30 segundos**, sin preguntarle al agente ni al admin.
- **SC-006**: El mapa de un proyecto de ~53 lotes (Teno) abre y responde al primer toque en **< 3 segundos** en un teléfono de gama media con 4G.
- **SC-007**: `pnpm test:api`, `pnpm test:web`, `pnpm typecheck:web` y `pnpm build:web` quedan verdes al cierre de cada user story, y el quickstart E2E contra Supabase y Telegram reales pasa antes de declarar cualquier historia lista (regla de la casa: los tests con fakes ocultan bugs reales de PostgREST).

## Assumptions

- La vinculación de cuentas existente (deep link `/start TOKEN` + QR del CRM) es el único mecanismo de onboarding; la mini app no crea usuarios ni vincula por sí misma.
- Un bot por organización se mantiene (tabla `telegram_bots`, RPC `get_decrypted_bot_token`); la mini app se registra por bot en @BotFather y la URL se configura por entorno (`TELEGRAM_MINI_APP_URL`).
- El motor de negocio no se toca: cascada SDD017, `process_admin_decision`, servicio de reservas, entrega de minutas y enlaces firmados se consumen tal cual. La mini app es un cliente.
- La vista pública para compradores/leads (catálogo compartible) queda explícitamente **fuera de alcance** de este SDD; la acción "compartir ficha" comparte contexto para humanos, no un portal.
- Pagos (Telegram Stars, TON, Webpay) quedan fuera de alcance.
- **Protección de datos**: no se almacenan imágenes de cédulas de identidad ni de otros documentos de identidad — restricción legal, no técnica. Ninguna iteración futura de la mini app la reintroduce sin revisión legal explícita del usuario.
- El desarrollo local usa el túnel ngrok existente ([update_ngrok_webhook.py](../../apps/api/scripts/dev-only/update_ngrok_webhook.py)) — Telegram exige HTTPS para mini apps.
- La acción "devolver al vendedor con nota" (wireframe 5) se especifica como acción de la bandeja pero puede degradar a "rechazar con comentario" si el estado del motor no la soporta sin cambios; cualquier estado nuevo del motor requiere un SDD aparte.
