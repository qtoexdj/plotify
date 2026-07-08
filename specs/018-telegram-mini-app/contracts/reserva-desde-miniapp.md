# Contrato: reserva estructurada desde la mini app

**Relacionado**: FR-009, FR-012, US5. Código a leer antes: [reservations.py](../../../apps/api/agent/tools/reservations.py) (cómo crea hoy el agente los `approval_requests` — el servicio a extraer/reutilizar, NO duplicar), [deps.py](../../../apps/api/api/deps.py) (`require_lot_organization`), [approval_notifier.py](../../../apps/api/workers/tasks/approval_notifier.py).

## POST /api/v1/miniapp/reservas

Requiere sesión de mini app con rol `vendor` (o `admin`).

### Request

```json
{
  "idempotency_key": "<uuid generado por el cliente al abrir el formulario>",
  "lot_id": "<uuid>",
  "comprador": {
    "nombre": "Juan Soto Pérez",
    "rut": "12.345.678-5",
    "telefono": "+56 9 1234 5678",
    "email": "juan@correo.cl"
  },
  "nota": "opcional, texto corto"
}
```

**Protección de datos (restricción legal)**: el formulario NO incluye carga de imágenes de la cédula de identidad ni de ningún documento de identidad — por ley no se pueden almacenar. Se capturan únicamente los datos tipeados. El campo "adjuntar cédula" del wireframe 3 quedó descartado; no implementarlo bajo ninguna variante (foto, PDF, OCR) sin autorización legal explícita del usuario.

### Validación en servidor (toda, aunque el cliente ya validó)

1. Sesión válida + rol permitido.
2. `lot_id` pertenece a la org de la sesión (patrón `require_lot_organization` — derivar, no confiar).
3. El vendedor de la sesión tiene el proyecto del lote asignado (`vendor_projects`); admin salta este paso.
4. El lote está en un estado reservable según la máquina de estados de lotes (SDD016) — la fuente de verdad es el servicio existente, no una lista de estados copiada a este endpoint.
5. RUT chileno válido (módulo 11, con normalización de puntos/guión). Teléfono y email con validación razonable (formato, no verificación).
6. `idempotency_key`: si ya existe una solicitud con esa clave para ese vendedor, responder **200 con la solicitud existente** (no 409, no duplicado). Implementación sugerida sin DDL: clave persistida en el payload/metadata del `approval_request` y consultada antes de crear; si el modelo actual no lo permite limpio, proponer la alternativa mínima en el PR antes de implementarla.

### Efecto

- Crea el `approval_request` por el MISMO servicio que usa el agente (extraerlo a un módulo compartido si hoy vive solo dentro del tool — refactor permitido y deseado; verificar llamadores con graphify).
- Notifica a los admins por el flujo existente, ahora con botón `web_app` al detalle (contrato de deep links).
- Audita `action="miniapp.reserva_creada"`, actor = user_id de la sesión, origen `miniapp`.

### Response

- **201**: `{ "approval_id": "...", "estado": "pendiente" }`
- **200**: misma forma, cuando la idempotency_key ya existía.
- **409 `lote_no_disponible`**: el estado del lote cambió entre la ficha y el envío; el cuerpo trae el estado actual para que la UI lo muestre ("este lote acaba de reservarse").
- **422**: detalle por campo (el cliente los pinta bajo cada input).
- **403**: vendedor sin el proyecto asignado / lote de otra org.

## Formulario (cliente)

- `react-hook-form` + resolver `zod`; el schema zod es el espejo del contrato (mismos límites) y vive en `apps/web/src/lib/miniapp/`.
- Validación de RUT en vivo (indicador check del wireframe 3); formateo automático de puntos/guión.
- `MainButton` de Telegram como submit ("Enviar a aprobación"), deshabilitado mientras el form sea inválido; `enableClosingConfirmation` mientras haya datos sin enviar.
- Estados explícitos: enviando / creado (con link al caso) / lote ya no disponible / error de red con reintento manual (misma `idempotency_key`).

## Tests mínimos

1. RUT inválido → 422 con el campo señalado (servidor), aunque el cliente se salte la validación (probar llamando el endpoint directo).
2. Doble envío con la misma `idempotency_key` → una sola solicitud en la base; segunda respuesta 200 con la misma `approval_id`.
3. Lote no disponible → 409 con estado actual; NO se crea solicitud.
4. Vendedor de otro proyecto → 403; lote de otra org → 403/404.
5. Flujo completo (test de integración + quickstart): crear → notificación con botón → aprobar desde la mini app → estados finales consistentes en `approval_requests` y `audit_logs` con origen `miniapp`.
