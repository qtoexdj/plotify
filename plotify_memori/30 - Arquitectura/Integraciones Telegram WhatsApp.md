# Integraciones Telegram y WhatsApp

**Tag:** #backend #integraciones
**Relacionado:** [[00 - Home]], [[Agente IA LangGraph]], [[Estructura Backend]]

---

## Telegram

### Arquitectura multi-tenant

- Un bot de Telegram por organizacion.
- Cada org tiene su propia configuracion de bot (token, username).
- El deep link se genera desde el frontend: `https://t.me/plotify_chat_bot?start=org_X`

### Webhook

- FastAPI recibe webhooks de Telegram en `/api/v1/webhook/telegram`.
- Valida que el webhook venga de Telegram (secret token).
- Extrae el org_id del contexto del chat.
- Pasa el mensaje al grafo LangGraph.

### Bot User

- Username configurado: `NEXT_PUBLIC_TELEGRAM_BOT_USER = plotify_chat_bot`
- El bot responde consultas sobre:
  - Disponibilidad de lotes.
  - Requisitos de reserva.
  - Estado de proyectos.

### Deep Linking

- Los vendors comparten links `t.me/plotify_chat_bot?start=PARAM` con compradores.
- El parametro start identifica el contexto (org, proyecto, vendor).

## WhatsApp

- Infraestructura preparada pero no activa por defecto.
- Mismo patron: un numero por org, webhooks, integracion con LangGraph.
- Requiere configuracion adicional de WhatsApp Business API.

## Relacionado
- [[Agente IA LangGraph]] — Como procesa los mensajes el agente
- [[Seguridad Backend]] — Validacion de webhooks
