-- SDD 019 (camino corto, hardening de producción): limitar la vida de
-- transacciones huérfanas.
--
-- Diagnóstico: el cliente httpx de la API/worker abandonaba peticiones
-- PostgREST que tardaban más que su timeout (120s), dejando transacciones
-- abiertas ("idle in transaction") que Supavisor retiene para siempre.
-- Cada zombie consume un slot del pool y retiene locks de fila sobre
-- workflow_outbox, causando más timeouts (loop) hasta agotar el pool
-- (PGRST003: Timed out acquiring connection from connection pool).
--
-- Con 0 (default) esas sesiones nunca se limpian solas. 5 minutos es
-- suficiente para cualquier transacción legítima del pipeline y mata
-- automáticamente las huérfanas antes de que acumulen.

ALTER DATABASE postgres SET idle_in_transaction_session_timeout = '5min';
