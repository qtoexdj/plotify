# Feature Specification: Gestión completa de notificaciones

**Feature Branch**: `021-notificaciones-gestion-completa`

**Created**: 2026-08-14

**Status**: Draft

**Input**: User description: "Completar la gestión de notificaciones de la campana: descarte por ítem, contador de pendientes, copy accionable con navegación, lectura masiva, historial acotado y actualización proactiva sin recarga."

## Contexto

La campana de notificaciones actual (Spec 002) muestra solicitudes de venta/reserva con estados y permite aprobar/rechazar y marcar leído individual o masivamente. El análisis de 2026-08-14 identificó los siguientes vacíos funcionales y de diseño:

1. No existe forma de descartar (borrar/ocultar) notificaciones: la columna `dismissed_at` existe en datos pero ningún flujo la escribe, y la lista crece indefinidamente.
2. La campana muestra solo un punto indicador; no muestra el número de solicitudes pendientes accionables.
3. El texto de contexto (título, mensaje y llamada a la acción con enlace a la mesa/borrador) se calcula pero nunca se muestra ni permite navegar.
4. "Marcar todo como leído" realiza una petición por ítem.
5. La lista no tiene límite ni paginación; todo el historial vive en el dropdown.
6. La campana solo se refresca al cargar la página y tras acciones propias; las solicitudes nuevas no aparecen sin recargar.
7. Los controles no son accesibles por teclado ni lectores de pantalla.

Los bugs de duplicación de eventos y de aislamiento por rol fueron corregidos previamente y son el baseline de este SDD.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Descartar notificaciones (Priority: P1)

Un administrador o vendedor revisa su campana y quiere retirar de su vista las notificaciones que ya no le aportan (por ejemplo, solicitudes ya procesadas que ya revisó), sin perder la trazabilidad histórica.

**Why this priority**: Es el vacío más evidente de la gestión diaria: sin descarte, la campana acumula ruido y se vuelve inútil con el tiempo. Es independiente del resto y entrega valor por sí solo.

**Independent Test**: Se puede probar creando notificaciones y descartándolas desde la campana: desaparecen de inmediato, no reaparecen al recargar y el conteo se ajusta.

**Acceptance Scenarios**:

1. **Given** una notificación visible en la campana, **When** el usuario activa el control de descartar de ese ítem, **Then** el ítem desaparece del listado principal de forma inmediata.
2. **Given** una notificación descartada, **When** el usuario recarga la página o abre la campana nuevamente, **Then** la notificación no vuelve a aparecer en el listado principal ni se cuenta en los contadores.
3. **Given** una notificación descartada, **When** se inspeccionan los registros, **Then** el evento conserva una marca temporal de descarte y NO fue eliminado físicamente (auditoría intacta).
4. **Given** una notificación pendiente de decisión, **When** el usuario la descarta, **Then** la solicitud subyacente sigue siendo decidible por otros canales (Telegram, mesa) y el descarte no altera el proceso de aprobación.
5. **Given** un fallo de red durante el descarte, **When** la petición falla, **Then** la notificación permanece en la lista con un mensaje de error visible y el estado no queda corrupto.

### User Story 2 - Contador de pendientes accionables (Priority: P1)

El usuario quiere saber de un vistazo cuántas solicitudes requieren su acción, sin abrir la campana.

**Why this priority**: El indicador actual (un punto) no cumple el requisito original de mostrar un conteo y resta valor operativo a la campana.

**Independent Test**: Se puede probar creando N solicitudes pendientes y verificando que la campana muestra N y que decrementa al decidir o descartar.

**Acceptance Scenarios**:

1. **Given** tres solicitudes pendientes para el usuario, **When** la campana carga, **Then** muestra el número 3 junto al ícono.
2. **Given** un conteo visible, **When** el usuario aprueba o rechaza una solicitud (desde la campana o cualquier canal), **Then** el conteo se actualiza en la siguiente actualización de la campana.
3. **Given** cero solicitudes pendientes, **When** la campana carga, **Then** no muestra número ni punto.
4. **Given** una solicitud pendiente descartada, **When** la campana se actualiza, **Then** deja de contarse en el número mostrado.

### User Story 3 - Copy accionable con navegación (Priority: P1)

Cada notificación debe mostrar su texto de contexto real (por ejemplo, "Borrador por revisar" con acción "Abrir borrador") y permitir llegar al destino con un clic.

**Why this priority**: El texto y los enlaces ya se calculan en el servidor pero se descartan en la interfaz; hoy la notificación muestra etiquetas genéricas y obliga al usuario a buscar el destino manualmente.

**Independent Test**: Se puede probar con una venta aprobada con borrador listo: la notificación muestra la llamada a la acción y un clic lleva a la mesa del borrador.

**Acceptance Scenarios**:

1. **Given** una notificación de venta aprobada con borrador listo, **When** el usuario la ve, **Then** muestra el título de contexto ("Borrador por revisar") y la acción correspondiente.
2. **Given** una notificación con destino asociado, **When** el usuario activa la acción o hace clic en el cuerpo navegable, **Then** navega al destino correcto (mesa/borrador del caso) en la misma pestaña o una nueva.
3. **Given** una notificación sin destino asociado (por ejemplo, venta rechazada), **Then** no muestra enlace ni botón de navegación.
4. **Given** un vendedor viendo una notificación, **Then** nunca ve controles ni enlaces de decisión administrativa.

### User Story 4 - Lectura masiva y refresco al abrir (Priority: P2)

El usuario quiere marcar todo como leído en una sola acción y ver datos frescos cada vez que abre la campana.

**Why this priority**: Reduce fricción diaria y corrige la ineficiencia actual (N peticiones) y el riesgo de ver datos viejos al abrir.

**Independent Test**: Con 10+ notificaciones sin leer, se pulsa "Marcar todo como leído" y se verifica que el contador llega a 0 con una sola operación; al cerrar y reabrir la campana los datos se refrescan.

**Acceptance Scenarios**:

1. **Given** diez notificaciones sin leer, **When** el usuario pulsa "Marcar todo como leído", **Then** todas quedan marcadas en una única operación y el contador llega a 0.
2. **Given** la campana cerrada con datos de hace 5 minutos, **When** el usuario la abre, **Then** solicita datos actualizados y muestra el estado vigente (con indicador de carga si corresponde).
3. **Given** un error en la operación masiva, **When** falla, **Then** el usuario ve un mensaje de error y el estado previo permanece.

### User Story 5 - Actualización proactiva sin recarga (Priority: P2)

Las solicitudes nuevas deben aparecer en la campana sin que el usuario recargue la página ni abra manualmente la campana.

**Why this priority**: Una campana con datos viejos genera decisiones tardías y desconfianza; la actualización automática es condición para que el resto del flujo sea confiable.

**Independent Test**: Con la página abierta, se crea una solicitud desde otro canal y se verifica que el contador/lista se actualiza solo en un plazo acotado.

**Acceptance Scenarios**:

1. **Given** la página abierta con la campana cargada, **When** se crea una nueva solicitud pendiente para el usuario, **Then** el contador refleja la novedad en un máximo de 60 segundos sin interacción del usuario.
2. **Given** la pestaña en segundo plano, **When** vuelve al primer plano, **Then** la campana se refresca de inmediato.
3. **Given** una sesión inactiva prolongada, **When** se cierra sesión o expira, **Then** la actualización automática deja de consumir recursos sin errores visibles.

### User Story 6 - Historial acotado y carga progresiva (Priority: P3)

El usuario quiere ver notificaciones antiguas sin que la campana cargue todo el historial en cada apertura.

**Why this priority**: Controla el crecimiento de datos y el rendimiento a medida que el producto acumula meses de uso.

**Independent Test**: Con más de N notificaciones, la campana muestra las N más recientes y permite cargar más bajo demanda.

**Acceptance Scenarios**:

1. **Given** más de 50 notificaciones en el historial, **When** el usuario abre la campana, **Then** se muestran las 50 más recientes y la carga inicial es inmediata.
2. **Given** una lista truncada, **When** el usuario activa "Cargar más", **Then** se agregan las siguientes notificaciones al final de la lista.
3. **Given** una notificación muy antigua, **Then** sigue accesible mediante la carga progresiva dentro del periodo de retención definido.

### User Story 7 - Accesibilidad de la campana (Priority: P3)

Todos los controles de la campana deben ser operables por teclado y legibles por lectores de pantalla.

**Why this priority**: Es requisito de calidad transversal (WCAG) y de bajo costo relativo al resto.

**Independent Test**: Se navega la campana solo con teclado (Tab, Enter, Escape) y se verifica con lector de pantalla que los estados (sin leer, pendiente, descartar) se anuncian.

**Acceptance Scenarios**:

1. **Given** la campana abierta, **When** el usuario navega con Tab, **Then** alcanza y activa todos los controles (marcar leído, descartar, decidir, cerrar) sin mouse.
2. **Given** una notificación sin leer, **When** un lector de pantalla la recorre, **Then** anuncia su estado y las acciones disponibles.
3. **Given** la campana cerrada, **When** el usuario presiona Escape, **Then** el foco vuelve al disparador de la campana.

### Edge Cases

- Doble clic rápido en descartar o en decidir: la segunda acción debe ser inofensiva (idempotente).
- Descartar una solicitud aún pendiente no debe impedir su decisión por otros canales.
- Un vendedor que intenta descartar o marcar una notificación ajena debe ser rechazado sin efectos.
- La lista vacía tras descartar todo muestra el estado vacío existente ("Todo al día").
- La agrupación temporal (Hoy/Ayer/Esta semana/Anteriores) debe usar las fechas del servidor, no el reloj del cliente.
- Notificaciones duplicadas previas al fix: el sistema no debe volver a generarlas (baseline corregido).

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: El sistema DEBE permitir a cada destinatario descartar (ocultar) cada notificación individualmente mediante un control visible en el ítem.
- **FR-002**: El descarte DEBE ser suave: se registra una marca temporal en el evento y el registro permanece para auditoría; nunca se elimina físicamente por la vía del usuario.
- **FR-003**: Las notificaciones descartadas NO DEBEN aparecer en el listado principal ni contar en los contadores en ninguna consulta posterior.
- **FR-004**: El descarte DEBE respetar el aislamiento por rol: un vendedor solo puede descartar sus propias notificaciones; un administrador, las de su organización dentro de su alcance.
- **FR-005**: La campana DEBE mostrar un conteo numérico de solicitudes pendientes accionables para el usuario, y mostrarlo actualizado al abrir la campana.
- **FR-006**: Cada notificación DEBE mostrar su texto de contexto (título y llamada a la acción) calculado por el sistema, sin exponer datos de otros usuarios.
- **FR-007**: Cuando una notificación tiene un destino asociado (mesa o borrador), el usuario DEBE poder navegar a él con un solo clic desde la notificación.
- **FR-008**: "Marcar todo como leído" DEBE ejecutarse como una única operación y reflejar el resultado en la lista y contadores sin recargar la página.
- **FR-009**: Al abrir la campana, el sistema DEBE solicitar datos actualizados y mostrar el estado vigente, con indicador de carga si la consulta tarda.
- **FR-010**: Las solicitudes nuevas DEBEN reflejarse en la campana en un máximo de 60 segundos sin recarga manual mientras la página esté abierta.
- **FR-011**: La lista DEBE devolver como máximo 50 notificaciones por consulta, ordenadas de más reciente a más antigua, con la posibilidad de cargar las siguientes bajo demanda.
- **FR-012**: Los controles de la campana (descartar, marcar leído, decidir, cerrar) DEBEN ser operables por teclado y anunciar su estado a lectores de pantalla.
- **FR-013**: El sistema DEBE auditar el descarte (actor, evento y momento) sin exponer detalles sensibles a otros usuarios.

### Key Entities _(include if feature involves data)_

- **Evento de notificación** (existente): representa una entrega/aviso dirigida a un destinatario para una solicitud de aprobación. Atributos relevantes: solicitud asociada, organización, destinatario, rol del destinatario, estado de lectura, **estado de descarte (nuevo uso)**, canal de entrega, estado de entrega y fecha de creación.
- **Solicitud de aprobación** (existente): origen de cada notificación; sus estados pendiente/aprobado/rechazado determinan el conteo accionable.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: El 100% de las solicitudes pendientes accionables del usuario se reflejan en el conteo de la campana en menos de 2 segundos tras abrirla.
- **SC-002**: Un usuario descarta una notificación en como máximo 2 acciones y esta no reaparece en ninguna consulta posterior.
- **SC-003**: Las solicitudes nuevas aparecen en la campana sin recarga manual en un máximo de 60 segundos con la página abierta.
- **SC-004**: Ninguna notificación descartada aparece en el listado principal; el registro de auditoría conserva el evento con su marca de descarte.
- **SC-005**: Llegar desde una notificación a su destino asociado toma exactamente 1 clic.
- **SC-006**: Marcar N notificaciones como leídas (N ≤ 100) toma 1 acción del usuario y completa en menos de 3 segundos.
- **SC-007**: Con más de 50 notificaciones, la apertura de la campana muestra las más recientes sin demora perceptible (>1 s) en condiciones normales de red.

## Assumptions

- El descarte es suave (soft-dismiss) por defecto para preservar la auditoría exigida por el Spec 002 (FR-016). El borrado físico queda fuera del alcance de este SDD.
- La actualización proactiva se resuelve con refresco al abrir + refresco periódico (máximo 60 s). La suscripción en tiempo real queda fuera del alcance inicial y podrá evaluarse después.
- La retención de notificaciones sigue el ciclo de vida natural de los datos de la organización; no se define borrado periódico automático en este SDD.
- Los usuarios objetivo son 1–2 administradores y un número pequeño de vendedores por organización; los requisitos de volumen asumen ≤ 100 notificaciones activas por usuario.
- Se reutiliza el sistema de diseño existente (componentes e iconografía actuales de la aplicación web) sin rediseño visual general.
- La interfaz móvil (mini app de Telegram) no se modifica en este SDD; el alcance es la campana web.
- Los eventos duplicados y el aislamiento por rol ya corregidos son el baseline de este SDD y no se reimplementan aquí.
