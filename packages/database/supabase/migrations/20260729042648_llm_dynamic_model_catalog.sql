-- Provider-discovered LLM catalog. Provider APIs are the availability source;
-- Plotify's capability classifier determines whether a discovered model is
-- safe to expose for task assignment. Active task assignments are intentionally
-- stored in a different table and are never mutated by catalog synchronization.

CREATE TABLE public.llm_provider_models (
    provider text NOT NULL
        CHECK (provider IN ('openai', 'anthropic', 'deepseek')),
    model_id text NOT NULL CHECK (char_length(model_id) BETWEEN 1 AND 200),
    display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 240),
    capabilities text[] NOT NULL DEFAULT '{}',
    reasoning_options text[] NOT NULL DEFAULT ARRAY['off']::text[],
    verification_status text NOT NULL DEFAULT 'discovered'
        CHECK (verification_status IN ('discovered', 'verified', 'incompatible')),
    source text NOT NULL DEFAULT 'provider'
        CHECK (source IN ('provider', 'curated', 'provider_capabilities')),
    owned_by text,
    released_at timestamptz,
    is_available boolean NOT NULL DEFAULT true,
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    last_verified_at timestamptz,
    verification_error_code text,
    raw_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, model_id),
    CHECK (array_length(reasoning_options, 1) IS NOT NULL),
    CHECK ('off' = ANY(reasoning_options))
);

COMMENT ON TABLE public.llm_provider_models IS
    'Service-only provider model discovery cache. It never contains credentials and never changes llm_task_configs.';

CREATE INDEX llm_provider_models_available_idx
    ON public.llm_provider_models (provider, is_available, verification_status);

CREATE TABLE public.llm_model_catalog_syncs (
    provider text PRIMARY KEY
        CHECK (provider IN ('openai', 'anthropic', 'deepseek')),
    status text NOT NULL
        CHECK (status IN ('success', 'error')),
    model_count integer NOT NULL DEFAULT 0 CHECK (model_count >= 0),
    last_error_code text,
    last_synced_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid
);

COMMENT ON TABLE public.llm_model_catalog_syncs IS
    'Last redacted model catalog synchronization status per LLM provider.';

ALTER TABLE public.llm_provider_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.llm_model_catalog_syncs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.llm_provider_models FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.llm_model_catalog_syncs FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.llm_provider_models TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.llm_model_catalog_syncs TO service_role;

ALTER TABLE public.llm_configuration_events
    DROP CONSTRAINT IF EXISTS llm_configuration_events_action_check;
ALTER TABLE public.llm_configuration_events
    ADD CONSTRAINT llm_configuration_events_action_check
    CHECK (
        action IN (
            'credential_saved',
            'credential_revoked',
            'task_configured',
            'model_catalog_synced'
        )
    );

INSERT INTO public.llm_provider_models (
    provider,
    model_id,
    display_name,
    capabilities,
    reasoning_options,
    verification_status,
    source,
    is_available,
    last_verified_at
)
VALUES
    (
        'openai',
        'gpt-5.6',
        'GPT-5.6',
        ARRAY['pdf_input', 'reasoning', 'structured_output', 'tool_calling'],
        ARRAY['off', 'low', 'medium', 'high', 'xhigh'],
        'verified',
        'curated',
        true,
        now()
    ),
    (
        'openai',
        'gpt-5.4',
        'GPT-5.4',
        ARRAY['pdf_input', 'reasoning', 'structured_output', 'tool_calling'],
        ARRAY['off', 'low', 'medium', 'high'],
        'verified',
        'curated',
        true,
        now()
    ),
    (
        'openai',
        'gpt-4o',
        'GPT-4o',
        ARRAY['pdf_input', 'structured_output', 'tool_calling'],
        ARRAY['off'],
        'verified',
        'curated',
        true,
        now()
    ),
    (
        'anthropic',
        'claude-sonnet-5',
        'Claude Sonnet 5',
        ARRAY['structured_output', 'tool_calling'],
        ARRAY['off'],
        'verified',
        'curated',
        true,
        now()
    ),
    (
        'anthropic',
        'claude-sonnet-4-6',
        'Claude Sonnet 4.6',
        ARRAY['structured_output', 'tool_calling'],
        ARRAY['off'],
        'verified',
        'curated',
        true,
        now()
    ),
    (
        'anthropic',
        'claude-haiku-4-5',
        'Claude Haiku 4.5',
        ARRAY['structured_output', 'tool_calling'],
        ARRAY['off'],
        'verified',
        'curated',
        true,
        now()
    ),
    (
        'deepseek',
        'deepseek-v4-pro',
        'DeepSeek V4 Pro',
        ARRAY['reasoning', 'structured_output', 'tool_calling'],
        ARRAY['off', 'high', 'max'],
        'verified',
        'curated',
        true,
        now()
    ),
    (
        'deepseek',
        'deepseek-v4-flash',
        'DeepSeek V4 Flash',
        ARRAY['reasoning', 'structured_output', 'tool_calling'],
        ARRAY['off', 'high', 'max'],
        'verified',
        'curated',
        true,
        now()
    )
ON CONFLICT (provider, model_id) DO NOTHING;

-- Forward rollback:
-- DROP TABLE public.llm_model_catalog_syncs;
-- DROP TABLE public.llm_provider_models;
