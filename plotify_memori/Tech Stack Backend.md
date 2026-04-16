# Tech Stack Backend (plotify_chat)

**Tag:** #backend #stack
**Relacionado:** [[00 - Home]], [[Arquitectura General]], [[Estructura Backend]]

---

## Tecnologias principales

| Capa | Tecnologia | Version/Notas |
|------|-----------|---------------|
| Lenguaje | Python | 3.13+ |
| Framework Web | FastAPI | 0.135.1 |
| Servidor | Uvicorn | ASGI |
| Framework AI | LangGraph | 1.1.0 |
| AI SDKs | LangChain + Anthropic + OpenAI | Multi-provider |
| Cola async | arq + Redis | Tareas en segundo plano |
| DB | Supabase Python + PostgREST | Mismo PostgreSQL |
| DB directo | psycopg3 | Queries SQL directos |
| Docs | Jinja2 + WeasyPrint + python-docx | PDF y DOCX |
| Auth | PyJWT | Tokens |
| Validacion | Pydantic | 2.x |
| Rate limiting | slowapi | 429 handler |
| Testing | pytest-asyncio | Tests async |

## Entrypoint

**** — FastAPI app:
- CORS restringido al URL del frontend.
- Router  registrado.
- Lifespan: checkpointer LangGraph (PostgreSQL) + pool ARQ Redis.
- Rate limiting con slowapi y handler custom 429.
- Expone  y .

## Diferencia con Frontend

El microservicio comparte la misma base de datos Supabase pero:
- Tiene su propio  con credenciales de OpenAI/Anthropic.
- Puede hacer bypass de RLS usando la service role key.
- Genera documentos PDF/DOCX que el frontend no puede generar.

## Relacionado
- [[Estructura Backend]] — Carpetas y archivos
- [[Comunicacion entre Servicios]] — Como se comunica con el frontend
- [[Agente IA LangGraph]] — El core del microservicio