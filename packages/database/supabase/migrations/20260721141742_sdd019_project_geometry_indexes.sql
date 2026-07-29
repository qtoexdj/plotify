-- SDD019 US3 follow-up: cover every FK introduced by the canonical geometry
-- model. These indexes are additive and preserve the immutable history model.
create index geometry_imports_organization_idx on public.geometry_imports(organization_id);
create index geometry_imports_source_file_idx on public.geometry_imports(source_file_id) where source_file_id is not null;
create index geometry_imports_supersedes_idx on public.geometry_imports(supersedes_import_id) where supersedes_import_id is not null;
create index geometry_imports_operation_idx on public.geometry_imports(operation_id);
create index geometry_imports_created_by_idx on public.geometry_imports(created_by);

create index geometry_assignment_history_organization_idx on public.geometry_assignment_history(organization_id);
create index geometry_assignment_history_project_idx on public.geometry_assignment_history(project_id);
create index geometry_assignment_history_geometry_idx on public.geometry_assignment_history(geometry_id) where geometry_id is not null;
create index geometry_assignment_history_previous_geometry_idx on public.geometry_assignment_history(previous_geometry_id) where previous_geometry_id is not null;
create index geometry_assignment_history_operation_idx on public.geometry_assignment_history(operation_id);
create index geometry_assignment_history_actor_idx on public.geometry_assignment_history(actor_user_id);

create index geometry_derivations_organization_idx on public.geometry_derivations(organization_id);
create index geometry_derivations_operation_idx on public.geometry_derivations(operation_id);

create index geometry_enrichment_jobs_organization_idx on public.geometry_enrichment_jobs(organization_id);
create index geometry_enrichment_jobs_project_idx on public.geometry_enrichment_jobs(project_id);
create index geometry_enrichment_jobs_lot_idx on public.geometry_enrichment_jobs(lot_id) where lot_id is not null;
create index geometry_enrichment_jobs_geometry_idx on public.geometry_enrichment_jobs(geometry_id) where geometry_id is not null;
create index geometry_enrichment_jobs_derivation_idx on public.geometry_enrichment_jobs(derivation_id) where derivation_id is not null;
create index geometry_enrichment_jobs_operation_idx on public.geometry_enrichment_jobs(operation_id);
