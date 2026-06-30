# API Contracts: Fundacion Operativa del Agente Plotify

Fuente de verdad: FastAPI/Pydantic para contratos de microservicio. Si se
agrega o cambia un endpoint bajo `apps/api`, ejecutar `pnpm contracts:generate`
y no editar a mano el OpenAPI generado.

## 1. POST `/api/v1/skills/invalidate-cache` (existente, obligatorio)

Uso: la web debe llamarlo despues de crear, actualizar, publicar, activar o
desactivar una skill.

Request:

```json
{
  "organization_id": "uuid"
}
```

Response:

```json
{
  "status": "invalidated",
  "organization_id": "uuid"
}
```

Invariantes:

- Requiere `X-Internal-Secret`.
- Debe borrar cache para roles `admin`, `user`, `lead`, `vendor`.
- Falla de invalidacion debe mostrarse como error operacional, no como exito
  silencioso.

## 2. POST `/api/v1/skills/validate-definition` (nuevo interno)

Valida una skill markdown antes de publicarla o hacerla ejecutable.

Request:

```json
{
  "organization_id": "uuid",
  "skill_id": "uuid | null",
  "slug": "seller_reservation_helper",
  "definition_markdown": "# Skill...",
  "requires_role": ["vendor"],
  "approved_tool_slugs": ["check_lot_availability", "request_reservation_intent"],
  "requires_mcp": false,
  "mcp_provider": null
}
```

Response success:

```json
{
  "status": "valid",
  "normalized_slug": "seller_reservation_helper",
  "approved_tool_slugs": ["check_lot_availability", "request_reservation_intent"],
  "warnings": []
}
```

Response blocked:

```json
{
  "status": "blocked",
  "errors": [
    {
      "code": "unapproved_tool",
      "message": "La skill intenta usar una herramienta no aprobada."
    }
  ],
  "warnings": []
}
```

Validation contract:

- Rechaza markdown vacio.
- Rechaza instrucciones de saltarse permisos, acceder a otros tenants,
  exponer secretos o ejecutar acciones no aprobadas.
- Rechaza tools inexistentes o incompatibles con los roles declarados.
- Rechaza MCP si la organizacion no tiene conexion activa compatible.

## 3. POST `/api/v1/bots/register` (extendido sin cambio de request)

Request actual:

```json
{
  "bot_token": "telegram-token",
  "organization_id": "uuid"
}
```

Response actual:

```json
{
  "bot_username": "plotify_org_bot",
  "is_active": true
}
```

Nuevo comportamiento obligatorio:

- Si `TELEGRAM_WEBHOOK_SECRET` esta configurado, `setWebhook` debe enviar
  `secret_token`.
- El webhook URL se mantiene como `/api/v1/webhook/telegram/{org_id}`.
- Si Telegram rechaza `setWebhook`, no se guarda el bot como activo.

## 4. Telegram seller commands

Canal: mensaje de texto entrante por `/api/v1/webhook/telegram/{org_id}`.

Comandos soportados V1:

```text
/lotes
disponibles
/disponibles
/reserva <lot_id> "<cliente_nombre>" "<cliente_run>" <valor_reserva>
```

Resultados:

| Caso                                         | Resultado                                                       |
| -------------------------------------------- | --------------------------------------------------------------- |
| Vendedor vinculado y asignado consulta lotes | Lista solo lotes disponibles de proyectos asignados             |
| Vendedor sin asignacion                      | Mensaje de rechazo sin datos comerciales                        |
| Reserva valida                               | `approval_requests.status = pending` y confirmacion al vendedor |
| Reserva invalida                             | Mensaje operativo y auditoria de rechazo/fallo                  |
| Formato incompleto                           | Mensaje de formato con ejemplo                                  |

Invariantes:

- `organization_id` proviene del path/webhook y se valida contra identidad.
- `vendor_id` proviene de perfil/vendor vinculado, no del mensaje.
- El agente no aprueba reservas.

## 5. Runtime tool execution contract

Antes de bindear o ejecutar tools para LangGraph:

```json
{
  "organization_id": "trusted uuid",
  "role": "vendor",
  "profile_id": "trusted uuid | null",
  "vendor_id": "trusted uuid | null",
  "thread_id": "organization_id:chat_id",
  "enabled_skill_slugs": ["..."],
  "allowed_tool_slugs": ["..."]
}
```

Reglas:

- Tools reciben contexto confiable desde runtime.
- El modelo nunca decide `organization_id`, `role`, `vendor_id` ni scope de
  tenant.
- Una tool sensible debe validar regla deterministica antes de escribir DB.

## 6. Contract tests required

- Toggle de skill llama invalidacion y el siguiente mensaje usa el nuevo set.
- Custom skill bloquea tool no aprobada.
- Runtime no expone custom skill de otra organizacion.
- Telegram webhook con secreto registrado acepta header valido y rechaza header
  faltante o invalido.
- Reserva Telegram queda `pending` y no `approved`.
