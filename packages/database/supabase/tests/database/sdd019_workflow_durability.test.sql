begin;

create extension if not exists pgtap with schema extensions;

set search_path to public, extensions;

select plan(1);

create or replace function pg_temp.sdd019_workflow_durability_failures()
returns text[]
language plpgsql
as $$
declare
  failures text[] := array[]::text[];
  relation_name text;
  expected_column text;
  approve_sale_definition text;
  claim_definition text;
  signature_definition text;
  signed_stage_guard_definition text;
  constraint_definitions text;
begin
  -- T071 is intentionally RED until the additive workflow migration exists.
  -- Aggregate catalog and behavioral-contract failures so the suite reports a
  -- functional marker instead of aborting on the first missing relation.
  foreach relation_name in array array[
    'workflow_outbox',
    'escritura_signature_events'
  ] loop
    if to_regclass(format('public.%I', relation_name)) is null then
      failures := array_append(failures, 'missing relation public.' || relation_name);
    end if;
  end loop;

  if to_regclass('public.workflow_outbox') is not null then
    foreach expected_column in array array[
      'id', 'organization_id', 'aggregate_type', 'aggregate_id', 'event_type',
      'event_fingerprint', 'operation_id', 'payload', 'status', 'attempt_count',
      'max_attempts', 'available_at', 'lease_owner', 'lease_expires_at',
      'heartbeat_at', 'deferred_reason', 'deferred_control_fingerprint',
      'last_error_code', 'last_error_class', 'created_at', 'updated_at',
      'completed_at'
    ] loop
      if not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'workflow_outbox'
          and column_name = expected_column
      ) then
        failures := array_append(failures, 'workflow_outbox column missing: ' || expected_column);
      end if;
    end loop;

    if not exists (
      select 1
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'workflow_outbox'
        and indexdef ilike 'create unique index%'
        and indexdef ilike '%event_fingerprint%'
    ) then
      failures := array_append(failures, 'outbox-v1 event fingerprint is not unique');
    end if;

    if not exists (
      select 1
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'workflow_outbox'
        and indexdef ilike '%status%available_at%'
    ) then
      failures := array_append(failures, 'due outbox eligibility index is absent');
    end if;

    if not exists (
      select 1
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'workflow_outbox'
        and indexdef ilike '%lease_expires_at%'
        and indexdef ilike '%processing%'
    ) then
      failures := array_append(failures, 'expired workflow lease index is absent');
    end if;

    select string_agg(pg_get_constraintdef(constraint_row.oid), E'\n')
      into constraint_definitions
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.workflow_outbox'::regclass;

    if constraint_definitions is null
       or constraint_definitions not ilike all (array[
         '%pending%', '%deferred_feature_off%', '%processing%',
         '%retry_scheduled%', '%completed%', '%dead_letter%', '%cancelled%'
       ]) then
      failures := array_append(failures, 'workflow outbox states are incomplete');
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'workflow_outbox'
        and column_name = 'attempt_count'
        and column_default in ('0', '0::integer')
    ) or not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'workflow_outbox'
        and column_name = 'max_attempts'
        and column_default in ('8', '8::integer')
    ) then
      failures := array_append(failures, 'workflow attempts do not default to 0 of 8');
    end if;

    if exists (
      select 1
      from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name = 'workflow_outbox'
        and grantee in ('PUBLIC', 'anon', 'authenticated')
    ) then
      failures := array_append(failures, 'workflow outbox is directly granted to client roles');
    end if;
  end if;

  -- Sale, canonical audit-v1 and outbox-v1 must be one database transaction.
  select string_agg(pg_get_functiondef(proc.oid), E'\n')
    into approve_sale_definition
  from pg_proc proc
  join pg_namespace namespace on namespace.oid = proc.pronamespace
  where namespace.nspname = 'public'
    and proc.proname = 'approve_sale';

  if approve_sale_definition is null then
    failures := array_append(failures, 'approve_sale function is missing');
  else
    if approve_sale_definition not ilike '%workflow_outbox%'
       or approve_sale_definition not ilike '%outbox-v1%'
       or approve_sale_definition not ilike '%audit_logs%'
       or approve_sale_definition not ilike '%audit-v1%' then
      failures := array_append(failures, 'sale, audit-v1 and outbox-v1 are not committed atomically');
    end if;
    if approve_sale_definition not ilike '%approved_transition_version%' then
      failures := array_append(failures, 'sale replay does not bind an approved transition version');
    end if;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'approval_requests'
      and column_name = 'approved_transition_version'
  ) then
    failures := array_append(failures, 'approval transition version is not persisted');
  end if;

  -- Claim is service-only, lease-based and concurrency-safe.
  select string_agg(pg_get_functiondef(proc.oid), E'\n')
    into claim_definition
  from pg_proc proc
  join pg_namespace namespace on namespace.oid = proc.pronamespace
  where namespace.nspname in ('public', 'private')
    and proc.proname in (
      'claim_workflow_outbox',
      'heartbeat_workflow_outbox',
      'release_workflow_outbox_for_feature_off'
    );

  if claim_definition is null
     or claim_definition not ilike '%for update skip locked%'
     or claim_definition not ilike '%lease_expires_at%'
     or claim_definition not ilike '%heartbeat_at%' then
    failures := array_append(failures, 'workflow claim lacks SKIP LOCKED lease and heartbeat');
  end if;

  if exists (
    select 1
    from information_schema.role_routine_grants
    where routine_schema in ('public', 'private')
      and routine_name in (
        'claim_workflow_outbox',
        'heartbeat_workflow_outbox',
        'release_workflow_outbox_for_feature_off'
      )
      and grantee in ('PUBLIC', 'anon', 'authenticated')
  ) then
    failures := array_append(failures, 'workflow lease RPCs are executable by client roles');
  end if;

  -- Automatic generations bind the complete minuta-generation-v2 envelope;
  -- manual generations require an operation identity and a human reason.
  foreach expected_column in array array[
    'generation_fingerprint', 'generation_mode', 'operation_id',
    'regeneration_reason', 'template_version', 'renderer_version',
    'ruleset_version', 'schema_version', 'normalization_version', 'approval_id',
    'provenance_manifest_hash', 'review_policy_fingerprint'
  ] loop
    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'escritura_minuta_generations'
        and column_name = expected_column
    ) then
      failures := array_append(failures, 'generation fingerprint column missing: ' || expected_column);
    end if;
  end loop;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'escritura_minuta_generations'
      and indexdef ilike 'create unique index%'
      and indexdef ilike '%generation_fingerprint%'
      and indexdef ilike '%automatic%'
  ) then
    failures := array_append(failures, 'automatic full generation fingerprint is not unique');
  end if;

  select string_agg(pg_get_constraintdef(constraint_row.oid), E'\n')
    into constraint_definitions
  from pg_constraint constraint_row
  where constraint_row.conrelid = to_regclass('public.escritura_minuta_generations');

  if constraint_definitions is null
     or constraint_definitions not ilike '%generation_mode%manual%regeneration_reason%'
     or constraint_definitions not ilike '%generation_mode%manual%operation_id%' then
    failures := array_append(failures, 'manual generation operation and reason are not mandatory');
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'escritura_minuta_generations'
      and indexdef ilike 'create unique index%'
      and indexdef ilike '%operation_id%'
      and indexdef ilike '%manual%'
  ) then
    failures := array_append(failures, 'manual generation operation identity is not unique');
  end if;

  -- Delivery obligation and access capability remain separate state axes.
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'escritura_deliveries'
      and indexdef ilike 'create unique index%'
      and indexdef ilike '%generation_id%recipient_user_id%channel%'
  ) then
    failures := array_append(failures, 'delivery obligation identity is not unique');
  end if;

  select string_agg(pg_get_constraintdef(constraint_row.oid), E'\n')
    into constraint_definitions
  from pg_constraint constraint_row
  where constraint_row.conrelid = to_regclass('public.escritura_deliveries');

  if constraint_definitions is null
     or constraint_definitions not ilike all (array[
       '%pending%', '%available%', '%retry_scheduled%', '%failed%',
       '%unavailable%', '%cancelled%'
     ]) then
    failures := array_append(failures, 'delivery lifecycle is not independently constrained');
  end if;

  if to_regclass('public.escritura_delivery_capabilities') is null then
    failures := array_append(failures, 'delivery capability issuance history is missing');
  else
    if not exists (
      select 1
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'escritura_delivery_capabilities'
        and indexdef ilike 'create unique index%'
        and indexdef ilike '%delivery_id%'
        and indexdef ilike '%active%'
    ) then
      failures := array_append(failures, 'delivery has more than one active capability');
    end if;

    select string_agg(pg_get_constraintdef(constraint_row.oid), E'\n')
      into constraint_definitions
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.escritura_delivery_capabilities'::regclass;

    if constraint_definitions is null
       or constraint_definitions not ilike all (array[
         '%active%', '%expired%', '%revoked%', '%rotated%'
       ]) then
      failures := array_append(failures, 'capability lifecycle is not independently constrained');
    end if;
  end if;

  if to_regclass('public.escritura_signature_events') is not null then
    foreach expected_column in array array[
      'id', 'organization_id', 'project_id', 'lot_id', 'escritura_case_id',
      'generation_id', 'signed_at', 'evidence_file_id', 'evidence_sha256',
      'recorded_by', 'operation_id', 'request_hash', 'created_at'
    ] loop
      if not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'escritura_signature_events'
          and column_name = expected_column
      ) then
        failures := array_append(failures, 'signature event column missing: ' || expected_column);
      end if;
    end loop;

    foreach expected_column in array array[
      'evidence_file_id', 'operation_id'
    ] loop
      if not exists (
        select 1
        from pg_indexes
        where schemaname = 'public'
          and tablename = 'escritura_signature_events'
          and indexdef ilike 'create unique index%'
          and indexdef ilike '%' || expected_column || '%'
      ) then
        failures := array_append(failures, 'signature event is not unique by ' || expected_column);
      end if;
    end loop;

    if not exists (
      select 1
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'escritura_signature_events'
        and indexdef ilike 'create unique index%'
        and indexdef ilike '%escritura_case_id%generation_id%'
    ) then
      failures := array_append(failures, 'case and ready generation can receive multiple signature events');
    end if;

    if exists (
      select 1
      from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name = 'escritura_signature_events'
        and grantee in ('PUBLIC', 'anon', 'authenticated')
        and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
    ) then
      failures := array_append(failures, 'signature events are directly mutable by client roles');
    end if;
  end if;

  -- The RPC proves exact evidence scope, ready generation, one-time evidence,
  -- non-future time, request idempotency and atomic event+stage+audit.
  select string_agg(pg_get_functiondef(proc.oid), E'\n')
    into signature_definition
  from pg_proc proc
  join pg_namespace namespace on namespace.oid = proc.pronamespace
  where namespace.nspname in ('public', 'private')
    and proc.proname = 'record_escritura_signature';

  if signature_definition is null then
    failures := array_append(failures, 'record_escritura_signature RPC is missing');
  else
    if signature_definition not ilike '%project_file_objects%'
       or signature_definition not ilike '%bound_escritura_case_id%'
       or signature_definition not ilike '%bound_generation_id%'
       or signature_definition not ilike '%escritura_signature_evidence%' then
      failures := array_append(failures, 'signature evidence is not bound to the exact case and generation');
    end if;
    if signature_definition not ilike '%readiness_status%ready%'
       or signature_definition not ilike '%semantic%pass%' then
      failures := array_append(failures, 'signature generation readiness is not enforced');
    end if;
    if signature_definition not ilike '%signed_at%now%'
       or signature_definition not ilike '%SIGNATURE_SCOPE_MISMATCH%'
       or signature_definition not ilike '%SIGNATURE_EVIDENCE_ALREADY_USED%' then
      failures := array_append(failures, 'signature time, scope or one-event consumption is not enforced');
    end if;
    if signature_definition not ilike '%operation_id%request_hash%'
       or signature_definition not ilike '%idempotency_operations%' then
      failures := array_append(failures, 'signature operation is not idempotent');
    end if;
    if signature_definition not ilike '%insert%escritura_signature_events%'
       or signature_definition not ilike '%update%lot_records%escritura_firmada%'
       or signature_definition not ilike '%insert%audit_logs%audit-v1%' then
      failures := array_append(failures, 'signature event, stage and audit are not atomic');
    end if;
  end if;

  select string_agg(pg_get_functiondef(proc.oid), E'\n')
    into signed_stage_guard_definition
  from pg_trigger trigger_row
  join pg_proc proc on proc.oid = trigger_row.tgfoid
  join pg_class relation_row on relation_row.oid = trigger_row.tgrelid
  join pg_namespace namespace on namespace.oid = relation_row.relnamespace
  where namespace.nspname = 'public'
    and relation_row.relname = 'lot_records'
    and not trigger_row.tgisinternal;

  if signed_stage_guard_definition is null
     or signed_stage_guard_definition not ilike '%escritura_firmada%'
     or signed_stage_guard_definition not ilike '%escritura_signature_events%' then
    failures := array_append(failures, 'signed stage is not guarded by a signature event');
  end if;

  if exists (
    select 1
    from information_schema.role_routine_grants
    where routine_schema in ('public', 'private')
      and routine_name = 'record_escritura_signature'
      and grantee in ('PUBLIC', 'anon', 'authenticated')
  ) then
    failures := array_append(failures, 'signature RPC is directly executable by client roles');
  end if;

  return failures;
end;
$$;

with assertion as materialized (
  select ok(
    cardinality(pg_temp.sdd019_workflow_durability_failures()) = 0,
    'SIGNATURE_SCOPE_MISMATCH: ' ||
      coalesce(
        array_to_string(pg_temp.sdd019_workflow_durability_failures(), '; '),
        'workflow durability contract is incomplete'
      )
  ) as tap_result
), completed as materialized (
  select * from finish()
)
select assertion.tap_result, completed.finish
from assertion
cross join completed;

rollback;
