-- SDD019 Phase 4: semantic validation and legal approval authority.
-- Additive/forward-fix migration. Existing generations remain unverified.

create extension if not exists pgtap with schema extensions;

insert into public.idempotency_operation_types (operation_type, contract_version, enabled)
values
  ('seller_fact_resolve', 'sdd019-semantic-v1', true),
  ('legal_approval_grant', 'sdd019-semantic-v1', true),
  ('legal_approval_revoke', 'sdd019-semantic-v1', true),
  ('matriz_approval_begin', 'sdd019-semantic-v1', true),
  ('matriz_approval_finalize', 'sdd019-semantic-v1', true),
  ('matriz_manual_regeneration', 'sdd019-semantic-v1', true)
on conflict (operation_type) do update
set contract_version = excluded.contract_version,
    enabled = excluded.enabled;

create table if not exists public.legal_approval_grants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  grantee_user_id uuid not null references auth.users(id) on delete cascade,
  granted_by uuid not null references auth.users(id) on delete restrict,
  operation_id uuid not null unique references public.idempotency_operations(id) on delete restrict,
  reason text not null check (length(btrim(reason)) between 1 and 2000),
  evidence_fingerprint text not null check (evidence_fingerprint ~ '^[a-f0-9]{64}$'),
  active boolean not null default true,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete restrict,
  revoke_operation_id uuid unique references public.idempotency_operations(id) on delete restrict,
  revoke_reason text,
  constraint legal_approval_grants_no_self_grant check (grantee_user_id <> granted_by),
  constraint legal_approval_grants_expiry check (expires_at is null or expires_at > granted_at),
  constraint legal_approval_grants_revoke_shape check (
    (active and revoked_at is null and revoked_by is null and revoke_operation_id is null)
    or
    (not active and revoked_at is not null and revoked_by is not null and revoke_operation_id is not null and length(btrim(revoke_reason)) > 0)
  )
);

create unique index if not exists legal_approval_grants_active_scope_idx
on public.legal_approval_grants (organization_id, coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid), grantee_user_id)
where active;

alter table public.variable_resolutions
  add column if not exists person_id uuid,
  add column if not exists field_version integer,
  add column if not exists legal_approval_grant_id uuid references public.legal_approval_grants(id) on delete restrict,
  add column if not exists attestation_ref text,
  add column if not exists evidence_hash text;

alter table public.variable_resolutions
  drop constraint if exists variable_resolutions_seller_manual_shape;
alter table public.variable_resolutions
  add constraint variable_resolutions_seller_manual_shape check (
    variable_key <> 'vendedor.comparecientes[]'
    or source_type <> 'manual'
    or (
      person_id is not null
      and field_version is not null and field_version > 0
      and legal_approval_grant_id is not null
      and length(btrim(correction_reason)) > 0
      and length(btrim(attestation_ref)) > 0
      and evidence_hash ~ '^[a-f0-9]{64}$'
      and reviewed_by is not null and reviewed_at is not null
      and value_text is null and jsonb_typeof(value_json) = 'object'
    )
  );

create table if not exists public.escritura_approval_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  escritura_case_id uuid references public.escritura_cases(id) on delete cascade,
  matriz_id uuid not null references public.escritura_matrices(id) on delete cascade,
  matriz_version integer not null check (matriz_version > 0),
  template_id uuid not null references public.escritura_templates(id) on delete restrict,
  template_version integer not null check (template_version > 0),
  origin text not null check (origin in ('human', 'system')),
  actor_user_id uuid references auth.users(id) on delete restrict,
  legal_approval_grant_id uuid not null references public.legal_approval_grants(id) on delete restrict,
  operation_id uuid not null unique references public.idempotency_operations(id) on delete restrict,
  snapshot_hash text not null check (length(snapshot_hash) >= 32),
  evidence_manifest_hash text not null check (evidence_manifest_hash ~ '^[a-f0-9]{64}$'),
  provenance_manifest_hash text not null check (provenance_manifest_hash ~ '^[a-f0-9]{64}$'),
  review_policy_fingerprint text not null check (review_policy_fingerprint ~ '^[a-f0-9]{64}$'),
  status text not null default 'validating' check (status in ('validating', 'failed', 'stale', 'finalized')),
  error_code text,
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  constraint escritura_approval_attempt_origin_actor check (
    (origin = 'human' and actor_user_id is not null) or origin = 'system'
  )
);

create index if not exists escritura_approval_attempts_matriz_idx
on public.escritura_approval_attempts (matriz_id, created_at desc);

create table if not exists public.escritura_semantic_validations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  escritura_case_id uuid references public.escritura_cases(id) on delete cascade,
  matriz_id uuid not null references public.escritura_matrices(id) on delete cascade,
  matriz_version integer not null check (matriz_version > 0),
  template_id uuid not null references public.escritura_templates(id) on delete restrict,
  template_version integer not null check (template_version > 0),
  snapshot_hash text not null,
  resolved_content_hash text not null check (resolved_content_hash ~ '^[a-f0-9]{64}$'),
  artifact_sha256 text not null check (artifact_sha256 ~ '^[a-f0-9]{64}$'),
  approval_attempt_id uuid not null references public.escritura_approval_attempts(id) on delete restrict,
  approval_id uuid references public.legal_review_decisions(id) on delete restrict,
  evidence_manifest_hash text not null check (evidence_manifest_hash ~ '^[a-f0-9]{64}$'),
  provenance_manifest_hash text not null check (provenance_manifest_hash ~ '^[a-f0-9]{64}$'),
  renderer_version text not null,
  ruleset_version text not null,
  normalization_version text not null,
  schema_version text not null,
  status text not null check (status in ('passed', 'failed')),
  issues jsonb not null default '[]'::jsonb check (jsonb_typeof(issues) = 'array'),
  validation_origin text not null check (validation_origin in ('approval', 'generation', 'historical_revalidation')),
  validated_by uuid references auth.users(id) on delete restrict,
  validated_at timestamptz not null default now(),
  constraint escritura_semantic_validation_pass_shape check (
    status = 'failed' or jsonb_array_length(issues) = 0
  ),
  constraint escritura_semantic_validation_unique_envelope unique (
    organization_id, artifact_sha256, ruleset_version, renderer_version,
    provenance_manifest_hash, approval_attempt_id
  )
);

create index if not exists escritura_semantic_validations_case_idx
on public.escritura_semantic_validations (escritura_case_id, validated_at desc);

alter table public.escritura_minuta_generations
  add column if not exists semantic_validation_id uuid references public.escritura_semantic_validations(id) on delete restrict,
  add column if not exists generation_fingerprint text,
  add column if not exists generation_mode text not null default 'legacy',
  add column if not exists operation_id uuid references public.idempotency_operations(id) on delete restrict,
  add column if not exists regeneration_reason text,
  add column if not exists template_version integer,
  add column if not exists renderer_version text,
  add column if not exists ruleset_version text,
  add column if not exists normalization_version text,
  add column if not exists schema_version text,
  add column if not exists artifact_sha256 text,
  add column if not exists provenance_manifest_hash text,
  add column if not exists review_policy_fingerprint text,
  add column if not exists approval_id uuid references public.legal_review_decisions(id) on delete restrict,
  add column if not exists readiness_status text not null default 'unverified';

alter table public.escritura_minuta_generations
  drop constraint if exists escritura_minuta_generations_semantic_shape;
alter table public.escritura_minuta_generations
  add constraint escritura_minuta_generations_semantic_shape check (
    generation_mode in ('legacy', 'automatic', 'manual')
    and readiness_status in ('unverified', 'ready')
    and (generation_fingerprint is null or generation_fingerprint ~ '^[a-f0-9]{64}$')
    and (artifact_sha256 is null or artifact_sha256 ~ '^[a-f0-9]{64}$')
    and (
      readiness_status = 'unverified'
      or (
        semantic_validation_id is not null and generation_fingerprint is not null
        and template_version is not null and renderer_version is not null
        and ruleset_version is not null and normalization_version is not null
        and schema_version is not null and artifact_sha256 is not null
        and provenance_manifest_hash is not null and review_policy_fingerprint is not null
        and approval_id is not null
      )
    )
    and (
      generation_mode <> 'manual'
      or readiness_status = 'unverified'
      or (operation_id is not null and length(btrim(regeneration_reason)) > 0)
    )
  );

alter table public.escritura_minuta_generations
  alter column generation_mode set default 'manual';

create unique index if not exists escritura_generations_automatic_fingerprint_idx
on public.escritura_minuta_generations (organization_id, generation_fingerprint)
where generation_mode = 'automatic' and generation_fingerprint is not null;

create unique index if not exists escritura_generations_manual_operation_idx
on public.escritura_minuta_generations (organization_id, operation_id)
where generation_mode = 'manual' and operation_id is not null;

create or replace function public.enforce_semantic_validation_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'escritura_semantic_validations is append-only';
  end if;
  if row(new.organization_id, new.project_id, new.escritura_case_id, new.matriz_id,
         new.matriz_version, new.template_id, new.template_version, new.snapshot_hash,
         new.resolved_content_hash, new.artifact_sha256, new.approval_attempt_id,
         new.evidence_manifest_hash, new.provenance_manifest_hash, new.renderer_version,
         new.ruleset_version, new.normalization_version, new.schema_version, new.status,
         new.issues, new.validation_origin, new.validated_by, new.validated_at)
     is distinct from
     row(old.organization_id, old.project_id, old.escritura_case_id, old.matriz_id,
         old.matriz_version, old.template_id, old.template_version, old.snapshot_hash,
         old.resolved_content_hash, old.artifact_sha256, old.approval_attempt_id,
         old.evidence_manifest_hash, old.provenance_manifest_hash, old.renderer_version,
         old.ruleset_version, old.normalization_version, old.schema_version, old.status,
         old.issues, old.validation_origin, old.validated_by, old.validated_at) then
    raise exception 'semantic validation envelope is immutable';
  end if;
  if old.approval_id is not null or new.approval_id is null then
    raise exception 'approval_id permits one NULL to value binding only';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_semantic_validation_immutability on public.escritura_semantic_validations;
create trigger trg_semantic_validation_immutability
before update or delete on public.escritura_semantic_validations
for each row execute function public.enforce_semantic_validation_immutability();

create or replace function public.begin_matriz_approval(
  p_matriz_id uuid,
  p_actor_user_id uuid,
  p_origin text,
  p_legal_approval_grant_id uuid,
  p_operation_id uuid,
  p_expected_matriz_version integer,
  p_template_version integer,
  p_snapshot_hash text,
  p_evidence_manifest_hash text,
  p_provenance_manifest_hash text,
  p_review_policy_fingerprint text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_matriz public.escritura_matrices%rowtype;
  v_grant public.legal_approval_grants%rowtype;
  v_attempt_id uuid;
begin
  select * into v_matriz from public.escritura_matrices where id = p_matriz_id for update;
  if not found or v_matriz.status <> 'legal_review_pending' then
    raise exception 'APPROVAL_CANDIDATE_STALE';
  end if;
  if v_matriz.version <> p_expected_matriz_version or v_matriz.snapshot_hash <> p_snapshot_hash then
    raise exception 'APPROVAL_CANDIDATE_STALE';
  end if;
  select * into v_grant from public.legal_approval_grants where id = p_legal_approval_grant_id for share;
  if not found or not v_grant.active or v_grant.organization_id <> v_matriz.organization_id
     or (v_grant.project_id is not null and v_grant.project_id <> v_matriz.project_id)
     or (v_grant.expires_at is not null and v_grant.expires_at <= now()) then
    raise exception 'LEGAL_APPROVAL_REQUIRED';
  end if;
  if p_origin = 'human' and (p_actor_user_id is null or v_grant.grantee_user_id <> p_actor_user_id) then
    raise exception 'LEGAL_APPROVAL_REQUIRED';
  end if;
  if p_origin = 'human' and v_matriz.submitted_by = p_actor_user_id then
    raise exception 'LEGAL_APPROVAL_DISTINCT_REVIEWER_REQUIRED';
  end if;
  insert into public.escritura_approval_attempts (
    organization_id, project_id, escritura_case_id, matriz_id, matriz_version,
    template_id, template_version, origin, actor_user_id, legal_approval_grant_id,
    operation_id, snapshot_hash, evidence_manifest_hash, provenance_manifest_hash,
    review_policy_fingerprint
  ) values (
    v_matriz.organization_id, v_matriz.project_id, v_matriz.escritura_case_id,
    v_matriz.id, v_matriz.version, v_matriz.template_id, p_template_version,
    p_origin, p_actor_user_id, v_grant.id, p_operation_id, p_snapshot_hash,
    p_evidence_manifest_hash, p_provenance_manifest_hash, p_review_policy_fingerprint
  ) returning id into v_attempt_id;
  return v_attempt_id;
end;
$$;

create or replace function public.finalize_matriz_approval(
  p_attempt_id uuid,
  p_validation_id uuid,
  p_operation_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.escritura_approval_attempts%rowtype;
  v_validation public.escritura_semantic_validations%rowtype;
  v_matriz public.escritura_matrices%rowtype;
  v_grant public.legal_approval_grants%rowtype;
  v_approval_id uuid;
begin
  select * into v_attempt from public.escritura_approval_attempts where id = p_attempt_id for update;
  select * into v_validation from public.escritura_semantic_validations where id = p_validation_id for update;
  select * into v_matriz from public.escritura_matrices where id = v_attempt.matriz_id for update;
  select * into v_grant from public.legal_approval_grants where id = v_attempt.legal_approval_grant_id for share;
  if v_attempt.status <> 'validating' or v_validation.approval_attempt_id <> v_attempt.id
     or v_validation.status <> 'passed' or v_validation.approval_id is not null
     or jsonb_array_length(v_validation.issues) <> 0 then
    raise exception 'DOCUMENT_SEMANTIC_INVALID';
  end if;
  if v_matriz.status <> 'legal_review_pending' or v_matriz.version <> v_attempt.matriz_version
     or v_matriz.snapshot_hash <> v_attempt.snapshot_hash
     or not v_grant.active or (v_grant.expires_at is not null and v_grant.expires_at <= now())
     or v_validation.matriz_version <> v_attempt.matriz_version
     or v_validation.template_version <> v_attempt.template_version
     or v_validation.evidence_manifest_hash <> v_attempt.evidence_manifest_hash
     or v_validation.provenance_manifest_hash <> v_attempt.provenance_manifest_hash then
    update public.escritura_approval_attempts set status = 'stale', error_code = 'APPROVAL_CANDIDATE_STALE' where id = v_attempt.id;
    raise exception 'APPROVAL_CANDIDATE_STALE';
  end if;
  insert into public.legal_review_decisions (
    organization_id, project_id, escritura_case_id, decision_type, decision_status,
    reason, decided_by, origin, trigger, inherited_from_matriz_id,
    inherited_matriz_version, decision_payload
  ) values (
    v_attempt.organization_id, v_attempt.project_id, v_attempt.escritura_case_id,
    'matriz_approved', 'approved', 'semantic_validation_passed',
    v_attempt.actor_user_id, v_attempt.origin, 'review_approved',
    null, null,
    jsonb_build_object('attemptId', v_attempt.id, 'validationId', v_validation.id,
      'legalGrantId', v_attempt.legal_approval_grant_id, 'operationId', p_operation_id)
  ) returning id into v_approval_id;
  update public.escritura_semantic_validations set approval_id = v_approval_id where id = v_validation.id;
  update public.escritura_matrices set
    status = 'approved', approved_by = v_attempt.actor_user_id, approved_at = now(),
    approval_origin = v_attempt.origin, version = version + 1, updated_at = now()
  where id = v_matriz.id;
  update public.escritura_approval_attempts set status = 'finalized', finalized_at = now() where id = v_attempt.id;
  insert into public.audit_logs (
    actor, actor_user_id, action, entity, entity_id, organization_id,
    operation_id, event_key, result, reason_code, payload
  ) values (
    case when v_attempt.origin = 'system' then 'service' else 'user' end,
    v_attempt.actor_user_id, 'matriz.semantic_approved', 'escritura_matriz', v_matriz.id::text,
    v_matriz.organization_id, p_operation_id, 'matriz.semantic_approved:' || v_matriz.id::text,
    'succeeded', 'SEMANTIC_PASS', jsonb_build_object('approvalId', v_approval_id,
      'validationId', v_validation.id, 'attemptId', v_attempt.id)
  );
  return jsonb_build_object('approvalId', v_approval_id, 'validationId', v_validation.id,
    'attemptId', v_attempt.id, 'matrizId', v_matriz.id, 'status', 'approved');
end;
$$;

alter table public.legal_approval_grants enable row level security;
alter table public.escritura_approval_attempts enable row level security;
alter table public.escritura_semantic_validations enable row level security;

drop policy if exists legal_approval_grants_admin_select on public.legal_approval_grants;
create policy legal_approval_grants_admin_select on public.legal_approval_grants for select
using (public.is_org_admin(organization_id) or public.is_super_admin());
drop policy if exists legal_approval_grants_service on public.legal_approval_grants;
create policy legal_approval_grants_service on public.legal_approval_grants to service_role using (true) with check (true);
drop policy if exists escritura_approval_attempts_admin_select on public.escritura_approval_attempts;
create policy escritura_approval_attempts_admin_select on public.escritura_approval_attempts for select
using (public.is_org_admin(organization_id) or public.is_super_admin());
drop policy if exists escritura_approval_attempts_service on public.escritura_approval_attempts;
create policy escritura_approval_attempts_service on public.escritura_approval_attempts to service_role using (true) with check (true);
drop policy if exists escritura_semantic_validations_admin_select on public.escritura_semantic_validations;
create policy escritura_semantic_validations_admin_select on public.escritura_semantic_validations for select
using (public.is_org_admin(organization_id) or public.is_super_admin());
drop policy if exists escritura_semantic_validations_service on public.escritura_semantic_validations;
create policy escritura_semantic_validations_service on public.escritura_semantic_validations to service_role using (true) with check (true);

revoke all on public.legal_approval_grants, public.escritura_approval_attempts, public.escritura_semantic_validations from anon, authenticated;
grant select on public.legal_approval_grants, public.escritura_approval_attempts, public.escritura_semantic_validations to authenticated;
grant select, insert, update on public.legal_approval_grants, public.escritura_approval_attempts, public.escritura_semantic_validations to service_role;
revoke all on function public.begin_matriz_approval(uuid, uuid, text, uuid, uuid, integer, integer, text, text, text, text) from public, anon, authenticated;
revoke all on function public.finalize_matriz_approval(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.begin_matriz_approval(uuid, uuid, text, uuid, uuid, integer, integer, text, text, text, text) to service_role;
grant execute on function public.finalize_matriz_approval(uuid, uuid, uuid) to service_role;

comment on table public.escritura_semantic_validations is 'Immutable redacted semantic verdicts bound to approval attempts and exact DOCX bytes.';
comment on table public.escritura_approval_attempts is 'Candidate envelope for begin-render-validate-finalize matriz approval.';
comment on table public.legal_approval_grants is 'Audited legal authority; organization membership alone never grants approval.';
