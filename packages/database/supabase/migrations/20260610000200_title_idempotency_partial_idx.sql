-- SDD 009 correccion: la idempotencia por hash aplica solo a corridas vigentes.
-- El indice unico total bloqueaba re-analizar con el mismo source_content_hash
-- cuando la corrida anterior quedo superseded/failed/llm_disabled (p. ej. el
-- rollout del flag LEGAL_TITLE_AGENT_ENABLED o revertir un documento), porque
-- las filas historicas conservan el hash. Las corridas re-ejecutables quedan
-- fuera del indice; la unicidad se garantiza solo entre corridas activas.

DROP INDEX IF EXISTS public.title_analyses_idempotency_idx;

CREATE UNIQUE INDEX IF NOT EXISTS title_analyses_idempotency_idx
ON public.title_analyses (project_id, source_content_hash, extractor_name, prompt_version)
WHERE (status <> ALL (ARRAY['superseded'::text, 'failed'::text, 'llm_disabled'::text]));
