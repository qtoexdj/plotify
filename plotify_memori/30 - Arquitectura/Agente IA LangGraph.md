# Agente IA (LangGraph)

**Tag:** #backend #ia
**Relacionado:** [[00 - Home]], [[Estructura Backend]], [[Tablas Agente IA]], [[Tech Stack Backend]]

---

## Arquitectura

El agente IA esta construido con **LangGraph** sobre **LangChain**, usando un grafo de estados para orquestar la conversacion.

## Componentes

### Grafo de estados

- **State** — Estado compartido de la conversacion (mensaje del usuario, contexto del proyecto, historial).
- **Nodes** — Funciones que procesan el mensaje y actualizan el estado.
- **Edges** — Transiciones condicionales entre nodos.
- **Checkpointer** — PostgreSQL (Supabase) para persistir conversaciones.

### Herramientas del agente

El agente tiene herramientas configurables por organizacion:

| Herramienta | Descripcion |
|------------|-------------|
| Consultar lotes | Pregunta disponibilidad de lotes en un proyecto |
| Requisitos de reserva | Indica que necesita un comprador para reservar |
| Solicitar aprobacion | Inicia flujo de aprobacion de reserva |

### Configuracion por org

- `agent_skills` — Catalogo global de habilidades disponibles.
- `org_skill_configs` — Por cada org, que skills estan activas.
- `agent_custom_instructions` — Instrucciones custom por usuario.

### System Prompts

- `system_prompts` — Catalogo de prompts del sistema (versionados).
- `prompt_versions` — Historial de versiones de cada prompt.
- El agente usa el prompt activo en tiempo de ejecucion.

## Flujo de un mensaje

```
Mensaje Telegram → Webhook → FastAPI /api/v1/webhook
→ LangGraph recibe mensaje
→ Lee prompt activo de system_prompts
→ Lee skills activas de org_skill_configs
→ Ejecuta grafo: clasifica intencion → usa herramienta → genera respuesta
→ Responde via Telegram Bot API
→ Persiste conversacion via checkpointer
```

## Modelos de IA

- Soporta **Anthropic** (Claude) y **OpenAI** (GPT) via LangChain.
- El modelo se configura en el `.env` del microservicio.

## Relacionado
- [[Tablas Agente IA]] — Tablas de DB del sistema de prompts/skills
- [[Integraciones Telegram WhatsApp]] — Como llegan los mensajes
- [[Tablas MCP]] — Conexiones OAuth para contexto del agente
