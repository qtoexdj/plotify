# Feature Specification: Fundacion Operativa del Agente Plotify

**Feature Branch**: `[012-agent-foundation]`

**Created**: 2026-06-22

**Status**: Draft

**Input**: User description: "Mejorar el agente LangGraph de Plotify usando Spec Kit: consolidar la fundacion operativa del agente, con skills en markdown guardadas en base de datos, skills personalizadas por organizacion, tools aprobadas por permisos, y un primer flujo E2E para que el vendedor por Telegram consulte lotes y solicite reservas con confirmacion/reglas."

## Context

Plotify ya cuenta con un agente conversacional basado en LangGraph, un catalogo de skills por organizacion, prompts versionados, comandos deterministas por Telegram para vendedores/admin, un gateway MCP inicial y un agente legal de titulos con un patron mas controlado de herramientas, evidencia y salida estructurada.

Esta feature consolida esas piezas en una fundacion operativa de plataforma: las skills deben ser documentos markdown legibles por humanos, persistidas en el catalogo runtime, activables por organizacion, y capaces de usar solo herramientas aprobadas segun rol y permisos. El primer flujo que prueba la fundacion es el vendedor por Telegram: consultar lotes asignados y solicitar reserva sin saltarse las reglas comerciales ni la confirmacion administrativa.

Fuera de alcance para esta primera version: marketplace publico de skills, creacion de nuevas tools arbitrarias desde la UI, autonomia completa del agente, aprobaciones legales automatizadas, y MCP externo ejecutando acciones sin permisos explicitos de administrador.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Vendedor opera por Telegram con permisos correctos (Priority: P1)

Como vendedor vinculado a una organizacion, quiero consultar desde Telegram los lotes disponibles de mis proyectos asignados y solicitar una reserva para un comprador, para trabajar rapido desde el canal que ya uso sin ver informacion de otros vendedores.

**Why this priority**: Es el primer flujo E2E que valida la fundacion completa: identidad de Telegram, rol vendedor, tenant isolation, skills activas, tools aprobadas, reglas de reserva y respuesta util.

**Independent Test**: Con un vendedor vinculado a Telegram y asignado a un proyecto con lotes disponibles, enviar una consulta de lotes y luego una solicitud de reserva. Verificar que solo aparecen lotes permitidos, que la reserva queda como solicitud pendiente de validacion, y que el vendedor recibe una respuesta clara.

**Acceptance Scenarios**:

1. **Given** un vendedor vinculado a Telegram y asignado a un proyecto, **When** consulta lotes disponibles, **Then** recibe solo lotes de sus proyectos asignados dentro de su organizacion.
2. **Given** un vendedor vinculado intenta solicitar reserva de un lote asignado, **When** entrega los datos minimos del comprador y valor de reserva, **Then** el sistema crea una solicitud pendiente para el administrador y confirma al vendedor que fue enviada.
3. **Given** un vendedor no vinculado, inactivo o sin proyectos asignados, **When** intenta consultar o reservar, **Then** el sistema rechaza la operacion con una explicacion breve y sin exponer datos comerciales.
4. **Given** un vendedor intenta reservar un lote no asignado o no disponible, **When** envia la solicitud, **Then** la operacion se bloquea y queda registrada como intento no permitido o invalido.

---

### User Story 2 - Administrador controla skills por organizacion (Priority: P1)

Como administrador de Plotify, quiero activar, desactivar y revisar las skills disponibles para mi organizacion, para decidir que capacidades tiene el agente sin afectar a otros tenants.

**Why this priority**: Sin administracion runtime de skills, el agente no puede ser una plataforma multi-tenant controlable. Esta historia tambien evita que una skill recien cambiada tarde en reflejarse o quede en un estado inconsistente.

**Independent Test**: Activar una skill permitida para una organizacion, conversar con el agente como vendedor, verificar que la capacidad aparece; desactivarla, volver a conversar y verificar que ya no esta disponible sin esperar un periodo opaco.

**Acceptance Scenarios**:

1. **Given** una skill disponible para el rol vendedor, **When** el administrador la activa para su organizacion, **Then** el agente puede usarla en conversaciones de esa organizacion y rol.
2. **Given** una skill activada, **When** el administrador la desactiva, **Then** el agente deja de ofrecer y usar esa capacidad para nuevos mensajes de esa organizacion.
3. **Given** una skill del sistema marcada como obligatoria, **When** un administrador intenta desactivarla, **Then** el sistema impide el cambio y explica por que.
4. **Given** dos organizaciones distintas, **When** una cambia sus skills, **Then** la otra organizacion conserva su configuracion sin efectos cruzados.

---

### User Story 3 - Skills personalizadas en markdown usan tools aprobadas (Priority: P2)

Como administrador, quiero crear una skill personalizada en markdown para adaptar instrucciones, criterios de respuesta y flujos conversacionales de mi organizacion, pero usando solo herramientas aprobadas por Plotify y permisos del rol.

**Why this priority**: Permite personalizacion real sin abrir el riesgo de que una organizacion cree acciones peligrosas, tools no auditadas o accesos fuera de permisos.

**Independent Test**: Crear una skill personalizada para vendedores que use una herramienta aprobada de consulta de lotes, activarla, y verificar que el agente sigue las instrucciones de la skill sin poder invocar herramientas fuera de la lista permitida.

**Acceptance Scenarios**:

1. **Given** un administrador crea una skill personalizada con nombre, descripcion, markdown y roles permitidos, **When** la guarda, **Then** queda disponible en el catalogo de su organizacion como skill personalizada.
2. **Given** una skill personalizada referencia tools aprobadas, **When** el agente la usa, **Then** solo puede ejecutar esas tools dentro de los permisos del rol y organizacion.
3. **Given** una skill personalizada intenta usar una tool no aprobada o un rol no permitido, **When** se valida, **Then** el sistema bloquea la publicacion o la ejecucion con una razon clara.
4. **Given** una skill personalizada cambia su markdown, **When** se guarda una nueva version, **Then** la version anterior queda trazable para auditoria y diagnostico.

---

### User Story 4 - Agente asistido con acciones sensibles bajo reglas (Priority: P2)

Como administrador, quiero que el agente pueda iniciar o proponer acciones operativas, pero que reservas, aprobaciones, entregas de documentos y cambios de estado sensibles pasen por reglas deterministicas y/o confirmacion humana.

**Why this priority**: Plotify opera flujos inmobiliarios y legales donde una accion mal ejecutada tiene impacto comercial. El agente debe aumentar velocidad sin saltarse controles.

**Independent Test**: Pedir al agente una accion sensible permitida para el vendedor y verificar que no se completa directamente; queda como solicitud o requiere confirmacion segun la regla del flujo.

**Acceptance Scenarios**:

1. **Given** un vendedor solicita una reserva por Telegram, **When** los datos minimos estan completos, **Then** el agente inicia una solicitud pendiente y no aprueba la reserva por si solo.
2. **Given** una accion requiere confirmacion administrativa, **When** el agente la propone, **Then** el administrador recibe una decision clara con aprobar/rechazar o su equivalente en la superficie disponible.
3. **Given** una accion sensible falla por regla de negocio, **When** el agente responde, **Then** explica el motivo en lenguaje operativo y no inventa un resultado exitoso.
4. **Given** una accion sensible se completa, **When** se consulta el historial, **Then** queda trazable quien la pidio, que regla aplico, quien confirmo y cuando.

---

### User Story 5 - Base preparada para MCP aprobado futuro (Priority: P3)

Como administrador de plataforma, quiero que la fundacion de skills deje preparado el camino para integraciones MCP aprobadas, para que futuras skills puedan consultar fuentes externas sin mezclar credenciales, permisos ni organizaciones.

**Why this priority**: MCP es valioso, pero no debe bloquear el primer flujo vendedor. La primera version debe dejar el contrato de permisos listo sin ejecutar acciones externas no gobernadas.

**Independent Test**: Registrar una skill que declara dependencia de integracion externa aprobada y verificar que el sistema la muestra como dependiente de configuracion, sin activarla para conversaciones si la organizacion no tiene la conexion autorizada.

**Acceptance Scenarios**:

1. **Given** una skill declara que requiere integracion externa, **When** la organizacion no tiene conexion autorizada, **Then** la skill no queda ejecutable y muestra el requisito pendiente.
2. **Given** una organizacion tiene una conexion autorizada, **When** activa una skill compatible, **Then** el agente solo puede usar esa conexion para esa organizacion.
3. **Given** una conexion externa falla, **When** el agente intenta usar la skill, **Then** responde con fallback operativo y registra el fallo sin exponer secretos.

### Edge Cases

- Telegram no envia el token secreto esperado o llega un webhook para una organizacion sin bot activo.
- Un chat de Telegram estuvo vinculado antes a otro perfil o a otra organizacion.
- Una skill cambia mientras una conversacion del vendedor esta en curso.
- La base runtime contiene una skill cuyo slug no existe como tool aprobada.
- Dos skills habilitadas intentan responder al mismo flujo con instrucciones contradictorias.
- El vendedor envia datos incompletos, ambiguos o mal formateados para la reserva.
- Redis/cache no esta disponible al resolver skills o prompts.
- Una skill personalizada contiene instrucciones que intentan saltarse permisos, exfiltrar datos o ejecutar acciones no aprobadas.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST treat the agent foundation as a multi-tenant platform capability, with skills resolved by organization and actor role for each new message.
- **FR-002**: The system MUST support skills authored as markdown documents with name, slug, description, category, allowed roles, required tools, and activation status.
- **FR-003**: The system MUST persist skills in the runtime catalog so organizations can enable, disable, inspect, and audit them without redeploying product code.
- **FR-004**: The system MUST support custom skills scoped to an organization.
- **FR-005**: Custom skills MUST be limited to platform-approved tools and role permissions; they MUST NOT create arbitrary tools or unrestricted external actions in this version.
- **FR-006**: The system MUST make enabled/disabled skill changes effective for subsequent agent messages without an opaque multi-minute wait.
- **FR-007**: The system MUST prevent administrators from disabling mandatory system skills.
- **FR-008**: The Telegram seller flow MUST resolve the actor from a linked Telegram identity before exposing project, lot, reservation, or document information.
- **FR-009**: The Telegram seller flow MUST restrict lot search and reservation requests to projects assigned to the seller in the current organization.
- **FR-010**: The agent MAY initiate a reservation request for a seller, but MUST NOT approve the reservation automatically.
- **FR-011**: Sensitive operations, including reservations, approvals, document delivery, and state changes, MUST pass through deterministic rules and/or human confirmation.
- **FR-012**: Every sensitive operation initiated through the agent MUST be auditable with actor, organization, requested action, decision status, timestamp, and channel.
- **FR-013**: The system MUST return clear operational messages for denied, incomplete, ambiguous, or failed Telegram actions.
- **FR-014**: The system MUST use the organization and role from trusted runtime context when executing tools, not from user-provided or model-generated text.
- **FR-015**: The system MUST support skills that declare future MCP/integration dependencies, and MUST block execution when the required approved connection is not configured for the organization.
- **FR-016**: The system MUST keep system skills, organization custom skills, and future integration-backed skills distinguishable in the admin surface.
- **FR-017**: The system MUST keep skill version history or equivalent traceability for custom skill changes.
- **FR-018**: The system MUST include validation that rejects or quarantines custom skill instructions that request permission bypass, cross-tenant data, secret exposure, or unapproved actions.

### Key Entities

- **Skill**: A markdown-authored capability available to the agent. Includes identity, human description, category, allowed roles, approved tools, system/custom status, version, and activation defaults.
- **Organization Skill Configuration**: Per-organization decision that enables or disables a skill and records who changed it.
- **Custom Skill Version**: A saved version of an organization-specific skill markdown definition, used for audit, rollback, and debugging.
- **Approved Tool**: A platform-governed action or query the agent can call only when the role and organization permit it.
- **Telegram Actor Link**: Trusted association between a Telegram chat and a Plotify user/vendor/admin identity.
- **Seller Operation Request**: A request initiated from Telegram, such as lot availability lookup or reservation request, with status and audit trail.
- **Integration Requirement**: A declared dependency for a skill that needs an approved external connection before it can run.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A linked seller can complete the lot availability to reservation-request journey in Telegram in under 2 minutes using assigned projects only.
- **SC-002**: 100% of seller Telegram availability responses exclude lots from unassigned projects and other organizations in test scenarios.
- **SC-003**: 100% of reservation requests initiated by the agent remain pending for deterministic or human approval and are never auto-approved by the model.
- **SC-004**: Enabling or disabling a skill is reflected in the next new agent message for that organization and role.
- **SC-005**: Custom skill publication blocks 100% of test cases that request unapproved tools, cross-tenant access, or permission bypass.
- **SC-006**: Every sensitive operation started through the agent creates an audit record with actor, organization, channel, requested action, and resulting status.
- **SC-007**: Administrators can create and activate a custom markdown skill using only approved tools without developer intervention.
- **SC-008**: Telegram webhook security and bot registration are aligned so production webhooks can be accepted when the configured secret is enabled.

## Assumptions

- The first implementation slice is the seller Telegram flow, not the legal agent, admin intelligence, or general MCP expansion.
- The agent is assisted, not autonomous: it can propose or initiate actions, while sensitive outcomes require rules or confirmation.
- The runtime catalog remains the operational source for active skills, with markdown definitions preserved for authoring, review, and versioning.
- Custom skills in this version can use existing approved tools only.
- MCP-backed skills are prepared as a governed dependency model but do not need to execute external actions in the first implementation slice.
- Existing Telegram account linking, vendor assignments, lot availability, and reservation approval concepts are reused.
- Existing legal writing and sale-to-escritura flows remain separate features unless later tasks explicitly connect them to the agent foundation.
