# Variables de Entorno

**Tag:** #guia #config
**Relacionado:** [[00 - Home]], [[Setup Local]], [[Feature Flags]]

---

## Frontend (plotify/.env)

### Requeridas

| Variable | Ejemplo | Descripcion |
|----------|---------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | `http://127.0.0.1:8000` | URL del gateway Supabase Docker existente (`supabase-kong`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` | Clave anonima para browser; fuente real: `plotify/.env` |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | Clave service-role para server; fuente real: `plotify/.env` |

### Feature Flags

| Variable | Default | Descripcion |
|----------|---------|-------------|
| `NEXT_PUBLIC_ENABLE_CAD_UPLOAD` | `false` | Habilita upload CAD (congelado) |
| `ENABLE_CAD_UPLOAD` | `false` | Version server del flag |

### Microservicio

| Variable | Ejemplo | Descripcion |
|----------|---------|-------------|
| `PLOTIFY_CHAT_BASE_URL` | `http://127.0.0.1:8005` | URL del microservicio chat |
| `INTERNAL_API_SECRET` | `abc123...` | Secret compartido (`openssl rand -hex 32`) |

### Telegram

| Variable | Ejemplo | Descripcion |
|----------|---------|-------------|
| `NEXT_PUBLIC_TELEGRAM_BOT_USER` | `plotify_chat_bot` | Username del bot |

## Microservicio (plotify_chat/.env)

### Requeridas

| Variable | Descripcion |
|----------|-------------|
| `SUPABASE_URL` | Mismo gateway Supabase que el frontend: `http://127.0.0.1:8000` o `http://localhost:8000` |
| `SUPABASE_SERVICE_ROLE_KEY` | Misma key service-role; fuente real: `plotify_chat/.env` |
| `SUPABASE_DB_URL` | Conexion PostgreSQL/pooler al stack Docker existente; fuente real: `plotify_chat/.env`; validada contra `supabase-pooler` en `localhost:6543` |
| `OPENAI_API_KEY` | Clave de OpenAI (si se usa GPT) |
| `ANTHROPIC_API_KEY` | Clave de Anthropic (si se usa Claude) |
| `INTERNAL_API_SECRET` | Mismo secret que el frontend |
| `REDIS_URL` | `redis://localhost:6379/0`; usa el contenedor Docker existente `redis` |

### Configuración Adicional y Rollout (SDD 009 / SDD 011)

| Variable | Default | Descripcion |
|----------|---------|-------------|
| `LEGAL_REVIEW_REQUIRE_DISTINCT_REVIEWER` | `false` | Si es `true`, exige control de doble verificación (four-eyes) en aprobación de matrices: el revisor debe ser distinto del emisor. |
| `LEGAL_TEXT_VISION_ENABLED` | `false` | Habilita transcripción multimodal por visión para PDFs escaneados de dominio vigente (CBR). |
| `LEGAL_TEXT_VISION_MODEL` | `gpt-5.5` | Modelo multimodal a utilizar en la transcripción por visión. |
| `LEGAL_TEXT_VISION_PROVIDER` | `openai` | Proveedor del modelo multimodal. |
| `LEGAL_TEXT_VISION_REASONING_EFFORT` | `low` | Nivel de razonamiento del modelo de visión (para modelos o-series). |
| `LEGAL_TEXT_VISION_TIMEOUT_SECONDS` | `240` | Timeout máximo para la llamada del pipeline de visión. |
| `LEGAL_TITLE_AGENT_ENABLED` | `false` | Habilita el agente de títulos legal (LLM). |
| `LEGAL_TITLE_AGENT_MODEL` | `gpt-4o` | Modelo utilizado por el agente de títulos. |
| `LEGAL_TITLE_AGENT_REASONING_EFFORT` | `""` | Esfuerzo de razonamiento del agente de títulos (si aplica). |
| `LEGAL_TITLE_AGENT_MAX_ITERATIONS` | `24` | Límite máximo de iteraciones del bucle de razonamiento del agente (FR-017). |
| `LEGAL_TITLE_AGENT_TIMEOUT_SECONDS` | `300` | Presupuesto de tiempo total para la corrida del agente de títulos. |
| `DB_ENCRYPTION_KEY` | `plotify-dev-key...` | Clave para cifrar las credenciales del vault en reposo. |
| `API_PUBLIC_URL` | `https://api.plotify.demo` | URL pública expuesta para los webhooks de Telegram. |

## Infra local compartida

El desarrollo local de Plotify no debe crear un segundo stack Supabase. Debe
usar los contenedores Docker existentes:

- Supabase API: `supabase-kong` en `http://127.0.0.1:8000`.
- Supabase DB/pooler: `supabase-db` y `supabase-pooler` en los puertos
  publicados del host.
- Redis/arq: contenedor `redis` en `redis://localhost:6379/0`.

Estado 2026-04-15: `plotify_chat/.env` fue normalizado para usar
`http://127.0.0.1:8000`, el pooler local en `localhost:6543` y Redis Docker en
`localhost:6379`. El checkpointer de LangGraph fue validado contra PostgreSQL.

Las credenciales reales viven en los `.env`; no copiarlas a documentacion,
README ni notas.

## Generar secrets

```bash
# Secret compartido
openssl rand -hex 32
```

## Archivos

- `.env.example` — Template con valores de ejemplo (commiteado al repo).
- `.env` — Valores reales (en `.gitignore`, nunca commitear).

## Notas

- Variables `NEXT_PUBLIC_*` se exponen al browser.
- Variables sin prefijo solo existen en server-side.
- Para produccion, configurar en Vercel (frontend) y en el servidor del microservicio.

## Relacionado
- [[Setup Local]] — Como usar estas variables
- [[Feature Flags]] — Flags disponibles
- [[Seguridad Backend]] — Manejo seguro de secrets
