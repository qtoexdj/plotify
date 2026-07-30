-- LLM control plane: provider credentials encrypted by the existing
-- Vault-backed encrypt_credential/decrypt_credential RPCs plus versioned
-- per-task assignments. These tables are service-only and are never exposed
-- to anon/authenticated clients.

CREATE TABLE public.llm_provider_credentials (
    provider text PRIMARY KEY
        CHECK (provider IN ('openai', 'anthropic', 'deepseek')),
    api_key_encrypted text NOT NULL,
    key_hint text NOT NULL CHECK (char_length(key_hint) BETWEEN 6 AND 32),
    status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'revoked', 'error')),
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    last_tested_at timestamptz,
    last_error_code text,
    updated_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.llm_provider_credentials IS
    'Service-only provider credentials. api_key_encrypted is ciphertext produced by encrypt_credential; never project it to public DTOs.';

CREATE TABLE public.llm_task_configs (
    task text PRIMARY KEY
        CHECK (task IN ('conversation', 'title_analysis', 'pdf_vision', 'prompt_sandbox')),
    provider text NOT NULL
        REFERENCES public.llm_provider_credentials(provider)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    model text NOT NULL CHECK (char_length(model) BETWEEN 1 AND 160),
    reasoning_effort text NOT NULL DEFAULT 'off'
        CHECK (reasoning_effort IN ('off', 'minimal', 'low', 'medium', 'high', 'xhigh')),
    enabled boolean NOT NULL DEFAULT true,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    updated_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.llm_task_configs IS
    'Versioned global assignment of an approved provider/model to each Plotify LLM task.';

CREATE TABLE public.llm_configuration_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id uuid,
    action text NOT NULL
        CHECK (action IN ('credential_saved', 'credential_revoked', 'task_configured')),
    provider text CHECK (provider IS NULL OR provider IN ('openai', 'anthropic', 'deepseek')),
    task text CHECK (
        task IS NULL OR task IN ('conversation', 'title_analysis', 'pdf_vision', 'prompt_sandbox')
    ),
    config_version integer CHECK (config_version IS NULL OR config_version > 0),
    outcome text NOT NULL DEFAULT 'success'
        CHECK (outcome IN ('success', 'rejected', 'error')),
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (provider IS NOT NULL OR task IS NOT NULL)
);

COMMENT ON TABLE public.llm_configuration_events IS
    'Append-only redacted audit events for LLM configuration. Never stores keys, prompts or model output.';

CREATE INDEX llm_configuration_events_created_at_idx
    ON public.llm_configuration_events (created_at DESC);

ALTER TABLE public.llm_provider_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.llm_task_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.llm_configuration_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.llm_provider_credentials FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.llm_task_configs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.llm_configuration_events FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.llm_provider_credentials TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.llm_task_configs TO service_role;
GRANT SELECT, INSERT
    ON TABLE public.llm_configuration_events TO service_role;

-- Forward rollback:
-- DROP TABLE public.llm_configuration_events;
-- DROP TABLE public.llm_task_configs;
-- DROP TABLE public.llm_provider_credentials;
