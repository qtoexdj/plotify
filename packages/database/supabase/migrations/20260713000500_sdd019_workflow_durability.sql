-- SDD019 T077: durable sale -> escritura workflow.
-- Additive/compatibility migration. Final client revokes remain in 00600.

set check_function_bodies = on;

alter table public.approval_requests
  add column if not exists request_hash text,
  add column if not exists operation_id uuid references public.idempotency_operations(id),
  add column if not exists approved_transition_version integer not null default 0;

update public.approval_requests
set idempotency_key = 'legacy:' || id::text
where idempotency_key is null;

update public.approval_requests
set request_hash = encode(
  extensions.digest(
    concat_ws(
      '|', 'approval-request-v1', organization_id::text, vendor_id::text,
      idempotency_key, request_type, coalesce(payload, '{}'::jsonb)::text
    ),
    'sha256'
  ),
  'hex'
)
where request_hash is null;

insert into public.idempotency_operations (
  organization_id, principal_type, principal_subject, operation_type,
  resource_scope, idempotency_key, request_hash, status, resource_type,
  resource_id, response_summary, source_kind, completed_at
)
select
  request.organization_id,
  'service',
  request.vendor_id::text,
  'sale.approve',
  'approval_request:' || request.id::text,
  left(request.idempotency_key, 128),
  request.request_hash,
  case when request.status = 'pending' then 'processing' else 'succeeded' end,
  'approval_requests',
  request.id,
  jsonb_build_object('legacy_backfill', true, 'status', request.status),
  'service',
  case when request.status = 'pending' then null else coalesce(request.resolved_at, request.created_at) end
from public.approval_requests request
where request.request_type = 'sale'
  and request.operation_id is null
on conflict (
  organization_id, principal_type, principal_subject, operation_type,
  resource_scope, idempotency_key
) do nothing;

update public.approval_requests request
set operation_id = operation.id
from public.idempotency_operations operation
where request.operation_id is null
  and request.request_type = 'sale'
  and operation.organization_id = request.organization_id
  and operation.principal_type = 'service'
  and operation.principal_subject = request.vendor_id::text
  and operation.operation_type = 'sale.approve'
  and operation.resource_scope = 'approval_request:' || request.id::text
  and operation.idempotency_key = left(request.idempotency_key, 128);

create unique index if not exists approval_requests_operation_uidx
  on public.approval_requests (operation_id)
  where operation_id is not null;

create unique index if not exists approval_requests_vendor_idempotency_uidx
  on public.approval_requests (organization_id, vendor_id, idempotency_key);

alter table public.escritura_minuta_generations
  drop constraint if exists escritura_minuta_generations_generation_mode_check;
alter table public.escritura_minuta_generations
  add constraint escritura_minuta_generations_generation_mode_check
  check (generation_mode in ('legacy', 'automatic', 'manual'));

alter table public.escritura_minuta_generations
  drop constraint if exists escritura_minuta_generations_manual_identity_check;
alter table public.escritura_minuta_generations
  add constraint escritura_minuta_generations_manual_identity_check
  check (
    generation_mode <> 'manual'
    or (
      operation_id is not null
      and nullif(btrim(regeneration_reason), '') is not null
    )
  ) not valid;

create unique index if not exists escritura_minuta_generations_automatic_fingerprint_uidx
  on public.escritura_minuta_generations (generation_fingerprint)
  where generation_mode = 'automatic' and generation_fingerprint is not null;

create unique index if not exists escritura_minuta_generations_manual_operation_uidx
  on public.escritura_minuta_generations (operation_id)
  where generation_mode = 'manual' and operation_id is not null;

alter table public.escritura_cascade_runs
  add column if not exists workflow_outbox_id uuid,
  add column if not exists attempt_number integer,
  add column if not exists generation_fingerprint text,
  add column if not exists delivery_state jsonb not null default '{}'::jsonb,
  add column if not exists started_at timestamptz,
  add column if not exists finished_at timestamptz,
  add column if not exists last_error_code text;

create table if not exists public.workflow_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  aggregate_type text not null check (aggregate_type in ('sale_approval')),
  aggregate_id uuid not null references public.approval_requests(id) on delete restrict,
  event_type text not null check (event_type in ('sale_approved')),
  event_fingerprint text not null check (event_fingerprint ~ '^[0-9a-f]{64}$'),
  operation_id uuid not null references public.idempotency_operations(id) on delete restrict,
  payload jsonb not null,
  status text not null default 'pending' check (status in (
    'pending', 'deferred_feature_off', 'processing', 'retry_scheduled',
    'completed', 'dead_letter', 'cancelled'
  )),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 8 check (max_attempts between 1 and 32),
  available_at timestamptz not null default now(),
  lease_owner text,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  deferred_reason text,
  deferred_control_fingerprint text,
  last_error_code text,
  last_error_class text check (last_error_class is null or last_error_class in ('retryable', 'terminal')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint workflow_outbox_lease_shape check (
    (status = 'processing' and lease_owner is not null and lease_expires_at is not null and heartbeat_at is not null)
    or
    (status <> 'processing' and lease_owner is null and lease_expires_at is null and heartbeat_at is null)
  )
);

create unique index if not exists workflow_outbox_event_fingerprint_uidx
  on public.workflow_outbox (event_fingerprint);
create index if not exists workflow_outbox_due_idx
  on public.workflow_outbox (status, available_at);
create index if not exists workflow_outbox_expired_lease_idx
  on public.workflow_outbox (lease_expires_at)
  where status = 'processing';

alter table public.escritura_cascade_runs
  drop constraint if exists escritura_cascade_runs_workflow_outbox_id_fkey;
alter table public.escritura_cascade_runs
  add constraint escritura_cascade_runs_workflow_outbox_id_fkey
  foreign key (workflow_outbox_id) references public.workflow_outbox(id) on delete restrict;

create unique index if not exists escritura_cascade_runs_outbox_attempt_uidx
  on public.escritura_cascade_runs (workflow_outbox_id, attempt_number)
  where workflow_outbox_id is not null and attempt_number is not null;

create table if not exists public.worker_job_failures (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.idempotency_operations(id) on delete restrict,
  queue_name text not null,
  task_name text not null,
  job_id text not null,
  payload_fingerprint text not null,
  error_code text not null,
  error_class text not null check (error_class in ('retryable', 'terminal')),
  status text not null check (status in ('retry_scheduled', 'dead_letter', 'resolved')),
  attempt_count integer not null check (attempt_count > 0),
  max_attempts integer not null check (max_attempts > 0),
  next_attempt_at timestamptz,
  first_failed_at timestamptz not null default now(),
  last_failed_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_operation_id uuid references public.idempotency_operations(id),
  last_audit_id uuid references public.audit_logs(id) deferrable initially deferred,
  unique (queue_name, job_id),
  check (
    (status = 'retry_scheduled' and next_attempt_at is not null and resolved_at is null)
    or (status = 'dead_letter' and next_attempt_at is null and resolved_at is null)
    or (status = 'resolved' and next_attempt_at is null and resolved_at is not null)
  )
);

alter table public.workflow_outbox enable row level security;
alter table public.worker_job_failures enable row level security;
revoke all on table public.workflow_outbox from public, anon, authenticated;
revoke all on table public.worker_job_failures from public, anon, authenticated;
grant select, insert, update on table public.workflow_outbox to service_role;
grant select, insert, update on table public.worker_job_failures to service_role;

create or replace function public.claim_workflow_outbox(
  p_worker_id text,
  p_hard_off boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate public.workflow_outbox;
  project_id uuid;
  eligible boolean := false;
  control_fingerprint text;
begin
  if nullif(btrim(p_worker_id), '') is null then
    raise exception using errcode = '22023', message = 'WORKER_ID_REQUIRED';
  end if;

  select item.* into candidate
  from public.workflow_outbox item
  where (
      item.status in ('pending', 'retry_scheduled', 'deferred_feature_off')
      and item.available_at <= now()
    ) or (
      item.status = 'processing' and item.lease_expires_at <= now()
    )
  order by item.available_at, item.created_at
  for update skip locked
  limit 1;

  if not found then
    return jsonb_build_object('outcome', 'idle', 'item', null);
  end if;

  project_id := nullif(candidate.payload->>'project_id', '')::uuid;
  eligible := not p_hard_off and public.resolve_feature_rollout(
    'automatic_escritura', candidate.organization_id, project_id
  );
  select encode(
    extensions.digest(
      concat_ws(
        '|', 'rollout-control-v1', candidate.organization_id::text,
        coalesce(project_id::text, ''), eligible::text, p_hard_off::text
      ),
      'sha256'
    ),
    'hex'
  ) into control_fingerprint;

  if not eligible then
    update public.workflow_outbox
    set status = 'deferred_feature_off',
        available_at = now() + interval '30 seconds',
        lease_owner = null,
        lease_expires_at = null,
        heartbeat_at = null,
        deferred_reason = case when p_hard_off then 'hard_off' else 'control_off' end,
        deferred_control_fingerprint = control_fingerprint,
        updated_at = now()
    where id = candidate.id
    returning * into candidate;
    return jsonb_build_object(
      'outcome', 'deferred_feature_off',
      'item', to_jsonb(candidate),
      'deferred_reason', candidate.deferred_reason,
      'control_fingerprint', control_fingerprint
    );
  end if;

  update public.workflow_outbox
  set status = 'processing',
      lease_owner = p_worker_id,
      lease_expires_at = now() + interval '60 seconds',
      heartbeat_at = now(),
      deferred_reason = null,
      deferred_control_fingerprint = null,
      updated_at = now()
  where id = candidate.id
  returning * into candidate;

  return jsonb_build_object('outcome', 'claimed', 'item', to_jsonb(candidate));
end;
$$;

create or replace function public.heartbeat_workflow_outbox(
  p_item_id uuid,
  p_worker_id text
)
returns public.workflow_outbox
language plpgsql
security definer
set search_path = ''
as $$
declare result public.workflow_outbox;
begin
  update public.workflow_outbox
  set heartbeat_at = now(), lease_expires_at = now() + interval '60 seconds', updated_at = now()
  where id = p_item_id and status = 'processing' and lease_owner = p_worker_id
    and lease_expires_at > now()
  returning * into result;
  if result.id is null then
    raise exception using errcode = '40001', message = 'WORKFLOW_LEASE_LOST';
  end if;
  return result;
end;
$$;

create or replace function public.release_workflow_outbox_for_feature_off(
  p_item_id uuid,
  p_worker_id text,
  p_reason text,
  p_control_fingerprint text
)
returns public.workflow_outbox
language plpgsql
security definer
set search_path = ''
as $$
declare result public.workflow_outbox;
begin
  update public.workflow_outbox
  set status = 'deferred_feature_off',
      available_at = now() + interval '30 seconds',
      lease_owner = null, lease_expires_at = null, heartbeat_at = null,
      deferred_reason = left(coalesce(nullif(btrim(p_reason), ''), 'control_off'), 100),
      deferred_control_fingerprint = p_control_fingerprint,
      updated_at = now()
  where id = p_item_id and status = 'processing' and lease_owner = p_worker_id
  returning * into result;
  if result.id is null then
    raise exception using errcode = '40001', message = 'WORKFLOW_LEASE_LOST';
  end if;
  return result;
end;
$$;

create or replace function public.begin_workflow_outbox_attempt(
  p_item_id uuid,
  p_worker_id text
)
returns public.workflow_outbox
language plpgsql
security definer
set search_path = ''
as $$
declare result public.workflow_outbox;
begin
  update public.workflow_outbox
  set attempt_count = attempt_count + 1, updated_at = now()
  where id = p_item_id and status = 'processing' and lease_owner = p_worker_id
    and lease_expires_at > now() and attempt_count < max_attempts
  returning * into result;
  if result.id is null then
    raise exception using errcode = '40001', message = 'WORKFLOW_ATTEMPT_NOT_ALLOWED';
  end if;
  return result;
end;
$$;

create or replace function public.finish_workflow_outbox(
  p_item_id uuid,
  p_worker_id text,
  p_status text,
  p_error_code text default null,
  p_error_class text default null,
  p_retry_after_seconds integer default null
)
returns public.workflow_outbox
language plpgsql
security definer
set search_path = ''
as $$
declare result public.workflow_outbox;
begin
  if p_status not in ('completed', 'retry_scheduled', 'dead_letter') then
    raise exception using errcode = '22023', message = 'WORKFLOW_OUTCOME_INVALID';
  end if;
  update public.workflow_outbox
  set status = p_status,
      available_at = case
        when p_status = 'retry_scheduled'
          then now() + make_interval(secs => greatest(1, least(coalesce(p_retry_after_seconds, 5), 3600)))
        else available_at
      end,
      lease_owner = null, lease_expires_at = null, heartbeat_at = null,
      last_error_code = case when p_status = 'completed' then null else left(p_error_code, 100) end,
      last_error_class = case when p_status = 'completed' then null else p_error_class end,
      completed_at = case when p_status = 'completed' then now() else null end,
      updated_at = now()
  where id = p_item_id and status = 'processing' and lease_owner = p_worker_id
  returning * into result;
  if result.id is null then
    raise exception using errcode = '40001', message = 'WORKFLOW_LEASE_LOST';
  end if;
  return result;
end;
$$;

alter table public.escritura_deliveries
  add column if not exists recipient_role text,
  add column if not exists required boolean not null default false,
  add column if not exists operation_id uuid references public.idempotency_operations(id),
  add column if not exists delivery_status text not null default 'pending',
  add column if not exists capability_status text not null default 'none',
  add column if not exists available_at timestamptz,
  add column if not exists first_accessed_at timestamptz,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists last_error_code text,
  add column if not exists last_error_class text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists legacy_cutover_status text not null default 'not_required',
  add column if not exists authenticated_replacement_verified_at timestamptz,
  add column if not exists legacy_revoked_at timestamptz;

alter table public.escritura_deliveries
  drop constraint if exists escritura_deliveries_status_check,
  drop constraint if exists escritura_deliveries_delivery_status_check,
  drop constraint if exists escritura_deliveries_capability_status_check,
  drop constraint if exists escritura_deliveries_recipient_role_check,
  drop constraint if exists escritura_deliveries_legacy_cutover_status_check;

alter table public.escritura_deliveries
  add constraint escritura_deliveries_status_check check (
    status in ('pending', 'available', 'sent', 'retry_scheduled', 'failed', 'unavailable', 'cancelled', 'expired')
  ),
  add constraint escritura_deliveries_delivery_status_check check (
    delivery_status in ('pending', 'available', 'sent', 'retry_scheduled', 'failed', 'unavailable', 'cancelled')
  ),
  add constraint escritura_deliveries_capability_status_check check (
    capability_status in ('none', 'active', 'expired', 'revoked')
  ),
  add constraint escritura_deliveries_recipient_role_check check (
    recipient_role is null or recipient_role in ('sale_vendor', 'organization_admin')
  ),
  add constraint escritura_deliveries_legacy_cutover_status_check check (
    legacy_cutover_status in ('not_required', 'pending_verification', 'verified', 'revoked', 'blocked')
  );

create unique index if not exists escritura_deliveries_obligation_uidx
  on public.escritura_deliveries (generation_id, recipient_user_id, channel)
  where recipient_user_id is not null;

create unique index if not exists escritura_deliveries_operation_uidx
  on public.escritura_deliveries (operation_id, channel)
  where operation_id is not null;

alter table public.escritura_delivery_capabilities
  drop constraint if exists escritura_delivery_capabilities_operation_id_key;
alter table public.escritura_delivery_capabilities
  add constraint escritura_delivery_capabilities_operation_id_key unique (operation_id);

create or replace function public.reject_capability_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('plotify.capability_rotation', true) = 'on' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;
  raise exception using errcode = '55000', message = 'CAPABILITY_ISSUANCE_IMMUTABLE';
end;
$$;

drop trigger if exists escritura_delivery_capabilities_immutable on public.escritura_delivery_capabilities;
create trigger escritura_delivery_capabilities_immutable
before update or delete on public.escritura_delivery_capabilities
for each row execute function public.reject_capability_mutation();

create or replace function public.issue_delivery_capability(
  p_delivery_id uuid,
  p_operation_id uuid,
  p_ttl_seconds integer,
  p_actor_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery public.escritura_deliveries;
  existing public.escritura_delivery_capabilities;
  capability_id uuid := gen_random_uuid();
  raw_token text;
  token_hash text;
  issued_at timestamptz := now();
  expires_at timestamptz;
begin
  select * into delivery from public.escritura_deliveries where id = p_delivery_id for update;
  if delivery.id is null then
    raise exception using errcode = 'P0002', message = 'DELIVERY_NOT_FOUND';
  end if;
  if not public.resolve_feature_rollout(
    'document_capabilities', delivery.organization_id, delivery.project_id
  ) then
    raise exception using errcode = '42501', message = 'DOCUMENT_CAPABILITIES_OFF';
  end if;
  select * into existing from public.escritura_delivery_capabilities
  where operation_id = p_operation_id;
  if found then
    return jsonb_build_object(
      'capability_id', existing.id,
      'delivery_id', existing.delivery_id,
      'status', existing.status,
      'code', 'CAPABILITY_TOKEN_ALREADY_CONSUMED'
    );
  end if;
  if exists (
    select 1 from public.escritura_delivery_capabilities
    where delivery_id = delivery.id and status = 'active'
  ) then
    raise exception using errcode = '23505', message = 'CAPABILITY_ACTIVE';
  end if;
  if p_ttl_seconds < 60 or p_ttl_seconds > 604800 then
    raise exception using errcode = '22023', message = 'CAPABILITY_TTL_INVALID';
  end if;

  -- Exactly 32 random bytes; plaintext is returned once and never persisted.
  raw_token := rtrim(
    translate(encode(extensions.gen_random_bytes(32), 'base64'), E'+/\\n', '-_'),
    '='
  );
  token_hash := encode(
    extensions.digest(
      concat_ws('|', 'document-capability-v1', delivery.id::text, raw_token),
      'sha256'
    ),
    'hex'
  );
  expires_at := issued_at + make_interval(secs => p_ttl_seconds);

  insert into public.escritura_delivery_capabilities (
    id, delivery_id, operation_id, token_hash, status,
    issued_at, expires_at, issued_by
  ) values (
    capability_id, delivery.id, p_operation_id, token_hash, 'active',
    issued_at, expires_at, p_actor_user_id
  );
  update public.escritura_deliveries
  set active_capability_id = capability_id,
      capability_status = 'active',
      updated_at = now()
  where id = delivery.id;
  insert into public.audit_logs (
    organization_id, actor, actor_user_id, action, entity, entity_id,
    operation_id, event_key, result, payload
  ) values (
    delivery.organization_id, 'user', p_actor_user_id,
    'delivery_capability.issued', 'escritura_delivery_capabilities', capability_id::text,
    p_operation_id,
    encode(extensions.digest(concat_ws('|', 'audit-v1', capability_id::text, 'issued'), 'sha256'), 'hex'),
    'succeeded', jsonb_build_object('delivery_id', delivery.id, 'expires_at', expires_at)
  );
  return jsonb_build_object(
    'capability_id', capability_id, 'delivery_id', delivery.id,
    'status', 'active', 'token', raw_token, 'expires_at', expires_at
  );
end;
$$;

create or replace function public.renew_delivery_capability(
  p_delivery_id uuid,
  p_operation_id uuid,
  p_ttl_seconds integer,
  p_actor_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery public.escritura_deliveries;
  previous public.escritura_delivery_capabilities;
  existing public.escritura_delivery_capabilities;
  next_id uuid := gen_random_uuid();
  raw_token text;
  token_hash text;
  issued_at timestamptz := now();
  expires_at timestamptz;
begin
  select * into delivery from public.escritura_deliveries where id = p_delivery_id for update;
  if delivery.id is null then raise exception 'DELIVERY_NOT_FOUND'; end if;
  if not public.resolve_feature_rollout(
    'document_capabilities', delivery.organization_id, delivery.project_id
  ) then
    raise exception using errcode = '42501', message = 'DOCUMENT_CAPABILITIES_OFF';
  end if;
  select * into existing from public.escritura_delivery_capabilities
  where operation_id = p_operation_id;
  if found then
    return jsonb_build_object(
      'capability_id', existing.id, 'delivery_id', existing.delivery_id,
      'status', existing.status, 'code', 'CAPABILITY_TOKEN_ALREADY_CONSUMED'
    );
  end if;
  select * into previous from public.escritura_delivery_capabilities
  where delivery_id = delivery.id and status = 'active'
  for update;
  if not found then raise exception 'CAPABILITY_ACTIVE_NOT_FOUND'; end if;
  if p_ttl_seconds < 60 or p_ttl_seconds > 604800 then
    raise exception using errcode = '22023', message = 'CAPABILITY_TTL_INVALID';
  end if;
  raw_token := rtrim(
    translate(encode(extensions.gen_random_bytes(32), 'base64'), E'+/\\n', '-_'),
    '='
  );
  token_hash := encode(
    extensions.digest(
      concat_ws('|', 'document-capability-v1', delivery.id::text, raw_token),
      'sha256'
    ),
    'hex'
  );
  expires_at := issued_at + make_interval(secs => p_ttl_seconds);

  -- Permit the single guarded status transition only inside this transaction.
  perform set_config('plotify.capability_rotation', 'on', true);
  update public.escritura_delivery_capabilities
  set status = 'rotated', revoked_at = issued_at, rotated_to_id = next_id,
      revoked_by = p_actor_user_id
  where id = previous.id;

  insert into public.escritura_delivery_capabilities (
    id, delivery_id, operation_id, token_hash, status,
    issued_at, expires_at, issued_by
  ) values (
    next_id, delivery.id, p_operation_id, token_hash, 'active',
    issued_at, expires_at, p_actor_user_id
  );
  update public.escritura_deliveries
  set active_capability_id = next_id, capability_status = 'active', updated_at = now()
  where id = delivery.id;
  insert into public.audit_logs (
    organization_id, actor, actor_user_id, action, entity, entity_id,
    operation_id, event_key, result, payload
  ) values (
    delivery.organization_id, 'user', p_actor_user_id,
    'delivery_capability.rotated', 'escritura_delivery_capabilities', next_id::text,
    p_operation_id,
    encode(extensions.digest(concat_ws('|', 'audit-v1', next_id::text, 'rotated'), 'sha256'), 'hex'),
    'succeeded', jsonb_build_object('delivery_id', delivery.id, 'previous_capability_id', previous.id)
  );
  return jsonb_build_object(
    'capability_id', next_id, 'delivery_id', delivery.id, 'status', 'active',
    'token', raw_token, 'expires_at', expires_at,
    'previous_capability_id', previous.id
  );
end;
$$;

create or replace function public.verify_legacy_delivery_replacement(
  p_delivery_id uuid,
  p_actor_user_id uuid,
  p_operation_id uuid
)
returns public.escritura_deliveries
language plpgsql
security definer
set search_path = ''
as $$
declare result public.escritura_deliveries;
begin
  update public.escritura_deliveries delivery
  set legacy_cutover_status = 'verified',
      authenticated_replacement_verified_at = now(),
      updated_at = now()
  where delivery.id = p_delivery_id
    and delivery.link_token is not null
    and delivery.recipient_user_id is not null
    and exists (
      select 1 from public.organization_members member
      where member.organization_id = delivery.organization_id
        and member.user_id = delivery.recipient_user_id
    )
  returning * into result;
  if result.id is null then
    raise exception using errcode = '23514', message = 'LEGACY_CAPABILITY_RECIPIENT_AMBIGUOUS';
  end if;
  insert into public.audit_logs (
    organization_id, actor, actor_user_id, action, entity, entity_id,
    operation_id, event_key, result, payload
  ) values (
    result.organization_id, 'user', p_actor_user_id,
    'legacy_delivery.authenticated_replacement_verified', 'escritura_deliveries', result.id::text,
    p_operation_id,
    encode(extensions.digest(concat_ws('|', 'audit-v1', result.id::text, 'replacement_verified'), 'sha256'), 'hex'),
    'succeeded', jsonb_build_object('delivery_id', result.id)
  );
  return result;
end;
$$;

create or replace function public.cutover_legacy_delivery_link(
  p_delivery_id uuid,
  p_actor_user_id uuid,
  p_operation_id uuid
)
returns public.escritura_deliveries
language plpgsql
security definer
set search_path = ''
as $$
declare result public.escritura_deliveries;
begin
  update public.escritura_deliveries
  set link_token = null, link_expires_at = null,
      legacy_cutover_status = 'revoked', legacy_revoked_at = now(), updated_at = now()
  where id = p_delivery_id
    and legacy_cutover_status = 'verified'
    and authenticated_replacement_verified_at is not null
  returning * into result;
  if result.id is null then
    raise exception using errcode = '23514', message = 'LEGACY_REPLACEMENT_NOT_VERIFIED';
  end if;
  insert into public.audit_logs (
    organization_id, actor, actor_user_id, action, entity, entity_id,
    operation_id, event_key, result, payload
  ) values (
    result.organization_id, 'user', p_actor_user_id,
    'legacy_delivery.link_revoked', 'escritura_deliveries', result.id::text,
    p_operation_id,
    encode(extensions.digest(concat_ws('|', 'audit-v1', result.id::text, 'legacy_revoked'), 'sha256'), 'hex'),
    'succeeded', jsonb_build_object('delivery_id', result.id)
  );
  return result;
end;
$$;

create table if not exists public.escritura_signature_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  lot_id uuid not null references public.lots(id) on delete restrict,
  escritura_case_id uuid not null references public.escritura_cases(id) on delete restrict,
  generation_id uuid not null references public.escritura_minuta_generations(id) on delete restrict,
  signed_at timestamptz not null,
  evidence_file_id uuid not null references public.project_file_objects(id) on delete restrict,
  evidence_sha256 text not null check (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  operation_id uuid not null references public.idempotency_operations(id) on delete restrict,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  reason text not null check (length(btrim(reason)) between 1 and 2000),
  created_at timestamptz not null default now(),
  unique (escritura_case_id, generation_id),
  unique (evidence_file_id),
  unique (operation_id)
);

alter table public.escritura_signature_events enable row level security;
revoke all on table public.escritura_signature_events from public, anon, authenticated;
grant select, insert on table public.escritura_signature_events to service_role;

create or replace function public.guard_escritura_firmada_stage()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.etapa_proceso = 'escritura_firmada'
     and old.etapa_proceso is distinct from 'escritura_firmada'
     and not exists (
       select 1
       from public.escritura_signature_events signature
       where signature.lot_id = new.lot_id
     ) then
    raise exception using errcode = '23514', message = 'SIGNATURE_EVENT_REQUIRED';
  end if;
  return new;
end;
$$;

drop trigger if exists lot_records_escritura_firmada_guard on public.lot_records;
create trigger lot_records_escritura_firmada_guard
before update on public.lot_records
for each row execute function public.guard_escritura_firmada_stage();

create or replace function public.record_escritura_signature(
  p_escritura_case_id uuid,
  p_generation_id uuid,
  p_evidence_file_id uuid,
  p_signed_at timestamptz,
  p_recorded_by uuid,
  p_operation_key text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  case_row public.escritura_cases;
  generation_row public.escritura_minuta_generations;
  validation_row public.escritura_semantic_validations;
  evidence_row public.project_file_objects;
  approval_row public.legal_review_decisions;
  operation_row public.idempotency_operations;
  existing_event public.escritura_signature_events;
  event_id uuid := gen_random_uuid();
  request_hash text;
  lower_bound timestamptz;
begin
  if nullif(btrim(p_operation_key), '') is null
     or length(p_operation_key) > 128
     or nullif(btrim(p_reason), '') is null then
    raise exception using errcode = '22023', message = 'SIGNATURE_REQUEST_INVALID';
  end if;

  select * into case_row
  from public.escritura_cases where id = p_escritura_case_id for update;
  if case_row.id is null
     or not (
       public.is_org_admin(case_row.organization_id)
       or public.is_super_admin()
       or exists (
         select 1 from public.organization_members member
         where member.organization_id = case_row.organization_id
           and member.user_id = p_recorded_by
           and member.role = 'admin'
       )
     ) then
    raise exception using errcode = '42501', message = 'SIGNATURE_FORBIDDEN';
  end if;

  select * into generation_row
  from public.escritura_minuta_generations
  where id = p_generation_id
  for update;
  if generation_row.id is null
     or generation_row.escritura_case_id <> case_row.id
     or generation_row.organization_id <> case_row.organization_id
     or generation_row.project_id <> case_row.project_id
     or generation_row.readiness_status <> 'ready'
     or generation_row.semantic_validation_id is null then
    raise exception using errcode = '23514', message = 'SIGNATURE_SCOPE_MISMATCH';
  end if;

  select * into validation_row
  from public.escritura_semantic_validations
  where id = generation_row.semantic_validation_id;
  if validation_row.id is null
     or validation_row.status <> 'passed'
     or validation_row.escritura_case_id <> case_row.id
     or validation_row.artifact_sha256 <> generation_row.artifact_sha256 then
    raise exception using errcode = '23514', message = 'SIGNATURE_GENERATION_NOT_READY';
  end if;

  select * into evidence_row
  from public.project_file_objects
  where id = p_evidence_file_id
  for update;
  if evidence_row.id is null
     or evidence_row.organization_id <> case_row.organization_id
     or evidence_row.project_id <> case_row.project_id
     or evidence_row.category <> 'escritura_signature_evidence'
     or evidence_row.bound_escritura_case_id <> case_row.id
     or evidence_row.bound_generation_id <> generation_row.id
     or evidence_row.status <> 'ready' then
    raise exception using errcode = '23514', message = 'SIGNATURE_SCOPE_MISMATCH';
  end if;

  if exists (
    select 1 from public.escritura_signature_events
    where evidence_file_id = evidence_row.id
  ) then
    raise exception using errcode = '23505', message = 'SIGNATURE_EVIDENCE_ALREADY_USED';
  end if;

  select * into approval_row
  from public.legal_review_decisions
  where id = generation_row.approval_id;
  lower_bound := greatest(
    generation_row.generated_at,
    coalesce(approval_row.decided_at, generation_row.generated_at)
  ) - interval '5 minutes';
  if p_signed_at < lower_bound or p_signed_at > now() + interval '5 minutes' then
    raise exception using errcode = '22008', message = 'SIGNATURE_TIME_INVALID';
  end if;

  request_hash := encode(
    extensions.digest(
      concat_ws(
        '|', 'signature-record-v1', case_row.id::text, generation_row.id::text,
        evidence_row.id::text, p_signed_at::text, p_recorded_by::text, btrim(p_reason)
      ),
      'sha256'
    ),
    'hex'
  );

  select * into operation_row
  from public.idempotency_operations
  where organization_id = case_row.organization_id
    and principal_type = 'user'
    and principal_subject = p_recorded_by::text
    and operation_type = 'signature.record'
    and resource_scope = 'escritura_case:' || case_row.id::text
    and idempotency_key = p_operation_key
  for update;

  if found then
    if operation_row.request_hash <> request_hash then
      raise exception using errcode = '23505', message = 'IDEMPOTENCY_CONFLICT';
    end if;
    select * into existing_event
    from public.escritura_signature_events
    where operation_id = operation_row.id;
    if existing_event.id is null then
      raise exception using errcode = '40001', message = 'SIGNATURE_OPERATION_INCOMPLETE';
    end if;
    return jsonb_build_object(
      'event_id', existing_event.id,
      'case_id', existing_event.escritura_case_id,
      'generation_id', existing_event.generation_id,
      'evidence_file_id', existing_event.evidence_file_id,
      'signature_status', 'recorded',
      'signed_at', existing_event.signed_at
    );
  end if;

  insert into public.idempotency_operations (
    organization_id, principal_type, principal_subject, operation_type,
    resource_scope, idempotency_key, request_hash, source_kind
  ) values (
    case_row.organization_id, 'user', p_recorded_by::text, 'signature.record',
    'escritura_case:' || case_row.id::text, p_operation_key, request_hash, 'web'
  ) returning * into operation_row;

  insert into public.escritura_signature_events (
    id, organization_id, project_id, lot_id, escritura_case_id,
    generation_id, signed_at, evidence_file_id, evidence_sha256,
    recorded_by, operation_id, request_hash, reason
  ) values (
    event_id, case_row.organization_id, case_row.project_id, case_row.lot_id, case_row.id,
    generation_row.id, p_signed_at, evidence_row.id, evidence_row.source_sha256,
    p_recorded_by, operation_row.id, request_hash, btrim(p_reason)
  );

  update public.lot_records
  set etapa_proceso = 'escritura_firmada',
      firma_fecha = p_signed_at::date,
      updated_at = now()
  where lot_id = case_row.lot_id
    and etapa_proceso = 'espera_firma_escritura';
  if not found then
    raise exception using errcode = '23514', message = 'SIGNATURE_STAGE_INVALID';
  end if;

  insert into public.audit_logs (
    organization_id, actor, actor_user_id, action, entity, entity_id,
    operation_id, event_key, result, reason_code, payload
  ) values (
    case_row.organization_id, 'user', p_recorded_by,
    'escritura_signature.recorded', 'escritura_signature_events', event_id::text,
    operation_row.id,
    encode(extensions.digest(concat_ws('|', 'audit-v1', event_id::text, 'recorded'), 'sha256'), 'hex'),
    'succeeded', null,
    jsonb_build_object(
      'case_id', case_row.id, 'generation_id', generation_row.id,
      'evidence_file_id', evidence_row.id, 'signed_at', p_signed_at
    )
  );
  update public.idempotency_operations
  set status = 'succeeded', resource_type = 'escritura_signature_events',
      resource_id = event_id,
      response_summary = jsonb_build_object('event_id', event_id, 'signature_status', 'recorded'),
      completed_at = now(), updated_at = now()
  where id = operation_row.id;

  return jsonb_build_object(
    'event_id', event_id, 'case_id', case_row.id,
    'generation_id', generation_row.id, 'evidence_file_id', evidence_row.id,
    'signature_status', 'recorded', 'signed_at', p_signed_at
  );
end;
$$;

create or replace function public.approve_sale(
  p_approval_id uuid,
  p_admin_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.approval_requests;
  lot_row public.lots;
  vendor_row public.vendors;
  project_row public.projects;
  payload jsonb;
  admin_user_ids uuid[];
  transition_version integer;
  event_fingerprint text;
  audit_event_key text;
  outbox_id uuid;
begin
  select * into request_row
  from public.approval_requests
  where id = p_approval_id and request_type = 'sale'
  for update;
  if request_row.id is null then
    return jsonb_build_object('success', false, 'error', 'Solicitud no encontrada.');
  end if;
  if request_row.status = 'approved' then
    select id into outbox_id from public.workflow_outbox
    where aggregate_id = request_row.id
      and event_fingerprint = encode(
        extensions.digest(
          concat_ws(
            '|', 'outbox-v1', 'sale_approved', request_row.organization_id::text,
            request_row.id::text, request_row.approved_transition_version::text
          ),
          'sha256'
        ),
        'hex'
      );
    return jsonb_build_object(
      'success', true, 'lot_id', request_row.lot_id,
      'workflow_outbox_id', outbox_id, 'replayed', true
    );
  end if;
  if request_row.status <> 'pending' then
    return jsonb_build_object('success', false, 'error', 'Solicitud ya procesada.');
  end if;
  if auth.role() <> 'service_role'
     and not public.is_org_admin(request_row.organization_id) then
    return jsonb_build_object('success', false, 'error', 'No autorizado.');
  end if;

  select * into vendor_row
  from public.vendors
  where id = request_row.vendor_id
    and organization_id = request_row.organization_id
    and active
  for share;
  if vendor_row.id is null or vendor_row.user_id is null then
    raise exception using errcode = '23514', message = 'VENDOR_USER_LINK_REQUIRED';
  end if;

  select * into lot_row
  from public.lots
  where id = request_row.lot_id
    and estado::text = coalesce(request_row.previous_lot_state, 'reservado')
  for update;
  if lot_row.id is null then
    return jsonb_build_object('success', false, 'error', 'El estado actual del lote no coincide.');
  end if;
  select * into project_row
  from public.projects
  where id = lot_row.project_id and organization_id = request_row.organization_id;
  if project_row.id is null then
    raise exception using errcode = '23514', message = 'SALE_TENANT_MISMATCH';
  end if;
  if request_row.operation_id is null then
    raise exception using errcode = '23514', message = 'SALE_OPERATION_REQUIRED';
  end if;

  select coalesce(array_agg(member.user_id order by member.user_id), '{}'::uuid[])
  into admin_user_ids
  from public.organization_members member
  where member.organization_id = request_row.organization_id
    and member.role = 'admin';

  payload := request_row.payload;
  transition_version := request_row.approved_transition_version + 1;
  v_event_fingerprint := encode(
    extensions.digest(
      concat_ws(
        '|', 'outbox-v1', 'sale_approved', request_row.organization_id::text,
        request_row.id::text, transition_version::text
      ),
      'sha256'
    ),
    'hex'
  );
  v_audit_event_key := encode(
    extensions.digest(
      concat_ws(
        '|', 'audit-v1', request_row.organization_id::text,
        'approval_requests', request_row.id::text, 'sale.approved', transition_version::text
      ),
      'sha256'
    ),
    'hex'
  );

  update public.approval_requests
  set status = 'approved', admin_phone = p_admin_phone, resolved_at = now(),
      approved_transition_version = transition_version
  where id = request_row.id;
  update public.lots
  set estado = 'vendido', sold_at = now(), updated_at = now(),
      vendedor_id = case when request_row.sale_mode = 'direct' then request_row.vendor_id else vendedor_id end
  where id = request_row.lot_id;

  insert into public.lot_records (
    lot_id, cliente_nombre, cliente_run, cliente_direccion,
    cliente_estado_civil, cliente_ocupacion, cliente_telefono, cliente_email,
    cliente_nacionalidad, cliente_region, cliente_comuna, valor,
    etapa_proceso, updated_at
  ) values (
    request_row.lot_id, coalesce(payload->>'cliente_nombre', ''),
    coalesce(payload->>'cliente_run', ''), payload->>'cliente_direccion',
    payload->>'cliente_estado_civil', payload->>'cliente_ocupacion',
    payload->>'cliente_telefono', payload->>'cliente_email',
    payload->>'cliente_nacionalidad', payload->>'cliente_region',
    payload->>'cliente_comuna',
    coalesce((payload->>'valor_final')::numeric, lot_row.precio),
    'espera_firma_escritura', now()
  )
  on conflict (lot_id) do update set
    cliente_nombre = coalesce(excluded.cliente_nombre, public.lot_records.cliente_nombre),
    cliente_run = coalesce(excluded.cliente_run, public.lot_records.cliente_run),
    cliente_direccion = coalesce(excluded.cliente_direccion, public.lot_records.cliente_direccion),
    cliente_estado_civil = coalesce(excluded.cliente_estado_civil, public.lot_records.cliente_estado_civil),
    cliente_ocupacion = coalesce(excluded.cliente_ocupacion, public.lot_records.cliente_ocupacion),
    cliente_telefono = coalesce(excluded.cliente_telefono, public.lot_records.cliente_telefono),
    cliente_email = coalesce(excluded.cliente_email, public.lot_records.cliente_email),
    cliente_nacionalidad = coalesce(excluded.cliente_nacionalidad, public.lot_records.cliente_nacionalidad),
    cliente_region = coalesce(excluded.cliente_region, public.lot_records.cliente_region),
    cliente_comuna = coalesce(excluded.cliente_comuna, public.lot_records.cliente_comuna),
    valor = coalesce(excluded.valor, public.lot_records.valor),
    firma_fecha = null,
    etapa_proceso = 'espera_firma_escritura',
    updated_at = now();

  insert into public.audit_logs (
    organization_id, actor, action, entity, entity_id, payload,
    operation_id, event_key, result
  ) values (
    request_row.organization_id, coalesce(p_admin_phone, 'admin'),
    'sale.approved', 'approval_requests', request_row.id::text,
    jsonb_build_object(
      'lot_id', request_row.lot_id, 'approval_id', request_row.id,
      'vendor_id', request_row.vendor_id,
      'approved_transition_version', transition_version
    ),
    request_row.operation_id, v_audit_event_key, 'succeeded'
  );

  insert into public.workflow_outbox (
    organization_id, aggregate_type, aggregate_id, event_type,
    event_fingerprint, operation_id, payload
  ) values (
    request_row.organization_id, 'sale_approval', request_row.id, 'sale_approved',
    v_event_fingerprint, request_row.operation_id,
    jsonb_build_object(
      'schema_version', 'outbox-v1',
      'approval_request_id', request_row.id,
      'approved_transition_version', transition_version,
      'project_id', project_row.id,
      'lot_id', request_row.lot_id,
      'sale_vendor_user_id', vendor_row.user_id,
      'admin_user_ids', to_jsonb(admin_user_ids),
      'channels', jsonb_build_object(
        'vendor_web_required', true,
        'vendor_telegram_configured', request_row.vendor_platform = 'telegram',
        'admin_telegram_user_ids', to_jsonb(admin_user_ids)
      )
    )
  )
  on conflict (event_fingerprint) do update
    set event_fingerprint = excluded.event_fingerprint
  returning id into outbox_id;

  update public.idempotency_operations
  set status = 'succeeded', resource_type = 'approval_requests',
      resource_id = request_row.id,
      response_summary = jsonb_build_object(
        'approval_id', request_row.id, 'workflow_outbox_id', outbox_id
      ),
      completed_at = now(), updated_at = now()
  where id = request_row.operation_id;

  return jsonb_build_object(
    'success', true, 'lot_id', request_row.lot_id,
    'vendor_phone', request_row.vendor_phone,
    'vendor_platform', request_row.vendor_platform,
    'vendor_name', request_row.vendor_name,
    'workflow_outbox_id', outbox_id,
    'approved_transition_version', transition_version
  );
end;
$$;

insert into public.production_readiness_findings (
  fingerprint, organization_id, kind, severity, resource_type, resource_id,
  details, status, owner, impact, budget
)
select
  encode(extensions.digest('vendor-user-link:' || request.id::text, 'sha256'), 'hex'),
  request.organization_id,
  'vendor_user_link_missing',
  'blocking',
  'approval_requests',
  request.id,
  jsonb_build_object('approval_request_id', request.id, 'vendor_id', request.vendor_id),
  'open',
  'commercial',
  'Approved sale cannot produce an exact authenticated recipient snapshot',
  'Must be resolved before workflow rollout'
from public.approval_requests request
join public.vendors vendor on vendor.id = request.vendor_id
where request.request_type = 'sale'
  and request.status in ('pending', 'approved')
  and (not vendor.active or vendor.user_id is null)
on conflict (fingerprint) do nothing;

insert into public.production_readiness_findings (
  fingerprint, organization_id, kind, severity, resource_type, resource_id,
  details, status, owner, impact, budget
)
select
  encode(extensions.digest('legacy-delivery-link:' || delivery.id::text, 'sha256'), 'hex'),
  delivery.organization_id,
  'legacy_delivery_link_cutover',
  'blocking',
  'escritura_deliveries',
  delivery.id,
  jsonb_build_object(
    'delivery_id', delivery.id,
    'recipient_state', case when delivery.recipient_user_id is null then 'ambiguous' else 'requires_verification' end
  ),
  'open',
  'security',
  'Plaintext legacy access remains until authenticated replacement is verified',
  'Cut over only through guarded RPC'
from public.escritura_deliveries delivery
where delivery.link_token is not null
on conflict (fingerprint) do nothing;

insert into public.production_readiness_findings (
  fingerprint, organization_id, kind, severity, resource_type, resource_id,
  details, status, owner, impact, budget
)
select
  encode(extensions.digest('false-signed-stage:' || record.id::text, 'sha256'), 'hex'),
  project.organization_id,
  'false_signed_stage',
  'blocking',
  'lot_records',
  record.id,
  jsonb_build_object('lot_id', record.lot_id),
  'open',
  'legal',
  'Historical signed stage has no immutable signature evidence',
  'Quarantine and reconcile without fabricating evidence'
from public.lot_records record
join public.lots lot on lot.id = record.lot_id
join public.projects project on project.id = lot.project_id
where record.etapa_proceso = 'escritura_firmada'
  and not exists (
    select 1 from public.escritura_signature_events signature
    where signature.lot_id = record.lot_id
  )
on conflict (fingerprint) do nothing;

revoke all on function public.claim_workflow_outbox(text, boolean) from public, anon, authenticated;
revoke all on function public.heartbeat_workflow_outbox(uuid, text) from public, anon, authenticated;
revoke all on function public.release_workflow_outbox_for_feature_off(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.begin_workflow_outbox_attempt(uuid, text) from public, anon, authenticated;
revoke all on function public.finish_workflow_outbox(uuid, text, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.issue_delivery_capability(uuid, uuid, integer, uuid) from public, anon, authenticated;
revoke all on function public.renew_delivery_capability(uuid, uuid, integer, uuid) from public, anon, authenticated;
revoke all on function public.verify_legacy_delivery_replacement(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.cutover_legacy_delivery_link(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.record_escritura_signature(uuid, uuid, uuid, timestamptz, uuid, text, text) from public, anon, authenticated;
revoke all on function public.approve_sale(uuid, text) from public, anon, authenticated;

grant execute on function public.claim_workflow_outbox(text, boolean) to service_role;
grant execute on function public.heartbeat_workflow_outbox(uuid, text) to service_role;
grant execute on function public.release_workflow_outbox_for_feature_off(uuid, text, text, text) to service_role;
grant execute on function public.begin_workflow_outbox_attempt(uuid, text) to service_role;
grant execute on function public.finish_workflow_outbox(uuid, text, text, text, text, integer) to service_role;
grant execute on function public.issue_delivery_capability(uuid, uuid, integer, uuid) to service_role;
grant execute on function public.renew_delivery_capability(uuid, uuid, integer, uuid) to service_role;
grant execute on function public.verify_legacy_delivery_replacement(uuid, uuid, uuid) to service_role;
grant execute on function public.cutover_legacy_delivery_link(uuid, uuid, uuid) to service_role;
grant execute on function public.record_escritura_signature(uuid, uuid, uuid, timestamptz, uuid, text, text) to service_role;
grant execute on function public.approve_sale(uuid, text) to service_role;

comment on table public.workflow_outbox is
  'Durable outbox-v1 authority for sale-approved escritura orchestration.';
comment on table public.worker_job_failures is
  'PII-free durable failures for non-outbox ARQ jobs.';
comment on table public.escritura_signature_events is
  'Immutable evidence-backed record of an escritura signature completed outside Plotify.';
