begin;

create extension if not exists pgtap with schema extensions;

set search_path to public, extensions;

select plan(1);

create or replace function pg_temp.sdd019_security_boundary_failures()
returns text[]
language plpgsql
as $$
declare
  failures text[] := array[]::text[];
  bucket_name text;
  helper_signature regprocedure;
begin
  -- Public delivery of a known avatar key is a bucket concern. A SELECT policy
  -- on storage.objects also authorizes enumeration and is therefore forbidden.
  if not exists (
    select 1 from storage.buckets where id = 'avatars' and public
  ) then
    failures := array_append(failures, 'avatars does not permit known-object public reads');
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and cmd in ('SELECT', 'ALL')
      and coalesce(qual, '') ilike '%avatars%'
  ) then
    failures := array_append(failures, 'avatars metadata can be globally enumerated');
  end if;

  foreach bucket_name in array array['project-files', 'documents'] loop
    if not exists (
      select 1 from storage.buckets where id = bucket_name and not public
    ) then
      failures := array_append(failures, bucket_name || ' is not private');
    end if;

    if exists (
      select 1
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and roles && array['public', 'anon', 'authenticated']::name[]
        and (
          coalesce(qual, '') ilike '%' || bucket_name || '%'
          or coalesce(with_check, '') ilike '%' || bucket_name || '%'
        )
    ) then
      failures := array_append(failures, bucket_name || ' still has a direct browser Storage policy');
    end if;
  end loop;

  -- Avatar writes must remain authenticated and owner-bound in both halves of
  -- UPDATE. The owner predicate prevents another authenticated user replacing
  -- or deleting an opaque key they happen to know.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and cmd = 'INSERT' and roles = array['authenticated']::name[]
      and coalesce(with_check, '') ilike '%avatars%'
      and coalesce(with_check, '') ilike '%auth.uid()%owner%'
  ) then
    failures := array_append(failures, 'avatar insert is not authenticated and owner-bound');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and cmd = 'UPDATE' and roles = array['authenticated']::name[]
      and coalesce(qual, '') ilike '%avatars%'
      and coalesce(qual, '') ilike '%auth.uid()%owner%'
      and coalesce(with_check, '') ilike '%avatars%'
      and coalesce(with_check, '') ilike '%auth.uid()%owner%'
  ) then
    failures := array_append(failures, 'avatar update lacks owner-bound USING/WITH CHECK');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and cmd = 'DELETE' and roles = array['authenticated']::name[]
      and coalesce(qual, '') ilike '%avatars%'
      and coalesce(qual, '') ilike '%auth.uid()%owner%'
  ) then
    failures := array_append(failures, 'avatar delete is not authenticated and owner-bound');
  end if;

  -- PUBLIC execute is independent from RLS. These helpers currently participate
  -- in tenant/storage policies and must never be callable by an anonymous role.
  foreach helper_signature in array array[
    to_regprocedure('public.can_read_project_files(text)'),
    to_regprocedure('public.is_org_admin(uuid)'),
    to_regprocedure('public.is_super_admin()')
  ] loop
    if helper_signature is null then
      failures := array_append(failures, 'required RLS helper is missing');
    elsif has_function_privilege('public', helper_signature, 'execute')
       or has_function_privilege('anon', helper_signature, 'execute') then
      failures := array_append(failures, helper_signature::text || ' is executable by PUBLIC/anon');
    end if;
  end loop;

  return failures;
end;
$$;

with assertion as materialized (
  select ok(
    cardinality(pg_temp.sdd019_security_boundary_failures()) = 0,
    'US1_SECURITY_BOUNDARY_NOT_IMPLEMENTED: ' ||
      coalesce(array_to_string(pg_temp.sdd019_security_boundary_failures(), '; '), 'unknown')
  ) as tap_result
), completed as materialized (
  select * from finish()
)
select assertion.tap_result, completed.finish
from assertion
cross join completed;

rollback;
