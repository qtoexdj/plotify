-- SDD019 T026: additive security/storage compatibility layer.
-- Forward fix: keep gateway objects and metadata default-deny; never restore
-- direct browser Storage policies during rollback.

set check_function_bodies = on;

update storage.buckets
set public = false
where id in ('project-files', 'documents');

update storage.buckets
set public = true
where id = 'avatars';

drop policy if exists "Public Access for avatars" on storage.objects;
drop policy if exists "Users can upload their own avatar" on storage.objects;
drop policy if exists "Users can update their own avatar" on storage.objects;
drop policy if exists "Users can delete their own avatar" on storage.objects;
drop policy if exists "Lectura selectiva project-files" on storage.objects;
drop policy if exists "Gestion miembros project-files" on storage.objects;
drop policy if exists "org_admin_read_documents" on storage.objects;
drop policy if exists "super_admin_read_documents" on storage.objects;

-- Public bucket delivery allows only GET by an already-known opaque key.
-- storage.objects SELECT is intentionally absent so list() returns no rows.
create policy "avatar_owner_insert"
on storage.objects for insert to authenticated
with check (bucket_id = 'avatars' and auth.uid() = owner);

create policy "avatar_owner_update"
on storage.objects for update to authenticated
using (bucket_id = 'avatars' and auth.uid() = owner)
with check (bucket_id = 'avatars' and auth.uid() = owner);

create policy "avatar_owner_delete"
on storage.objects for delete to authenticated
using (bucket_id = 'avatars' and auth.uid() = owner);

revoke execute on function public.can_read_project_files(text) from public, anon, authenticated;
revoke execute on function public.is_org_admin(uuid) from public, anon;
revoke execute on function public.is_super_admin() from public, anon;

create or replace function public.is_project_vendor(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.vendor_projects vp
    join public.vendors v on v.id = vp.vendor_id
    join public.projects p on p.id = vp.project_id
    where vp.project_id = target_project_id
      and v.user_id = auth.uid()
      and v.active
      and v.organization_id = p.organization_id
  );
$$;
revoke execute on function public.is_project_vendor(uuid) from public, anon;
grant execute on function public.is_project_vendor(uuid) to authenticated, service_role;

drop policy if exists lots_update on public.lots;
create policy lots_update on public.lots
for update to authenticated
using (
  public.is_super_admin()
  or public.is_project_admin(project_id)
  or (
    public.is_project_vendor(project_id)
    and (
      vendedor_id is null
      or exists (
        select 1 from public.vendors v
        where v.id = vendedor_id and v.user_id = auth.uid() and v.active
      )
    )
  )
)
with check (
  public.is_super_admin()
  or public.is_project_admin(project_id)
  or (
    public.is_project_vendor(project_id)
    and (
      vendedor_id is null
      or exists (
        select 1 from public.vendors v
        where v.id = vendedor_id and v.user_id = auth.uid() and v.active
      )
    )
  )
);

create table if not exists public.project_file_objects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  category text not null check (category in (
    'project_image', 'legal_document', 'geometry_source', 'escritura_signature_evidence'
  )),
  bucket text not null check (bucket in ('project-files', 'documents')),
  object_path text not null,
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  size_bytes bigint not null check (size_bytes > 0),
  content_type text not null,
  original_filename text not null,
  visibility text not null check (visibility in ('admin_only', 'assigned_project')),
  bound_escritura_case_id uuid references public.escritura_cases(id) on delete restrict,
  bound_generation_id uuid references public.escritura_minuta_generations(id) on delete restrict,
  status text not null default 'pending' check (status in (
    'pending', 'ready', 'superseded', 'deleted', 'repair_required'
  )),
  replaces_file_id uuid references public.project_file_objects(id) on delete restrict,
  retention_class text not null check (retention_class in ('media', 'legal', 'geometry_source')),
  operation_id uuid not null references public.idempotency_operations(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket, object_path),
  check (
    category <> 'escritura_signature_evidence'
    or (bound_escritura_case_id is not null and bound_generation_id is not null)
  )
);

create index if not exists project_file_objects_scope_idx
  on public.project_file_objects (organization_id, project_id, status, created_at desc);

alter table public.legal_documents
  add column if not exists project_file_object_id uuid
  references public.project_file_objects(id) on delete restrict;

create unique index if not exists legal_documents_project_file_object_uidx
  on public.legal_documents (project_file_object_id)
  where project_file_object_id is not null;

create table if not exists public.escritura_delivery_capabilities (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.escritura_deliveries(id) on delete restrict,
  operation_id uuid not null references public.idempotency_operations(id) on delete restrict,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  status text not null check (status in ('active', 'expired', 'revoked', 'rotated')),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  rotated_to_id uuid references public.escritura_delivery_capabilities(id) on delete restrict,
  issued_by uuid references auth.users(id) on delete restrict,
  revoked_by uuid references auth.users(id) on delete restrict,
  last_audit_id uuid references public.audit_logs(id) deferrable initially deferred,
  created_at timestamptz not null default now(),
  check (expires_at > issued_at and expires_at <= issued_at + interval '7 days')
);

create unique index if not exists escritura_delivery_capabilities_active_uidx
  on public.escritura_delivery_capabilities (delivery_id) where status = 'active';

alter table public.escritura_deliveries
  add column if not exists active_capability_id uuid
  references public.escritura_delivery_capabilities(id) deferrable initially deferred;

create table if not exists public.vendor_membership_operations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  target_user_id uuid references auth.users(id) on delete restrict,
  target_email_hash text,
  target_vendor_id uuid references public.vendors(id) on delete restrict,
  target_project_id uuid references public.projects(id) on delete restrict,
  operation_kind text not null check (operation_kind in (
    'invite', 'assign', 'remove_membership', 'delete_global_identity'
  )),
  status text not null default 'intent' check (status in (
    'intent', 'external_succeeded', 'finalized', 'compensation_required', 'failed'
  )),
  idempotency_operation_id uuid not null references public.idempotency_operations(id) on delete restrict,
  requested_by uuid not null references auth.users(id) on delete restrict,
  approval_operation_id uuid references public.idempotency_operations(id) on delete restrict,
  external_subject_hash text,
  error_code text,
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  unique (idempotency_operation_id)
);

alter table public.project_file_objects enable row level security;
alter table public.escritura_delivery_capabilities enable row level security;
alter table public.vendor_membership_operations enable row level security;

revoke all on public.project_file_objects from public, anon, authenticated;
revoke all on public.escritura_delivery_capabilities from public, anon, authenticated;
revoke all on public.vendor_membership_operations from public, anon, authenticated;
grant select, insert, update on public.project_file_objects to service_role;
grant select, insert, update on public.escritura_delivery_capabilities to service_role;
grant select, insert, update on public.vendor_membership_operations to service_role;

create or replace function public.commit_project_file_with_reference(
  p_file_id uuid,
  p_legal_document_id uuid,
  p_operation_id uuid,
  p_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file public.project_file_objects;
begin
  select * into v_file from public.project_file_objects where id = p_file_id for update;
  if v_file.id is null or v_file.status not in ('pending', 'repair_required') then
    raise exception 'STORAGE_REPAIR_REQUIRED';
  end if;
  update public.legal_documents
  set project_file_object_id = v_file.id, updated_at = now()
  where id = p_legal_document_id
    and organization_id = v_file.organization_id
    and project_id = v_file.project_id;
  if not found then
    update public.project_file_objects set status = 'repair_required', updated_at = now()
    where id = v_file.id;
    raise exception 'STORAGE_REPAIR_REQUIRED';
  end if;
  update public.project_file_objects set status = 'ready', updated_at = now() where id = v_file.id;
  insert into public.audit_logs (
    organization_id, actor, actor_user_id, action, entity, entity_id,
    operation_id, event_key, result, payload
  ) values (
    v_file.organization_id, 'user', p_actor_user_id, 'project_file_committed',
    'project_file_objects', v_file.id::text, p_operation_id,
    encode(extensions.digest('project_file_commit:' || v_file.id::text, 'sha256'), 'hex'),
    'succeeded', jsonb_build_object('project_id', v_file.project_id, 'file_id', v_file.id)
  );
  return v_file.id;
exception when others then
  if sqlerrm <> 'STORAGE_REPAIR_REQUIRED' then
    raise;
  end if;
  raise;
end;
$$;

create or replace function public.begin_vendor_membership_operation(
  p_organization_id uuid,
  p_target_user_id uuid,
  p_target_vendor_id uuid,
  p_target_project_id uuid,
  p_operation_kind text,
  p_idempotency_operation_id uuid,
  p_requested_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if not public.is_org_admin(p_organization_id) and not public.is_super_admin() then
    raise exception 'FORBIDDEN';
  end if;
  if p_operation_kind = 'delete_global_identity' then
    if not public.is_super_admin() or exists (
      select 1 from public.organization_members where user_id = p_target_user_id
    ) then
      raise exception 'GLOBAL_IDENTITY_DELETE_FORBIDDEN';
    end if;
  end if;
  insert into public.vendor_membership_operations (
    organization_id, target_user_id, target_vendor_id, target_project_id,
    operation_kind, idempotency_operation_id, requested_by
  ) values (
    p_organization_id, p_target_user_id, p_target_vendor_id, p_target_project_id,
    p_operation_kind, p_idempotency_operation_id, p_requested_by
  ) on conflict (idempotency_operation_id) do update
    set idempotency_operation_id = excluded.idempotency_operation_id
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.finalize_vendor_membership_operation(
  p_operation_id uuid,
  p_external_subject_hash text,
  p_succeeded boolean,
  p_error_code text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_op public.vendor_membership_operations;
begin
  select * into v_op from public.vendor_membership_operations
  where id = p_operation_id for update;
  if v_op.id is null then raise exception 'OPERATION_NOT_FOUND'; end if;
  if v_op.status = 'finalized' then return v_op.status; end if;
  if not p_succeeded then
    update public.vendor_membership_operations
    set status = 'compensation_required', error_code = p_error_code,
        external_subject_hash = p_external_subject_hash
    where id = v_op.id;
    insert into public.production_readiness_findings (
      fingerprint, organization_id, kind, severity, status, owner, impact, details
    ) values (
      encode(extensions.digest('vendor-auth-compensation:' || v_op.id::text, 'sha256'), 'hex'),
      v_op.organization_id, 'vendor_auth_compensation', 'blocking', 'open',
      'security', 'External Auth succeeded or failed without an atomic DB finalize',
      jsonb_build_object('operation_id', v_op.id, 'error_code', p_error_code)
    ) on conflict (fingerprint) do nothing;
    return 'compensation_required';
  end if;
  update public.vendor_membership_operations
  set status = 'finalized', external_subject_hash = p_external_subject_hash,
      finalized_at = now()
  where id = v_op.id;
  insert into public.audit_logs (
    organization_id, actor, action, entity, entity_id, operation_id,
    event_key, result, actor_user_id, payload
  ) values (
    v_op.organization_id, 'user', 'vendor_membership_finalized',
    'vendor_membership_operations', v_op.id::text, v_op.idempotency_operation_id,
    encode(extensions.digest('vendor_membership:' || v_op.id::text, 'sha256'), 'hex'),
    'succeeded', v_op.requested_by,
    jsonb_build_object('operation_kind', v_op.operation_kind)
  );
  return 'finalized';
end;
$$;

revoke all on function public.commit_project_file_with_reference(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.begin_vendor_membership_operation(uuid, uuid, uuid, uuid, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.finalize_vendor_membership_operation(uuid, text, boolean, text) from public, anon, authenticated;
grant execute on function public.commit_project_file_with_reference(uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.begin_vendor_membership_operation(uuid, uuid, uuid, uuid, text, uuid, uuid) to service_role;
grant execute on function public.finalize_vendor_membership_operation(uuid, text, boolean, text) to service_role;

comment on table public.project_file_objects is
  'Canonical private file metadata. Rollback is forward-fix only; never restore direct Storage access.';
comment on table public.escritura_delivery_capabilities is
  'Hash-only immutable capability issuances; plaintext is never persisted.';
