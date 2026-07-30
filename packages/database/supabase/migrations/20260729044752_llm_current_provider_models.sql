-- Refresh Plotify's credential-independent curated catalog from the current
-- provider documentation. Provider /models synchronization still remains the
-- availability authority when a credential has been configured.

UPDATE public.llm_provider_models
SET
    is_available = false,
    updated_at = now()
WHERE provider = 'openai'
  AND model_id = 'gpt-5.6';

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
VALUES
    (
        'openai',
        'gpt-5.6-sol',
        'GPT-5.6 Sol',
        ARRAY['pdf_input', 'reasoning', 'structured_output', 'tool_calling'],
        ARRAY['off', 'low', 'medium', 'high', 'xhigh'],
        'verified',
        'curated',
        true,
        now(),
        now(),
        now()
    ),
    (
        'openai',
        'gpt-5.6-terra',
        'GPT-5.6 Terra',
        ARRAY['pdf_input', 'reasoning', 'structured_output', 'tool_calling'],
        ARRAY['off', 'low', 'medium', 'high', 'xhigh'],
        'verified',
        'curated',
        true,
        now(),
        now(),
        now()
    ),
    (
        'openai',
        'gpt-5.6-luna',
        'GPT-5.6 Luna',
        ARRAY['pdf_input', 'reasoning', 'structured_output', 'tool_calling'],
        ARRAY['off', 'low', 'medium', 'high', 'xhigh'],
        'verified',
        'curated',
        true,
        now(),
        now(),
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
        now(),
        now(),
        now()
    ),
    (
        'anthropic',
        'claude-fable-5',
        'Claude Fable 5',
        ARRAY['structured_output', 'tool_calling'],
        ARRAY['off'],
        'verified',
        'curated',
        true,
        now(),
        now(),
        now()
    ),
    (
        'anthropic',
        'claude-mythos-5',
        'Claude Mythos 5',
        ARRAY['structured_output', 'tool_calling'],
        ARRAY['off'],
        'verified',
        'curated',
        true,
        now(),
        now(),
        now()
    ),
    (
        'anthropic',
        'claude-opus-4-8',
        'Claude Opus 4.8',
        ARRAY['structured_output', 'tool_calling'],
        ARRAY['off'],
        'verified',
        'curated',
        true,
        now(),
        now(),
        now()
    ),
    (
        'anthropic',
        'claude-opus-4-7',
        'Claude Opus 4.7',
        ARRAY['structured_output', 'tool_calling'],
        ARRAY['off'],
        'verified',
        'curated',
        true,
        now(),
        now(),
        now()
    ),
    (
        'anthropic',
        'claude-mythos-preview',
        'Claude Mythos Preview',
        ARRAY['structured_output', 'tool_calling'],
        ARRAY['off'],
        'verified',
        'curated',
        true,
        now(),
        now(),
        now()
    ),
    (
        'anthropic',
        'claude-opus-4-6',
        'Claude Opus 4.6',
        ARRAY['structured_output', 'tool_calling'],
        ARRAY['off'],
        'verified',
        'curated',
        true,
        now(),
        now(),
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
        now(),
        now(),
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
        now(),
        now(),
        now()
    ),
    (
        'anthropic',
        'claude-opus-4-5',
        'Claude Opus 4.5',
        ARRAY['structured_output', 'tool_calling'],
        ARRAY['off'],
        'verified',
        'curated',
        true,
        now(),
        now(),
        now()
    ),
    (
        'anthropic',
        'claude-sonnet-4-5',
        'Claude Sonnet 4.5',
        ARRAY['structured_output', 'tool_calling'],
        ARRAY['off'],
        'verified',
        'curated',
        true,
        now(),
        now(),
        now()
    ),
    (
        'anthropic',
        'claude-opus-4-1',
        'Claude Opus 4.1',
        ARRAY['structured_output', 'tool_calling'],
        ARRAY['off'],
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
