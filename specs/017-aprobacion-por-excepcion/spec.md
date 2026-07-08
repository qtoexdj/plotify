# Feature Specification: Aprobación por excepción del pipeline venta → minuta

**Feature Branch**: `017-aprobacion-por-excepcion`

**Created**: 2026-07-08

**Status**: Draft

**Input**: User description: "El pipeline debe ser: la inmobiliaria sube sus documentos y su KMZ, revisa los deslindes, se aprueba el molde una vez y se habilita la venta. De ahí en adelante, por cada venta solo varían el lote (sus deslindes) y los datos del comprador — la escritura debe salir sola. No tengo por qué tener una ceremonia de matriz para cada lote: hay muchas aprobaciones que están de más. La idea del código es solucionar, mejorar y simplificar la vida."

## Contexto

Hoy, después de que el admin aprueba una venta, el sistema le exige por CADA lote: abrir la mesa, "Enviar a revisión" (+ diálogo), "Aprobar revisión jurídica" (+ diálogo), "Aprobar" la matriz (+ diálogo) y "Generar minuta" (+ diálogo con warning legal). Son 4 aprobaciones y 4 confirmaciones por lote — en un proyecto de 53 lotes, ~400 clicks — pese a que todo el contenido del caso ya pasó por un humano antes: el molde fue aprobado, el lote fue verificado (cabida y deslindes) y la venta fue aprobada. La máquina de estados con revisión se diseñó para el molde del proyecto (donde sí aporta) y se heredó completa a cada caso por lote (donde no aporta ninguna decisión nueva).

Este feature invierte el modelo: **la aprobación deja de ser una estación de peaje y pasa a ser una alarma de excepción**. El registro inmutable por caso (snapshot, versión, hash — la evidencia de qué se generó para quién) se conserva intacto; lo que desaparece es el trámite humano cuando no hay nada que decidir.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Cascada automática venta → minuta entregada (Priority: P1)

Como administradora de una inmobiliaria con su proyecto ya preparado (molde aprobado, lotes verificados), cuando apruebo la venta de un lote quiero recibir la minuta de escritura por Telegram sin hacer nada más. El sistema completa el expediente del caso con los datos de la venta y del lote, verifica que no falte nada, aprueba el caso a nombre del sistema (dejando constancia de que hereda el molde vigente y su versión), genera el documento y lo entrega.

**Why this priority**: Es el corazón del feature y del MVP: convierte la promesa del producto ("la escritura sale sola") en realidad. Sin esto, el resto son parches de UX.

**Independent Test**: Aprobar una venta en un proyecto sin pendientes y verificar que la minuta llega por Telegram al admin sin ninguna acción humana posterior, con el caso marcado como aprobado por el sistema y auditado.

**Acceptance Scenarios**:

1. **Given** un proyecto con molde aprobado y un lote verificado, **When** el admin aprueba la venta de ese lote y el caso queda sin ningún pendiente, **Then** la matriz del caso queda aprobada automáticamente (con registro auditable de que la aprobación es del sistema, heredada del molde y su versión), la minuta se genera y se entrega por Telegram a los admins (y al vendedor si tiene Telegram), todo sin intervención humana.
2. **Given** la misma venta, **When** la cascada termina, **Then** en la plataforma el caso aparece como "Minuta entregada" con acceso al documento y a su trazabilidad (quién aprobó qué y cuándo, incluyendo las decisiones del sistema).
3. **Given** un caso al que le falta un dato (p. ej. estado civil del comprador), **When** el admin aprueba la venta, **Then** la cascada se detiene ANTES de aprobar, el caso queda en estado de excepción con la lista de causas, y no se genera ningún documento parcial.

---

### User Story 2 - Revisión jurídica como política de la organización (Priority: P2)

Como organización, quiero decidir cuánta supervisión legal quiero por venta: "revisar cada venta" (una persona aprueba o rechaza la revisión jurídica de cada caso; después de aprobar, la cascada continúa sola hasta la entrega) o "revisar solo excepciones" (la cascada corre completa sin actos humanos; la revisión existe solo cuando algo la gatilla). El modo por defecto es "revisar cada venta": una organización nueva parte con supervisión y la relaja cuando confía en su molde.

**Why this priority**: Es la palanca que decide entre 1 y 0 acciones humanas por venta. Separada de la US1 porque la cascada tiene valor incluso con revisión activada (baja de 4 aprobaciones a 1).

**Independent Test**: Con el modo "revisar cada venta", aprobar una venta y verificar que el único acto humano pendiente es la revisión jurídica, y que al aprobarla la generación y entrega ocurren solas. Cambiar el modo a "solo excepciones" y verificar que la siguiente venta no pide nada.

**Acceptance Scenarios**:

1. **Given** una organización en modo "revisar cada venta", **When** se aprueba una venta sin pendientes, **Then** el caso queda esperando únicamente la revisión jurídica (ningún otro acto), y al aprobarla la cascada termina sola (aprobación del caso + generación + entrega).
2. **Given** una organización en modo "solo excepciones", **When** se aprueba una venta sin pendientes, **Then** la cascada corre completa sin ningún acto humano.
3. **Given** una revisión jurídica rechazada con comentario, **When** el revisor rechaza, **Then** el caso pasa a excepción con la razón visible y la cascada no continúa hasta que se corrija y se reintente.
4. **Given** cualquier organización, **When** un admin cambia el modo de revisión, **Then** el cambio queda auditado (quién, cuándo, de qué modo a qué modo) y aplica a las ventas siguientes, no a los casos ya en curso.

---

### User Story 3 - La mesa como sala de control de excepciones (Priority: P2)

Como administradora, cuando entro a la mesa de escritura quiero ver de un vistazo qué casos terminaron solos (minuta entregada, con descarga) y cuáles necesitan mi atención (excepciones con su causa concreta y la acción para corregirla). Los botones "Enviar a revisión" y "Aprobar" desaparecen del camino feliz; quedan disponibles la corrección, el reintento de la cascada y la regeneración.

**Why this priority**: Es la cara visible del cambio de modelo. Sin esto, la cascada corre pero la UI sigue mostrando una estación de peaje vacía que confunde.

**Independent Test**: Con un caso terminado y otro en excepción, abrir la mesa y verificar que el terminado muestra "Minuta entregada" + descarga sin botones de workflow, y el en excepción muestra las causas con su acción de corrección y un reintento que completa la cascada al quedar resuelto.

**Acceptance Scenarios**:

1. **Given** un caso cuya cascada terminó, **When** el admin abre la mesa, **Then** ve el estado "Minuta entregada", el historial de generaciones y la descarga — sin botones de enviar/aprobar.
2. **Given** un caso en excepción por datos faltantes, **When** el admin corrige la causa y reintenta, **Then** la cascada continúa desde donde se detuvo y termina sin pasos adicionales.
3. **Given** cualquier acción reversible de la mesa (reintentar, regenerar, rechazar con razón), **When** el usuario la ejecuta, **Then** no se le pide un diálogo de confirmación adicional; las acciones irreversibles (ninguna en este flujo) son las únicas que podrían pedirlo.
4. **Given** un caso que entró en excepción, **When** la cascada se detiene, **Then** el admin recibe una notificación (por el mismo canal de entrega) con el lote y la causa, para no depender de revisar la plataforma.

---

### User Story 4 - Warning legal una vez por proyecto (Priority: P3)

Como administradora, quiero confirmar el aviso legal sobre el carácter de borrador de las minutas UNA vez por proyecto — no en cada generación. La confirmación queda registrada (quién y cuándo) y ampara las generaciones siguientes del proyecto, incluidas las automáticas.

**Why this priority**: Es fricción pura repetida por lote; confirmarlo 53 veces no agrega responsabilidad legal. Es P3 porque la cascada (US1) ya lo necesita resuelto para correr sin intervención — pero puede nacer implementado como parte del setup del proyecto.

**Independent Test**: Confirmar el warning en el primer caso del proyecto y verificar que las generaciones siguientes (manuales o automáticas) no lo vuelven a pedir y que cada minuta registra qué confirmación la ampara.

**Acceptance Scenarios**:

1. **Given** un proyecto sin el warning confirmado, **When** se habilita la venta del proyecto (o se genera la primera minuta), **Then** se pide la confirmación una única vez y queda registrada con usuario y fecha.
2. **Given** el warning ya confirmado en el proyecto, **When** la cascada genera cualquier minuta, **Then** no se exige nueva confirmación y la generación registra la confirmación que la ampara.

---

### Edge Cases

- **Molde re-aprobado con casos ya entregados**: una nueva versión del molde NO regenera minutas ya entregadas; los casos futuros usan la versión nueva. Un caso en excepción pendiente adopta la versión vigente al reintentar.
- **Falla de entrega (Telegram caído / sin chat configurado)**: la minuta generada persiste siempre; la entrega fallida queda visible en la mesa con reintento. Una falla de entrega no revierte ni bloquea la aprobación del caso.
- **Datos del lote corregidos después de la minuta**: la corrección deja al caso marcado como desactualizado respecto del documento entregado; regenerar es una acción explícita (no automática) para no reemplazar en silencio algo que pudo haberse enviado a notaría.
- **Dos ventas simultáneas del mismo lote**: fuera de alcance — lo impide la máquina de estados de lotes existente (SDD016).
- **Cascada interrumpida a mitad (caída del servicio)**: la cascada es reanudable; reintentar no duplica minutas ni entregas ya hechas (idempotencia por caso y por generación).
- **Organización con four-eyes activado** (revisor ≠ quien envía): en modo "revisar cada venta" el sistema figura como origen del envío a revisión, por lo que cualquier humano puede aprobar; la restricción se mantiene con su semántica actual para flujos manuales.
- **Proyecto sin Telegram configurado**: la cascada termina igual (generación + registro); la entrega queda como pendiente visible con la causa "sin canal de entrega", igual que hoy.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Al validarse una venta, el sistema DEBE ejecutar automáticamente la cadena completa: completar el expediente del caso con los datos operacionales, refrescar su snapshot y evaluar pendientes; si no hay ninguno (y la política de revisión no exige acto humano), aprobar el caso, generar la minuta y entregarla — sin intervención humana.
- **FR-002**: Toda aprobación automática DEBE quedar registrada como decisión del sistema con trazabilidad completa: qué molde y qué versión hereda, hash del snapshot aprobado, momento y gatillo (venta validada / reintento / revisión aprobada). Las decisiones del sistema DEBEN ser distinguibles de las humanas en la trazabilidad del caso.
- **FR-003**: La organización DEBE poder elegir su política de revisión jurídica entre "revisar cada venta" (default) y "revisar solo excepciones". El cambio de política DEBE quedar auditado y aplicar solo a ventas posteriores.
- **FR-004**: En modo "revisar cada venta", el único acto humano del camino feliz DEBE ser aprobar o rechazar la revisión jurídica; al aprobarla, el resto de la cascada DEBE continuar sin más actos. El rechazo DEBE llevar el caso a excepción con el comentario del revisor.
- **FR-005**: Cuando la cascada encuentre pendientes (dato faltante, conflicto, lote sin verificar, gate no cumplido), el caso DEBE quedar en estado de excepción con la lista de causas accionables (qué falta y dónde corregirlo), sin generar documento parcial, y DEBE notificarse al admin por el canal de entrega configurado.
- **FR-006**: El caso en excepción DEBE poder reintentarse (manual) una vez corregida la causa; el reintento DEBE reanudar la cascada desde el punto pendiente y ser idempotente (sin duplicar aprobaciones, minutas ni entregas ya realizadas).
- **FR-007**: La mesa DEBE presentar los casos terminados como "Minuta entregada" (con descarga e historial) sin acciones de workflow, y los casos en excepción con sus causas y acciones de corrección. Los botones "Enviar a revisión" y "Aprobar" DEBEN desaparecer del camino feliz.
- **FR-008**: Las acciones reversibles del flujo (reintentar, regenerar, rechazar con razón) NO DEBEN exigir diálogos de confirmación adicionales.
- **FR-009**: El aviso legal de borrador DEBE confirmarse una sola vez por proyecto, quedar registrado (usuario, fecha) y amparar todas las generaciones siguientes del proyecto; cada generación DEBE referenciar la confirmación que la ampara.
- **FR-010**: El registro inmutable por caso DEBE conservarse sin regresión: snapshot de variables, versión de matriz, hash de contenido y el historial de decisiones siguen siendo la evidencia auditable de qué documento se produjo para qué comprador con qué molde.
- **FR-011**: La regeneración de una minuta ya entregada DEBE ser siempre una acción humana explícita, nunca automática, y DEBE dejar rastro de por qué se regeneró (dato corregido, molde nuevo, rechazo).
- **FR-012**: El flujo manual completo (enviar/aprobar/rechazar paso a paso) DEBE seguir disponible para los casos en excepción y para organizaciones que operen con four-eyes, con su semántica actual.

### Key Entities

- **Caso de escritura**: expediente por lote vendido; gana la noción de "resultado de cascada" (terminado / en excepción / esperando revisión) además de su registro inmutable actual (snapshot, versión, hash).
- **Decisión de aprobación**: registro de quién aprobó qué; ahora puede ser de origen humano o del sistema (con el gatillo y el molde/versión heredado como atributos).
- **Política de revisión de la organización**: configuración por organización ("cada venta" / "solo excepciones"), auditada en sus cambios.
- **Confirmación de aviso legal por proyecto**: registro único por proyecto (usuario, fecha) que ampara las generaciones del proyecto.
- **Excepción de caso**: estado con lista de causas accionables (origen: dato faltante, conflicto, revisión rechazada, entrega fallida) y su historial de reintentos.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: En una organización en modo "solo excepciones", una venta sin pendientes llega de "venta aprobada" a "minuta entregada por Telegram" con **0 acciones humanas** posteriores a la aprobación de la venta.
- **SC-002**: En modo "revisar cada venta" (default), la misma venta requiere **exactamente 1 acción humana** (aprobar la revisión jurídica); hoy requiere 4 aprobaciones + 4 confirmaciones.
- **SC-003**: Vender los 53 lotes de un proyecto tipo Teno sin excepciones cuesta **≤53 acciones humanas** post-venta en modo default y **0** en modo "solo excepciones" (contra ~400 clicks actuales).
- **SC-004**: Un caso con un dato faltante queda visible como excepción, con su causa y enlace de corrección, en **menos de 1 minuto** desde la aprobación de la venta, y el admin recibe la notificación sin abrir la plataforma.
- **SC-005**: El 100% de las aprobaciones automáticas es rastreable desde la mesa: origen sistema, molde y versión heredados, hash del snapshot y gatillo.
- **SC-006**: Una venta sin excepciones entrega su minuta en **menos de 2 minutos** desde la aprobación de la venta.
- **SC-007**: `pnpm test:api`, `pnpm test:web`, `pnpm typecheck:web` y `pnpm build:web` quedan verdes al cierre de cada user story.

## Assumptions

- El prerequisito del proyecto no cambia: molde aprobado + lotes verificados + organización configurada (checklist SDD016). La cascada no rebaja ningún gate: solo elimina actos humanos que no aportan decisión.
- El default de la política de revisión es "revisar cada venta" (coherente con SC-001 de SDD016: venta + revisión = 2 actos); "solo excepciones" es opt-in explícito de la organización.
- El motor existente (resolutor de variables, gates de readiness, puente operacional, renderer DOCX, entrega por Telegram) no se modifica: la cascada es orquestación sobre piezas ya probadas.
- La confirmación del warning legal por proyecto satisface el requisito legal actual (el aviso ampara al proyecto completo, no a cada documento); la generación individual conserva la referencia a esa confirmación.
- El four-eyes (`LEGAL_REVIEW_REQUIRE_DISTINCT_REVIEWER`) permanece OFF por default y compatible: cuando está activo, la aprobación de revisión exige un humano distinto del origen del envío (el sistema).
- Los casos ya existentes al momento del despliegue conservan su estado; la cascada aplica a ventas nuevas y a reintentos explícitos de casos en excepción.
