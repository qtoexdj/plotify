# Procedimientos Atomicos

**Tag:** #db #seguridad
**Relacionado:** [[00 - Home]], [[Schema General BD]], [[Tablas Core BD]], [[Server Actions]]

---

## reserve_lot

Procedimiento PL/pgSQL para reservar un lote de forma atomica.

### Caracteristicas

- Usa `SELECT ... FOR UPDATE` lock en la fila del lote.
- Verifica que el lote este `disponible` antes de reservar.
- Actualiza `estado = reservado`, `sale_state = reservado`.
- Setea `process_stage = espera_firma_reserva`.
- Registra quien reservo y cuando.
- Previene **double-booking** (dos vendors reservando el mismo lote al mismo tiempo).

### Quien lo llama

- `src/actions/reserve-lot.action.ts` → servicio → RPC.

### Trigger asociado

Al insertar en `lots` con estado reservado, un trigger crea automaticamente un `lot_record` vacio.

## direct_sale_lot

Variante para venta directa (sin paso por reserva).

### Caracteristicas

- Mismo patron de `FOR UPDATE` lock.
- Actualiza directamente a `vendido`.
- Setea `process_stage = escritura_firmada`.

## RPC functions

### reserve_lot RPC

```sql
-- Se llama desde el frontend via:
supabase.rpc('reserve_lot', { p_lot_id: '...', p_vendor_id: '...' })
```

- Retorna exito o error con mensaje.
- Todo dentro de una transaccion atomica.

## Prevencion de race conditions

El patron `FOR UPDATE` lockea la fila hasta que la transaccion termina:

```
Transaccion A: LOCK lote 42 → verifica disponible → reserva → COMMIT
Transaccion B: espera... → LOCK liberado → lote ya reservado → ERROR
```

## Relacionado
- [[Server Actions]] — reserve-lot.action.ts usa este procedimiento
- [[Tablas Core BD]] — lots y lot_records que modifica
