# Estructura Backend (plotify_chat)

**Tag:** #backend
**Relacionado:** [[00 - Home]], [[Tech Stack Backend]], [[Agente IA LangGraph]]

---

## Directorio

```
plotify_chat/
├── main.py              # FastAPI entrypoint
├── agent/               # Definiciones de agentes LangGraph
├── api/                 # Route handlers (api.v1.router)
├── core/                # Config, utilidades
├── integrations/        # Telegram, WhatsApp, webhooks
├── models/              # Modelos Pydantic
├── schemas/             # Schemas de DB
├── services/            # Logica de negocio
├── workers/             # Workers async (arq)
├── scripts/             # Scripts de utilidad
├── supabase/            # Config cliente Supabase
├── tests/               # Tests Python
├── requirements.txt     # Dependencias
├── .env / .env.example  # Variables de entorno
└── README.md
```

## Descripcion por carpeta

### agent/

Definiciones del grafo LangGraph:
- Nodos del grafo (nodes).
- Estado compartido (state).
- Herramientas del agente (tools).
- Checkpointer para persistencia de conversaciones.

### api/

Rutas REST versionadas (v1):
- Endpoints de consulta de lotes.
- Endpoints de generacion de documentos.
- Webhook handler para bots de Telegram.

### integrations/

Conectores externos:
- Bot de Telegram (multi-tenant, un bot por org).
- WhatsApp (pendiente/configurable).
- Gestion de webhooks.

### services/

Logica de negocio:
- Consulta de disponibilidad de lotes.
- Requisito de reserva.
- Generacion de documentos.
- Interaccion con Supabase.

### workers/

Workers async con arq:
- Tareas pesadas de generacion de PDF.
- Procesamiento de mensajes en cola.

### supabase/

Config del cliente Python de Supabase:
- Conecta al mismo PostgreSQL.
- Usa service role key para bypass RLS.

## Relacionado
- [[Agente IA LangGraph]] — Detalle del grafo de agentes
- [[Integraciones Telegram WhatsApp]] — Detalle de bots
- [[Seguridad Backend]] — Seguridad y encriptacion
