begin;
set local search_path = public, extensions;
select plan(12);

select has_table('public', 'legal_approval_grants', 'legal approval grants exist');
select has_table('public', 'escritura_approval_attempts', 'approval attempts exist');
select has_table('public', 'escritura_semantic_validations', 'semantic validations exist');
select has_function('public', 'begin_matriz_approval', array['uuid','uuid','text','uuid','uuid','integer','integer','text','text','text','text'], 'begin approval RPC exists');
select has_function('public', 'finalize_matriz_approval', array['uuid','uuid','uuid'], 'finalize approval RPC exists');
select has_column('public', 'escritura_minuta_generations', 'semantic_validation_id', 'generation binds semantic validation');
select has_column('public', 'escritura_minuta_generations', 'generation_fingerprint', 'generation has immutable fingerprint');
select has_column('public', 'escritura_minuta_generations', 'readiness_status', 'history is explicitly verified or unverified');
select col_default_is('public', 'escritura_minuta_generations', 'readiness_status', 'unverified', 'historical default is unverified');
select is_empty($$select 1 from information_schema.role_table_grants where table_schema='public' and table_name='escritura_semantic_validations' and grantee='anon'$$, 'anon has no semantic table grants');
select is_empty($$select 1 from information_schema.role_routine_grants where routine_schema='public' and routine_name in ('begin_matriz_approval','finalize_matriz_approval') and grantee in ('anon','authenticated')$$, 'public roles cannot execute approval RPCs');
select results_eq($$select count(*)::bigint from public.escritura_minuta_generations where semantic_validation_id is null and readiness_status <> 'unverified'$$, array[0::bigint], 'legacy generations are never promoted');

select * from finish();
rollback;
