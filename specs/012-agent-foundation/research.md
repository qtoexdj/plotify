# Research: Fundacion Operativa del Agente Plotify

**Branch**: `012-agent-foundation` | **Date**: 2026-06-22 | **Plan**: [plan.md](./plan.md)

Contexto usado: [spec.md](./spec.md), constitucion, memoria curada en
`plotify_memori/`, CodeGraph sobre el repo real, documentacion oficial de
Telegram Bot API y LangGraph.

## D1 - Alcance V1

**Decision**: V1 se enfoca en fundacion operativa del agente y primer slice
vendedor por Telegram.

**Rationale**: El codigo ya tiene piezas dispersas: LangGraph dinamico,
registry de skills, prompts DB, Telegram, approvals y MCP inicial. Antes de
sumar autonomia, conviene hacer confiable el runtime multi-tenant.

**Alternatives considered**:

- Agente legal primero: valioso, pero SDD 009 ya tiene patron propio y no
  prueba el canal vendedor.
- Admin intelligence primero: util, pero menos critico para tenant/tool safety.
- MCP primero: demasiado riesgo sin gobernanza de skills y permisos.

## D2 - Skills como markdown persistido

**Decision**: Cada skill debe tener una definicion markdown legible, guardada en
DB y versionada. `agent_skills` sigue como catalogo runtime; se agregan campos
de scope/markdown y tabla de versiones.

**Rationale**: El usuario quiere skills `.md` y runtime en base de datos. El
catalogo actual ya resuelve skills por organizacion/rol, por lo que extenderlo
evita crear otro sistema.

**Alternatives considered**:

- Solo archivos `.md`: bueno para git, malo para activacion multi-tenant.
- Solo DB sin markdown: rapido, pero opaco y dificil de revisar.
- Tabla separada para custom skills: mas aislada, pero duplica runtime y UI.

## D3 - Custom skills con tools aprobadas

**Decision**: Una custom skill V1 puede ajustar instrucciones y flujo usando
solo tools aprobadas por Plotify, rol y organizacion.

**Rationale**: Mantiene personalizacion sin permitir que una organizacion cree
acciones arbitrarias o salte permisos. El runtime debe validar que cada tool
referenciada exista en el registry y sea compatible con el rol.

**Alternatives considered**:

- Solo instrucciones sin tools: seguro pero poco util.
- Custom skills con MCP directo: se posterga hasta tener integraciones
  aprobadas y timeouts/governance cerrados.
- Crear nuevas tools desde UI: fuera de alcance por riesgo operacional.

## D4 - Contexto confiable para tools

**Decision**: `organization_id`, rol, usuario/perfil y vendor deben provenir de
contexto runtime validado, no de argumentos generados por el modelo.

**Rationale**: La constitucion prohibe confiar en `organization_id` libre. El
codigo actual pasa `organization_id` a algunas tools como argumento visible al
LLM; la mejora debe moverlo a una capa de ejecucion confiable.

**Alternatives considered**:

- Mantener argumentos LLM y confiar en prompt: insuficiente ante prompt
  injection o tool-call malformado.
- Duplicar validaciones en cada tool sin wrapper comun: funciona, pero aumenta
  drift y omisiones.

## D5 - Invalidacion de cache

**Decision**: Al activar/desactivar o publicar una skill, la web debe invalidar
el cache runtime de la organizacion inmediatamente mediante el endpoint interno
existente.

**Rationale**: `skill_registry.py` cachea por 5 minutos. La spec exige que el
cambio aplique al siguiente mensaje; ya existe `POST /api/v1/skills/invalidate-cache`,
pero el Server Action web todavia no lo llama.

**Alternatives considered**:

- Bajar TTL a pocos segundos: reduce dolor pero mantiene comportamiento opaco.
- Eliminar cache: simple, pero aumenta latencia y carga DB por mensaje.

## D6 - Telegram webhook seguro

**Decision**: `register_bot` debe llamar `setWebhook` con `secret_token` cuando
`TELEGRAM_WEBHOOK_SECRET` esta configurado, porque el webhook ya valida el
header `X-Telegram-Bot-Api-Secret-Token`.

**Rationale**: La documentacion oficial de Telegram Bot API define
`secret_token` para que Telegram envie ese header al webhook. Hoy el registro
solo envia `url`, lo que puede hacer que produccion rechace webhooks validos si
el secreto esta activo.

**Alternatives considered**:

- Desactivar validacion del header: debilita seguridad.
- Usar secreto por organizacion en V1: mas flexible, pero requiere nuevo modelo
  de bot/secret; puede venir despues.

## D7 - Flujo vendedor Telegram deterministico primero

**Decision**: Disponibilidad y reserva por Telegram se resuelven primero por
operaciones deterministicas; la conversacion LLM puede ayudar a interpretar,
pero la ejecucion sensible usa reglas y approvals.

**Rationale**: `process_vendor_telegram_operation` ya protege por vendor
assignment y `request_reservation` deja la solicitud pendiente. Esto satisface
la autonomia asistida decidida por el usuario.

**Alternatives considered**:

- Dejar que el LLM llame la tool de reserva directo: riesgoso sin validacion de
  contexto y datos.
- Solo comandos rigidos: seguro, pero menos natural. Puede ser el fallback.

## D8 - MCP futuro gobernado

**Decision**: La feature solo deja preparado el contrato de integraciones: una
skill que requiere MCP no es ejecutable sin conexion activa aprobada por la
organizacion. Si se activa ejecucion MCP, el timeout debe cumplir el maximo
constitucional de 10 segundos.

**Rationale**: `mcp_gateway.py` existe, pero no esta conectado al runtime de
skills y usa 30 segundos de timeout. La constitucion exige allowlist,
validacion de URLs/hosts y timeouts no superiores a 10 segundos.

**Alternatives considered**:

- Conectar MCP completo en esta feature: aumenta riesgo y scope.
- Ignorar MCP: pierde la oportunidad de dejar bien modeladas las dependencias.

## Sources

- Telegram Bot API: `setWebhook`, `sendMessage`, `sendDocument`.
- LangGraph official docs: overview and persistence/checkpointers.
