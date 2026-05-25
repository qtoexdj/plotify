# Workers del Microservicio

**Tag:** #backend #async
**Relacionado:** [[00 - Home]], [[Estructura Backend]], [[API Endpoints Microservicio]]

---

## Vision general

4 tareas async procesadas por ARQ (cola con Redis). Config en `workers/main_worker.py`.

**Config:** `max_tries=3`, dead letter queue tras 3 reintentos.

---

## message_processor.py

Procesa mensajes entrantes de WhatsApp/Telegram.

**Exporta:**
- `process_incoming_message(ctx, payload_dict)` — Tarea principal: reconstruye payload, determina role (lead/vendor) desde DB, sanitiza input, invoca grafo LangGraph, y rutea respuesta via Meta o Telegram client.
- `link_telegram_account(ctx, org_id, link_token, telegram_chat_id)` — Vincula perfil de Supabase con chat ID de Telegram. Valida token, hace cleanup de huerfanos (escenario de reasignacion), envia confirmacion.

---

## approval_notifier.py

Envia notificaciones de aprobacion a admins de la org.

**Exporta:**
- `notify_admin_approval(ctx, approval_id)` — Lee solicitud de aprobacion, construye mensaje formateado, busca admins de la org, envia notificacion via Telegram (con botones inline Approve/Reject) o fallback WhatsApp.

---

## approval_processor.py

Procesa decisiones de aprobacion/rechazo de admins.

**Exporta:**
- `process_admin_decision(ctx, org_id, approval_id, action, admin_id)` — Llama RPC de Supabase (`approve_reservation` o `reject_reservation`), notifica al vendor del resultado (Telegram > WhatsApp), envia confirmacion al admin.

---

## notification_worker.py

Notificaciones proactivas a admins de la org.

**Exporta:**
- `send_notification(ctx, payload)` — Sistema de notificaciones template-based soporta: `reservation_approved`, `new_lead`, `stage_change`.

---

## Config del Worker

**Archivo:** `workers/main_worker.py`

```
WorkerSettings:
  functions: [
    process_incoming_message,
    link_telegram_account,
    notify_admin_approval,
    process_admin_decision,
    send_notification
  ]
  max_tries: 3
  on_job_end: mueve fallidos a dead_letter_queue
  redis_settings: desde config
```

## Dead Letter Queue

Cuando una tarea falla tras 3 reintentos, se mueve a la tabla `dead_letter_queue` en Supabase para revision manual.

## Relacionado
- [[API Endpoints Microservicio]] — Donde se despachan las tareas
- [[Agente IA LangGraph]] — message_processor invoca el grafo
