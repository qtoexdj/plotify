# Data Model: Fundacion Operativa del Agente Plotify

**Branch**: `012-agent-foundation` | **Date**: 2026-06-22 | **Plan**: [plan.md](./plan.md)

Modelo derivado de [research.md](./research.md). Regla principal: extender el
runtime existente, no crear una segunda plataforma de agentes.

## 1. Skill (`agent_skills`, extendida)

Representa una capacidad visible y activable del agente. Hoy ya existe como
catalogo global; pasa a soportar skills de sistema y custom por organizacion.

### Campos existentes reutilizados

| Campo                           | Uso                                                     |
| ------------------------------- | ------------------------------------------------------- |
| `id`                            | Identidad estable de la skill.                          |
| `slug`                          | Identificador humano/tecnico. Debe ser unico por scope. |
| `name`                          | Nombre visible.                                         |
| `description`                   | Explicacion visible para admin.                         |
| `category`                      | `builtin`, `mcp`, `custom`.                             |
| `tool_definition`               | Schema visible/operativo de la tool o capability.       |
| `requires_mcp` / `mcp_provider` | Dependencia de integracion externa.                     |
| `requires_role`                 | Roles que pueden usar la skill.                         |
| `is_system`                     | No deshabilitable desde UI.                             |
| `enabled_by_default`            | Estado por defecto si no hay config por org.            |

### Campos nuevos propuestos

| Campo                 | Tipo          | Regla                                                 |
| --------------------- | ------------- | ----------------------------------------------------- |
| `organization_id`     | UUID nullable | `NULL` para system/global; requerido para custom.     |
| `definition_markdown` | text          | Requerido para custom; recomendado para builtin seed. |
| `approved_tool_slugs` | text[]        | Tools que una custom skill puede usar.                |
| `current_version`     | integer       | Version activa publicada.                             |
| `validation_status`   | text          | `draft`, `valid`, `blocked`.                          |
| `validation_errors`   | jsonb         | Lista de razones si esta bloqueada.                   |
| `created_by`          | UUID nullable | Admin que creo la custom skill.                       |
| `updated_by`          | UUID nullable | Ultimo admin que cambio la skill.                     |
| `updated_at`          | timestamptz   | Auditoria operacional.                                |

### Unicidad

La restriccion global actual sobre `slug` debe migrar a:

```sql
-- Skills globales/sistema
UNIQUE (slug) WHERE organization_id IS NULL;

-- Skills custom por organizacion
UNIQUE (organization_id, slug) WHERE organization_id IS NOT NULL;
```

### Validaciones

- `category='custom'` exige `organization_id` y `definition_markdown`.
- `is_system=true` exige `organization_id IS NULL`.
- `approved_tool_slugs` solo puede contener slugs registrados como tools
  aprobadas y compatibles con `requires_role`.
- `requires_mcp=true` exige `mcp_provider`.
- `validation_status='valid'` exige markdown no vacio y sin errores criticos.

## 2. Skill Version (`agent_skill_versions`, nueva)

Historial inmutable de definiciones markdown y permisos de una skill.

| Campo                 | Tipo          | Regla                                   |
| --------------------- | ------------- | --------------------------------------- |
| `id`                  | UUID          | PK.                                     |
| `skill_id`            | UUID          | FK a `agent_skills`, cascade delete.    |
| `organization_id`     | UUID nullable | Copia del scope para queries/auditoria. |
| `version`             | integer       | Unica por `skill_id`.                   |
| `definition_markdown` | text          | Snapshot exacto publicado/guardado.     |
| `tool_definition`     | jsonb         | Snapshot del schema visible.            |
| `approved_tool_slugs` | text[]        | Snapshot de tools permitidas.           |
| `requires_role`       | text[]        | Snapshot de roles permitidos.           |
| `validation_status`   | text          | `draft`, `valid`, `blocked`.            |
| `validation_errors`   | jsonb         | Razones de bloqueo si aplica.           |
| `created_by`          | UUID nullable | Admin autor.                            |
| `change_summary`      | text nullable | Motivo humano del cambio.               |
| `created_at`          | timestamptz   | Fecha de version.                       |

Estados:

```text
draft -> valid -> published
draft -> blocked
published -> superseded
```

Implementacion simple: `agent_skills.current_version` apunta a la version que
usa runtime; versiones anteriores quedan solo lectura.

## 3. Organization Skill Configuration (`org_skill_configs`, existente)

Decision por organizacion sobre si una skill esta activa.

Campos existentes se mantienen: `organization_id`, `skill_id`, `enabled`,
`config_overrides`, `enabled_by`, `created_at`, `updated_at`.

Reglas nuevas:

- Al upsert exitoso debe invalidarse el cache runtime para la organizacion.
- No se permite `enabled=false` si la skill es `is_system=true`.
- Una org solo puede configurar skills globales o skills custom propias.
- Si `requires_mcp=true`, `enabled=true` requiere conexion activa compatible o
  queda como `blocked`/no ejecutable segun contrato UI.

## 4. Approved Tool

No requiere tabla nueva en V1. El catalogo aprobado se deriva de:

- handlers registrados en `BUILTIN_HANDLERS` para tools internas;
- filas `agent_skills` globales `category in ('builtin', 'mcp')`;
- checks de rol, sensibilidad y dependencia MCP antes de exponerlas al LLM.

Invariante: una custom skill no puede inventar una tool; solo referencia
slugs aprobados.

## 5. Telegram Actor Link

Reusa `profiles.telegram_chat_id`, `vendors`, `organization_members` y
`vendor_projects`.

Reglas:

- El chat id debe mapear a un perfil antes de exponer informacion de vendedor.
- El vendor debe estar activo.
- El vendor debe tener proyectos asignados.
- El fallback `vendors.phone == telegram_chat_id` se conserva solo como
  compatibilidad y debe quedar cubierto por tests de no fuga cross-tenant.

## 6. Seller Operation Request

Reusa `approval_requests` para reservas/ventas y `audit_logs` para acciones
sensibles.

### `approval_requests`

Campos relevantes:

- `lot_id`
- `organization_id`
- `vendor_id`
- `vendor_name`
- `vendor_phone`
- `vendor_platform`
- `payload`
- `status`
- `request_type`
- `created_at`
- `resolved_at`

Reglas:

- Reservas iniciadas por agente quedan siempre `pending`.
- `request_reservation` valida disponibilidad, pending duplicado y asignacion
  `vendor_projects`.
- Ninguna respuesta del LLM puede cambiar `status` a `approved`.

### `audit_logs`

Debe registrar acciones sensibles nuevas:

- `agent.skill.created`
- `agent.skill.updated`
- `agent.skill.enabled`
- `agent.skill.disabled`
- `agent.skill.validation_blocked`
- `telegram.vendor.availability_requested`
- `telegram.vendor.reservation_requested`
- `telegram.vendor.operation_denied`
- `telegram.webhook.unauthorized`

## 7. Integration Requirement

Reusa `mcp_connections` para conexiones externas.

Reglas:

- Una skill con `requires_mcp=true` no se expone como ejecutable si la org no
  tiene conexion `active` del `mcp_provider`.
- Las credenciales nunca salen al prompt ni a markdown.
- Si MCP se conecta en esta feature, `MCP_REQUEST_TIMEOUT` debe ser <= 10s y
  `server_url` debe validarse contra allowlist/host seguro.

## Resumen de migracion

| Objeto                 | Cambio                                                                                                                                         | Migracion |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `agent_skills`         | `organization_id`, markdown, approved tools, version, validacion, autores, `updated_at`; reemplazo de unique slug global por uniques por scope | Si        |
| `agent_skill_versions` | Tabla nueva de historial inmutable                                                                                                             | Si        |
| `org_skill_configs`    | Sin cambio estructural inicial; nuevas reglas de servicio                                                                                      | No        |
| `approval_requests`    | Reuso para reserva pendiente                                                                                                                   | No        |
| `audit_logs`           | Reuso para auditoria Nivel B                                                                                                                   | No        |
| `mcp_connections`      | Reuso; reglas de ejecucion/timeout si se activa MCP                                                                                            | No        |

Tras migracion: `pnpm verify:migrations`, regenerar tipos de DB si aplica y
`pnpm contracts:generate` si cambian schemas FastAPI.
