-- Borrado explícito, atómico y auditado de un proyecto con toda su evidencia.
--
-- SDD019 dejó las FK de geometría/archivos en `on delete restrict` a propósito:
-- nada debe borrarse por accidente ni en cascada silenciosa. Esta función NO
-- relaja esas FK; abre una única puerta deliberada, server-side, que exige el
-- nombre tipeado del proyecto y deja registro en audit_logs.
--
-- Estrategia: en vez de borrar a mano las ~30 tablas dependientes, se anulan
-- los enlaces `restrict` (incluidas dos auto-referencias) y se borran solo las
-- tablas que no tienen camino de cascada al proyecto. El `delete from projects`
-- final arrastra el resto por las FK `on delete cascade` ya existentes.

create or replace function public.delete_project_cascade(
  p_project_id uuid,
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_confirmed_name text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  proj public.projects;
  storage_objects jsonb;
  removed jsonb;
  audit_id uuid := gen_random_uuid();
begin
  select * into proj from public.projects
  where id = p_project_id and organization_id = p_organization_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'PROJECT_NOT_FOUND';
  end if;

  -- Última capa de confirmación, verificada en el servidor: el nombre tipeado
  -- debe calzar exacto. Sin esto las capas de la UI serían solo decorativas.
  if p_confirmed_name is distinct from proj.name then
    raise exception using errcode = '22023', message = 'PROJECT_NAME_MISMATCH';
  end if;

  -- El llamador necesita las rutas para vaciar el bucket: las filas se van en
  -- esta transacción, pero los blobs viven fuera de Postgres.
  select coalesce(
      jsonb_agg(jsonb_build_object('bucket', bucket, 'path', object_path)),
      '[]'::jsonb)
    into storage_objects
  from public.project_file_objects where project_id = p_project_id;

  removed := jsonb_build_object(
    'lots', (select count(*) from public.lots where project_id = p_project_id),
    'geometryImports', (select count(*) from public.geometry_imports where project_id = p_project_id),
    'files', (select count(*) from public.project_file_objects where project_id = p_project_id),
    'escrituraCases', (select count(*) from public.escritura_cases where project_id = p_project_id),
    'legalDocuments', (select count(*) from public.legal_documents where project_id = p_project_id),
    'titleAnalyses', (select count(*) from public.title_analyses where project_id = p_project_id)
  );

  -- 1. Romper los enlaces `restrict` sin borrar filas: lo que tiene cascada al
  --    proyecto se limpia solo al final.
  update public.geometries set import_id = null where project_id = p_project_id;
  update public.geometry_imports set supersedes_import_id = null where project_id = p_project_id;
  update public.legal_documents set project_file_object_id = null where project_id = p_project_id;
  update public.project_file_objects set replaces_file_id = null where project_id = p_project_id;

  -- 2. Borrar lo que no tiene camino de cascada (FK restrict / no action).
  --    El orden importa: cada tabla sale antes que aquello a lo que apunta.
  delete from public.geometry_assignment_history where project_id = p_project_id;
  delete from public.geometry_enrichment_jobs where project_id = p_project_id;
  delete from public.geometry_derivations where project_id = p_project_id;
  delete from public.project_road_segments where project_id = p_project_id;
  delete from public.escritura_signature_events where project_id = p_project_id;
  delete from public.geometry_imports where project_id = p_project_id;
  delete from public.project_file_objects where project_id = p_project_id;
  delete from public.feature_rollout_projects where project_id = p_project_id;
  delete from public.vendor_membership_operations where target_project_id = p_project_id;

  -- 3. El proyecto arrastra lotes, geometrías, escrituras, documentos legales,
  --    títulos y variables por las cascadas ya definidas.
  delete from public.projects where id = p_project_id;

  insert into public.audit_logs (
    id, actor, action, entity, entity_id, payload, organization_id, event_key, result
  ) values (
    audit_id,
    coalesce(p_actor_user_id::text, 'unknown'),
    'project.delete',
    'project',
    p_project_id::text,
    jsonb_build_object(
      'name', proj.name,
      'estado', proj.estado,
      'removed', removed,
      'storageObjects', jsonb_array_length(storage_objects),
      'reason', p_reason),
    p_organization_id,
    encode(extensions.digest(
      concat_ws('|', 'audit-v1', p_organization_id, 'project', p_project_id, 'delete'),
      'sha256'), 'hex'),
    'succeeded'
  );

  return jsonb_build_object(
    'projectId', p_project_id,
    'name', proj.name,
    'removed', removed,
    'storageObjects', storage_objects);
end;
$$;

revoke all on function public.delete_project_cascade(uuid, uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.delete_project_cascade(uuid, uuid, uuid, text, text)
  to service_role;

comment on function public.delete_project_cascade(uuid, uuid, uuid, text, text) is
  'Borrado deliberado de un proyecto y su evidencia. Exige nombre confirmado, audita en audit_logs y devuelve los objetos de storage que el llamador debe eliminar del bucket.';
