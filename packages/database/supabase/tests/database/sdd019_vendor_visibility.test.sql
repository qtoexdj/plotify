begin;

create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;
select plan(1);

create or replace function pg_temp.sdd019_vendor_visibility_failures()
returns text[]
language plpgsql
as $$
declare
  failures text[] := array[]::text[];
  definition text := coalesce(pg_get_functiondef(to_regprocedure('public.is_project_vendor(uuid)')), '');
  lots_select text;
  lots_update_using text;
  lots_update_check text;
begin
  if definition not ilike '%vendor_projects%'
     or definition not ilike '%vendors%active%'
     or definition not ilike '%projects%organization_id%'
     or definition not ilike '%vendors%organization_id%' then
    failures := array_append(
      failures,
      'is_project_vendor does not require active same-org vendor_projects membership'
    );
  end if;

  select qual into lots_select
  from pg_policies
  where schemaname = 'public' and tablename = 'lots' and cmd = 'SELECT'
  order by policyname
  limit 1;

  if lots_select is null or lots_select not ilike '%is_project_vendor(project_id)%' then
    failures := array_append(failures, 'lots inventory is not derived from vendor_projects');
  end if;
  if lots_select ilike '%vendedor_id%' then
    failures := array_append(failures, 'lots.vendedor_id incorrectly grants project inventory');
  end if;

  select qual, with_check into lots_update_using, lots_update_check
  from pg_policies
  where schemaname = 'public' and tablename = 'lots' and cmd = 'UPDATE'
  order by policyname
  limit 1;

  if lots_update_using ilike '%limit 1%'
     or lots_update_check is null
     or lots_update_check not ilike '%is_project_vendor(project_id)%' then
    failures := array_append(
      failures,
      'own-sensitive lot mutation is ambiguous or lacks assignment WITH CHECK'
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'vendor_projects'
      and cmd = 'DELETE' and coalesce(qual, '') ilike '%is_project_admin(project_id)%'
  ) then
    failures := array_append(failures, 'vendor assignment revoke is not project-admin scoped');
  end if;

  return failures;
end;
$$;

with assertion as materialized (
  select ok(
    cardinality(pg_temp.sdd019_vendor_visibility_failures()) = 0,
    'VENDOR_PROJECT_VISIBILITY_NOT_IMPLEMENTED: ' ||
      coalesce(array_to_string(pg_temp.sdd019_vendor_visibility_failures(), '; '), 'unknown')
  ) as tap_result
), completed as materialized (
  select * from finish()
)
select assertion.tap_result, completed.finish
from assertion
cross join completed;

rollback;
