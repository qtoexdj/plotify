# Quickstart: Fundacion Operativa del Agente Plotify

**Feature**: `012-agent-foundation`

Este quickstart define las pasadas de validacion para el plan antes de generar
tareas con `/speckit-tasks`.

## 1. Precondiciones

- Rama activa: `012-agent-foundation`.
- Feature actual en `.specify/feature.json`: `specs/012-agent-foundation`.
- CodeGraph sincronizado: `codegraph sync .`.
- Telegram bot de prueba por organizacion.
- Vendedor activo con:
  - perfil vinculado a Telegram;
  - registro en `vendors`;
  - asignacion en `vendor_projects`;
  - proyecto con al menos un lote `disponible`.

## 2. Setup tecnico esperado tras implementacion

```bash
pnpm verify:migrations
pnpm contracts:generate
pnpm test:api
pnpm test:web
pnpm typecheck:web
pnpm --filter web lint
pnpm format:check
pnpm build:web
```

Si la tarea toca solo API o solo web, el Verify de la tarea puede ser mas
estrecho, pero el cierre del feature debe pasar la lista completa aplicable.

## 3. Validacion E2E - Vendedor Telegram

1. Vincular vendedor con `/start <token>` desde el bot de la organizacion.
2. Enviar `/lotes`.
3. Confirmar que la respuesta muestra solo lotes de proyectos asignados.
4. Enviar:

```text
/reserva <lot_id> "Juan Perez" "12345678-9" 500000
```

5. Confirmar que:
   - se crea `approval_requests.status = pending`;
   - no cambia a `approved` sin admin;
   - se notifica al administrador;
   - queda auditoria de accion iniciada por Telegram.

## 4. Validacion de aislamiento

- Vendedor A no ve lotes del vendedor B.
- Vendedor de otra organizacion no ve lotes aunque conozca el numero.
- Chat Telegram no vinculado recibe rechazo sin datos comerciales.
- Vendedor inactivo o sin proyectos asignados recibe rechazo operativo.

## 5. Validacion de skills runtime

1. Admin activa una skill vendedor.
2. Siguiente mensaje del vendedor puede usar esa skill.
3. Admin desactiva la skill.
4. Siguiente mensaje ya no la usa.
5. Confirmar que la web llamo `POST /api/v1/skills/invalidate-cache`.

## 6. Validacion de custom skills

1. Crear custom skill markdown con una tool aprobada.
2. Validar y publicar.
3. Activar para la organizacion.
4. Confirmar que el runtime la considera solo para esa organizacion y rol.
5. Editar markdown y publicar nueva version.
6. Confirmar que la version anterior queda trazable.

Casos negativos:

- Markdown vacio.
- Tool no aprobada.
- Rol incompatible.
- Instruccion que pide saltarse permisos.
- Skill MCP sin conexion activa.

## 7. Validacion Telegram webhook

1. Registrar bot con `TELEGRAM_WEBHOOK_SECRET` configurado.
2. Confirmar que `setWebhook` incluye `secret_token`.
3. Enviar webhook con header valido: debe responder `200`.
4. Enviar webhook sin header o con header invalido: debe responder `403`.

## 8. Gates humanos

Antes de implementar UI de custom skills, aprobar:

- flujo admin para crear/validar/publicar custom skill;
- copy de errores de validacion;
- mensajes Telegram vendedor para exito, rechazo, datos incompletos y sin
  asignacion.

Frase sugerida:

```text
Apruebo los flujos de custom skills y Telegram vendedor para SDD 012.
```

## 9. Notas de validacion del pase compartido

Fecha: 2026-06-22.

Alcance validado en el pase Setup/Foundation/Polish compartido:

- Migracion SDD 012 creada en `packages/database/supabase/migrations`.
- Schemas Pydantic y servicio de validacion markdown agregados.
- Registry de skills extendido con scope por organizacion, metadata, markdown,
  version, validacion y gating MCP.
- Runtime context confiable agregado para que las tools reciban
  `organization_id` desde contexto del agente y no desde argumentos del modelo.
- Graph LangGraph actualizado para inyectar contexto confiable e instrucciones
  markdown activas.

Comandos ejecutados:

```bash
codegraph sync .
pnpm verify:migrations
./apps/api/.venv/bin/python -m pytest -q tests/test_agent_foundation.py tests/test_agent_fase6.py::TestGraphPromptRouting
./apps/web/node_modules/.bin/vitest run tests/agent-foundation-skills.action.test.ts tests/agent-foundation-skills.components.test.tsx tests/fase4-seed-migration.test.ts --reporter=dot
./apps/api/.venv/bin/python scripts/export_openapi_contract.py
```

Validacion manual pendiente hasta implementar las historias correspondientes:

- Telegram vendedor E2E: pendiente de US1.
- Crear, validar, publicar y activar custom skill desde UI: pendiente de US3.
