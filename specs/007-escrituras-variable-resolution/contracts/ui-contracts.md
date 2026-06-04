# UI Contracts: Centro de Control Legal

**Date**: 2026-06-03

## Scope

This feature implements the variable/evidence/readiness control surface. It does not implement the final visual minuta builder. The future builder should be a new interface that consumes escritura case snapshots created here.

## Onboarding Contract

### User Goal

Upload project media and legal documents while creating a project, without reviewing variables during onboarding.

### Required Behavior

- Legal document inputs remain simple file upload controls.
- Accepted document types are communicated next to the uploader.
- Upload success stores the path and metadata needed for registration.
- After project creation, the system registers each legal document and queues extraction.
- The user sees a lightweight status such as `Extraccion iniciada` or `Pendiente de procesar`, not a full variable table.

### Prohibited Behavior

- Do not ask the user to correct OCR or legal variables during onboarding.
- Do not block project creation because extraction has not finished.
- Do not show final escritura readiness in onboarding.

## Project Documents Contract

### User Goal

Upload, replace, view and track legal documents after project creation.

### Required Panels

- Source documents table grouped by document type.
- Extraction status badge per document.
- Retry action for failed extraction.
- Version indicator when a document is replaced.
- Link to Centro de Control Legal when variables need review.

### Status Labels

| State                | Label                |
| -------------------- | -------------------- |
| `queued`             | En cola              |
| `processing`         | Extrayendo           |
| `text_extracted`     | Texto extraido       |
| `variables_proposed` | Variables propuestas |
| `needs_review`       | Requiere revision    |
| `failed`             | Error de extraccion  |
| `superseded`         | Reemplazado          |

## Centro de Control Legal Contract

### Layout

- Header: project name, extraction summary, readiness summary.
- Left or top area: source documents and extraction states.
- Main area: variable inventory table grouped by variable group.
- Right side or drawer: variable detail, evidence and edit/review actions.

### Variable Table Columns

| Column    | Purpose                                              |
| --------- | ---------------------------------------------------- |
| Variable  | Canonical key and human label                        |
| Valor     | Current value or placeholder                         |
| Estado    | Missing/proposed/approved/conflict/manual review     |
| Fuente    | Document/system/geometry/manual/derived/legal review |
| Evidencia | Document name and page/logical page                  |
| Confianza | Extractor confidence if present                      |
| Accion    | Edit, approve, mark not applicable, view evidence    |

### Filters

- State: missing, conflict, manual review, proposed, approved.
- Group: dominio/matriz, SII, SAG/plano, lote, comprador, precio, revision legal.
- Source document.
- Lot, when lot-scoped variables are present.

### Variable Detail Drawer

Required fields:

- Canonical key.
- Description.
- Current value.
- Source type.
- Evidence list.
- State transition controls.
- Manual correction reason.
- Audit history summary.

### Boundary with Matriz Builder

This UI is the source of truth for correcting extracted variables. The future matriz builder may show values, status and evidence from the approved snapshot, but wrong or missing variables must be corrected here and then snapshotted again.

### Evidence Viewer

Required behavior:

- Show document name, page/logical page and snippet.
- Allow opening the source document URL if user has access.
- Do not expose raw internal storage paths beyond authorized signed/public URL behavior.

## SII Role Matching Contract

### User Goal

Confirm each lot has the correct role, pre-role or role of avaluo en tramite.

### Required UI

- Lot list with lot number, SII unit, role/pre-role, match status and source document.
- `Rol de avaluo en tramite` appears as a valid state when backed by evidence or approved override.
- Ambiguous/missing matches are visually blocking and filterable.
- Manual override requires a reason.

## Escritura Readiness Contract

### User Goal

Before preparing the minuta, understand exactly what blocks the sold lot.

### Required Gates

| Gate                   | UI label               |
| ---------------------- | ---------------------- |
| `title_verified`       | Dominio y titulo       |
| `sii_verified`         | Roles SII              |
| `sag_plano_verified`   | SAG y plano            |
| `geometry_verified`    | Deslindes y superficie |
| `party_verified`       | Partes                 |
| `price_verified`       | Precio y pago          |
| `legal_review_ready`   | Revision legal         |
| `warning_acknowledged` | Advertencia legal      |

### Mandatory Warning

Every readiness view and case creation action must show:

```text
La minuta generada automaticamente debe ser revisada y aprobada por abogado antes de usarse en notaria o como instrumento final.
```

## Accessibility and UX Requirements

- All status colors must include text labels.
- Evidence/action buttons must have accessible names.
- Tables must remain usable on narrow screens via responsive columns or drawers.
- Loading states distinguish extraction still running from values truly missing.
- Empty states should tell the user which document or manual action is needed.
