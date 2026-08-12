# Plotify Operational Memory

## Contrato con AGENTS.md

Lee [AGENTS.md](AGENTS.md) antes de usar esta memoria. Resume estado entre sesiones; no sustituye código, SDD ni el vault. Las reglas permanentes viven en AGENTS; el conocimiento profundo en `plotify_memori/`.

## Estado actual

- Verificado: 2026-08-12 (949 tests API de pytest pasando; 1 live fail preexistente `test_trigger_exists_in_db`).
- Feature SDD activa: `specs/019-hardening-produccion/`.
- Próxima tarea permitida: reiniciar worker ARQ (F4) y completar T079–T082.
- CodeGraph: sano y sincronizado.
- Camino corto A1–A5: `core/config.py` (hard-off false), `escritura_auto_pipeline.py` (rollout desde RPC SQL + gates relajables), migración `20260807235200_sdd019_relaxed_readiness.sql`.
- F1–F6 pool PostgREST: singleton cliente en `core/database.py` (timeout 30s, pool limitado), migraciones `20260812165003_sdd019_idle_transaction_timeout` y `20260812165010_sdd019_outbox_lock_timeout` aplicadas al linked (parity 0/0), script `apps/api/scripts/check_idle_transactions.py`, runbook `docs/runbooks/postgres-connection-pool.md`, test de regresión singleton.

## Fuentes

- Reglas: [AGENTS.md](AGENTS.md).
- Principios: `.specify/memory/constitution.md`.
- SDD activo: `specs/019-hardening-produccion/`.
- Código y dependencias: manifiestos, lockfile, migraciones y tests.
- Vault Obsidian: `plotify_memori/`; no usar `.obsidian/` como fuente de producto.
- [Mapa Técnico Actual](plotify_memori/30%20-%20Arquitectura/Mapa%20T%C3%A9cnico%20Actual.md).

## Stack técnico verificado

Fuente: `package.json`, `apps/web/package.json`, `apps/api/requirements.txt`, `pnpm-lock.yaml` y runtimes locales; verificado 2026-08-06.

- Node: mínimo `>=22.13`; runtime observado `26.5.0`.
- pnpm: `11.3.0` declarado.
- Web: Next `16.2.6`, React `19.2.4`, TypeScript 5, Tailwind 4, shadcn `4.8.0`, Vitest `4.0.17`, Playwright `1.61.1`.
- API/worker: Python `3.13.13`, FastAPI `0.135.1`, LangGraph `1.2.1`, ARQ `0.27.0`.
- Datos: Supabase cloud-only `swkrnjdpnlrgxgotmfxy`. PostgreSQL 17 está declarado por SDD019 y requiere confirmación Supabase MCP antes de afirmar estado del servicio.

## Correcciones

### Pendientes de verificar

- 2026-08-07 — Secuencia exacta de excepciones por intento del consumidor outbox (sospecha: `WORKFLOW_LEASE_LOST` al llamar `complete()` tras el defer de la cascada). Falta confirmar con logs del worker ARQ; el usuario no adjuntó las terminales. Fuente: diagnóstico en vivo.
- 2026-08-07 — Reconciliación de migraciones EJECUTADA y verificada (A3b completo): Fase 1 registró en `schema_migrations` las 5 versiones locales LLM + `20260806000000` (statements=ARRAY[], DDL ya aplicado) y retiró las 5 remote-only LLM (metadata, DDL intacto). Fase 2.1 creó `organizations.escritura_relaxed_readiness`; Fase 2.2 re-aplicó `is_project_vendible` con el flag relajado. Registrada también `20260807235200`. Resultado: `supabase migration list --linked` 45/45 `local==remote`; `compare-migration-history --target linked` → `exact_parity`. Backup lógico en `specs/019-hardening-produccion/evidence/migration-reconciliation-backup.json`. Fuente: ejecución directa + verificación.
- 2026-08-07 — Fix en `packages/database/scripts/compare-migration-history.mjs`: (1) `inspectLinkedMigrationHistory` corría `supabase migration list` desde la raíz del monorepo (nunca veía locales) → corregido cwd a `packages/database/supabase`; (2) `parseRemoteMigrationList` esperaba salida tabular, pero la CLI devuelve JSON → soporta JSON con fallback legacy. 2 tests nuevos: 6/6 verdes. Este bug invalidaba el gate de parity del SDD019. Fuente: verificación.

### Camino corto (A1–A5) — implementado y verificado

- 2026-08-07 — Implementado el "camino corto" para generar escrituras: `PLOTIFY_HARD_OFF_*` default `false` (`core/config.py`); `run_case_cascade` resuelve el rollout desde la RPC SQL `resolve_feature_rollout` (fuente de verdad) en vez de `control=None` (elimina `AUTOMATIC_ESCRITURA_MISSING`); nuevo flag de org `escritura_relaxed_readiness` (migración `20260807235200_sdd019_relaxed_readiness.sql`) que relaja los gates heredados `title_verified`/`sii_verified`/`sag_plano_verified` en la cascada. `is_project_vendible` (migración `20260806000000`) ahora respeta el flag: con él basta matriz aprobada para vender. Four-eyes ya era `false` por defecto. Evidencia: 946 tests pytest verdes (1 live fail preexistente `test_notifications_fase7::test_trigger_exists_in_db` por función `query` ausente en BD). Fuente: implementación + verificación.
- 2026-08-07 — Tests de API rotos por el cambio manual del usuario `maybe_single()→limit(1)` + consulta separada a `projects` en `_assert_lot_scope`: se actualizaron los mocks de `test_pipeline_venta_escritura_contract.py`, `test_escrituras_readiness.py`, `test_matriz_operational_bridge.py` y `test_matriz_operational_gates.py` para soportar la tabla `projects` y el método `.limit()`. Fuente: verificación de suite.

### Verificadas

- 2026-08-12 — Agotamiento del pool PostgREST (PGRST003) diagnosticado: `get_supabase_client()` creaba un cliente httpx nuevo por llamada (~145 call sites) con timeout 120s; peticiones abandonadas dejaban transacciones huérfanas (`idle in transaction`) que Supavisor retiene para siempre (`idle_in_transaction_session_timeout=0`), retenían locks de fila sobre `workflow_outbox` y generaban más timeouts (loop) hasta agotar el pool. El puente operacional hacía supersede (UPDATE ok) + insert (INSERT falla) → variables `superseded` sin reemplazo ("faltantes aunque aprobadas"). Fixes F1–F6 aplicados: singleton cliente (timeout 30s, pool HTTP/1.1 10/5), `idle_in_transaction_session_timeout='5min'` (registrado en `pg_db_role_setting`), `lock_timeout=5s` en RPCs del outbox, script de monitoreo + runbook, test de regresión. 7 zombies terminados manualmente. Fuente: inspección pg_stat_activity/pg_locks + docs Supabase (Context7) + verificación en suite.

- 2026-08-07 — Diagnóstico "venta aprobada sin escritura": el `approve_sale` remoto crea outbox (`workflow_outbox_id`), lo que desactiva el hook inline; el consumidor nunca completa porque `run_case_cascade` pasa `control=None` a `resolve_feature_rollout` (resulta `missing` → defiere con `AUTOMATIC_ESCRITURA_MISSING`, limpia el lease y rompe el `complete()` posterior) — trabajo ya cubierto por T079–T082. Además el caso del lote 47 queda `blocked` por gates `sii_verified` (`lote.rol_tramite`) y `legal_review_ready` (`revision_juridica.estado`). 5 ventas (lotes 47, 34, 2, 8, 16) en outbox `dead_letter`/`processing`. Evidencia: inspección BD cloud + reproducción local del hook/cascada. Fuente: verificación directa.
- 2026-08-07 — Divergencia de migraciones repo↔cloud: 5 remote-only (20260729023506, 20260729043333, 20260729043821, 20260729044941, 20260730012841) ausentes del repo y `20260806000000_sdd019_fix_outbox_and_vendible_rpc.sql` local sin aplicar al linked. Fuente: `supabase migration list --linked`.
- 2026-08-07 — En diagnóstico se ejecutó manualmente el hook para el lote 47: caso `93d9a7fc-a7d2-4364-ae9f-b9621b5cbc39` y borrador `02603b2c-6c2c-4433-ba26-a1a485aad382` creados (readiness `blocked`). Fuente: ejecución directa verificada.
- 2026-08-06 — La aprobación comercial de venta debe generar y despachar automáticamente el borrador de escritura (PDF/DOCX) por Telegram a Vendedor y Administrador sin bloqueos post-venta, utilizando la matriz aprobada previa y deslindes validados en visor. Fuente: usuario.
- 2026-08-06 — `plotify_memori/` es el vault de Obsidian y memoria profunda; `memory.md` no debe copiarlo. Fuente: usuario.
- 2026-08-06 — Rules y workflows heredados se retiran para eliminar instrucciones contradictorias. Fuente: usuario y auditoría de `.agents/`.

## Skills usadas y motivo

- 2026-08-06 — `context-engineering`: diseñar jerarquía de contexto persistente.
- 2026-08-06 — `documentation-and-adrs`: estructurar documentación durable en Obsidian.
- 2026-08-06 — `skill-creator`: crear `plotify-sdd-handoff`.
- 2026-08-06 — `test-driven-development`: cubrir el verificador antes de implementarlo.
- 2026-08-06 — `git-workflow-and-versioning`: aislar el cambio documental de producto.

## Handoffs y bitácora

- Handoffs históricos: `plotify_memori/50 - Implementaciones/`.
- SDD019 sigue activo; no emitir recibo de cierre hasta completar gates y evidencia.
- 2026-08-06 — Se adoptó el modelo AGENTS para normas, memory para estado y `plotify_memori/` para documentación profunda.

## Protocolo de actualización

1. Registrar una corrección del usuario como pendiente, con fecha y fuente.
2. Contrastar con código, SDD, tests, CodeGraph o decisión explícita.
3. Promover sólo hechos confirmados y enlazar la evidencia.
4. Al cerrar un SDD, usar `$plotify-sdd-handoff` para actualizar vault, Home, handoff y memoria.
5. Ejecutar `pnpm check:agent-context` tras modificar AGENTS, memoria, mapa técnico o feature activa.
