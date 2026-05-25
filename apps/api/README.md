# Plotify Messaging Engine

Motor de mensajería (WhatsApp/Telegram) para el CRM SaaS Plotify, especializado en la gestión de clientes y venta de parcelas y terrenos.

## 📚 Documentación Detallada (Recomendado)

Para entender a fondo el sistema, consulta la memoria del proyecto en `../../plotify_memori/`:

1. `Tech Stack Backend.md`: librerías, frameworks y versiones.
2. `Estructura Backend.md`: organización del microservicio.
3. `Core del Microservicio.md`: FastAPI, Redis, LangGraph y workers.
4. `API Endpoints Microservicio.md`: rutas internas y contratos.
5. `Schema General BD.md`: tablas de Supabase, relaciones y políticas.
6. `Setup Local.md`: comandos útiles y entorno de desarrollo.

---

_(Documentación centralizada en `plotify_memori/`.)_

## 🚀 Comandos de Inicio (Entorno de Desarrollo)

Para correr el backend completo en desarrollo local, necesitas abrir dos terminales:

**1. Levantar la API HTTP (FastAPI)**
Diseñada para recibir webhooks en < 100ms.

```bash
source venv/bin/activate && export $(grep -v '^#' .env | xargs) && python main.py
```

_Por defecto corre en el puerto `8005` para evitar colisiones con Supabase._

**2. Levantar el Worker de Tareas (ARQ)**
Procesa la lógica pesada (IA, RAG, Notificaciones).

```bash
source venv/bin/activate && export $(grep -v '^#' .env | xargs) && arq workers.main_worker.WorkerSettings
```

---

## Propósito

Recibir webhooks de Meta y Telegram (Multi-tenant), encolar mensajes en Redis y orquestar conversaciones inteligentes via LangGraph con acceso a datos reales de Supabase (lotes, precios, disponibilidad).

## Funcionalidades Clave (Segurizadas y Estabilizadas)

- **Bots Multi-tenant:** Registro dinámico de bots de Telegram con aislamiento estricto vía `organization_id`.
- **Asincronía Real:** FastAPI + ARQ + Redis. Las herramientas (tools) del agente son ahora asíncronas para no bloquear el Event Loop.
- **Seguridad Robusta:** Protección de endpoints internos con `X-Internal-Secret`, sanitización de _prompt injection_ y CORS restrictivo.
- **Resiliencia con DLQ:** Persistencia de jobs fallidos en la tabla `dead_letter_queue` tras agotar reintentos.
- **Rate Limiting Global:** Control de tráfico (50 req/s) en webhooks de Meta y Telegram.
- **Auditoría Integrada:** Registro de acciones críticas del Agente AI en la tabla compartida `audit_logs`.

## Inicio Rápido

### 1. Requisitos previos

- Python 3.13+
- Redis en contenedor Docker existente (`redis`, puerto `6379`)
- Supabase Docker existente (`supabase-kong`, URL `http://127.0.0.1:8000`)

No levantar un stack Supabase nuevo desde este repo. Las credenciales de
Supabase y Redis se leen desde `.env`.

### 2. Instalación

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 3. Configuración

```bash
cp .env.example .env
# Configura API_PUBLIC_URL con tu link de ngrok/tunnel
```

## Estructura del Proyecto

```text
apps/api/
├── main.py              # Entrada FastAPI, Limiter y Lifespan
├── workers/
│   ├── main_worker.py   # Configuración de ARQ y Handlers DLQ
│   └── tasks/           # Procesamiento de mensajes y notificaciones
├── agent/
│   ├── graph.py         # Orquestación LangGraph con Checkpointers
│   ├── tools/           # Herramientas asíncronas (async def)
│   └── prompts/         # Prompts de ventas seguros
├── api/
│   ├── deps.py          # Inyección de dependencias y seguridad (X-Internal-Secret)
│   └── v1/
│       ├── endpoints/   # Webhooks, Aprobaciones, Usuarios (Protegidos)
├── core/
│   ├── redis.py         # Singleton centralizado de ArqRedis Pool
│   ├── rate_limiter.py  # Instancia global de SlowAPI Limiter
│   └── config.py        # Configuración tipada vía Pydantic Settings
└── utils/
    ├── audit.py         # Registro asíncrono en audit_logs de Supabase
    ├── sanitize.py      # Limpieza de Prompt Injection
```

---

_Documentación core actualizada automáticamente al finalizar la Fase VI (Marzo 2021-2026)._

```

```
