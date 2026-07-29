-- SDD019 US3: atomic projects and canonical, versioned geometry imports.
-- Rollback is forward-fix only after first use: immutable imports, assignment
-- history and source evidence must be retained. Before use, new objects may be
-- dropped in reverse dependency order.

alter default privileges for role postgres in schema public revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on functions from public, anon, authenticated, service_role;

create table public.geometry_imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  source_file_id uuid references public.project_file_objects(id) on delete restrict,
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  source_type public.source_type not null,
  version integer not null check (version > 0),
  feature_count integer not null check (feature_count between 1 and 10000),
  status text not null default 'active' check (status in ('active','superseded','finding')),
  supersedes_import_id uuid references public.geometry_imports(id) on delete restrict,
  superseded_at timestamptz,
  operation_id uuid not null references public.idempotency_operations(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check ((status = 'active' and superseded_at is null) or status <> 'active'),
  unique (project_id, version)
);
create unique index geometry_imports_one_active_project_uidx
  on public.geometry_imports(project_id) where superseded_at is null and status = 'active';
create index geometry_imports_source_idx on public.geometry_imports(project_id, source_sha256, created_at desc);
create unique index project_file_objects_geometry_content_uidx
  on public.project_file_objects(project_id, category, source_sha256)
  where category = 'geometry_source' and status = 'ready';

alter table public.geometries add column import_id uuid references public.geometry_imports(id) on delete restrict;
alter table public.geometries add column feature_key text;
alter table public.geometries add column source_feature_index integer;
alter table public.geometries add column content_hash text;
alter table public.geometries add column active boolean not null default true;
alter table public.geometries add constraint geometries_content_hash_check
  check (content_hash is null or content_hash ~ '^[a-f0-9]{64}$');
create unique index geometries_import_feature_uidx on public.geometries(import_id, feature_key)
  where import_id is not null;
create index geometries_project_active_idx on public.geometries(project_id, active, geometry_type);
create unique index lots_one_active_geometry_uidx on public.lots(geometry_id) where geometry_id is not null;
create unique index geometries_one_active_lot_uidx on public.geometries(lot_id) where lot_id is not null and active;

create table public.geometry_assignment_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  lot_id uuid not null references public.lots(id) on delete restrict,
  geometry_id uuid references public.geometries(id) on delete restrict,
  previous_geometry_id uuid references public.geometries(id) on delete restrict,
  action text not null check (action in ('assigned','reassigned','detached','import_superseded')),
  operation_id uuid not null references public.idempotency_operations(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index geometry_assignment_history_lot_idx on public.geometry_assignment_history(lot_id, created_at desc);

create table public.geometry_derivations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  derivation_type text not null check (derivation_type in ('road','common_area')),
  source_geometry_ids uuid[] not null check (cardinality(source_geometry_ids) > 0),
  source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
  config jsonb not null default '{}'::jsonb,
  config_hash text not null check (config_hash ~ '^[a-f0-9]{64}$'),
  result jsonb,
  status text not null default 'pending' check (status in ('pending','ready','failed','invalidated')),
  operation_id uuid not null references public.idempotency_operations(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, derivation_type, source_hash, config_hash)
);

create table public.geometry_enrichment_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  lot_id uuid references public.lots(id) on delete restrict,
  geometry_id uuid references public.geometries(id) on delete restrict,
  derivation_id uuid references public.geometry_derivations(id) on delete restrict,
  job_kind text not null check (job_kind in ('lot_metrics','project_infrastructure','servidumbre')),
  status text not null default 'pending' check (status in ('pending','leased','retry_scheduled','ready','dead_letter')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 8),
  available_at timestamptz not null default now(),
  lease_owner text,
  lease_expires_at timestamptz,
  last_error_code text,
  operation_id uuid not null references public.idempotency_operations(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check ((status = 'leased') = (lease_owner is not null and lease_expires_at is not null))
);
create index geometry_enrichment_jobs_claim_idx
  on public.geometry_enrichment_jobs(status, available_at, created_at)
  where status in ('pending','retry_scheduled','leased');

alter table public.geometry_imports enable row level security;
alter table public.geometry_assignment_history enable row level security;
alter table public.geometry_derivations enable row level security;
alter table public.geometry_enrichment_jobs enable row level security;
revoke all on public.geometry_imports, public.geometry_assignment_history, public.geometry_derivations, public.geometry_enrichment_jobs from public, anon, authenticated;
grant select, insert, update on public.geometry_imports, public.geometry_assignment_history, public.geometry_derivations, public.geometry_enrichment_jobs to service_role;

create or replace function public.create_project_with_lots(
  p_organization_id uuid, p_actor_user_id uuid, p_operation_id uuid,
  p_name text, p_region text, p_comuna text, p_descripcion text,
  p_total_lotes integer, p_lot_prefix text, p_precio numeric, p_valor_reserva numeric
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_project public.projects; v_lots jsonb;
begin
  if p_total_lotes is null or p_total_lotes < 1 or p_total_lotes > 100 then
    raise exception using errcode='22023', message='PROJECT_LOT_COUNT_LIMIT';
  end if;
  if not exists (select 1 from public.organization_members m where m.organization_id=p_organization_id and m.user_id=p_actor_user_id and m.role='admin') then
    raise exception using errcode='42501', message='WORKSPACE_FORBIDDEN';
  end if;
  insert into public.projects(name,region,comuna,descripcion,total_lotes,organization_id,estado)
  values(trim(p_name),p_region,p_comuna,nullif(trim(p_descripcion),''),p_total_lotes,p_organization_id,'draft') returning * into v_project;
  insert into public.lots(project_id,numero_lote,estado,precio,valor_reserva)
  select v_project.id, coalesce(p_lot_prefix,'Lote ') || n, 'disponible', p_precio, p_valor_reserva
  from generate_series(1,p_total_lotes) n;
  select jsonb_agg(to_jsonb(l) order by l.numero_lote) into v_lots from public.lots l where l.project_id=v_project.id;
  insert into public.audit_logs(organization_id,actor,actor_user_id,action,entity,entity_id,operation_id,event_key,result,payload)
  values(p_organization_id,'user',p_actor_user_id,'project.create','projects',v_project.id::text,p_operation_id,
    encode(extensions.digest('project.create:'||p_operation_id::text,'sha256'),'hex'),'succeeded',jsonb_build_object('lot_count',p_total_lotes));
  return jsonb_build_object('project',to_jsonb(v_project),'lots',coalesce(v_lots,'[]'::jsonb));
end $$;

create or replace function public.commit_geometry_import(
  p_organization_id uuid, p_project_id uuid, p_source_file_id uuid, p_source_sha256 text,
  p_source_type public.source_type, p_features jsonb, p_operation_id uuid, p_actor_user_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_import public.geometry_imports; v_feature jsonb; v_index integer:=0; v_ids jsonb:='[]'::jsonb; v_id uuid; v_key text;
begin
  if not exists(select 1 from public.projects where id=p_project_id and organization_id=p_organization_id) then raise exception 'RESOURCE_NOT_FOUND'; end if;
  if not exists(select 1 from public.project_file_objects where id=p_source_file_id and organization_id=p_organization_id and project_id=p_project_id and category='geometry_source' and status='ready' and source_sha256=p_source_sha256) then raise exception 'SOURCE_FILE_SCOPE_MISMATCH'; end if;
  if jsonb_typeof(p_features) <> 'array' or jsonb_array_length(p_features) < 1 or jsonb_array_length(p_features)>10000 then raise exception 'FEATURE_COUNT_LIMIT'; end if;
  if exists(select 1 from public.geometry_imports where project_id=p_project_id and status='active' and superseded_at is null) then raise exception 'IMPORT_VERSION_CONFLICT'; end if;
  insert into public.geometry_imports(organization_id,project_id,source_file_id,source_sha256,source_type,version,feature_count,operation_id,created_by)
  values(p_organization_id,p_project_id,p_source_file_id,p_source_sha256,p_source_type,1,jsonb_array_length(p_features),p_operation_id,p_actor_user_id) returning * into v_import;
  for v_feature in select value from jsonb_array_elements(p_features) loop
    v_key:=coalesce(nullif(v_feature->>'featureKey',''), encode(extensions.digest(p_source_sha256||':'||v_index,'sha256'),'hex'));
    insert into public.geometries(project_id,geometry,source_type,properties,geometry_type,name,is_assigned,import_id,feature_key,source_feature_index,content_hash,active)
    values(p_project_id,v_feature->'geometry',p_source_type,coalesce(v_feature->'properties','{}'::jsonb),(v_feature->>'geometryType')::public.geometry_type,v_feature->>'name',false,v_import.id,v_key,v_index,encode(extensions.digest((v_feature->'geometry')::text,'sha256'),'hex'),true)
    returning id into v_id;
    v_ids:=v_ids||jsonb_build_array(jsonb_build_object('geometryId',v_id,'featureKey',v_key,'geometryType',v_feature->>'geometryType'));
    v_index:=v_index+1;
  end loop;
  return jsonb_build_object('importId',v_import.id,'version',v_import.version,'sourceSha256',v_import.source_sha256,'features',v_ids);
end $$;

create or replace function public.assign_project_geometry(
  p_organization_id uuid, p_project_id uuid, p_lot_id uuid, p_geometry_id uuid,
  p_expected_geometry_id uuid, p_operation_id uuid, p_actor_user_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_lot public.lots; v_geometry public.geometries; v_action text; v_job uuid;
begin
  select * into v_lot from public.lots where id=p_lot_id and project_id=p_project_id for update;
  if v_lot.id is null or not exists(select 1 from public.projects where id=p_project_id and organization_id=p_organization_id) then raise exception 'RESOURCE_NOT_FOUND'; end if;
  if v_lot.geometry_id is distinct from p_expected_geometry_id then raise exception using errcode='40001', message='LOT_GEOMETRY_CONFLICT'; end if;
  if p_geometry_id is not null then
    select * into v_geometry from public.geometries where id=p_geometry_id and project_id=p_project_id and active for update;
    if v_geometry.id is null or v_geometry.geometry_type <> 'lot' then raise exception 'GEOMETRY_NOT_ASSIGNABLE'; end if;
    if exists(select 1 from public.lots where geometry_id=p_geometry_id and id<>p_lot_id) then raise exception using errcode='23505', message='LOT_GEOMETRY_CONFLICT'; end if;
  end if;
  v_action:=case when p_geometry_id is null then 'detached' when v_lot.geometry_id is null then 'assigned' else 'reassigned' end;
  update public.geometries set lot_id=null,is_assigned=false,updated_at=now() where id=v_lot.geometry_id and id is distinct from p_geometry_id;
  update public.lots set geometry_id=p_geometry_id,m2=null,servidumbre_calculation_status='not_calculated',updated_at=now() where id=p_lot_id;
  if p_geometry_id is not null then update public.geometries set lot_id=p_lot_id,is_assigned=true,updated_at=now() where id=p_geometry_id; end if;
  insert into public.geometry_assignment_history(organization_id,project_id,lot_id,geometry_id,previous_geometry_id,action,operation_id,actor_user_id)
  values(p_organization_id,p_project_id,p_lot_id,p_geometry_id,v_lot.geometry_id,v_action,p_operation_id,p_actor_user_id);
  if p_geometry_id is not null then
    insert into public.geometry_enrichment_jobs(organization_id,project_id,lot_id,geometry_id,job_kind,operation_id)
    values(p_organization_id,p_project_id,p_lot_id,p_geometry_id,'lot_metrics',p_operation_id) returning id into v_job;
  end if;
  return jsonb_build_object('geometryId',p_geometry_id,'lotId',p_lot_id,'assignmentStatus','committed','enrichmentStatus',case when p_geometry_id is null then 'not_required' else 'pending' end,'enrichmentJobId',v_job);
end $$;

create or replace function public.commit_project_infrastructure(
  p_organization_id uuid, p_project_id uuid, p_derivation_type text, p_source_geometry_ids uuid[],
  p_config jsonb, p_source_hash text, p_config_hash text, p_operation_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_derivation public.geometry_derivations; v_job uuid;
begin
  if p_derivation_type not in ('road','common_area') or cardinality(p_source_geometry_ids)<1 then raise exception 'INVALID_DERIVATION'; end if;
  if exists(select 1 from unnest(p_source_geometry_ids) as source_id(id) left join public.geometries g on g.id=source_id.id and g.project_id=p_project_id and g.active where g.id is null) then raise exception 'SOURCE_GEOMETRY_NOT_FOUND'; end if;
  insert into public.geometry_derivations(organization_id,project_id,derivation_type,source_geometry_ids,source_hash,config,config_hash,operation_id)
  values(p_organization_id,p_project_id,p_derivation_type,p_source_geometry_ids,p_source_hash,coalesce(p_config,'{}'::jsonb),p_config_hash,p_operation_id)
  on conflict(project_id,derivation_type,source_hash,config_hash) do update set updated_at=public.geometry_derivations.updated_at returning * into v_derivation;
  insert into public.geometry_enrichment_jobs(organization_id,project_id,derivation_id,job_kind,operation_id)
  values(p_organization_id,p_project_id,v_derivation.id,'project_infrastructure',p_operation_id) returning id into v_job;
  return jsonb_build_object('derivationId',v_derivation.id,'assignmentStatus','committed','enrichmentStatus','pending','enrichmentJobId',v_job);
end $$;

create or replace function public.supersede_geometry_import(
  p_organization_id uuid, p_project_id uuid, p_expected_source_sha256 text,
  p_source_file_id uuid, p_source_sha256 text, p_source_type public.source_type,
  p_features jsonb, p_operation_id uuid, p_actor_user_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_old public.geometry_imports; v_new public.geometry_imports; v_feature jsonb; v_index integer:=0; v_id uuid; v_ids jsonb:='[]'::jsonb; v_key text;
begin
  select * into v_old from public.geometry_imports where project_id=p_project_id and status='active' and superseded_at is null for update;
  if v_old.id is null or v_old.source_sha256<>p_expected_source_sha256 then raise exception using errcode='40001', message='IMPORT_VERSION_CONFLICT'; end if;
  if v_old.organization_id<>p_organization_id or not exists(select 1 from public.project_file_objects where id=p_source_file_id and organization_id=p_organization_id and project_id=p_project_id and category='geometry_source' and status='ready' and source_sha256=p_source_sha256) then raise exception 'SOURCE_FILE_SCOPE_MISMATCH'; end if;
  if jsonb_typeof(p_features)<>'array' or jsonb_array_length(p_features)<1 or jsonb_array_length(p_features)>10000 then raise exception 'FEATURE_COUNT_LIMIT'; end if;
  insert into public.geometry_assignment_history(organization_id,project_id,lot_id,geometry_id,previous_geometry_id,action,operation_id,actor_user_id)
    select p_organization_id,p_project_id,h.id,null,h.geometry_id,'import_superseded',p_operation_id,p_actor_user_id from public.lots h where h.project_id=p_project_id and h.geometry_id in(select id from public.geometries where import_id=v_old.id);
  update public.lots l set geometry_id=null,m2=null,servidumbre_calculation_status='not_calculated',updated_at=now()
    where l.project_id=p_project_id and l.geometry_id in(select id from public.geometries where import_id=v_old.id);
  update public.geometries set lot_id=null,is_assigned=false,active=false,updated_at=now() where import_id=v_old.id;
  update public.geometry_derivations set status='invalidated',updated_at=now() where project_id=p_project_id and status in('pending','ready','failed');
  update public.geometry_imports set status='superseded',superseded_at=now() where id=v_old.id;
  insert into public.geometry_imports(organization_id,project_id,source_file_id,source_sha256,source_type,version,feature_count,supersedes_import_id,operation_id,created_by)
  values(p_organization_id,p_project_id,p_source_file_id,p_source_sha256,p_source_type,v_old.version+1,jsonb_array_length(p_features),v_old.id,p_operation_id,p_actor_user_id) returning * into v_new;
  for v_feature in select value from jsonb_array_elements(p_features) loop
    v_key:=coalesce(nullif(v_feature->>'featureKey',''),encode(extensions.digest(p_source_sha256||':'||v_index,'sha256'),'hex'));
    insert into public.geometries(project_id,geometry,source_type,properties,geometry_type,name,is_assigned,import_id,feature_key,source_feature_index,content_hash,active)
    values(p_project_id,v_feature->'geometry',p_source_type,coalesce(v_feature->'properties','{}'::jsonb),(v_feature->>'geometryType')::public.geometry_type,v_feature->>'name',false,v_new.id,v_key,v_index,encode(extensions.digest((v_feature->'geometry')::text,'sha256'),'hex'),true) returning id into v_id;
    v_ids:=v_ids||jsonb_build_array(jsonb_build_object('geometryId',v_id,'featureKey',v_key,'geometryType',v_feature->>'geometryType')); v_index:=v_index+1;
  end loop;
  return jsonb_build_object('importId',v_new.id,'version',v_new.version,'sourceSha256',v_new.source_sha256,'features',v_ids,'supersededImportId',v_old.id);
end $$;

create or replace function public.claim_geometry_enrichment_job(p_worker_id text)
returns public.geometry_enrichment_jobs language plpgsql security definer set search_path='' as $$
declare v_job public.geometry_enrichment_jobs;
begin
  update public.geometry_enrichment_jobs set status='dead_letter',lease_owner=null,lease_expires_at=null,last_error_code='MAX_ATTEMPTS',updated_at=now()
    where status='leased' and lease_expires_at<now() and attempt_count>=8;
  select * into v_job from public.geometry_enrichment_jobs where
    attempt_count<8 and ((status in('pending','retry_scheduled') and available_at<=now()) or (status='leased' and lease_expires_at<now()))
    order by available_at,created_at for update skip locked limit 1;
  if v_job.id is null then return null; end if;
  update public.geometry_enrichment_jobs set status='leased',lease_owner=p_worker_id,lease_expires_at=now()+interval '60 seconds',attempt_count=attempt_count+1,updated_at=now() where id=v_job.id returning * into v_job;
  return v_job;
end $$;

revoke all on function public.create_project_with_lots(uuid,uuid,uuid,text,text,text,text,integer,text,numeric,numeric) from public,anon,authenticated;
revoke all on function public.commit_geometry_import(uuid,uuid,uuid,text,public.source_type,jsonb,uuid,uuid) from public,anon,authenticated;
revoke all on function public.assign_project_geometry(uuid,uuid,uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.commit_project_infrastructure(uuid,uuid,text,uuid[],jsonb,text,text,uuid) from public,anon,authenticated;
revoke all on function public.supersede_geometry_import(uuid,uuid,text,uuid,text,public.source_type,jsonb,uuid,uuid) from public,anon,authenticated;
revoke all on function public.claim_geometry_enrichment_job(text) from public,anon,authenticated;
grant execute on function public.create_project_with_lots(uuid,uuid,uuid,text,text,text,text,integer,text,numeric,numeric) to service_role;
grant execute on function public.commit_geometry_import(uuid,uuid,uuid,text,public.source_type,jsonb,uuid,uuid) to service_role;
grant execute on function public.assign_project_geometry(uuid,uuid,uuid,uuid,uuid,uuid,uuid) to service_role;
grant execute on function public.commit_project_infrastructure(uuid,uuid,text,uuid[],jsonb,text,text,uuid) to service_role;
grant execute on function public.supersede_geometry_import(uuid,uuid,text,uuid,text,public.source_type,jsonb,uuid,uuid) to service_role;
grant execute on function public.claim_geometry_enrichment_job(text) to service_role;

insert into public.production_readiness_findings(fingerprint,kind,severity,resource_type,details,status,owner,impact,budget)
select encode(extensions.digest('sdd019:legacy_geometry:'||g.project_id::text,'sha256'),'hex'),'legacy_geometry_without_import','blocking','project',jsonb_build_object('projectId',g.project_id,'geometryCount',count(*)),'open','platform','Canonical import provenance must be reconciled before readiness','before rollout'
from public.geometries g where g.import_id is null group by g.project_id on conflict(fingerprint) do nothing;
