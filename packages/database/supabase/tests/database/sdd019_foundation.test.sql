begin;

create extension if not exists pgtap with schema extensions;

set search_path to public, extensions;

select plan(1);

create or replace function pg_temp.sdd019_foundation_failures()
returns text[]
language plpgsql
as $$
declare
  failures text[] := array[]::text[];
  required_feature_keys constant text[] := array[
    'automatic_escritura',
    'canonical_geometry_import',
    'document_capabilities'
  ];
  relation_name text;
  function_pattern text;
  role_name text;
  expected_column text;
  definition text;
begin
  -- The foundation owns these durable records. Keeping the checks in one
  -- function makes the RED phase emit one functional failure instead of a
  -- misleading cascade of missing-table/setup errors.
  foreach relation_name in array array[
    'idempotency_operations',
    'production_readiness_findings',
    'feature_rollout_controls',
    'feature_rollout_projects',
    'runtime_release_attestations'
  ] loop
    if to_regclass(format('public.%I', relation_name)) is null then
      failures := array_append(failures, 'missing relation public.' || relation_name);
    end if;
  end loop;

  -- Every canonical owner must start from restrictive defaults. Explicit
  -- per-object grants are tested separately by later security-boundary suites.
  if exists (
    select 1
    from pg_default_acl defaults
    join pg_roles owner on owner.oid = defaults.defaclrole
    cross join lateral aclexplode(coalesce(defaults.defaclacl, acldefault(defaults.defaclobjtype, defaults.defaclrole))) grants
    join pg_roles grantee on grantee.oid = grants.grantee
    where defaults.defaclnamespace in (
      0,
      coalesce(to_regnamespace('public'), 0),
      coalesce(to_regnamespace('private'), 0)
    )
      and owner.rolname = 'postgres'
      and grantee.rolname in ('anon', 'authenticated', 'service_role')
  ) then
    failures := array_append(failures, 'default ACL grants runtime roles future-object privileges');
  end if;

  -- Probe future tables/functions/sequences transactionally as the migration
  -- owner. A restrictive default must not leak privileges to runtime roles.
  begin
    execute 'create table public.sdd019_acl_table_probe(id bigint)';
    execute 'create sequence public.sdd019_acl_sequence_probe';
    execute 'create function public.sdd019_acl_function_probe() returns integer language sql as ''select 1''';
    foreach role_name in array array['anon', 'authenticated', 'service_role'] loop
      if has_table_privilege(role_name, 'public.sdd019_acl_table_probe', 'select,insert,update,delete') then
        failures := array_append(failures, 'future table ACL probe leaked to ' || role_name);
      end if;
      if has_sequence_privilege(role_name, 'public.sdd019_acl_sequence_probe', 'usage,select,update') then
        failures := array_append(failures, 'future sequence ACL probe leaked to ' || role_name);
      end if;
      if has_function_privilege(role_name, 'public.sdd019_acl_function_probe()', 'execute') then
        failures := array_append(failures, 'future function ACL probe leaked to ' || role_name);
      end if;
    end loop;
    execute 'drop function public.sdd019_acl_function_probe()';
    execute 'drop sequence public.sdd019_acl_sequence_probe';
    execute 'drop table public.sdd019_acl_table_probe';
  exception when others then
    failures := array_append(
      failures,
      'default ACL transactional probe failed: ' || sqlstate || ' ' || sqlerrm
    );
  end;

  if to_regclass('public.idempotency_operations') is not null then
    foreach expected_column in array array[
      'organization_id', 'principal_type', 'principal_subject', 'operation_type',
      'resource_scope', 'idempotency_key', 'request_hash', 'status', 'source_kind',
      'provider_event_key'
    ] loop
      if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'idempotency_operations'
          and column_name = expected_column
      ) then
        failures := array_append(failures, 'idempotency column missing: ' || expected_column);
      end if;
    end loop;

    if not exists (
      select 1 from pg_indexes
      where schemaname = 'public'
        and tablename = 'idempotency_operations'
        and indexdef ilike '%organization_id%principal_type%principal_subject%operation_type%resource_scope%idempotency_key%'
        and indexdef ilike 'create unique index%'
    ) then
      failures := array_append(failures, 'idempotency identity is not unique');
    end if;
    if not exists (
      select 1 from pg_constraint
      where conrelid = 'public.idempotency_operations'::regclass
        and contype = 'c'
        and pg_get_constraintdef(oid) like '%request_hash%64%'
    ) then
      failures := array_append(failures, 'request hash conflict contract is absent');
    end if;
  end if;

  -- The allowlist must be a versioned database object, never an unreviewed free
  -- text operation_type. The implementation may use a table or a function.
  if to_regclass('public.idempotency_operation_types') is null
     and to_regprocedure('public.is_allowed_idempotency_operation(text,text)') is null then
    failures := array_append(failures, 'versioned operation allowlist is absent');
  end if;

  if to_regclass('public.audit_logs') is null
     or not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'audit_logs' and column_name = 'event_key'
     )
     or not exists (
       select 1 from pg_indexes
       where schemaname = 'public' and tablename = 'audit_logs'
         and indexdef ilike 'create unique index%'
         and indexdef ilike '%organization_id%event_key%where%event_key is not null%'
     ) then
    failures := array_append(failures, 'canonical audit-v1 uniqueness is absent');
  end if;

  if to_regclass('public.production_readiness_findings') is not null then
    if not exists (
      select 1 from pg_constraint
      where conrelid = 'public.production_readiness_findings'::regclass
        and contype = 'c'
        and pg_get_constraintdef(oid) like '%blocking%'
        and pg_get_constraintdef(oid) like '%warning%'
    ) then
      failures := array_append(failures, 'readiness severity is not constrained');
    end if;
    if not exists (
      select 1 from pg_constraint
      where conrelid = 'public.production_readiness_findings'::regclass
        and contype = 'c'
        and pg_get_constraintdef(oid) like '%open%'
        and pg_get_constraintdef(oid) like '%resolved%'
    ) then
      failures := array_append(failures, 'blocking finding lifecycle is not constrained');
    end if;
  end if;

  if to_regclass('public.feature_rollout_controls') is not null then
    if not exists (
      select 1 from pg_constraint
      where conrelid = 'public.feature_rollout_controls'::regclass
        and contype = 'c'
        and pg_get_constraintdef(oid) like all (array['%off%', '%projects%', '%on%'])
    ) then
      failures := array_append(failures, 'rollout modes are not exact');
    end if;
    if not exists (
      select 1 from pg_constraint
      where conrelid = 'public.feature_rollout_controls'::regclass
        and contype = 'c'
        and pg_get_constraintdef(oid) like all (
          select '%' || key || '%' from unnest(required_feature_keys) key
        )
    ) then
      failures := array_append(failures, 'rollout feature keys are not exact');
    end if;
  end if;

  foreach function_pattern in array array[
    'resolve_feature_rollout',
    'set_feature_rollout_control',
    'claim_idempotency_operation',
    'complete_idempotency_operation',
    'retire_runtime_slot'
  ] loop
    select pg_get_functiondef(proc.oid)
      into definition
    from pg_proc proc
    join pg_namespace namespace on namespace.oid = proc.pronamespace
    where namespace.nspname in ('public', 'private')
      and proc.proname = function_pattern
    order by proc.oid
    limit 1;

    if definition is null then
      failures := array_append(failures, 'missing function ' || function_pattern);
    elsif function_pattern = 'resolve_feature_rollout'
      and (definition not ilike '%off%' or definition not ilike '%project%') then
      failures := array_append(failures, 'rollout resolver does not fail closed or apply project precedence');
    elsif function_pattern in ('set_feature_rollout_control', 'retire_runtime_slot')
      and (definition not ilike '%version%' or definition not ilike '%audit%') then
      failures := array_append(failures, function_pattern || ' lacks CAS and atomic audit');
    end if;
  end loop;

  if to_regclass('public.runtime_release_attestations') is not null then
    foreach expected_column in array array[
      'environment_fingerprint', 'deployment_id', 'runtime_role', 'slot_id',
      'instance_id', 'release_sha', 'artifact_digest', 'config_version',
      'hard_off_fingerprint', 'lifecycle', 'heartbeat_at', 'retired_at',
      'retired_by_operation_id'
    ] loop
      if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'runtime_release_attestations'
          and column_name = expected_column
      ) then
        failures := array_append(failures, 'runtime attestation column missing: ' || expected_column);
      end if;
    end loop;

    if not exists (
      select 1 from pg_constraint
      where conrelid = 'public.runtime_release_attestations'::regclass
        and contype = 'p'
        and pg_get_constraintdef(oid) ilike all (
          array['%deployment_id%', '%runtime_role%', '%slot_id%', '%instance_id%']
        )
    ) then
      failures := array_append(failures, 'runtime deployment/role/slot/instance identity is not exact');
    end if;
    if not exists (
      select 1 from pg_constraint
      where conrelid = 'public.runtime_release_attestations'::regclass
        and contype = 'c'
        and pg_get_constraintdef(oid) like '%web%'
        and pg_get_constraintdef(oid) like '%api%'
        and pg_get_constraintdef(oid) like '%worker%'
    ) then
      failures := array_append(failures, 'runtime role roster is not exact');
    end if;
    if exists (
      select 1
      from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name = 'runtime_release_attestations'
        and grantee in ('anon', 'authenticated')
    ) then
      failures := array_append(failures, 'runtime attestations are client-readable');
    end if;
  end if;

  return failures;
end;
$$;

with assertion as materialized (
  select ok(
    cardinality(pg_temp.sdd019_foundation_failures()) = 0,
    'SDD019_FOUNDATION_NOT_IMPLEMENTED: ' ||
      coalesce(array_to_string(pg_temp.sdd019_foundation_failures(), '; '), 'unknown')
  ) as tap_result
), completed as materialized (
  select * from finish()
)
select assertion.tap_result, completed.finish
from assertion
cross join completed;

rollback;
