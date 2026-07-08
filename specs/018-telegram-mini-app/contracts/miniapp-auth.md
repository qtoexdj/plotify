# Contrato: autenticación de la mini app (initData → sesión)

**Relacionado**: FR-001, FR-002, FR-003, FR-011, FR-014, US1. Código a leer antes: [telegram_client.py](../../../apps/api/integrations/telegram_client.py) (factory por org + RPC de token), [message_processor.py](../../../apps/api/workers/tasks/message_processor.py) (`resolve_telegram_actor_context`), [deps.py](../../../apps/api/api/deps.py) (patrones de autorización).

## POST /api/v1/miniapp/session

Emite la sesión de mini app validando el `initData` de Telegram.

### Request

```json
{
  "org_id": "<uuid>",
  "init_data": "<string crudo de window.Telegram.WebApp.initData>"
}
```

`org_id` viene de la URL de la mini app (cada org tiene su bot y su URL con contexto). El servidor NO confía en él como identidad: solo lo usa para elegir contra qué token de bot validar; la pertenencia real se verifica contra la base.

### Validación (en orden, cortocircuito al primer fallo)

1. Obtener el token del bot de la org (misma fuente que `get_telegram_client_for_org`: RPC `get_decrypted_bot_token`, cache TTL 1h). Sin bot → 404 genérico.
2. Parsear `init_data` como querystring; extraer y remover `hash`.
3. `data_check_string` = pares `key=value` ordenados alfabéticamente, unidos por `\n`.
4. `secret_key = HMAC_SHA256(key="WebAppData", msg=bot_token)`; `computed = HMAC_SHA256(key=secret_key, msg=data_check_string)` en hex.
5. Comparar con `hmac.compare_digest`. **Verificar el algoritmo vigente con context7 antes de implementar** — este contrato fija la intención, la doc oficial fija los bytes.
6. `auth_date` dentro de la ventana: **≤ 600 segundos**. Fuera → 401 `initdata_expired` (la mini app reintenta con initData fresco del SDK; es transparente para el usuario).
7. Extraer `user.id` (chat_id) del campo `user`. Resolver identidad como `resolve_telegram_actor_context`: perfil por `telegram_chat_id` + membresía VIGENTE en la org (`organization_members` para admin; `vendors`/`vendor_projects` para vendedor). Sin perfil → 403 `not_linked`. Sin membresía vigente → 403 `not_member`.

### Response 200

```json
{
  "token": "<sesión firmada>",
  "expires_in": 3600,
  "role": "admin | vendor",
  "user": { "id": "<uuid>", "nombre": "...", "org_id": "<uuid>", "org_nombre": "..." }
}
```

### Sesión

- Token firmado con `MINIAPP_SESSION_SECRET` (HS256), claims: `sub` (user_id), `org` (org_id), `role`, `chat_id`, `iat`, `exp` (1 hora). Stateless: sin tabla de sesiones.
- Renovación: la mini app pide sesión nueva con el `initData` vigente cuando recibe 401; no hay refresh tokens.

### Dependencia FastAPI

`verify_miniapp_session` (en `core/miniapp_session.py`): lee `Authorization: Bearer`, verifica firma y expiración, devuelve el contexto `{user_id, org_id, role, chat_id}`. TODOS los endpoints `/miniapp/*` (salvo `/session`) la usan. Los endpoints de admin agregan chequeo de `role == "admin"` **y** re-verificación contra `organization_members` en mutaciones (la membresía puede haber cambiado dentro de la hora de vida del token).

### Errores

| Código | Cuerpo | Cuándo |
|---|---|---|
| 401 `invalid_initdata` | genérico, sin detalle | hash no coincide, formato inválido |
| 401 `initdata_expired` | indica reintento | `auth_date` fuera de ventana |
| 403 `not_linked` | instruye vincular | chat sin perfil |
| 403 `not_member` | genérico | perfil sin membresía vigente en la org |
| 404 | genérico | org sin bot configurado |

Los cuerpos de error NUNCA revelan si la org existe, cuántos miembros tiene, ni nada enumerable.

### Auditoría

- Emisión exitosa: `action="miniapp.session_issued"`, actor = user_id resuelto.
- Rechazo: `action="miniapp.session_rejected"`, actor = `telegram:{chat_id}` (si parseable), payload con la causa. Mismo patrón `log_agent_action` de [audit.py](../../../apps/api/utils/audit.py).

### Tests mínimos (negativos primero)

1. Vectores HMAC con token de prueba conocido: válido / hash alterado / campo agregado / orden distinto de campos (debe seguir validando: el orden lo impone el algoritmo, no el emisor).
2. `auth_date` viejo → 401 `initdata_expired`.
3. Chat no vinculado → 403 `not_linked`, sin datos de la org en la respuesta.
4. Usuario removido de `organization_members` → 403 `not_member` aunque el perfil tenga `telegram_chat_id`.
5. Sesión expirada / firma inválida en `verify_miniapp_session` → 401.
6. Vendedor llamando un endpoint de admin → 403.
7. Token de sesión de la org A usado para leer datos de la org B → 403/404 (tenant derivado de la sesión, jamás del query param).
