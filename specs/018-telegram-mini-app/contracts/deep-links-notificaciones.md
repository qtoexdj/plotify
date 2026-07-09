# Contrato: notificaciones accionables y deep links de la mini app

**Relacionado**: FR-004, FR-013, US1, US2. Código a leer antes: [approval_notifier.py](../../../apps/api/workers/tasks/approval_notifier.py), [escritura_notifications.py](../../../apps/api/services/escritura_notifications.py), [telegram_client.py](../../../apps/api/integrations/telegram_client.py) (`send_text` ya acepta `reply_markup`).

## Esquema de URLs de la mini app

Base: `TELEGRAM_MINI_APP_URL` (env del API, ej. `https://app.plotify.cl`). Rutas canónicas:

| Entidad                      | URL                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Home (rol decide destino)    | `{BASE}/mini?org={org_id}`                                                                                    |
| Detalle de caso de escritura | `{BASE}/mini/bandeja/{case_id}?org={org_id}` (admin) / `{BASE}/mini/ventas/{case_id}?org={org_id}` (vendedor) |
| Detalle de reserva pendiente | `{BASE}/mini/bandeja/{approval_id}?org={org_id}&tipo=reserva`                                                 |
| Documento entregado          | `{BASE}/mini/documentos?org={org_id}&destacar={delivery_id}`                                                  |
| Ficha de lote (compartir)    | `https://t.me/{bot_username}/{app_name}?startapp=lot_{lot_id}`                                                |

Reglas:

- `org` en la URL solo selecciona el bot para la validación de sesión (contrato de auth); **no autoriza nada**.
- El deep link lleva a la entidad, pero la pantalla igual re-verifica que la entidad pertenezca a la org de la sesión y que el rol pueda verla; un deep link ajeno termina en 404 de la mini app, nunca en datos.
- Compartir hacia terceros usa `startapp` (link `t.me`, funciona sin haber abierto el bot); los botones de notificación usan `web_app` (URL directa, solo chats privados con el bot — que es exactamente donde notificamos).

## Cambios en los notificadores

Cada mensaje que hoy se envía por `send_text(...)` en estos flujos agrega `reply_markup` con un botón `web_app`:

1. **Solicitud de aprobación de reserva** (`approval_notifier.py`): conserva los botones inline `approve:{uuid}` / `reject:{uuid}` actuales (FR-013: conviven) y agrega fila con `{"text": "Abrir en la app", "web_app": {"url": <detalle reserva>}}`.
2. **Excepción de cascada** (notificación SDD017 en `escritura_notifications.py`): botón hacia el detalle del caso en la bandeja.
3. **Entrega de minuta** (`sendDocument` + mensaje): botón hacia "mis documentos" con el delivery destacado.
4. **Revisión jurídica pendiente** (modo `every_sale` del SDD017): botón hacia el detalle del caso.

Si `TELEGRAM_MINI_APP_URL` no está configurada, los mensajes salen SIN botón `web_app` (sin romper nada): el botón es aditivo y su ausencia se loguea una vez como warning, no por mensaje.

## Menú persistente del bot

Al configurar o actualizar el bot de una org (flujo existente de `telegram_bots`), invocar `setChatMenuButton` con `{"type": "web_app", "text": "Abrir Plotify", "web_app": {"url": "{BASE}/mini?org={org_id}"}}`. Nota: `setChatMenuButton` debe agregarse a `_ALLOWED_BOT_METHODS` en `telegram_client.py`.

## Recepción del deep link en la mini app

- URL directa (`web_app` button): la ruta y query llegan tal cual; la página pide sesión (contrato auth) y luego carga la entidad.
- `startapp` (links compartidos): el parámetro llega como `start_param` DENTRO del `initData` firmado; la mini app lo lee después de validar la sesión y navega. Formato: `{tipo}_{id}` (`lot_abc123`). Ignorar silenciosamente valores malformados.

## Tests mínimos

1. Notificación de aprobación generada en test → `reply_markup` contiene los botones inline existentes Y el botón `web_app` con la URL correcta del detalle.
2. Sin `TELEGRAM_MINI_APP_URL` → mensaje sin botón `web_app`, sin excepción, warning logueado.
3. Deep link a un caso de otra org con sesión válida → la pantalla no muestra datos (404).
4. `start_param` malformado → home normal, sin error visible.
5. Regresión: los botones inline `approve/reject` siguen funcionando por el webhook actual (escenario 0 del quickstart).
