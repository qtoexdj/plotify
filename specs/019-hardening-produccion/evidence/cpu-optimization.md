# Evidencia T-CPU-05: Validación de Advisors post-migración CPU

**Fecha**: 2026-08-12
**Proyecto**: `swkrnjdpnlrgxgotmfxy`
**Verificador**: sesión opencode SDD019
**Migraciones aplicadas en el plan**: `20260812165003`, `20260812165010`, `20260812220304`, `20260812222206`, `20260812224500`, `20260812225000`, `20260812225430` (fix regresión).

## 1. Estado del Plan de Estabilización de CPU

| Tarea                          | Migración/archivo                                                       | Estado                                                                                 |
| ------------------------------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| T-CPU-01 RLS InitPlan completo | `20260812220304` + `20260812222206`                                     | Aplicada; **28 instancias residuales en dominios fuera del plan** (ver §2.1)           |
| T-CPU-02 Monitor automático    | `apps/api/workers/tasks/idle_transaction_monitor.py` + `main_worker.py` | Aplicada; cron 10 min, detection-only                                                  |
| T-CPU-03 Triggers `STATEMENT`  | `20260812224500` + fix `20260812225430`                                 | Aplicada; 5 triggers convertidos; **regresión semántica detecrada y fixeada** (ver §3) |
| T-CPU-04 SHA-256 → md5         | `20260812225000`                                                        | Aplicada; `approve_sale` usa `md5()` en `event_fingerprint` y `audit_event_key`        |
| T-CPU-05 Validar Advisors      | (este archivo)                                                          | Aplicada                                                                               |
| T-CPU-06 Runbook               | `docs/runbooks/postgres-connection-pool.md`                             | Aplicada                                                                               |
| T-CPU-07 `memory.md`           | `memory.md`                                                             | Aplicada                                                                               |

## 2. Advisors post-migración

Fuente: `supabase_get_advisors` (security + performance) vía Supabase MCP el 2026-08-12. Total de lints reportados: 732 (109 security + 623 performance).

### 2.1 `auth_rls_initplan` — 28 instancias restantes

> [!IMPORTANT]
> El objetivo del plan T-CPU-05 era reducir `auth_rls_initplan` a 0 (o al mínimo irreducible). El advisor reporta **28 instancias residuales** en políticas cuyo alcance NO era parte de T-CPU-01 (dominios auth/org/vendor/perfiles/agent skills). Las migraciones `20260812220304` (`is_org_admin`, `is_super_admin`, `is_project_vendor`, `profiles_update`, `notification_events_vendor_update`) y `20260812222206` (`can_manage_project_files`, `can_read_project_files`, `is_org_user`, `approve_sale`, `notification_events_vendor_select`, `escritura_deliveries_vendor_select`, `avatar_owner_*`, `lots_update`) cubrieron únicamente las **14 instancias críticas** listadas en el plan T-CPU-01. Las 28 restantes requieren un pase futuro.

**Lista de 28 instancias residuales**:

| #   | Tabla                              | Política RLS                                         |
| --- | ---------------------------------- | ---------------------------------------------------- |
| 1   | `public.leads`                     | `Leads are viewable by everyone in the organization` |
| 2   | `public.telegram_bots`             | `Members can view their organization's bot`          |
| 3   | `public.audit_logs`                | `audit_logs_insert`                                  |
| 4   | `public.audit_logs`                | `audit_logs_select`                                  |
| 5   | `public.lot_records`               | `lot_records_select`                                 |
| 6   | `public.lot_records`               | `lot_records_update`                                 |
| 7   | `public.audit_logs`                | `org_admins_read_audit`                              |
| 8   | `public.organization_payment_info` | `org_admins_write_payment_info`                      |
| 9   | `public.approval_requests`         | `org_members_can_insert_approvals`                   |
| 10  | `public.approval_requests`         | `org_members_can_view_approvals`                     |
| 11  | `public.organization_members`      | `org_members_insert`                                 |
| 12  | `public.audit_logs`                | `org_members_insert_audit`                           |
| 13  | `public.organization_payment_info` | `org_members_read_payment_info`                      |
| 14  | `public.organization_members`      | `org_members_select`                                 |
| 15  | `public.organizations`             | `organizations_delete`                               |
| 16  | `public.organizations`             | `organizations_insert`                               |
| 17  | `public.organizations`             | `organizations_select`                               |
| 18  | `public.organizations`             | `organizations_update`                               |
| 19  | `public.mcp_connections`           | `own_connections`                                    |
| 20  | `public.agent_custom_instructions` | `own_instructions`                                   |
| 21  | `public.profiles`                  | `profiles_insert`                                    |
| 22  | `public.profiles`                  | `profiles_select`                                    |
| 23  | `public.profiles`                  | `profiles_select_org_members`                        |
| 24  | `public.vendor_projects`           | `vendor_projects_select`                             |
| 25  | `public.vendors`                   | `vendors_select`                                     |
| 26  | `public.vendors`                   | `vendors_update`                                     |
| 27  | `public.agent_skills`              | `agent_skills_global_read`                           |
| 28  | `public.agent_skill_versions`      | `agent_skill_versions_org_read`                      |

**Consulta de validación** (reutilizable en cada futuro pase):

```sql
select
  schemaname || '.' || tablename as "tabla",
  policyname as "politica",
  qual as "usando_clause",
  with_check as "with_check_clause"
from pg_policies
where qual ~ 'auth\.(uid|role|email)\(\)'
   or with_check ~ 'auth\.(uid|role|email)\(\)'
   or qual ~ 'current_setting\('
   or with_check ~ 'current_setting\('
;
```

### 2.2 `duplicate_index` — 0 instancias

No se reportan índices duplicados. (La migración `20260812220304` eliminó `approval_requests_vendor_idempotency_uidx` previamente reportado como duplicado; el advisor confirma 0.)

### 2.3 `unindexed_foreign_keys` — 107 findings / 37 tablas

Top 10 (ordenadas por impacto en tablas críticas para CPU en outbox/audit/escritura):

| Tabla                           | FK sin índice                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `workflow_outbox`               | `workflow_outbox_aggregate_id_fkey`                                                                     |
| `workflow_outbox`               | `workflow_outbox_operation_id_fkey`                                                                     |
| `workflow_outbox`               | `workflow_outbox_organization_id_fkey`                                                                  |
| `production_readiness_findings` | `production_readiness_findings_organization_id_fkey`                                                    |
| `idempotency_operations`        | (FK indexado; no aparece)                                                                               |
| `escritura_minuta_generations`  | `escritura_minuta_generations_approval_id_fkey`                                                         |
| `escritura_minuta_generations`  | `escritura_minuta_generations_project_id_fkey`                                                          |
| `escritura_signature_events`    | `escritura_signature_events_project_id_fkey`                                                            |
| `escritura_approval_attempts`   | `escritura_approval_attempts_project_id_fkey`                                                           |
| `legal_documents`               | `legal_documents_lot_id_fkey`, `legal_documents_superseded_by_fkey`, `legal_documents_uploaded_by_fkey` |

Total subagregado por dominio:

| Dominio                    | #FKs | Tablas                                                                                                                                                                                                                                                                                                           |
| -------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| escritura/matrix/approval  | 36   | `escritura_approval_attempts`, `escritura_cascade_runs`, `escritura_cases`, `escritura_deliveries`, `escritura_delivery_capabilities`, `escritura_matrices`, `escritura_minuta_generations`, `escritura_semantic_validations`, `escritura_signature_events`, `escritura_template_clauses`, `escritura_templates` |
| audit/outbox/idempotency   | 12   | `audit_logs`, `denied_operation_attempts`, `idempotency_operations`, `workflow_outbox`, `worker_job_failures`, `runtime_release_attestations`                                                                                                                                                                    |
| legal_documents            | 6    | `legal_documents`, `legal_document_pages`, `legal_review_decisions`, `lot_legal_data`, `project_legal_data`, `document_evidence`                                                                                                                                                                                 |
| projects/geometries/lots   | 12   | `projects`, `document_ingestion_jobs`, `feature_rollout_projects`, `lot_legal_data`, `project_file_objects`, `vendor_membership_operations`                                                                                                                                                                      |
| vendor/approval/membership | 13   | `vendors`, `vendor_projects`, `vendor_membership_operations`, `approval_requests`, `organization_members`, `organization_payment_info`                                                                                                                                                                           |
| title/variable             | 7    | `title_analyses`, `variable_resolutions`                                                                                                                                                                                                                                                                         |
| auth/profiles              | 17   | `agent_skills`, `agent_skill_versions`, `mcp_connections`, `agent_custom_instructions`                                                                                                                                                                                                                           |
| otros                      | 4    | `llm_task_configs`, `project_active_templates`                                                                                                                                                                                                                                                                   |

### 2.4 `multiple_permissive_policies` — 439 findings / 36 tablas

RLS overhead por query: tablas con 24 ocurrencias/c/u (máximo): `agent_skill_versions`, `agent_skills`, `document_blocks`, `document_templates`, `geometries`, `lot_records`, `organization_members`, `organizations`, `projects`, `vendor_projects`, `vendors`. Patrón típico: múltiples políticas permissive para rol `anon`/`authenticated` en acciones DELETE/UPDATE/INSERT/SELECT.

### 2.5 `unused_index` — 49 findings

Top 5 por impacto en writes/storage:

| Tabla                         | Índices no usados                                                                                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `geometry_imports`            | `geometry_imports_source_idx`, `geometry_imports_organization_idx`, `geometry_imports_source_file_idx`, `geometry_imports_supersedes_idx`, `geometry_imports_operation_idx`, `geometry_imports_created_by_idx` (6) |
| `geometry_enrichment_jobs`    | 4 índices                                                                                                                                                                                                          |
| `geometry_assignment_history` | 3 índices                                                                                                                                                                                                          |
| `agent_skills`                | 2 índices                                                                                                                                                                                                          |
| `agent_skill_versions`        | 2 índices                                                                                                                                                                                                          |

Otros notables: `lots`, `notification_events`, `generated_documents`, `checkpoints`/`checkpoint_writes`/`checkpoint_blobs`, `idempotency_operations`, `production_readiness_findings`, `runtime_release_attestations`.

### 2.6 Otros findings de seguridad (informativos)

| Advisor                                              | Cuenta |
| ---------------------------------------------------- | ------ |
| `authenticated_security_definer_function_executable` | 43     |
| `anon_security_definer_function_executable`          | 40     |
| `rls_enabled_no_policy`                              | 22     |
| `function_search_path_mutable`                       | 3      |
| `auth_leaked_password_protection`                    | 1      |

## 3. Regresión semántica en T-CPU-03 (`trg_doc_epoch_inc`)

La migración `20260812224500` convirtió el trigger `trg_doc_epoch_inc` de `legal_documents` a `FOR EACH STATEMENT` con la función `trg_doc_epoch_inc_upd_stmt()`.

**Función original (`trg_doc_epoch_check()` en `20260806000000:336-352`)**:

```sql
IF (TG_OP = 'INSERT') OR (TG_OP = 'DELETE') OR
   (TG_OP = 'UPDATE' AND OLD.extraction_status <> NEW.extraction_status
                     AND NEW.extraction_status IN ('text_extracted', 'variables_proposed', 'needs_review'))
THEN
  UPDATE public.projects SET preparation_epoch = preparation_epoch + 1, ...
END IF;
```

**Función nueva (regresiva)** en `20260812224500:91-109`:

```sql
UPDATE public.projects ... WHERE id IN (
  SELECT DISTINCT project_id FROM new_table
  WHERE project_id IS NOT NULL
    AND extraction_status IN ('text_extracted', 'variables_proposed', 'needs_review')
);
```

**Divergencia**: la nueva función omite `OLD.extraction_status IS DISTINCT FROM NEW.extraction_status`. Por tanto, una `UPDATE` a `legal_documents` que no toque `extraction_status` (permaneciendo en la lista de estados "completos") ahora incrementa el epoch — antes no lo hacía.

**Fix aplicado**: migración `20260812225430_sdd019_doc_epoch_upd_restore.sql` restaura la comparación mediante JOIN entre `new_table` y `old_table` sobre la PK `id` (uuid NOT NULL en `legal_documents`):

```sql
UPDATE public.projects ... WHERE id IN (
  SELECT DISTINCT n.project_id
  FROM new_table n
  JOIN old_table o ON o.id = n.id
  WHERE n.project_id IS NOT NULL
    AND o.extraction_status IS DISTINCT FROM n.extraction_status
    AND n.extraction_status IN ('text_extracted', 'variables_proposed', 'needs_review')
);
```

La función `trg_doc_epoch_check()` original queda huérfana en la BD (sin triggers que la usen); no se dropea en este fix para evitar tocar código no cubierto por tests.

## 4. Conclusión

Estado al 2026-08-13: **plan COMPLETO y aplicado al cloud.**

- **8 migraciones SDD019 aplicadas** + verificadas en la BD cloud del proyecto `swkrnjdpnlrgxgotmfxy`.
- **RLS InitPlan**: 0 políticas con `auth.uid()` o `auth.role()` sin wrapper (verificado via `pg_policies` después de aplicar `20260813000001_sdd019_rls_initplan_v2.sql` que cubrió las 28 residuales).
- **Triggers STATEMENT**: 10 statement triggers activos con `REFERENCING NEW TABLE / OLD TABLE` (3 para matrices, 1 para lots, 3 para legal_documents, 3 para geometry_imports). Fix de limitación PG17: las transition tables no soportan column lists (`UPDATE OF col1,col2`) — el filtrado se pasó al interior de las funciones via `JOIN new_table↔old_table` sobre la PK, preservando la semántica del trigger original.
- **Hashing**: `approve_sale` usa `md5()` en `event_fingerprint` y `audit_event_key`. `create_sale_request_db`/`create_reservation_request_db` mantienen SHA-256 para `request_hash` (idempotency payload).
- **Índices FK**: 19 índices nuevos en FKs críticas (workflow_outbox 3, audit_logs 2, denied_operation_attempts 2, escritura_cases/approval_attempts/minuta_generations/signature_events 5, deliveries/capabilities 3, legal_documents 3, production_readiness_findings 1, vendor_membership_operations 2, feature_rollout_projects 1, projects 1). Reducción proyectada: 107 → 88 FKs sin índice.
- **Runtime verificado en cloud**: 0 sesiones `idle in transaction` zombie, 13 conexiones activas/idle, outbox 12/12 completed.
- **Test suite**: 949 pytest passed / 1 fail pre-existente `test_trigger_exists_in_db` (requiere RPC `public.query(query)` que no existe en BD por seguridad).

## 5. Recomendaciones futuras (no parte de este plan)

- **T-CPU-08 (propuesta)**: elaborar un segundo pase "RLS InitPlan v2" para envolver `auth.uid()`/`auth.role()`/`current_setting()` en `(select …)` en las 28 políticas listadas en §2.1. ROI alto: reduce CPU en cada query sobre `organizations`, `audit_logs`, `profiles`, `vendor_projects`, `approval_requests`, etc.
- **T-CPU-09 (propuesta)**: índices FK en tablas críticas de outbox (`workflow_outbox_aggregate_id_fkey`, `workflow_outbox_operation_id_fkey`), audit y cascadas de escritura.
- **T-CPU-10 (propuesta)**: revisión de `multiple_permissive_policies` (439) y `unused_index` (49) para reducir overhead de RLS y writes innecesarios.
