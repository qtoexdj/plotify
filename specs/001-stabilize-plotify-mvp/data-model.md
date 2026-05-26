# Data Model: Stabilize Plotify MVP

This model is grounded in current generated Supabase types and migration files.
Fields marked **existing** are already present. Fields marked **planned** require
canonical migrations under `packages/database/supabase/migrations`.

## Organization

**Existing table**: `organizations`

Represents an inmobiliaria or parcelation manager.

Relationships:

- Has many `projects`
- Has many `organization_members`
- Has many `vendors`
- Owns document templates, blocks, generated documents, approval requests, and
  audit logs

Validation:

- Every MVP operation must resolve or validate the organization from persisted
  project/lot/template relationships.

## Organization Member

**Existing table**: `organization_members`

Represents a user membership in an organization.

Relevant existing fields:

- `organization_id`
- `user_id`
- `role` / `org_role`

Rules:

- Admin role can approve requests and generate final documents.
- User/vendor role can operate assigned projects only.

## Vendor

**Existing tables**: `vendors`, `vendor_projects`

Represents the seller assigned to one or more projects.

Relevant existing fields:

- `vendors.id`
- `vendors.organization_id`
- `vendors.user_id`
- `vendors.nombre`
- `vendors.phone`
- `vendors.active`
- `vendor_projects.vendor_id`
- `vendor_projects.project_id`

Rules:

- A vendor can request reservation/sale only for assigned projects.
- Vendor identity feeds approval payloads and document variables.

## Project

**Existing table**: `projects`

Represents a parcelation project created from KMZ/KML and enriched with legal
documents.

Relevant existing fields:

- `id`
- `organization_id`
- `name`
- `descripcion`
- `comuna`
- `region`
- `estado`
- `total_lotes`
- `road_geometry`
- `road_width_m`
- `images`
- `doc_dominio_vigente`
- `doc_hipoteca_gravamen`
- `doc_roles`
- `doc_subdivision`
- `doc_plano_oficial`
- `doc_otros`

Planned decisions:

- Standardize `estado` values used for MVP readiness, such as draft/imported,
  validated, and operational, using existing column if possible.
- Link project to active reservation/escritura templates.

Validation:

- Project cannot become operational for documents until required lot geometry
  and minimum legal/commercial fields are reviewed.
- Project documents must be validated by MIME/type and size before storage.

## Geometry

**Existing table**: `geometries`

Represents uploaded KMZ/KML-derived spatial features.

Relevant existing fields:

- `project_id`
- `geometry_type` (`lot`, `road`, `common_area`)
- `source_type` (`kmz`, `kml`, currently enum also has `dxf`, `dwg`)
- `geometry`
- `properties`

Rules:

- MVP production flow accepts KMZ/KML, not CAD.
- Lot geometries must be assignable to lots before legal document use.

## Lot

**Existing table**: `lots`

Represents a sellable parcel.

Relevant existing fields:

- `id`
- `project_id`
- `numero_lote`
- `estado` (`disponible`, `reservado`, `vendido`)
- `geometry_id`
- `m2`
- `precio`
- `valor_reserva`
- `vendedor_id`
- `reserved_at`
- `sold_at`
- `verified_status`
- `verified_at`
- `verified_by`
- `area_official_m2`
- `boundaries_official`
- `perimeter_official_m`
- `superficie_neta_m2`
- `servidumbre_m2`
- `servidumbre_ancho_m`

State transitions:

- `disponible` -> `reservado` after approved reservation
- `reservado` -> `vendido` after approved sale / escritura completion
- `reservado` -> `disponible` only through explicit release/cancellation flow

Validation:

- Reservation requires `estado = disponible`.
- Sale requires approved admin decision and compatible prior state.
- Document generation requires tenant validation through project/lot ownership.

## Lot Record

**Existing table**: `lot_records`

Stores buyer and process data for a lot.

Relevant existing fields:

- `lot_id`
- `cliente_nombre`
- `cliente_run`
- `cliente_direccion`
- `cliente_estado_civil`
- `cliente_ocupacion`
- `cliente_email`
- `cliente_telefono`
- `valor`
- `abono`
- `saldo`
- `firma_fecha`
- `firma_lugar`
- `firma_estado`
- `etapa_proceso`
- CBR fields (`cbr_estado`, `cbr_numero_petitorio`, etc.)

Rules:

- Approval payloads write buyer data into this record.
- Document variables for buyer and process data should resolve from here.

## Approval Request

**Existing table**: `approval_requests`

Represents an admin decision request. Current implementation is reservation
oriented.

Relevant existing fields:

- `id`
- `organization_id`
- `lot_id`
- `vendor_id`
- `vendor_name`
- `vendor_phone`
- `vendor_platform`
- `payload`
- `status` (`pending`, `approved`, `rejected`)
- `admin_phone`
- `resolved_at`

Planned P2 fields/options:

- Add request type classification (`reservation`, `sale`) or equivalent
  compatible model.
- Preserve current reservation behavior while supporting sale requests.

State transitions:

- `pending` -> `approved`
- `pending` -> `rejected`
- Re-processing an already resolved request must return an already-processed
  result without mutating state again.

Validation:

- Only one pending request per lot/type should exist where business rules
  require exclusivity.
- Admin decision path must verify organization membership before resolution.

## Audit Log / History Event

**Existing table**: `audit_logs`

Represents traceability for commercial, legal, document, tenant, and external
integration events.

Relevant existing fields:

- `organization_id`
- `actor`
- `action`
- `entity`
- `entity_id`
- `payload`
- `created_at`

Rules:

- P1 must log reservation requested/approved/rejected, document generated,
  document regenerated, and document sent.
- P2 must log sale requested/approved/rejected and legal-data changes.
- A lot history view can derive from `audit_logs`, `approval_requests`,
  `generated_documents`, and `lot_records`.

## Document Block

**Existing table**: `document_blocks`

Represents reusable legal text.

Relevant existing fields:

- `organization_id`
- `name`
- `category`
- `content`
- `variables`
- `tags`
- `version`
- `is_active`

Rules:

- `variables` is part of missing-variable detection.
- Blocks used in final documents must render through backend generation.

## Document Template

**Existing table**: `document_templates`

Represents an ordered template for reservation, escritura, promesa, deslinde, or
other document.

Relevant existing fields:

- `organization_id`
- `name`
- `document_type`
- `description`
- `header_config`
- `footer_config`
- `page_config`
- `is_default`
- `created_by`

Planned P1/P2 model:

- Project-scoped active template support for reservation and escritura.
- Unique active template per project and document type.

Relationships:

- Has many `template_block_items`.
- Used by `generated_documents`.

## Template Block Item

**Existing table**: `template_block_items`

Represents block order and conditions inside a template.

Relevant existing fields:

- `template_id`
- `block_id`
- `position`
- `is_optional`
- `condition_field`
- `overrides`

Rules:

- Missing-variable detection must evaluate only included blocks after conditions.

## Generated Document

**Existing table**: `generated_documents`

Represents a persisted PDF/DOCX.

Relevant existing fields:

- `organization_id`
- `template_id`
- `lot_id`
- `lot_record_id`
- `document_type`
- `file_url`
- `file_format`
- `generated_by`
- `variables_snapshot`
- `created_at`

Planned fields:

- Explicit `version_number` or equivalent per lot/template/document type.
- Optional metadata for missing variables accepted by admin.
- Optional source document references for escritura.

Rules:

- Regeneration must create a new row/version.
- `variables_snapshot` is immutable legal traceability data.
- Generated response should expose persisted document metadata, not only URL.

## Project Legal Data

**Planned model**: New table or structured project-level storage.

Represents reviewed legal data extracted or manually entered from project
documents.

Likely fields:

- `project_id`
- `organization_id`
- source document type/path
- structured values for dominio, roles, SAG, plano, matriz, personeria, and
  related escritura variables
- review status
- reviewed_by
- reviewed_at

Rules:

- Uploaded PDFs are sources, not automatic truth.
- Admin/lawyer-functional review is required before final escritura generation.

## Document Variables v1

**Planned contract**: Shared variable shape used by backend generation and
frontend preview/status UI.

Top-level groups:

- `vendedor`
- `comprador`
- `matriz`
- `sag`
- `lote`
- `servidumbre`
- `transaccion`
- `mandato`
- `personeria`

Rules:

- Backend final render is authoritative.
- Frontend preview must consume the same resolved variable/status contract.
- Missing variables must be classified before final generation.
