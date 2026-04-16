# API Endpoints del Microservicio

**Tag:** #backend #api
**Relacionado:** [[00 - Home]], [[Estructura Backend]], [[Comunicacion entre Servicios]]

---

## Vision general

10 endpoints en `api/v1/` del microservicio plotify_chat. Router principal en `api/v1/router.py`.

---

## Auth

Todos los endpoints requieren header `X-Internal-Secret` validado por `verify_internal_secret` en `api/deps.py`. Retorna 403 si es invalido.

Para superadmin: header adicional `X-User-Id` validado por `verify_super_admin`.

---

## Endpoints

### health.py

- `GET /api/v1/health` — Health check del microservicio.

### webhook.py

- `POST /api/v1/webhook` — Recibe webhooks de Meta (WhatsApp) y Telegram.
- Detecta plataforma del payload y delega al procesador correspondiente.
- Despacha tarea arq `process_incoming_message`.

### approvals.py

- `POST /api/v1/approvals` — Crea solicitud de aprobacion de reserva.
- `GET /api/v1/approvals/{id}` — Consulta estado de solicitud.
- Valida payload con Pydantic `ReservationRequest`.

### users.py

- Endpoints de gestion de usuarios.

### bots.py

- Configuracion de bots de Telegram por organizacion.
- Gestion de tokens y webhooks.

### prompts.py

- `GET /api/v1/prompts` — Lista system prompts.
- `POST /api/v1/prompts` — Crea nueva version de prompt.
- `PATCH /api/v1/prompts/{id}/activate` — Activa una version.

### skills.py

- `GET /api/v1/skills` — Lista skills disponibles.
- `POST /api/v1/skills/config` — Configura skills por org.

### documents.py

- `POST /api/v1/documents/generate` — Genera documento PDF/DOCX.
- Recibe `EscrituraVariables` — Jinja2 — WeasyPrint — retorna URL.

### integrations.py

- Gestion de conexiones MCP externas.
- OAuth callbacks.

---

## Schemas Pydantic

**Ubicacion:** `schemas/`

| Archivo | Modelos |
|---------|---------|
| approval.py | ReservationPayload, ReservationRequest, ReservationResponse |
| message_job.py | MessageJobPayload (plataforma, vendor_id, org_id, message_text) |
| meta_webhook.py | MetaWebhookPayload completo (text, message, contact, value, change, entry) |
| telegram_vincule.py | TelegramTokenRequest, TelegramTokenResponse (token, bot_username, deep_link) |

---

## Relacionado
- [[Comunicacion entre Servicios]] — Auth servicio-a-servicio
- [[Agente IA LangGraph]] — Como se conectan los endpoints al agente
- [[Seguridad Backend]] — Validacion de auth
