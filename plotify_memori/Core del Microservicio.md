# Core del Microservicio

**Tag:** #backend
**Relacionado:** [[00 - Home]], [[Estructura Backend]], [[Tech Stack Backend]]

---

## Vision general

Modulo `core/` del microservicio con configuracion, clientes, y utilidades compartidas.

---

## config.py

Settings de Pydantic para todas las variables de entorno.

**Exporta:**
- `Settings` — Contiene: info del proyecto, security keys, Redis URL, config Supabase, tokens Meta/WhatsApp, token Telegram, API keys OpenAI/Anthropic.
- `get_settings()` — Singleton con cache LRU.

---

## database.py

Factory de cliente Supabase.

**Exporta:**
- `get_supabase_client()` — Retorna cliente Supabase autenticado con Service Role Key (acceso admin). Nota: sincronico bajo el capo.

---

## checkpointer.py

Setup del checkpointer PostgreSQL de LangGraph con pool de psycopg.

**Exporta:**
- `pool` — `AsyncConnectionPool` global (max 20 conexiones).
- `setup_checkpointer()` — Abre pool e inicializa tablas de checkpoint de LangGraph.
- `close_checkpointer()` — Cierra el pool de conexiones.

---

## redis.py

Pool centralizado de Redis para jobs ARQ.

**Exporta:**
- `get_arq_pool()` — Factory singleton de pool `ArqRedis`.
- `close_arq_pool()` — Cierra el pool en shutdown.

---

## logger.py

Logging estructurado con structlog.

**Exporta:**
- `setup_logging(log_level)` — Configura structlog con output de consola coloreado, timestamps, niveles de log, info de stack.
- `get_logger(name)` — Retorna logger structlog con nombre vinculado.

---

## rate_limiter.py

Rate limiter global con slowapi.

**Exporta:**
- `limiter` — Instancia de Limiter keyeada por IP del cliente.

---

## Resumen de dependencias

```
main.py (entrypoint)
  → core/config.py (settings)
  → core/database.py (Supabase client)
  → core/checkpointer.py (LangGraph persistence)
  → core/redis.py (ARQ pool)
  → core/logger.py (logging)
  → core/rate_limiter.py (slowapi)
```

## Relacionado
- [[Tech Stack Backend]] — Stack completo
- [[Estructura Backend]] — Donde esta core/ en la estructura
- [[Workers del Microservicio]] — Quien usa redis y database
