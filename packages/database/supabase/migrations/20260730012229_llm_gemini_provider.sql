-- Add Google Gemini to the same encrypted credential, task assignment, model
-- catalog and audit boundaries used by the existing LLM providers.

ALTER TABLE public.llm_provider_credentials
    DROP CONSTRAINT llm_provider_credentials_provider_check,
    ADD CONSTRAINT llm_provider_credentials_provider_check
    CHECK (provider IN ('openai', 'anthropic', 'deepseek', 'gemini'));

ALTER TABLE public.llm_configuration_events
    DROP CONSTRAINT llm_configuration_events_provider_check,
    ADD CONSTRAINT llm_configuration_events_provider_check
    CHECK (
        provider IS NULL
        OR provider IN ('openai', 'anthropic', 'deepseek', 'gemini')
    );

ALTER TABLE public.llm_provider_models
    DROP CONSTRAINT llm_provider_models_provider_check,
    ADD CONSTRAINT llm_provider_models_provider_check
    CHECK (provider IN ('openai', 'anthropic', 'deepseek', 'gemini'));

ALTER TABLE public.llm_model_catalog_syncs
    DROP CONSTRAINT llm_model_catalog_syncs_provider_check,
    ADD CONSTRAINT llm_model_catalog_syncs_provider_check
    CHECK (provider IN ('openai', 'anthropic', 'deepseek', 'gemini'));

INSERT INTO public.llm_provider_models (
    provider,
    model_id,
    display_name,
    capabilities,
    reasoning_options,
    verification_status,
    source,
    is_available,
    last_seen_at,
    last_verified_at,
    updated_at
)
VALUES (
    'gemini',
    'gemini-3.6-flash',
    'Gemini 3.6 Flash',
    ARRAY['pdf_input', 'reasoning', 'structured_output', 'tool_calling'],
    ARRAY['off', 'minimal', 'low', 'medium', 'high'],
    'verified',
    'curated',
    true,
    now(),
    now(),
    now()
)
ON CONFLICT (provider, model_id) DO UPDATE
SET
    display_name = EXCLUDED.display_name,
    capabilities = EXCLUDED.capabilities,
    reasoning_options = EXCLUDED.reasoning_options,
    verification_status = EXCLUDED.verification_status,
    source = EXCLUDED.source,
    is_available = EXCLUDED.is_available,
    last_seen_at = EXCLUDED.last_seen_at,
    last_verified_at = EXCLUDED.last_verified_at,
    verification_error_code = NULL,
    updated_at = EXCLUDED.updated_at;

-- Forward rollback:
-- Remove Gemini credentials/task assignments/catalog rows first, then restore
-- the four provider CHECK constraints to openai/anthropic/deepseek.
