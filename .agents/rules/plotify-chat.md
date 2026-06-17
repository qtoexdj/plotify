---
trigger: always_on
---

# Contexto del Microservicio
Este componente es el motor FastAPI/LangGraph de Plotify para mensajería, aprobaciones, documentos y flujos operativos por Telegram. En el MVP activo, Telegram es canal operacional para vendedores y administradores, pero WhatsApp no es canal principal.

# Stack Tecnológico Estricto
- Lenguaje: Python
- Framework Web: FastAPI
- Orquestador de Agentes: LangGraph
- Base de Datos y RAG: Supabase (PostgreSQL + pgvector)
- Gestión de Carga y Colas: Redis

# Protocolo SDD de Inicio del Agente
Antes de escribir o modificar código en `apps/api`, confirma:

1. La tarea exacta de `specs/008-creador-matriz/tasks.md`.
2. El protocolo de `specs/008-creador-matriz/agent-execution.md`.
3. Que no quedan hallazgos `CRITICAL` pendientes de `$speckit-analyze`.
4. `git status --short`.
5. `codegraph sync .`.
6. Si la tarea toca FastAPI, LangGraph, Supabase, Redis/arq o Telegram y necesitas documentación actual, usa Context7/ctx7. No uses Context7 para lógica local o decisiones de producto.

# Reglas de Interacción con Datos
1. **Fuente DB canónica:** Las migraciones viven en `packages/database/supabase/migrations` y los tipos generados en `packages/database/types/database.generated.ts`.
2. **Introspección:** Si hay MCP Supabase disponible, úsalo para consultar esquema/relaciones. Si no está disponible, usa migraciones, tipos generados y código real. Nunca asumas nombres de tablas, columnas, RPCs o tipos.
3. **Service role:** Todo endpoint o worker que use service role debe derivar y validar tenant desde recursos persistidos; no confiar en `organization_id` libre del frontend.

# Reglas de Arquitectura y Desarrollo
1. **Gestión de Carga (Redis):** Los webhooks de FastAPI deben responder casi instantáneamente (200 OK) a Meta/Telegram. El procesamiento del mensaje y la ejecución del grafo de LangGraph deben encolarse y gestionarse a través de Redis de forma asíncrona.
2. **Asincronía Total:** Todo el código (endpoints de FastAPI, nodos de LangGraph, conexiones a Redis y llamadas externas) debe ser estrictamente asíncrono (`async def`, `await`).
3. **Manejo de Errores y Logs:** Implementa bloques `try/except` robustos. Si el RAG falla o un nodo de LangGraph se rompe, el error debe registrarse, el worker de Redis debe manejar el reintento (si aplica) y el sistema general no debe colapsar.
4. **Seguridad y Entorno:** Las credenciales (URLs de Redis, Supabase, Tokens de Meta/Telegram) se leen estrictamente desde variables de entorno (`os.getenv`). NUNCA hardcodees tokens.
5. **Telegram seguro:** Las llamadas al Bot API deben usar host fijo de Telegram, timeouts explícitos <= 10 segundos, payloads validados y logs/auditoría de fallos para reintento.
6. **OpenAPI generado:** Para cambiar contratos HTTP, edita modelos/endpoints FastAPI y luego ejecuta `pnpm contracts:generate`. No edites manualmente `packages/contracts/openapi/plotify-chat.v1.json` como fuente.
7. **Documentos:** La generación PDF/DOCX debe conservar snapshot de variables, versión, template usado, lote, actor y estado de envío/reintento cuando aplique.

# Gates de Calidad
1. Cambios en `apps/api`: ejecuta `pnpm test:api`.
2. Cambios de contrato FastAPI/OpenAPI: ejecuta `pnpm contracts:generate`.
3. Cambios que impacten cliente web o tipos generados: ejecuta `pnpm typecheck:web`, `pnpm --filter web lint`, `pnpm format:check` y `pnpm build:web`.
