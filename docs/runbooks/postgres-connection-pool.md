# Runbook: Pool de conexiones PostgREST agotado (PGRST003)

**Owner**: backend
**Severidad**: alta (bloquea ventas, generación de escrituras y aprobaciones)

## Síntoma

- Errores `PGRST003: Timed out acquiring connection from connection pool` en API/worker.
- Ventas aprobadas que no generan escritura.
- Variables aprobadas en la mesa legal que reaparecen como faltantes.
- Logs del worker con `ReadTimeout` y corridas de ~240s.

## Causa raíz

Transacciones huérfanas acumuladas en Supavisor (modo transacción):

1. Una petición PostgREST supera el timeout del cliente (120s antes de SDD019
   F1; 30s después) y el cliente abandona la petición a mitad de camino.
2. La transacción queda abierta en el servidor (`idle in transaction` /
   `idle in transaction (aborted)`) y Supavisor la reserva para siempre.
3. La huérfana retiene locks de fila sobre `workflow_outbox`.
4. La siguiente llamada espera el lock (hasta `statement_timeout`), también
   es abandonada → nueva huérfana. Loop: +1 zombie por ciclo del cron (45s).
5. El pool se agota y TODA petición falla con PGRST003.
6. El puente operacional hace supersede (UPDATE ok) + insert (INSERT falla):
   variables `superseded` sin reemplazo → "faltantes aunque aprobadas".

## Detección

```bash
# read-only, exit 1 si hay zombies de >5min
apps/api/.venv/bin/python apps/api/scripts/check_idle_transactions.py

# detectar y TERMINAR zombies (mutante, con aprobación)
apps/api/.venv/bin/python apps/api/scripts/check_idle_transactions.py --terminate
```

Alternativa manual (psql/SQL):

```sql
select pid, state, xact_start, left(query, 80)
from pg_stat_activity
where state in ('idle in transaction', 'idle in transaction (aborted)')
order by xact_start;

select pg_terminate_backend(<pid>);
```

## Mitigación permanente (aplicada en SDD019)

- `core/database.py`: cliente Supabase singleton por proceso, timeout 30s,
  pool HTTP/1.1 limitado (10 conexiones / 5 keepalive).
- Migración `20260812165003_sdd019_idle_transaction_timeout.sql`:
  `idle_in_transaction_session_timeout = '5min'` — Postgres mata huérfanas solo.
- Migración `20260812165010_sdd019_outbox_lock_timeout.sql`:
  `lock_timeout = 5s` en heartbeat/begin/finish/release del outbox — fallan
  rápido en vez de esperar el lock 120s.

## Rollback

Ninguna de las tres mitigaciones es destructiva:

- Singleton: revertir `core/database.py` (no toca datos).
- `idle_in_transaction_session_timeout`: `ALTER DATABASE postgres RESET
  idle_in_transaction_session_timeout;`
- `lock_timeout` de las RPC: recrear las funciones desde
  `20260713000500_sdd019_workflow_durability.sql` (versión previa).

## Post-incidente

1. Verificar `check_idle_transactions.py` → 0 zombies.
2. Verificar ventas afectadas: lotes `vendido` sin generación (comparar
   `lots` vs `escritura_minuta_generations`).
3. Re-ejecutar la cascada para esos lotes con `handle_sale_validated_for_
   escritura` + `run_case_cascade` (trigger `manual_retry`).
4. Reiniciar el worker ARQ para que use el código actualizado.
