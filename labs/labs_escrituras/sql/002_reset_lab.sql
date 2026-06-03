-- Laboratorio de Escrituras reset.
-- WARNING: removes every lab artifact only. Does not touch public product tables.

delete from storage.objects where bucket_id = 'lab-escrituras-documents';
delete from storage.buckets where id = 'lab-escrituras-documents';
drop schema if exists lab_escrituras cascade;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    alter role authenticator set pgrst.db_schemas = 'public,storage,graphql_public';
  end if;
end $$;

notify pgrst, 'reload config';
