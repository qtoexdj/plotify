# Contrato: payloads de reserva/venta con datos completos del comprador

**Relacionado**: FR-003, FR-004, US1, US3. Archivos: `apps/api/schemas/approval.py`, RPCs `approve_sale`/`approve_reservation`.

## Cambio en `SalePayload` y `ReservationPayload` (Pydantic v2)

Agregar 3 campos opcionales a **ambas** clases (`apps/api/schemas/approval.py:6` y `:33`):

```python
cliente_nacionalidad: Optional[str] = None
cliente_region: Optional[str] = None
cliente_comuna: Optional[str] = None
```

`ReservationPayload` ya tiene `notaria`/`fecha_firma`; `SalePayload` también. No cambian.

**Tras el cambio**: `pnpm contracts:generate` (regenera `packages/contracts/openapi/plotify-chat.v1.json` y `apps/web/src/lib/services/plotify-chat.generated.ts`). El frontend consume el tipo generado (Principio IV), no el mirror.

## Contrato de request (sin cambios de forma externa)

`POST /api/v1/approvals/request-sale` y `.../request-reservation` — el `payload` ahora acepta los 3 campos extra. Ejemplo:

```json
{
  "lot_id": "…",
  "organization_id": "…",
  "vendor_id": "…",
  "vendor_name": "…",
  "vendor_phone": "…",
  "vendor_platform": "telegram",
  "sale_mode": "reserved",
  "previous_lot_state": "reservado",
  "payload": {
    "cliente_nombre": "…",
    "cliente_run": "…",
    "valor_final": 12000000,
    "cliente_direccion": "…",
    "cliente_region": "Maule",
    "cliente_comuna": "Teno",
    "cliente_estado_civil": "…",
    "cliente_nacionalidad": "chilena",
    "cliente_ocupacion": "…",
    "cliente_email": "…",
    "cliente_telefono": "…",
    "notaria": "…",
    "fecha_firma": "2026-07-15"
  }
}
```

## Efecto aguas abajo

- RPC copia los campos a `lot_records` (data-model §3).
- Puente mapea `comprador.nacionalidad` desde `lot_records.cliente_nacionalidad` (`escritura_operational_bridge.py:240`, función `map_lot_record_variables`).
- Decisión de la tarea: región/comuna se concatenan a `comprador.domicilio` para el render o quedan como metadatos (no son token de escritura hoy).

## Test de contrato (obligatorio, cubre el gap del FakeStore)

- Enviar el payload con los 3 campos → verificar que llegan a `approval_requests.payload` (no se descartan).
- Aprobar → verificar que `lot_records` tiene los 3 valores.
- Correr el puente → verificar fila `comprador.nacionalidad` en `variable_resolutions` con valor.
