# Feature Specification: Remediación del pipeline venta→escritura y reducción de fricción

**Feature Branch**: `016-pipeline-remediacion-ux`

**Created**: 2026-07-06

**Status**: Draft

**Input**: Plan de remediación de la auditoría E2E (`specs/plan-remediacion-auditoria.md`), verificado contra el código el 2026-07-06 con cuentas reales admin/vendedor sobre el proyecto Teno.

---

## Context (leer antes de implementar)

Este feature **no construye el pipeline desde cero**: el motor de escrituras (SDD 006→011) ya existe. Arregla los puntos donde el pipeline se corta hoy y reduce la fricción para que abogados y administradores nuevos lo usen sin resistencia. La auditoría verificó, con datos reales, que:

- **Funciona hoy:** login, matriz de variables del proyecto, aprobación de la matriz, verificación de cabida/deslindes de un lote, registro de venta por el vendedor, aprobación de la venta por Telegram, y la generación del DOCX de la minuta (mecánicamente).
- **Se corta hoy:** al validar la venta, el puente que copia los datos del comprador/precio/lote a las variables de la escritura **revienta siempre** (bug de una línea), así que todo caso queda "esperando datos". Además la escritura no le llega al administrador, el gate de "revisión jurídica" no tiene ningún botón en la UI, y hay ~60 aprobaciones/verificaciones para configurar un proyecto.

**Glosario mínimo (para el agente implementador):**

- **Molde / matriz del proyecto:** plantilla aprobada una vez por proyecto con los datos comunes (predio, título, SAG); deja los datos de cada venta como "huecos".
- **Caso de escritura (`escritura_cases`):** una venta concreta de un lote; hereda el molde y rellena los huecos con los datos de esa venta.
- **Puente operacional (`escritura_operational_bridge.py`):** copia los datos de `lot_records`/`lots` a variables de la escritura (`variable_resolutions`).
- **Gate:** condición que un caso debe cumplir para generar la minuta (party_verified, price_verified, geometry_verified, legal_review_ready, etc.).
- **Mesa:** la pantalla que muestra la escritura renderizada con sus huecos y pendientes.

Datos de referencia: proyecto Teno `aad0fbf2-ceda-47bc-954a-b3f5f2ac8797`, org `7a0203ce-8b31-4661-a7b7-933613d49069`, backend Supabase `swkrnjdpnlrgxgotmfxy`.

---

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Una venta genera y entrega la escritura sin intervención manual (Priority: P1) 🎯 MVP

Cuando el administrador valida una venta, el sistema debe rellenar automáticamente los datos del comprador, precio, lote y servidumbre en la escritura, pasar por la revisión jurídica del abogado como un paso visible, generar la minuta y entregarla al administrador por Telegram. Hoy este flujo se corta en el primer paso.

**Why this priority**: Es el corazón del producto. Sin esto, ninguna venta llega a escritura y nada de lo demás importa. Es el MVP: si solo se implementa esta historia, el pipeline ya funciona de punta a punta para un proyecto configurado.

**Independent Test**: Con el molde de Teno aprobado, registrar una venta nueva → aprobarla → verificar que el caso pasa de `variables_pending` a "esperando revisión jurídica", que el abogado la aprueba desde la mesa, que se genera la minuta y que llega un documento al Telegram del administrador. Sin ejecutar nada de SQL a mano.

**Acceptance Scenarios**:

1. **Given** una venta aprobada de un lote cuya matriz de proyecto está aprobada, **When** corre el hook post-venta, **Then** las variables `comprador.*`, `transaccion.*`, `lote.*` y `servidumbre.*` del caso quedan pobladas desde `lot_records`/`lots` (filas `lot_id`-scoped en `variable_resolutions`).
2. **Given** un caso con todos los datos de venta poblados, **When** se evalúan los gates, **Then** el único pendiente humano es la revisión jurídica (los gates de proyecto se heredan del molde).
3. **Given** un caso "esperando revisión jurídica", **When** el abogado hace clic en "Aprobar revisión jurídica" en la mesa, **Then** se escribe `revision_juridica.estado='aprobada'` + `aprobada_por` + `aprobada_at` y el caso pasa a `ready_for_minuta`.
4. **Given** una minuta generada, **When** termina la generación, **Then** llega el documento al Telegram del administrador de la organización y se registra una fila `sent` en `escritura_deliveries` con `recipient_user_id` no nulo.
5. **Given** la organización sin datos bancarios cargados (`organization_payment_info` vacío), **When** corre el puente, **Then** el puente completa igual (los datos bancarios son opcionales) y no lanza excepción.
6. **Given** una venta que envía `cliente_nacionalidad`, `cliente_region` y `cliente_comuna`, **When** se aprueba, **Then** esos datos se persisten en `lot_records` y `comprador.nacionalidad` queda disponible como variable del caso.

---

### User Story 2 - Configurar el molde en un clic, no variable por variable (Priority: P2)

El abogado revisa la escritura renderizada y aprueba el molde con un solo botón que también aprueba las variables extraídas de alta confianza. Hoy el botón "Aprobar molde" no hace nada, y aprobar exige revisar variable por variable más dos pasos separados (enviar + aprobar).

**Why this priority**: Es la mayor fuente de fricción del lado de configuración. Reduce la carga cognitiva del abogado de ~13 decisiones + 2 pasos a 1 acción informada, sin perder control sobre lo dudoso.

**Independent Test**: En el Centro de Control Legal de un proyecto con variables extraídas, hacer clic en "Aprobar molde" → confirmar en el diálogo que lista las variables de confianza ≥0,9 que se aprobarán → verificar que la matriz del proyecto queda `approved` y el estado muestra "Molde aprobado · esperando ventas".

**Acceptance Scenarios**:

1. **Given** un molde con variables `proposed` de confianza ≥0,9 con evidencia, **When** el admin hace clic en "Aprobar molde" y confirma, **Then** esas variables se aprueban en bloque y la matriz de proyecto pasa a `submitted`+`approved` en una sola acción.
2. **Given** variables de confianza <0,9 o en conflicto, **When** se aprueba el molde, **Then** esas variables NO se auto-aprueban y siguen exigiendo decisión explícita.
3. **Given** el molde ya aprobado, **When** se abre el Centro de Control Legal, **Then** el botón muestra "Molde aprobado · esperando ventas" y está deshabilitado.
4. **Given** faltan huecos obligatorios del molde, **When** se intenta aprobar, **Then** se muestra un mensaje claro con qué falta, no un fallo silencioso.

---

### User Story 3 - Reservar y vender sin re-tipear ni re-aprobar lo mismo (Priority: P2)

El formulario de reserva pide lo mínimo (compromiso comercial); el de venta pide lo legal completo. Al concretar la venta de un lote reservado, los datos del cliente vienen pre-cargados desde la reserva, y el administrador solo confirma el delta (valor final), no re-aprueba todo.

**Why this priority**: Elimina el re-tipeo completo del vendedor y la doble aprobación del admin en el camino reserva→venta, que es el más común en terreno.

**Independent Test**: Reservar un lote con datos mínimos → aprobar la reserva → abrir "Solicitar Venta" en ese lote → verificar que el formulario llega con nombre/RUT/contacto pre-cargados y editables → enviar → verificar que la notificación al admin muestra el delta (valor final) y no el formulario completo.

**Acceptance Scenarios**:

1. **Given** el formulario de reserva, **When** el vendedor lo abre, **Then** solo son obligatorios identificación (nombre, RUT), contacto y valor de reserva; los datos legales completos son opcionales; no pide notaría ni fecha de firma.
2. **Given** un lote `reservado` con datos en `lot_records`, **When** el vendedor abre "Solicitar Venta", **Then** el formulario de venta llega pre-poblado con los datos de la reserva, editables, con aviso "Datos cargados desde la reserva" y foco en el primer campo vacío.
3. **Given** una venta que viene de una reserva aprobada con el mismo RUT, **When** llega al admin, **Then** la notificación muestra solo el delta ("Ya aprobaste la reserva de {cliente} para el lote {N}; valor final $X — Confirmar / Rechazar").
4. **Given** una venta directa (sin reserva previa), **When** llega al admin, **Then** mantiene la aprobación completa (sin cambios).
5. **Given** un intento de transición de estado inválida en un lote (p. ej. vendido→disponible sin liberar), **When** se ejecuta, **Then** el sistema la rechaza server-side con error visible; nunca queda `sold_at` seteado con `estado='disponible'`.

---

### User Story 4 - Camino guiado para configurar un proyecto desde cero (Priority: P2)

Un usuario que nunca vio la plataforma ve un checklist del proyecto que le dice qué paso sigue (Documentos → Título → Variables → Molde → Lotes verificados → Habilitado para ventas), puede conectar su Telegram y cargar los datos de su organización desde la UI, y solo ve en el menú lo que su rol permite.

**Why this priority**: Sin esto, un usuario nuevo no sabe el orden del flujo ni puede recibir notificaciones (Telegram se poblaba a mano). Es lo que separa "demo con datos sembrados" de "producto usable por terceros".

**Independent Test**: Con un proyecto nuevo vacío, verificar que el checklist muestra los pasos pendientes con su CTA; conectar Telegram desde Configuración y recibir una notificación de prueba; cargar los datos de la organización; iniciar sesión como vendedor y verificar que no ve mesa/plantillas/vendedores en el menú.

**Acceptance Scenarios**:

1. **Given** un proyecto en cualquier etapa, **When** se abre su vista general, **Then** un checklist muestra Documentos / Título / Variables / Molde aprobado / Lotes verificados / Habilitado para ventas, cada uno con estado (hecho/pendiente) y su CTA.
2. **Given** el estado real del proyecto (geometría cargada, matriz aprobada, ventas registradas), **When** se muestra el estado de preparación, **Then** refleja la realidad (no "Borrador — falta cargar geometría" con 53 lotes cargados).
3. **Given** Configuración, **When** el admin abre "Datos de la organización para escrituras", **Then** puede cargar razón social, RUT, banco/cuenta y mandatario por defecto.
4. **Given** Configuración, **When** el admin abre "Conectar Telegram", **Then** ve un deep link al bot y su `telegram_chat_id` queda vinculado tras verificar.
5. **Given** un usuario con rol `user` (vendedor), **When** se renderiza el sidebar, **Then** no ve Mesa/Plantillas/Vendedores, y las rutas correspondientes están bloqueadas server-side.
6. **Given** un lote no verificado, **When** el vendedor intenta venderlo, **Then** se le avisa "Este lote aún no tiene cabida/deslindes verificados; la escritura quedará en espera" antes de enviar.

---

### User Story 5 - Verificar los lotes que coinciden con el plano en una acción (Priority: P2)

El administrador verifica de una sola vez todos los lotes cuya cabida calculada coincide con el plano dentro de tolerancia, y solo revisa manualmente los desviados. Hoy son 53 paneles individuales para confirmar diferencias de 0,0%.

**Why this priority**: Es el quick-win más visible para el usuario final del lado de configuración: 53 acciones → ~2.

**Independent Test**: En un proyecto con lotes con geometría asignada, hacer clic en "Verificar los N lotes que coinciden con el plano" → verificar que los lotes dentro de tolerancia quedan `verified_exact` con `verified_by=admin`, y que los desviados aparecen en la cola de revisión manual.

**Acceptance Scenarios**:

1. **Given** lotes con diferencia CALC vs oficial dentro de tolerancia (default 0,5%), **When** el admin ejecuta la verificación masiva, **Then** esos lotes quedan `verified_status='verified_exact'` con `verified_by` del admin, en una transacción auditada.
2. **Given** lotes con desviación fuera de tolerancia, **When** corre la verificación masiva, **Then** NO se auto-verifican y quedan listados para revisión manual.
3. **Given** el resultado de la verificación masiva, **When** termina, **Then** se muestra un resumen "N verificados, M desviados para revisión".

---

### User Story 6 - Seguridad para exponer a producción (Priority: P1 como gate de piloto)

Antes de invitar usuarios reales, las funciones de descifrado no deben ser ejecutables por `anon`, y los documentos legales no deben estar en un bucket público.

**Why this priority**: Aunque es independiente del pipeline funcional, es un **gate duro** para el piloto: hoy cualquiera con la anon key del bundle web puede extraer el token de Telegram descifrado, y los dominios vigentes (con PII de dueños) están en un bucket público. No se invita a nadie sin cerrar esto.

**Independent Test**: Verificar que `POST /rest/v1/rpc/get_decrypted_bot_token` con la anon key devuelve permiso denegado; verificar que el bucket `project-files` es privado y sus objetos se sirven con URL firmada.

**Acceptance Scenarios**:

1. **Given** la anon key, **When** se llama `get_decrypted_bot_token`/`decrypt_credential`/`get_mcp_credentials`, **Then** la ejecución es rechazada (revocado `EXECUTE` a `anon`/`authenticated`).
2. **Given** el bucket `project-files`, **When** se consulta un objeto sin URL firmada, **Then** el acceso es denegado; con URL firmada, permitido.
3. **Given** la app funcionando, **When** se cargan/ven documentos legales, **Then** siguen funcionando vía URLs firmadas (sin regresión).

---

### User Story 7 - Salud de código y limpieza pre-piloto (Priority: P3)

Eliminar código muerto, duplicación y datos de prueba inconsistentes que ensucian el piloto.

**Why this priority**: No bloquea el flujo, pero reduce el riesgo de regresiones y confusión durante el piloto.

**Independent Test**: `pnpm build:web` y `pnpm test:api` verdes tras eliminar `generation-wizard.tsx`, `reserve-lot.action.ts` y extraer el helper de aprobación; datos de prueba de Teno limpios.

**Acceptance Scenarios**:

1. **Given** el árbol de código, **When** se borran los archivos huérfanos, **Then** `pnpm build:web` y `pnpm typecheck:web` siguen verdes.
2. **Given** las dos funciones de aprobación casi idénticas, **When** se extrae el helper común, **Then** el comportamiento es idéntico y los tests pasan.

---

### Edge Cases

- **Puente sin datos bancarios:** debe completar; los datos bancarios son opcionales (US1-AS5).
- **Venta de lote sin matriz de proyecto aprobada:** el caso queda "esperando molde del proyecto" (comportamiento existente, no romper).
- **Venta de lote no verificado:** se avisa antes de enviar; el caso se bloquea en `geometry_verified` con mensaje claro (US4-AS6).
- **Admin sin Telegram vinculado:** la entrega cae a "mis documentos" web y se registra `unavailable`; nunca `sent` con recipient nulo (US1-AS4).
- **Reserva sin datos legales completos y luego venta:** el prefill trae lo que exista; el formulario de venta exige completar lo faltante (US3-AS2).
- **Verificación masiva con lotes sin geometría:** se omiten (no se pueden calcular) y aparecen como pendientes de asignar geometría.
- **Re-aprobación del molde tras cambios:** re-aprobar debe re-evaluar los casos `variables_pending` del proyecto (US1 + recompute).

---

## Requirements _(mandatory)_

### Functional Requirements

**Pipeline (US1)**

- **FR-001**: El puente operacional MUST tolerar resultados PostgREST `None` (0 filas) sin lanzar excepción; los datos bancarios de la organización son opcionales.
- **FR-002**: El sistema MUST loguear a nivel `error` (no `warning`) cuando el puente puebla 0 variables donde debía poblar N, y contar las variables efectivamente pobladas.
- **FR-003**: Los payloads de reserva y venta MUST aceptar y persistir `cliente_nacionalidad`, `cliente_region`, `cliente_comuna`, `notaria` y `fecha_firma`.
- **FR-004**: El RPC de aprobación MUST copiar esos campos a `lot_records`; el puente MUST mapear `comprador.nacionalidad` desde `lot_records`.
- **FR-005**: Al aprobar la matriz del proyecto, el sistema MUST re-evaluar (recompute) los casos `variables_pending` de ese proyecto.
- **FR-006**: El botón "Verificar" de la mesa MUST llamar al re-stage del caso y refrescar los gates.
- **FR-007**: El sistema MUST exponer una acción "Aprobar revisión jurídica" (solo admin/abogado) que escriba `revision_juridica.estado='aprobada'` + `aprobada_por` + `aprobada_at`, auditada, con contraparte de rechazo+comentario.
- **FR-008**: El caso MUST mostrar "Esperando revisión jurídica" como paso visible del flujo, no como variable críptica faltante.
- **FR-009**: La minuta generada MUST entregarse al administrador de la organización por Telegram; el vendedor recibe copia si tiene Telegram vinculado.
- **FR-010**: El sistema MUST NO marcar una entrega como `sent` si `recipient_user_id` es nulo; en ese caso registra estado `unavailable`/`unresolved`.

**Fricción / molde (US2)**

- **FR-011**: "Aprobar molde" MUST enviar (submit) y aprobar (approve) la matriz del proyecto en una sola acción para rol admin.
- **FR-012**: Al aprobar el molde, el sistema MUST auto-aprobar las variables `proposed` de confianza ≥0,9 con evidencia, listándolas en el diálogo de confirmación.
- **FR-013**: Variables de confianza <0,9 o en conflicto MUST NOT auto-aprobarse.
- **FR-014**: El caso MUST heredar del molde aprobado los gates de proyecto (título, SAG, SII-matriz) y no re-mostrarlos como pendientes; solo lista datos de venta, lote verificado y revisión jurídica.

**Formularios / venta (US3)**

- **FR-015**: El sistema MUST tener un `reservationSchema` liviano (identificación + contacto + valor) y un `saleSchema` estricto (legal completo + firma), con secciones de formulario compartidas.
- **FR-016**: Al vender un lote `reservado`, el formulario de venta MUST pre-cargar los datos del cliente desde `lot_records` (fallback: última reserva aprobada), editables.
- **FR-017**: Una venta que viene de reserva aprobada con el mismo RUT MUST presentarse al admin como confirmación de delta, no como aprobación completa.
- **FR-018**: El sistema MUST validar server-side las transiciones de `lots.estado`; las inválidas se rechazan.
- **FR-019**: El bulk-update de lotes MUST validar `response.ok` y mostrar error en fallo (no fallo silencioso).

**Camino guiado (US4)**

- **FR-020**: La vista general del proyecto MUST mostrar un checklist de preparación con estado real por paso y su CTA.
- **FR-021**: El estado de preparación del proyecto MUST derivarse del estado real (geometría/matriz/ventas), no de un flag fijo.
- **FR-022**: Configuración MUST permitir cargar los datos de la organización para escrituras (razón social, RUT, banco/cuenta, mandatario por defecto).
- **FR-023**: Configuración MUST permitir conectar Telegram (deep link + vinculación de `telegram_chat_id`).
- **FR-024**: El sidebar MUST filtrar los ítems por rol; las rutas restringidas MUST tener guard server-side.
- **FR-025**: El panel del lote MUST avisar antes de vender un lote no verificado.

**Verificación masiva (US5)**

- **FR-026**: El sistema MUST ofrecer verificación masiva de lotes dentro de tolerancia (default 0,5%, configurable), auditada, dejando los desviados en revisión manual, con resumen del resultado.

**Seguridad (US6)**

- **FR-027**: `get_decrypted_bot_token`, `decrypt_credential`, `get_mcp_credentials` MUST NOT ser ejecutables por `anon`/`authenticated`.
- **FR-028**: El bucket `project-files` MUST ser privado y servirse con URLs firmadas, sin regresión de carga/visualización.

**Salud de código (US7)**

- **FR-029**: El sistema MUST eliminar código muerto (`generation-wizard.tsx`, `reserve-lot.action.ts`) sin romper build/typecheck.
- **FR-030**: El sistema MUST extraer el helper común de las dos funciones de aprobación conservando el comportamiento.

### Key Entities _(include if feature involves data)_

- **lot_records** (existente, se extiende): registro comercial/legal de la venta de un lote. Nuevas columnas: `cliente_nacionalidad`, `cliente_region`, `cliente_comuna` (y persistir `notaria`/`fecha_firma` ya existentes en payload).
- **variable_resolutions** (existente): resoluciones de variables por proyecto/lote. Se añade la escritura de `revision_juridica.*` scope lote.
- **escritura_cases** (existente): caso de escritura de una venta. `readiness_gates` deja de contar los heredados del molde como pendientes del caso.
- **escritura_deliveries** (existente): entregas auditadas. Se resuelve destinatario = admin (+vendedor opcional); nunca `sent` sin recipient.
- **escritura_matrices** (existente): molde del proyecto. La aprobación colapsa submit+approve.
- **organization_payment_info** (existente, gana UI): datos bancarios + razón social/RUT de la organización. Opcional para el pipeline.
- **organization defaults (mandatario, abogado_redactor)**: datos de organización para escrituras, staged como variables de proyecto con default de org. (Decidir en research: columna en tabla de org vs. variable manual.)
- **telegram_bots / profiles.telegram_chat_id** (existentes, ganan UI): conexión de Telegram por org y por usuario.
- **lots.estado** (existente): máquina de estados con transiciones válidas server-side.

---

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Una venta nueva sobre un proyecto con molde aprobado llega de "venta aprobada" a "minuta generada y entregada al admin por Telegram" con **0 comandos SQL manuales** y **≤2 acciones humanas** (confirmación de venta + revisión jurídica).
- **SC-002**: El caso de una venta muestra **≤2 pendientes humanos** en la mesa (no ~35), midiendo los gates que quedan tras heredar los del molde.
- **SC-003**: Configurar un proyecto desde cero baja de **~60 acciones** (13 variables + 2 pasos de molde + 53 lotes) a **≤12 acciones** (título + manuales + 1 aprobación de molde + verificación masiva + lotes desviados).
- **SC-004**: Vender un lote reservado baja de **4 formularios/aprobaciones completas** a **2 actos reales** (confirmación delta + revisión jurídica), con el formulario de venta pre-cargado.
- **SC-005**: Un usuario nuevo puede, desde la UI y sin ayuda, conectar Telegram, cargar los datos de su organización y saber cuál es el siguiente paso del proyecto (checklist visible).
- **SC-006**: La verificación masiva verifica todos los lotes dentro de tolerancia de un proyecto de 53 lotes en **1 acción** y deja los desviados aparte.
- **SC-007**: `get_decrypted_bot_token` no es ejecutable con la anon key, y `project-files` es privado; sin regresión funcional.
- **SC-008**: `pnpm test:api`, `pnpm --filter web test`, `pnpm typecheck:web` y `pnpm build:web` quedan verdes al cierre de cada user story.

---

## Assumptions

- El motor de escrituras (SDD 006→011) y la mesa (SDD 010) existen y NO se reconstruyen; este feature solo los arregla y reduce fricción.
- La rama 015 (rediseño de identidad UI) está en vuelo; este feature parte desde `main` o desde 015 según decida el usuario (ver research). Los formularios ya piden nacionalidad/región/comuna en 015.
- El "abogado redactor" y el "mandatario" son datos de organización con default; no se pide por venta.
- La confianza de extracción (`confidence`) ya existe en `variable_resolutions` (0.0–1.0) y sirve como umbral para la auto-aprobación del molde.
- El piloto correrá contra el mismo backend Supabase que hoy es dev, salvo que el usuario decida separar staging/prod (fuera del alcance de código de este feature; se documenta como pre-requisito operativo).

## Human Gates (los marca el usuario, nunca un agente)

- **HG-1 (pre-implementación):** confirmar destino de entrega (admin siempre, vendedor opcional) y si la venta desde reserva con RUT+valor coincidentes se auto-aprueba o solo muestra delta.
- **HG-2 (pre-piloto):** aprobar la migración de seguridad (revocar grants + bucket privado) y la limpieza de datos de prueba de Teno.
- **HG-3 (cierre):** sesión de usabilidad con un usuario nuevo real que valide SC-003/SC-004/SC-005.
