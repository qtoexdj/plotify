-- Laboratorio de Escrituras bootstrap.
-- Ejecutar solo en Supabase local:
-- docker exec -i supabase-db psql -U postgres -d postgres < labs/labs_escrituras/sql/001_bootstrap_lab.sql

create extension if not exists vector with schema extensions;

create schema if not exists lab_escrituras;

create table if not exists lab_escrituras.analysis_runs (
  id uuid primary key default gen_random_uuid(),
  run_type text not null default 'upload',
  status text not null default 'pending',
  parameters jsonb not null default '{}'::jsonb,
  error_message text,
  created_by uuid,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  constraint analysis_runs_status_check check (status in ('pending', 'processing', 'completed', 'failed')),
  constraint analysis_runs_type_check check (run_type in ('upload', 'process', 'extract', 'report', 'batch'))
);

create table if not exists lab_escrituras.source_documents (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references lab_escrituras.analysis_runs(id) on delete set null,
  original_filename text not null,
  document_type text not null default 'otro',
  source_format text not null default 'pdf',
  content_type text not null default 'application/pdf',
  size_bytes bigint not null default 0,
  sha256 text not null,
  storage_bucket text not null default 'lab-escrituras-documents',
  storage_path text not null,
  processing_status text not null default 'uploaded',
  detected_pdf_type text,
  detection_confidence numeric,
  page_count integer,
  pages_needing_ocr integer[] not null default '{}'::integer[],
  layout_metadata jsonb not null default '{}'::jsonb,
  error_message text,
  uploaded_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint source_documents_type_check check (document_type in ('escritura', 'dominio_vigente', 'roles_sii', 'plano', 'certificado_sag', 'personeria', 'otro')),
  constraint source_documents_source_format_check check (source_format in ('pdf', 'docx', 'doc', 'rtf')),
  constraint source_documents_status_check check (processing_status in ('uploaded', 'pending', 'processing', 'processed', 'needs_ocr', 'low_quality_extraction', 'failed'))
);

alter table lab_escrituras.source_documents
  add column if not exists source_format text not null default 'pdf';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'source_documents_source_format_check'
      and conrelid = 'lab_escrituras.source_documents'::regclass
  ) then
    alter table lab_escrituras.source_documents
      add constraint source_documents_source_format_check
      check (source_format in ('pdf', 'docx', 'doc', 'rtf'));
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'source_documents_status_check'
      and conrelid = 'lab_escrituras.source_documents'::regclass
  ) then
    alter table lab_escrituras.source_documents
      drop constraint source_documents_status_check;
  end if;

  alter table lab_escrituras.source_documents
    add constraint source_documents_status_check
    check (processing_status in ('uploaded', 'pending', 'processing', 'processed', 'needs_ocr', 'low_quality_extraction', 'failed'));
end $$;

create index if not exists source_documents_run_idx on lab_escrituras.source_documents(run_id);
create index if not exists source_documents_sha_idx on lab_escrituras.source_documents(sha256);
create index if not exists source_documents_status_idx on lab_escrituras.source_documents(processing_status, created_at desc);

create table if not exists lab_escrituras.document_pages (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references lab_escrituras.source_documents(id) on delete cascade,
  page_number integer not null,
  markdown text not null default '',
  raw_text text,
  needs_ocr boolean not null default false,
  has_encoding_issues boolean not null default false,
  is_complex_layout boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(document_id, page_number)
);

create index if not exists document_pages_document_idx on lab_escrituras.document_pages(document_id, page_number);

create table if not exists lab_escrituras.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references lab_escrituras.source_documents(id) on delete cascade,
  page_id uuid references lab_escrituras.document_pages(id) on delete cascade,
  chunk_index integer not null,
  section_label text,
  markdown text not null,
  token_estimate integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  embedding extensions.vector(1536),
  created_at timestamptz not null default now(),
  unique(document_id, chunk_index)
);

create index if not exists document_chunks_document_idx on lab_escrituras.document_chunks(document_id, chunk_index);
create index if not exists document_chunks_embedding_idx on lab_escrituras.document_chunks using ivfflat (embedding extensions.vector_cosine_ops) with (lists = 100) where embedding is not null;

create table if not exists lab_escrituras.extracted_variable_candidates (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references lab_escrituras.analysis_runs(id) on delete set null,
  document_id uuid references lab_escrituras.source_documents(id) on delete cascade,
  chunk_id uuid references lab_escrituras.document_chunks(id) on delete set null,
  canonical_variable text not null,
  proposed_value text,
  confidence numeric not null default 0,
  evidence text not null default '',
  future_source text not null default 'manual_review',
  source_table text,
  source_field text,
  status text not null default 'candidate',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint extracted_variable_status_check check (status in ('candidate', 'accepted_for_notes', 'rejected')),
  constraint extracted_variable_source_check check (future_source in ('project_legal_data', 'lots', 'lot_records', 'geometry', 'manual_review', 'future_model', 'unknown'))
);

create index if not exists extracted_variables_document_idx on lab_escrituras.extracted_variable_candidates(document_id, canonical_variable);

create table if not exists lab_escrituras.template_candidates (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references lab_escrituras.analysis_runs(id) on delete set null,
  name text not null default 'Escritura draft',
  document_type text not null default 'escritura',
  draft_markdown text not null,
  variables jsonb not null default '[]'::jsonb,
  status text not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint template_candidates_status_check check (status in ('draft', 'reviewed', 'archived'))
);

create table if not exists lab_escrituras.source_map_entries (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references lab_escrituras.analysis_runs(id) on delete set null,
  canonical_variable text not null,
  future_source text not null,
  source_table text,
  source_field text,
  rationale text not null default '',
  status text not null default 'proposed',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(run_id, canonical_variable),
  constraint source_map_status_check check (status in ('proposed', 'reviewed', 'rejected'))
);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'lab-escrituras-documents',
  'lab-escrituras-documents',
  false,
  52428800,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/rtf'
  ]
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

grant usage on schema lab_escrituras to service_role;
grant all privileges on all tables in schema lab_escrituras to service_role;
grant all privileges on all sequences in schema lab_escrituras to service_role;
alter default privileges in schema lab_escrituras grant all privileges on tables to service_role;
alter default privileges in schema lab_escrituras grant all privileges on sequences to service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    alter role authenticator set pgrst.db_schemas = 'public,storage,graphql_public,lab_escrituras';
  end if;
end $$;

notify pgrst, 'reload config';

comment on schema lab_escrituras is 'Local-only laboratory schema for escritura PDF analysis. Excluded from production migrations/deploy.';
