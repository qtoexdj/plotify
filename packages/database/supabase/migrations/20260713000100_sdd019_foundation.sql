-- SDD019 production-hardening foundation.
--
-- Rollback policy: this migration is intentionally forward-fix only after any
-- operation row exists. A pre-use rollback may drop the five new relation
-- families and their routines in reverse dependency order. In production,
-- disable all controls first, retire runtime slots, retain audit/idempotency
-- history, and ship a new canonical migration instead of destructive rollback.

-- New objects must never inherit the permissive defaults from the historical
-- baseline. Runtime roles receive only explicit grants below.
alter default privileges for role postgres in schema public revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on functions from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on sequences from public, anon, authenticated, service_role;

create table public.idempotency_operation_types (
  operation_type text primary key,
  contract_version text not null default 'sdd019-foundation-v1',
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.idempotency_operation_types (operation_type) values
  ('project.create'), ('project.update'),
  ('file.upload'), ('file.replace'), ('file.delete'),
  ('geometry.import'), ('geometry.assign'), ('geometry.unassign'),
  ('geometry.derive'), ('geometry.replace'), ('geometry.recalculate'),
  ('capability.renew'), ('capability.revoke'), ('sale.approve'),
  ('recipient.reassign'), ('seller_fact.resolve'),
  ('legal_approval.grant'), ('legal_approval.revoke'),
  ('matriz_approval.begin'), ('matriz_approval.finalize'),
  ('minuta.generate'), ('minuta.regenerate'), ('signature.record'),
  ('rollout_control.set'), ('runtime_slot.retire'),
  ('provider.telegram'), ('provider.meta');

create table public.idempotency_operations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  principal_type text not null check (principal_type in ('user', 'miniapp', 'service')),
  principal_subject text not null check (length(principal_subject) between 1 and 256),
  operation_type text not null references public.idempotency_operation_types(operation_type),
  resource_scope text not null check (length(resource_scope) between 1 and 512),
  idempotency_key text not null check (length(idempotency_key) between 1 and 128),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  canonicalization_version text not null default 'jcs-rfc8785-v1' check (canonicalization_version = 'jcs-rfc8785-v1'),
  status text not null default 'processing' check (status in ('processing', 'succeeded', 'failed')),
  resource_type text,
  resource_id uuid,
  response_summary jsonb not null default '{}'::jsonb,
  error_code text,
  source_kind text not null check (source_kind in ('web', 'miniapp', 'telegram', 'meta', 'service')),
  provider_event_key text check (provider_event_key is null or provider_event_key ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (organization_id, principal_type, principal_subject, operation_type, resource_scope, idempotency_key),
  check ((status = 'processing' and completed_at is null) or status <> 'processing')
);

create unique index idempotency_operations_provider_event_uidx
  on public.idempotency_operations (organization_id, source_kind, provider_event_key)
  where provider_event_key is not null;
create index idempotency_operations_status_updated_idx
  on public.idempotency_operations (status, updated_at);

alter table public.audit_logs add column if not exists operation_id uuid references public.idempotency_operations(id);
alter table public.audit_logs add column if not exists event_key text;
alter table public.audit_logs add column if not exists result text not null default 'succeeded';
alter table public.audit_logs add column if not exists reason_code text;
alter table public.audit_logs add column if not exists actor_user_id uuid references auth.users(id);
alter table public.audit_logs drop constraint if exists audit_logs_result_check;
alter table public.audit_logs add constraint audit_logs_result_check
  check (result in ('succeeded', 'denied', 'failed'));
create unique index if not exists audit_logs_organization_event_uidx
  on public.audit_logs (organization_id, event_key) where event_key is not null;

create table public.denied_operation_attempts (
  attempt_id uuid primary key,
  organization_id uuid references public.organizations(id),
  principal_type text not null,
  principal_subject_hash text not null check (principal_subject_hash ~ '^[0-9a-f]{64}$'),
  operation_type text not null,
  resource_scope_hash text not null check (resource_scope_hash ~ '^[0-9a-f]{64}$'),
  reason_code text not null,
  occurred_at timestamptz not null default now(),
  reconciled_at timestamptz,
  audit_log_id uuid references public.audit_logs(id)
);

create table public.production_readiness_findings (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  organization_id uuid references public.organizations(id),
  kind text not null,
  severity text not null check (severity in ('blocking', 'warning')),
  resource_type text,
  resource_id uuid,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'resolved', 'false_positive')),
  owner text,
  impact text,
  budget text,
  resolution text,
  review_due_at timestamptz,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  updated_at timestamptz not null default now(),
  check (status = 'open' or (resolution is not null and resolved_at is not null)),
  check (not (severity = 'blocking' and status = 'false_positive'))
);
create index production_readiness_open_idx
  on public.production_readiness_findings (severity, detected_at) where status = 'open';

create table public.feature_rollout_controls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  feature_key text not null check (feature_key in ('automatic_escritura', 'canonical_geometry_import', 'document_capabilities')),
  mode text not null default 'off' check (mode in ('off', 'projects', 'on')),
  version bigint not null default 1 check (version > 0),
  operation_id uuid not null references public.idempotency_operations(id),
  updated_by text not null,
  reason text not null check (length(reason) between 1 and 1000),
  last_audit_id uuid not null references public.audit_logs(id) deferrable initially deferred,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, feature_key)
);

create table public.feature_rollout_projects (
  control_id uuid not null references public.feature_rollout_controls(id) on delete cascade,
  project_id uuid not null references public.projects(id),
  created_at timestamptz not null default now(),
  primary key (control_id, project_id)
);

create table public.runtime_release_attestations (
  environment_fingerprint text not null,
  deployment_id text not null,
  runtime_role text not null check (runtime_role in ('web', 'api', 'worker')),
  slot_id text not null,
  instance_id text not null,
  release_sha text not null check (release_sha ~ '^[0-9a-f]{40}$'),
  artifact_digest text not null check (artifact_digest ~ '^sha256:[0-9a-f]{64}$'),
  config_version text not null,
  hard_off_automatic_escritura boolean not null,
  hard_off_canonical_geometry_import boolean not null,
  hard_off_document_capabilities boolean not null,
  hard_off_fingerprint text not null check (hard_off_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  lifecycle text not null default 'active' check (lifecycle in ('active', 'retired')),
  heartbeat_at timestamptz not null default now(),
  retired_at timestamptz,
  retired_by_operation_id uuid references public.idempotency_operations(id),
  metadata jsonb not null default '{}'::jsonb,
  primary key (deployment_id, runtime_role, slot_id, instance_id),
  check ((lifecycle = 'active' and retired_at is null and retired_by_operation_id is null)
      or (lifecycle = 'retired' and retired_at is not null and retired_by_operation_id is not null))
);
create index runtime_release_attestations_environment_idx
  on public.runtime_release_attestations (environment_fingerprint, heartbeat_at desc);

create or replace function public.assert_feature_rollout_project_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  control_organization_id uuid;
  project_organization_id uuid;
begin
  select organization_id into control_organization_id
  from public.feature_rollout_controls where id = new.control_id;
  select organization_id into project_organization_id
  from public.projects where id = new.project_id;
  if control_organization_id is null or project_organization_id is null
     or control_organization_id <> project_organization_id then
    raise exception using errcode = '23514', message = 'ROLLOUT_PROJECT_TENANT_MISMATCH';
  end if;
  return new;
end;
$$;
create trigger feature_rollout_projects_scope_trigger
before insert or update on public.feature_rollout_projects
for each row execute function public.assert_feature_rollout_project_scope();

create or replace function public.claim_idempotency_operation(
  p_organization_id uuid,
  p_principal_type text,
  p_principal_subject text,
  p_operation_type text,
  p_resource_scope text,
  p_idempotency_key text,
  p_request_hash text,
  p_source_kind text,
  p_provider_event_key text default null
)
returns public.idempotency_operations
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed public.idempotency_operations;
begin
  insert into public.idempotency_operations (
    organization_id, principal_type, principal_subject, operation_type,
    resource_scope, idempotency_key, request_hash, source_kind, provider_event_key
  ) values (
    p_organization_id, p_principal_type, p_principal_subject, p_operation_type,
    p_resource_scope, p_idempotency_key, p_request_hash, p_source_kind, p_provider_event_key
  )
  on conflict (organization_id, principal_type, principal_subject, operation_type, resource_scope, idempotency_key)
  do update set updated_at = public.idempotency_operations.updated_at
  returning * into claimed;

  if claimed.request_hash <> p_request_hash then
    raise exception using errcode = '23505', message = 'IDEMPOTENCY_CONFLICT';
  end if;
  return claimed;
end;
$$;

create or replace function public.complete_idempotency_operation(
  p_operation_id uuid,
  p_request_hash text,
  p_status text,
  p_resource_type text default null,
  p_resource_id uuid default null,
  p_response_summary jsonb default '{}'::jsonb,
  p_error_code text default null
)
returns public.idempotency_operations
language plpgsql
security definer
set search_path = ''
as $$
declare
  completed public.idempotency_operations;
begin
  if p_status not in ('succeeded', 'failed') then
    raise exception using errcode = '22023', message = 'INVALID_OPERATION_STATUS';
  end if;
  update public.idempotency_operations
  set status = p_status,
      resource_type = p_resource_type,
      resource_id = p_resource_id,
      response_summary = coalesce(p_response_summary, '{}'::jsonb),
      error_code = p_error_code,
      updated_at = now(),
      completed_at = now()
  where id = p_operation_id and request_hash = p_request_hash
  returning * into completed;
  if completed.id is null then
    raise exception using errcode = 'P0002', message = 'OPERATION_NOT_FOUND_OR_HASH_MISMATCH';
  end if;
  return completed;
end;
$$;

create or replace function public.resolve_feature_rollout(
  p_feature_key text,
  p_organization_id uuid,
  p_project_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  control_row public.feature_rollout_controls;
begin
  if p_feature_key not in ('automatic_escritura', 'canonical_geometry_import', 'document_capabilities') then
    return false;
  end if;
  select * into control_row from public.feature_rollout_controls
  where organization_id = p_organization_id and feature_key = p_feature_key;
  if not found or control_row.mode = 'off' then return false; end if;
  if control_row.mode = 'on' then return true; end if;
  if p_project_id is null then return false; end if;
  return exists (
    select 1 from public.feature_rollout_projects scope
    join public.projects project on project.id = scope.project_id
    where scope.control_id = control_row.id
      and scope.project_id = p_project_id
      and project.organization_id = p_organization_id
  );
exception when others then
  return false;
end;
$$;

create or replace function public.set_feature_rollout_control(
  p_organization_id uuid,
  p_feature_key text,
  p_mode text,
  p_project_ids uuid[],
  p_expected_version bigint,
  p_operation_id uuid,
  p_actor text,
  p_reason text
)
returns public.feature_rollout_controls
language plpgsql
security definer
set search_path = ''
as $$
declare
  control_row public.feature_rollout_controls;
  audit_id uuid := gen_random_uuid();
  next_version bigint;
  project_id uuid;
begin
  if p_feature_key not in ('automatic_escritura', 'canonical_geometry_import', 'document_capabilities')
     or p_mode not in ('off', 'projects', 'on') or nullif(trim(p_reason), '') is null then
    raise exception using errcode = '22023', message = 'INVALID_ROLLOUT_CONTROL';
  end if;
  select * into control_row from public.feature_rollout_controls
  where organization_id = p_organization_id and feature_key = p_feature_key for update;
  if found and control_row.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'ROLLOUT_VERSION_CONFLICT';
  end if;
  if not found and p_expected_version <> 0 then
    raise exception using errcode = '40001', message = 'ROLLOUT_VERSION_CONFLICT';
  end if;
  next_version := case when found then control_row.version + 1 else 1 end;
  insert into public.audit_logs (
    id, actor, action, entity, entity_id, payload, organization_id,
    operation_id, event_key, result, reason_code
  ) values (
    audit_id, p_actor, 'rollout_control.set', 'feature_rollout_control', p_feature_key,
    jsonb_build_object('mode', p_mode, 'version', next_version), p_organization_id,
    p_operation_id,
    encode(extensions.digest(concat_ws('|', 'audit-v1', p_organization_id, 'feature_rollout_control', p_feature_key, 'set', next_version, p_operation_id), 'sha256'), 'hex'),
    'succeeded', null
  );
  insert into public.feature_rollout_controls (
    organization_id, feature_key, mode, version, operation_id, updated_by, reason, last_audit_id
  ) values (
    p_organization_id, p_feature_key, p_mode, next_version, p_operation_id, p_actor, p_reason, audit_id
  ) on conflict (organization_id, feature_key) do update
    set mode = excluded.mode, version = excluded.version, operation_id = excluded.operation_id,
        updated_by = excluded.updated_by, reason = excluded.reason,
        last_audit_id = excluded.last_audit_id, updated_at = now()
  returning * into control_row;
  delete from public.feature_rollout_projects where control_id = control_row.id;
  if p_mode = 'projects' then
    foreach project_id in array coalesce(p_project_ids, '{}'::uuid[]) loop
      insert into public.feature_rollout_projects(control_id, project_id)
      values (control_row.id, project_id);
    end loop;
  end if;
  return control_row;
end;
$$;

create or replace function public.retire_runtime_slot(
  p_deployment_id text,
  p_runtime_role text,
  p_slot_id text,
  p_instance_id text,
  p_expected_heartbeat_at timestamptz,
  p_operation_id uuid,
  p_actor text,
  p_reason text
)
returns public.runtime_release_attestations
language plpgsql
security definer
set search_path = ''
as $$
declare
  retired public.runtime_release_attestations;
  audit_id uuid := gen_random_uuid();
begin
  update public.runtime_release_attestations
  set lifecycle = 'retired', retired_at = now(), retired_by_operation_id = p_operation_id
  where deployment_id = p_deployment_id and runtime_role = p_runtime_role
    and slot_id = p_slot_id and instance_id = p_instance_id
    and lifecycle = 'active' and heartbeat_at = p_expected_heartbeat_at
  returning * into retired;
  if retired.deployment_id is null then
    raise exception using errcode = '40001', message = 'RUNTIME_SLOT_VERSION_CONFLICT';
  end if;
  insert into public.audit_logs (
    id, actor, action, entity, entity_id, payload, organization_id,
    operation_id, event_key, result, reason_code
  ) values (
    audit_id, p_actor, 'runtime_slot.retire', 'runtime_release_attestation',
    concat_ws(':', p_deployment_id, p_runtime_role, p_slot_id, p_instance_id),
    jsonb_build_object('reason', p_reason, 'heartbeatAt', p_expected_heartbeat_at), null,
    p_operation_id,
    encode(extensions.digest(concat_ws('|', 'audit-v1', 'runtime', p_deployment_id, p_runtime_role, p_slot_id, p_instance_id, p_operation_id), 'sha256'), 'hex'),
    'succeeded', null
  );
  return retired;
end;
$$;

alter table public.idempotency_operation_types enable row level security;
alter table public.idempotency_operations enable row level security;
alter table public.denied_operation_attempts enable row level security;
alter table public.production_readiness_findings enable row level security;
alter table public.feature_rollout_controls enable row level security;
alter table public.feature_rollout_projects enable row level security;
alter table public.runtime_release_attestations enable row level security;

revoke all on table public.idempotency_operation_types from public, anon, authenticated, service_role;
revoke all on table public.idempotency_operations from public, anon, authenticated, service_role;
revoke all on table public.denied_operation_attempts from public, anon, authenticated, service_role;
revoke all on table public.production_readiness_findings from public, anon, authenticated, service_role;
revoke all on table public.feature_rollout_controls from public, anon, authenticated, service_role;
revoke all on table public.feature_rollout_projects from public, anon, authenticated, service_role;
revoke all on table public.runtime_release_attestations from public, anon, authenticated, service_role;

grant select on table public.idempotency_operation_types to service_role;
grant select, insert, update on table public.idempotency_operations to service_role;
grant select, insert, update on table public.denied_operation_attempts to service_role;
grant select, insert, update on table public.production_readiness_findings to service_role;
grant select on table public.feature_rollout_controls to service_role;
grant select on table public.feature_rollout_projects to service_role;
grant select, insert, update on table public.runtime_release_attestations to service_role;

revoke all on function public.assert_feature_rollout_project_scope() from public, anon, authenticated, service_role;
revoke all on function public.claim_idempotency_operation(uuid,text,text,text,text,text,text,text,text) from public, anon, authenticated, service_role;
revoke all on function public.complete_idempotency_operation(uuid,text,text,text,uuid,jsonb,text) from public, anon, authenticated, service_role;
revoke all on function public.resolve_feature_rollout(text,uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function public.set_feature_rollout_control(uuid,text,text,uuid[],bigint,uuid,text,text) from public, anon, authenticated, service_role;
revoke all on function public.retire_runtime_slot(text,text,text,text,timestamptz,uuid,text,text) from public, anon, authenticated, service_role;

grant execute on function public.claim_idempotency_operation(uuid,text,text,text,text,text,text,text,text) to service_role;
grant execute on function public.complete_idempotency_operation(uuid,text,text,text,uuid,jsonb,text) to service_role;
grant execute on function public.resolve_feature_rollout(text,uuid,uuid) to service_role;
grant execute on function public.set_feature_rollout_control(uuid,text,text,uuid[],bigint,uuid,text,text) to service_role;
grant execute on function public.retire_runtime_slot(text,text,text,text,timestamptz,uuid,text,text) to service_role;

comment on table public.idempotency_operations is 'SDD019 durable operation identity; canonicalization jcs-rfc8785-v1.';
comment on table public.runtime_release_attestations is 'Service-only deployment/role/slot/instance evidence. Retired rows are immutable history.';
