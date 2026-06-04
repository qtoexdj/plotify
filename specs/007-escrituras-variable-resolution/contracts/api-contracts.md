# API Contracts: Escrituras Variable Resolution

**Date**: 2026-06-03

These contracts describe the planned typed API surface. Per repository rules, actual OpenAPI output must be generated from FastAPI/Pydantic source under `apps/api` and not hand-edited in `packages/contracts/openapi`.

## Contract Principles

- FastAPI owns business contracts and schema validation.
- Next.js route handlers act as authenticated proxies for the browser and must infer/validate tenant ownership.
- Internal API calls keep the existing `X-Internal-Secret` pattern where the frontend calls FastAPI.
- No endpoint trusts a free-form `organization_id` without validating project/lot membership.
- Every mutation that changes variables, evidence, roles or readiness creates audit history.

## Shared Enums

### LegalDocumentType

```text
dominio_vigente
hipoteca_gravamen
certificado_roles_sii
certificado_sag
plano_oficial
personeria
rnda
instruccion_pago
otro
```

### ExtractionStatus

```text
pending
queued
processing
text_extracted
variables_proposed
needs_review
failed
superseded
```

### VariableState

```text
missing
proposed
resolved
approved
manual_review
conflict
derived
not_applicable
superseded
```

### RoleMatchingStatus

```text
matched
ambiguous
missing
manual_override
```

### EscrituraCaseStatus

```text
draft
variables_pending
ready_for_minuta
minuta_generated
legal_review_pending
minuta_approved
sent_to_external
cancelled
```

## FastAPI Endpoints

### POST `/legal-documents/register`

Registers a source document already uploaded to Supabase Storage and queues extraction.

Request:

```json
{
  "project_id": "uuid",
  "lot_id": "uuid-or-null",
  "document_type": "dominio_vigente",
  "source_field": "doc_dominio_vigente",
  "storage_bucket": "project-files",
  "storage_path": "project-id/docs/doc_dominio_vigente.pdf",
  "original_filename": "Dominio vigente.pdf",
  "mime_type": "application/pdf",
  "file_size_bytes": 123456,
  "upload_source": "onboarding"
}
```

Response:

```json
{
  "legal_document_id": "uuid",
  "ingestion_job_id": "uuid",
  "extraction_status": "queued",
  "version_number": 1
}
```

Validation:

- Project belongs to the caller organization.
- Storage object belongs to the project path.
- Document type is allowed.
- New upload supersedes prior active document of the same type when requested.

### GET `/legal-documents/project/{project_id}`

Lists legal source documents and extraction status for a project.

Response:

```json
{
  "project_id": "uuid",
  "documents": [
    {
      "id": "uuid",
      "document_type": "certificado_roles_sii",
      "original_filename": "Roles.pdf",
      "version_number": 1,
      "extraction_status": "variables_proposed",
      "latest_job_id": "uuid",
      "uploaded_at": "2026-06-03T12:00:00Z",
      "summary": {
        "pages": 3,
        "variables_proposed": 12,
        "variables_conflict": 0,
        "variables_missing": 2
      }
    }
  ]
}
```

### POST `/legal-documents/{legal_document_id}/retry`

Queues a retry for a failed legal document extraction.

Response:

```json
{
  "legal_document_id": "uuid",
  "ingestion_job_id": "uuid",
  "extraction_status": "queued",
  "attempt_number": 2
}
```

### GET `/legal-variables/project/{project_id}`

Returns project/lot variable inventory with evidence summaries.

Query parameters:

```text
lot_id?: uuid
state?: VariableState
group?: string
include_evidence?: boolean
```

Response:

```json
{
  "project_id": "uuid",
  "lot_id": "uuid-or-null",
  "groups": {
    "matriz": [
      {
        "id": "uuid",
        "variable_key": "matriz.inscripcion_fojas",
        "state": "proposed",
        "value_text": "4699",
        "source_type": "document",
        "confidence": 0.92,
        "approval_required": true,
        "evidence": [
          {
            "legal_document_id": "uuid",
            "page_number": 2,
            "snippet": "inscrita a fojas 4699...",
            "confidence": 0.92
          }
        ]
      }
    ]
  },
  "summary": {
    "total": 80,
    "approved": 34,
    "proposed": 20,
    "missing": 12,
    "conflict": 2,
    "manual_review": 12
  }
}
```

### PATCH `/legal-variables/{variable_resolution_id}`

Edits, approves or marks a variable as not applicable.

Request:

```json
{
  "action": "approve",
  "value_text": "4699",
  "value_json": null,
  "state": "approved",
  "correction_reason": "Validado contra dominio vigente pagina 2",
  "evidence_policy": "keep_existing"
}
```

Response:

```json
{
  "variable_resolution_id": "uuid",
  "state": "approved",
  "reviewed_by": "uuid",
  "reviewed_at": "2026-06-03T12:00:00Z",
  "audit_event_id": "uuid"
}
```

Validation:

- Manual value edits require an allowed target state and audit reason.
- `approved` requires authorized user.
- Document-sourced variables keep evidence unless replaced with manual/legal review reason.

### GET `/legal-roles/project/{project_id}/matches`

Returns SII role/pre-role matching status by lot.

Response:

```json
{
  "project_id": "uuid",
  "lots": [
    {
      "lot_id": "uuid",
      "lot_number": "29",
      "sii_unit_name": "Lote 29",
      "sii_pre_role": "08179-00029",
      "role_status": "rol_en_tramite",
      "matching_status": "matched",
      "source_legal_document_id": "uuid"
    }
  ],
  "summary": {
    "matched": 40,
    "ambiguous": 1,
    "missing": 2,
    "manual_override": 0
  }
}
```

### PATCH `/legal-roles/lots/{lot_id}`

Manually resolves a lot role match.

Request:

```json
{
  "sii_unit_name": "Lote 29",
  "sii_pre_role": "08179-00029",
  "role_status": "rol_en_tramite",
  "matching_status": "manual_override",
  "reason": "Validado por certificado SII"
}
```

### GET `/escritura-cases/lots/{lot_id}/readiness`

Returns sold-lot readiness for minuta preparation.

Response:

```json
{
  "lot_id": "uuid",
  "project_id": "uuid",
  "readiness_status": "blocked",
  "case_status": "variables_pending",
  "gates": [
    {
      "key": "sii_verified",
      "status": "blocked",
      "message": "El rol del lote no esta asociado al certificado SII",
      "blocking_variables": ["sii.pre_rol_lote"]
    },
    {
      "key": "geometry_verified",
      "status": "ready",
      "message": "Deslindes oficiales verificados"
    }
  ],
  "warning": "La minuta generada automaticamente debe ser revisada y aprobada por abogado antes de usarse en notaria o como instrumento final."
}
```

### POST `/escritura-cases/lots/{lot_id}`

Creates or refreshes an escritura case snapshot for a sold lot.

Request:

```json
{
  "acknowledge_legal_review_required": true
}
```

Response:

```json
{
  "escritura_case_id": "uuid",
  "case_status": "ready_for_minuta",
  "readiness_status": "ready",
  "variable_snapshot_count": 84,
  "evidence_snapshot_count": 62
}
```

## Next.js Proxy Routes

Planned browser-facing route handlers:

```text
GET  apps/web/src/app/api/projects/[id]/legal-documents/route.ts
POST apps/web/src/app/api/projects/[id]/legal-documents/route.ts
GET  apps/web/src/app/api/projects/[id]/legal-variables/route.ts
PATCH apps/web/src/app/api/projects/[id]/legal-variables/[variableId]/route.ts
GET  apps/web/src/app/api/projects/[id]/legal-roles/route.ts
PATCH apps/web/src/app/api/projects/[id]/legal-roles/[lotId]/route.ts
GET  apps/web/src/app/api/projects/[id]/escritura-readiness/route.ts
POST apps/web/src/app/api/projects/[id]/escritura-cases/route.ts
```

Proxy requirements:

- Infer authenticated user from Supabase session.
- Validate project membership before calling FastAPI.
- Do not accept arbitrary organization IDs from the browser.
- Return user-facing Spanish errors while logging structured backend details.
