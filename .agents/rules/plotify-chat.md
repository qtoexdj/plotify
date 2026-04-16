---
trigger: always_on
---

# Contexto del Microservicio
Este componente es el motor de mensajería (WhatsApp/Telegram) de Plotify, un CRM SaaS para la gestión de clientes y venta de parcelas y terrenos. Su función principal es recibir webhooks, gestionar la alta concurrencia, orquestar la conversación y consultar disponibilidad mediante RAG.

# Stack Tecnológico Estricto
- Lenguaje: Python
- Framework Web: FastAPI
- Orquestador de Agentes: LangGraph
- Base de Datos y RAG: Supabase (PostgreSQL + pgvector)
- Gestión de Carga y Colas: Redis

# Protocolo de Inicio del Agente (Obligatorio en cada prompt)
Antes de comenzar a escribir o modificar código para cualquier tarea asignada, DEBES ejecutar este flujo paso a paso:
1. **Revisión entorno virtual ** Revisa que el entorno virtual este activado antes de empesar
2. **Revisión de Skills:** Revisa todas las skills y herramientas disponibles en tu entorno. Identifica y planifica cuáles te servirán para la tarea actual.
3. **Validación de Contexto:** Ejecuta SIEMPRE `mcp:context7` para validar el contexto del sistema, entender en qué estado está el proyecto y asegurar que tus próximos pasos estén alineados con la arquitectura.

# Reglas de Interacción con Datos
1. **Introspección vía MCP:** Para consultar el esquema de la base de datos, relaciones de tablas (ej. parcelas, leads) o cualquier información de Supabase, DEBES usar EXCLUSIVAMENTE `mcp:supabase-local`. Prohibido asumir nombres de columnas, tablas o tipos de datos.

# Reglas de Arquitectura y Desarrollo
1. **Gestión de Carga (Redis):** Los webhooks de FastAPI deben responder casi instantáneamente (200 OK) a Meta/Telegram. El procesamiento del mensaje y la ejecución del grafo de LangGraph deben encolarse y gestionarse a través de Redis de forma asíncrona.
2. **Asincronía Total:** Todo el código (endpoints de FastAPI, nodos de LangGraph, conexiones a Redis y llamadas externas) debe ser estrictamente asíncrono (`async def`, `await`).
3. **Manejo de Errores y Logs:** Implementa bloques `try/except` robustos. Si el RAG falla o un nodo de LangGraph se rompe, el error debe registrarse, el worker de Redis debe manejar el reintento (si aplica) y el sistema general no debe colapsar.
4. **Seguridad y Entorno:** Las credenciales (URLs de Redis, Supabase, Tokens de Meta/Telegram) se leen estrictamente desde variables de entorno (`os.getenv`). NUNCA hardcodees tokens.