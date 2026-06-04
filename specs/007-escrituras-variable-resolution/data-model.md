# Data Model: Escrituras Variable Resolution

**Date**: 2026-06-03

## Design Principles

- All production tables live in canonical Supabase migrations.
- Every record is tenant scoped through `organization_id` and, where applicable, `project_id` and `lot_id`.
- Extracted values are proposals until reviewed or approved.
- Evidence is first-class: document/page/chunk support must be traceable.
- Generated minuta snapshots use approved/resolved variables, not live OCR text.

## Entity: legal_documents

Represents a source document uploaded for a project or lot.

| Field                       | Type          | Notes                                                                                                                                                 |
| --------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                        | uuid          | Primary key                                                                                                                                           |
| `organization_id`           | uuid          | Required; tenant scope                                                                                                                                |
| `project_id`                | uuid          | Required for project-level docs                                                                                                                       |
| `lot_id`                    | uuid nullable | Optional lot-specific document                                                                                                                        |
| `document_type`             | text          | `dominio_vigente`, `hipoteca_gravamen`, `certificado_roles_sii`, `certificado_sag`, `plano_oficial`, `personeria`, `rnda`, `instruccion_pago`, `otro` |
| `source_field`              | text nullable | Original project field, e.g. `doc_roles`                                                                                                              |
| `storage_bucket`            | text          | Usually `project-files`                                                                                                                               |
| `storage_path`              | text          | Storage object path                                                                                                                                   |
| `original_filename`         | text          | User-facing filename                                                                                                                                  |
| `mime_type`                 | text          | Validated MIME                                                                                                                                        |
| `file_size_bytes`           | bigint        | Upload size                                                                                                                                           |
| `sha256_hash`               | text          | Dedup/version support                                                                                                                                 |
| `version_number`            | integer       | Increment per project/document type                                                                                                                   |
| `upload_source`             | text          | `onboarding`, `project_documents`, `legal_control_center`, `api`                                                                                      |
| `uploaded_by`               | uuid nullable | User who uploaded                                                                                                                                     |
| `extraction_status`         | text          | `pending`, `queued`, `processing`, `text_extracted`, `variables_proposed`, `needs_review`, `failed`, `superseded`                                     |
| `superseded_by`             | uuid nullable | Newer document version                                                                                                                                |
| `created_at` / `updated_at` | timestamptz   | Audit timestamps                                                                                                                                      |

Validation:

- A document must belong to a project in the same organization.
- `storage_path` plus `sha256_hash` should avoid duplicate active versions for the same type.
- Replacing a document supersedes the prior active document but must not delete evidence used by old escritura cases.

## Entity: document_ingestion_jobs

Represents one extraction attempt for a legal document.

| Field                         | Type                 | Notes                                                                                 |
| ----------------------------- | -------------------- | ------------------------------------------------------------------------------------- |
| `id`                          | uuid                 | Primary key                                                                           |
| `organization_id`             | uuid                 | Required                                                                              |
| `project_id`                  | uuid                 | Required                                                                              |
| `legal_document_id`           | uuid                 | FK to `legal_documents`                                                               |
| `status`                      | text                 | `queued`, `processing`, `text_extracted`, `variables_proposed`, `failed`, `cancelled` |
| `pipeline_version`            | text                 | Extractor/converter version                                                           |
| `converter`                   | text                 | `pdf_text`, `ocr`, `docx`, `textutil_doc`, `manual`                                   |
| `attempt_number`              | integer              | Retry count                                                                           |
| `started_at` / `completed_at` | timestamptz nullable | Runtime tracking                                                                      |
| `error_code`                  | text nullable        | Machine-readable failure                                                              |
| `error_message`               | text nullable        | User/admin readable failure                                                           |
| `stats`                       | jsonb                | Page count, char count, token count, OCR confidence                                   |
| `created_at` / `updated_at`   | timestamptz          | Audit timestamps                                                                      |

Validation:

- Only one active `queued` or `processing` job per active legal document.
- Failed jobs may be retried with a higher `attempt_number`.

## Entity: legal_document_pages

Stores extracted text/Markdown for a physical page or logical page.

| Field               | Type          | Notes                              |
| ------------------- | ------------- | ---------------------------------- |
| `id`                | uuid          | Primary key                        |
| `organization_id`   | uuid          | Required                           |
| `project_id`        | uuid          | Required                           |
| `legal_document_id` | uuid          | FK                                 |
| `ingestion_job_id`  | uuid          | FK                                 |
| `page_number`       | integer       | Physical or logical page number    |
| `page_kind`         | text          | `physical`, `logical`, `ocr_image` |
| `text_content`      | text          | Extracted text                     |
| `markdown_content`  | text nullable | Markdown if produced               |
| `char_count`        | integer       | Quality metric                     |
| `checksum`          | text          | Evidence integrity                 |
| `created_at`        | timestamptz   | Audit timestamp                    |

Validation:

- Page numbers are unique per `legal_document_id` and `ingestion_job_id`.
- Empty pages may exist but should be excluded from evidence by default.

## Entity: variable_resolutions

Stores canonical variable state and value at project, lot or escritura case scope.

| Field                       | Type                 | Notes                                                                                                                 |
| --------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `id`                        | uuid                 | Primary key                                                                                                           |
| `organization_id`           | uuid                 | Required                                                                                                              |
| `project_id`                | uuid                 | Required                                                                                                              |
| `lot_id`                    | uuid nullable        | Lot-scoped variables                                                                                                  |
| `escritura_case_id`         | uuid nullable        | Snapshot/case-scoped variables                                                                                        |
| `variable_key`              | text                 | Canonical key, e.g. `matriz.inscripcion_fojas`                                                                        |
| `variable_group`            | text                 | `matriz`, `sii`, `lote`, etc.                                                                                         |
| `value_text`                | text nullable        | Human-readable/resolved value                                                                                         |
| `value_json`                | jsonb nullable       | Structured values, arrays, objects                                                                                    |
| `state`                     | text                 | `missing`, `proposed`, `resolved`, `approved`, `manual_review`, `conflict`, `derived`, `not_applicable`, `superseded` |
| `source_type`               | text                 | `document`, `system`, `geometry`, `derived`, `manual`, `legal_review`, `post_minuta`                                  |
| `source_ref`                | jsonb                | References to source rows or fields                                                                                   |
| `confidence`                | numeric nullable     | 0 to 1                                                                                                                |
| `extractor_name`            | text nullable        | Extractor/LLM/rule source                                                                                             |
| `reviewed_by`               | uuid nullable        | User reviewer                                                                                                         |
| `reviewed_at`               | timestamptz nullable | Review timestamp                                                                                                      |
| `approval_required`         | boolean              | Blocks readiness until approved                                                                                       |
| `correction_reason`         | text nullable        | Last manual correction reason                                                                                         |
| `superseded_by`             | uuid nullable        | Newer resolution                                                                                                      |
| `created_at` / `updated_at` | timestamptz          | Audit timestamps                                                                                                      |

Validation:

- One active non-superseded row per `(project_id, lot_id, escritura_case_id, variable_key)` scope.
- `approved` variables require `reviewed_by` and `reviewed_at`.
- `document` source variables should have at least one `document_evidence` row.

## Entity: document_evidence

Links a variable resolution to the source text that supports it.

| Field                    | Type             | Notes                                  |
| ------------------------ | ---------------- | -------------------------------------- |
| `id`                     | uuid             | Primary key                            |
| `organization_id`        | uuid             | Required                               |
| `project_id`             | uuid             | Required                               |
| `variable_resolution_id` | uuid             | FK                                     |
| `legal_document_id`      | uuid             | FK                                     |
| `legal_document_page_id` | uuid nullable    | FK                                     |
| `chunk_index`            | integer nullable | Optional chunk                         |
| `snippet`                | text nullable    | Short evidence snippet                 |
| `snippet_hash`           | text             | Integrity without relying only on text |
| `bbox`                   | jsonb nullable   | Future OCR bounding box                |
| `confidence`             | numeric nullable | Evidence confidence                    |
| `created_at`             | timestamptz      | Audit timestamp                        |

Validation:

- Evidence must belong to the same organization/project as the variable.
- Snippets should be short enough for UI display and privacy-conscious logs.

## Entity: lot_legal_data

Stores lot-level legal values not represented by geometry alone.

| Field                         | Type                      | Notes                                                       |
| ----------------------------- | ------------------------- | ----------------------------------------------------------- |
| `id`                          | uuid                      | Primary key                                                 |
| `organization_id`             | uuid                      | Required                                                    |
| `project_id`                  | uuid                      | Required                                                    |
| `lot_id`                      | uuid                      | Required                                                    |
| `sii_unit_name`               | text nullable             | Unit/lote as shown in SII certificate                       |
| `sii_role_matrix`             | text nullable             | Matriz role if present                                      |
| `sii_pre_role`                | text nullable             | Pre-role or role in process                                 |
| `sii_role_in_process_text`    | text nullable             | Rendered wording for minuta                                 |
| `sii_definitive_role`         | text nullable             | Post-inscription definitive role                            |
| `role_status`                 | text                      | `missing`, `rol_en_tramite`, `definitive`, `not_applicable` |
| `matching_status`             | text                      | `matched`, `ambiguous`, `missing`, `manual_override`        |
| `matching_score`              | numeric nullable          | Normalization score                                         |
| `source_legal_document_id`    | uuid nullable             | SII certificate                                             |
| `reviewed_by` / `reviewed_at` | uuid/timestamptz nullable | Manual/legal review                                         |
| `created_at` / `updated_at`   | timestamptz               | Audit timestamps                                            |

Validation:

- One row per lot.
- `rol_en_tramite` is valid only with SII evidence or approved manual/legal review.

## Entity: escritura_cases

Represents a per-lot escritura workflow case.

| Field                       | Type          | Notes                                                                                                                                            |
| --------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                        | uuid          | Primary key                                                                                                                                      |
| `organization_id`           | uuid          | Required                                                                                                                                         |
| `project_id`                | uuid          | Required                                                                                                                                         |
| `lot_id`                    | uuid          | Required                                                                                                                                         |
| `case_status`               | text          | `draft`, `variables_pending`, `ready_for_minuta`, `minuta_generated`, `legal_review_pending`, `minuta_approved`, `sent_to_external`, `cancelled` |
| `readiness_status`          | text          | `blocked`, `needs_review`, `ready`                                                                                                               |
| `readiness_gates`           | jsonb         | Gate-by-gate result                                                                                                                              |
| `variable_snapshot`         | jsonb         | Approved/resolved values at case time                                                                                                            |
| `evidence_snapshot`         | jsonb         | Evidence map for snapshot                                                                                                                        |
| `template_id`               | uuid nullable | Future template                                                                                                                                  |
| `generated_document_id`     | uuid nullable | Latest generated output                                                                                                                          |
| `created_by`                | uuid nullable | User                                                                                                                                             |
| `created_at` / `updated_at` | timestamptz   | Audit timestamps                                                                                                                                 |

Validation:

- One active escritura case per sold lot unless superseded/cancelled.
- `ready_for_minuta` requires domain/title, SII, SAG/plano, geometry, buyer, price and warning gates to pass.
- `minuta_approved` requires legal review decision and lawyer/redactor variables.

## Entity: legal_review_decisions

Stores review actions by an authorized user or lawyer.

| Field                    | Type          | Notes                                                                                                                           |
| ------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `id`                     | uuid          | Primary key                                                                                                                     |
| `organization_id`        | uuid          | Required                                                                                                                        |
| `project_id`             | uuid          | Required                                                                                                                        |
| `lot_id`                 | uuid nullable | Optional                                                                                                                        |
| `escritura_case_id`      | uuid nullable | Optional                                                                                                                        |
| `variable_resolution_id` | uuid nullable | Optional                                                                                                                        |
| `decision_type`          | text          | `approve_variable`, `reject_variable`, `manual_override`, `approve_case`, `reject_case`, `assign_lawyer`, `mark_not_applicable` |
| `decision_status`        | text          | `approved`, `rejected`, `needs_changes`                                                                                         |
| `reason`                 | text nullable | Human reason                                                                                                                    |
| `lawyer_name`            | text nullable | Redactor/reviewer                                                                                                               |
| `lawyer_rut`             | text nullable | Redactor/reviewer                                                                                                               |
| `lawyer_email`           | text nullable | Redactor/reviewer                                                                                                               |
| `decided_by`             | uuid          | User                                                                                                                            |
| `decided_at`             | timestamptz   | Timestamp                                                                                                                       |

Validation:

- Case approval requires lawyer fields when moving toward external use.
- Decisions must be immutable except for administrative correction with separate audit.

## State Transitions

### Document extraction

```text
pending -> queued -> processing -> text_extracted -> variables_proposed -> needs_review
pending -> queued -> processing -> failed
needs_review -> superseded
failed -> queued
```

### Variable resolution

```text
missing -> proposed -> resolved -> approved
proposed -> conflict
conflict -> manual_review -> resolved -> approved
proposed -> manual_review -> resolved
resolved -> superseded
missing -> not_applicable
```

### Escritura case

```text
draft -> variables_pending -> ready_for_minuta -> minuta_generated
minuta_generated -> legal_review_pending -> minuta_approved
any active state -> cancelled
```

## Readiness Gates

| Gate                   | Required signals                                                       |
| ---------------------- | ---------------------------------------------------------------------- |
| `title_verified`       | Approved/resolved matriz/title variables with evidence                 |
| `sii_verified`         | Lot role matched or legally approved, including valid `rol_en_tramite` |
| `sag_plano_verified`   | SAG certificate and plan variables resolved or manually reviewed       |
| `geometry_verified`    | Existing lot readiness passes official area, perimeter and boundaries  |
| `party_verified`       | Buyer/seller identity variables available and reviewed where required  |
| `price_verified`       | Price/payment variables available                                      |
| `legal_review_ready`   | Lawyer/redactor workflow variables assigned for approval stage         |
| `warning_acknowledged` | User sees minuta requires lawyer review before external use            |

## Relationship to Existing Tables

- `projects`: retains existing document path columns for backward compatibility.
- `project_legal_data`: remains a compatibility table for existing resolver fields; approved variable resolutions can backfill or override its current values during resolver integration.
- `lots`: remains source for lot number, geometry, official area/perimeter and verified boundaries.
- `lot_records`: remains source for comprador and commercial sale data.
- `document_templates`, `document_blocks`, `generated_documents`: remain the generation system; future integration will use escritura case snapshots.
