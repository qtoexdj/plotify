begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;
select plan(1);

create or replace function pg_temp.sdd019_geometry_failures()
returns text[] language plpgsql as $$
declare
  failures text[] := array[]::text[];
  name text;
begin
  foreach name in array array[
    'geometry_imports', 'geometry_assignment_history', 'geometry_derivations',
    'geometry_enrichment_jobs'
  ] loop
    if to_regclass('public.' || name) is null then
      failures := array_append(failures, 'missing relation ' || name);
    end if;
  end loop;
  foreach name in array array[
    'create_project_with_lots', 'commit_geometry_import', 'assign_project_geometry',
    'commit_project_infrastructure', 'supersede_geometry_import'
  ] loop
    if not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = name
    ) then failures := array_append(failures, 'missing function ' || name); end if;
  end loop;
  if not exists (
    select 1 from pg_indexes where schemaname='public' and tablename='geometry_imports'
      and indexdef ilike 'create unique index%' and indexdef ilike '%project_id%where%superseded_at is null%'
  ) then failures := array_append(failures, 'one active import invariant absent'); end if;
  if not exists (
    select 1 from pg_indexes where schemaname='public' and tablename='lots'
      and indexdef ilike 'create unique index%' and indexdef ilike '%geometry_id%where%geometry_id is not null%'
  ) then failures := array_append(failures, 'one active geometry per lot invariant absent'); end if;
  return failures;
end $$;

with assertion as materialized (
  select ok(cardinality(pg_temp.sdd019_geometry_failures()) = 0,
    'create_project_with_lots: ' || coalesce(array_to_string(pg_temp.sdd019_geometry_failures(), '; '), 'unknown')) tap
), completed as materialized (select * from finish())
select assertion.tap, completed.finish from assertion cross join completed;
rollback;
