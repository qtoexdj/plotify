# Contract: Escritura semantic quality, durable workflow and delivery

**Scope**: US2 + US4, FR-010–FR-016, FR-025–FR-032, FR-042, FR-044.

## 1. Three document levels

| Level                       | Structured gaps              | Literal placeholders in rendered bytes             | External delivery           |
| --------------------------- | ---------------------------- | -------------------------------------------------- | --------------------------- |
| project/case matrix         | allowed and typed            | not an artifact                                    | no                          |
| internal draft              | allowed, visible as blockers | may be rendered only as non-deliverable diagnostic | no                          |
| approved/deliverable minuta | zero required gaps           | forbidden                                          | yes, only semantic `passed` |

Acknowledging a legal warning is not legal approval. `exceptions_only` inheritance requires a project matrix previously approved by an actor with a current `legal_approval_grants` row. An active admin may delegate to another member but never self-grant; single-admin bootstrap requires superadmin reason/audit. Admin membership alone is insufficient. Provenance/version/snapshot/policy must remain unchanged and the new artifact must obtain a semantic pass.

Policy behavior is explicit and versioned:

- `every_sale`: every case remains `awaiting_review` until a legal grant holder approves that exact case;
- `exceptions_only`: inheritance is possible only with zero blocking exception and unchanged approved project-matrix provenance;
- when `four_eyes=true`, the legal approver is a different active user from the preparer/commercial approver, and the approval snapshot records both IDs;
- rejection records reason/version, keeps the durable obligation actionable and cannot schedule generation/delivery until a later valid approval.

## 2. Matrix schema v2: `optional_phrase`

```json
{
  "type": "optional_phrase",
  "attrs": {
    "conditionKey": "comprador.oficio.present",
    "mode": "omit"
  },
  "content": [
    { "type": "text", "text": ", de profesión " },
    {
      "type": "variable_token",
      "attrs": { "variableKey": "comprador.oficio", "label": "oficio", "format": null }
    }
  ]
}
```

- true: resolve children and unwrap the full phrase;
- false/not applicable: remove the complete node including punctuation/connectors;
- missing/blocked condition: keep a structured blocker; never convert to empty resolved text;
- v1 published templates remain immutable; migration creates a new template/version and translates known optional phrases explicitly.

Seller appearance facts are structured before prose. `titulo.propietarios[]` projects to `vendedor.comparecientes[]`; every subject has stable `personId` persisted from an upstream subject ID or one-time server identity reconciliation, never array index/name. Nationality, marital status and treatment are evidenced per person and never inferred. Missing required nationality produces `SEM_MISSING_REQUIRED` at `vendedor.comparecientes[personId=<uuid>].nacionalidad`. The title agent may return `null`, never `[NACIONALIDAD]`; the final comparecencia is materialized deterministically only after required facts are resolved or a grant holder approves a traced manual resolution.

## 3. Semantic validator input/output

Input binds:

```json
{
  "organizationId": "uuid",
  "caseId": "uuid",
  "snapshotHash": "hex",
  "matriz": { "id": "uuid", "version": 4 },
  "template": { "id": "uuid", "version": 2 },
  "approvalAttempt": {
    "id": "uuid",
    "origin": "human|system",
    "legalGrantId": "uuid",
    "operationId": "uuid",
    "reviewPolicyFingerprint": "hex"
  },
  "evidenceManifestHash": "hex",
  "provenanceManifestHash": "hex",
  "resolvedAst": {},
  "resolutionManifest": {},
  "rendererVersion": "matriz-docx/2",
  "rulesetVersion": "semantic/1"
}
```

Output after AST check and temporary DOCX extraction:

```json
{
  "status": "failed",
  "resolvedContentHash": "hex",
  "artifactSha256": "hex",
  "issues": [
    {
      "code": "SEM_PLACEHOLDER_LITERAL",
      "severity": "blocking",
      "clauseKey": "comparecencia",
      "path": "comprador.nacionalidad",
      "evidenceRef": null,
      "messageKey": "semantic.placeholder_literal"
    }
  ]
}
```

Stable issue codes:

| Code                         | Condition                                                       |
| ---------------------------- | --------------------------------------------------------------- |
| `SEM_UNRESOLVED_TOKEN`       | AST retains `variable_token`/unknown token                      |
| `SEM_MISSING_REQUIRED`       | required typed gap unresolved                                   |
| `SEM_PLACEHOLDER_LITERAL`    | `[NACIONALIDAD]`, underscores or equivalent literal filler      |
| `SEM_FILLER_LINE`            | line/marker allowed only in internal diagnostic                 |
| `SEM_EMPTY_GRAMMAR_UNIT`     | optional value removed without its phrase                       |
| `SEM_ORPHAN_CONNECTOR`       | normalized `salvo ,`, `salvo .`, `será .` or ruleset equivalent |
| `SEM_ORPHAN_PUNCTUATION`     | punctuation sequence after normalization                        |
| `SEM_DUPLICATE_CLAUSE`       | duplicate normalized legal block beyond allowlist               |
| `SEM_FACT_MISMATCH`          | rendered fact differs from approved snapshot/evidence           |
| `SEM_MISSING_EVIDENCE`       | factual claim lacks required evidence status                    |
| `SEM_PROVENANCE_INCOMPLETE`  | historical artifact lacks reconstructable approved provenance   |
| `SEM_ARTIFACT_HASH_MISMATCH` | bytes do not match persisted validation/generation              |

Normalization, legal duplicate allowlist and fixtures are versioned. Issues contain paths/references, not full sensitive text.

## 3A. Structured seller-fact manual resolution

```http
PATCH /api/v1/escritura-cases/{caseId}/seller-comparecientes/{personId}/{field}
Idempotency-Key: <opaque>
```

```json
{
  "value": "chilena",
  "expectedVersion": 4,
  "reason": "Corrección contra certificado revisado",
  "attestationRef": "legal_document:<uuid>#page=2"
}
```

`personId` is a persisted subject UUID, never array index or display name; reorder/reanalysis must retain it or create a blocking ambiguous-match finding. `field` is an allowlisted structured fact such as `nacionalidad`, never arbitrary JSON/text. The server derives organization/project/person, requires an active legal approval grant, non-empty reason and attestation/evidence in the same scope, then inserts a new field resolution carrying previous/new version, grant ID, attestation, reason, reviewer/time and audit. Missing grant/reason/attestation, stale version, foreign/ambiguous person or stringified object is rejected. This operation resolves facts; it does not approve a matrix, and a pending approval attempt becomes stale.

## 3B. Approval candidate and finalization

Manual `approve_case_matriz` and automatic `_system_approve_matriz` use one sequence:

1. `begin_matriz_approval` locks the matrix, validates state, legal grant, inheritance/four-eyes policy and creates immutable attempt `validating`; matrix remains unapproved.
2. Resolve AST and render temporary DOCX without Storage upload.
3. Validate AST+bytes against the attempt.
4. Failure records redacted issues, returns `422 DOCUMENT_SEMANTIC_INVALID` and leaves `approved_at`, decision, stage, generation and delivery unchanged.
5. PASS calls `finalize_matriz_approval` with expected matrix/template versions and snapshot/evidence/policy hashes.
6. The RPC re-locks attempt+matrix+grant. Any change marks the attempt `stale` and returns `409 APPROVAL_CANDIDATE_STALE`.
7. An unchanged candidate atomically inserts the effective approval decision, performs the only allowed `semantic_validation.approval_id` binding (`NULL → new approval id`), changes matrix status and writes audit. A trigger forbids second binding or mutation of result/hashes/issues; after finalization the full envelope is immutable.

No endpoint or worker may update a matrix directly to approved. A system-origin attempt still requires the inherited project approval/grant/policy and cannot bypass render or validation.

## 4. Generation contract

Authoritative automatic fingerprint:

```text
sha256('minuta-generation-v2' | org | case | snapshot |
       matriz_id | matriz_version | template_id | template_version |
       renderer_version | ruleset_version | schema_version |
       normalization_version | approval_id | provenance_manifest_hash |
       review_policy_fingerprint)
```

Flow:

1. claim idempotency/outbox and fingerprint;
2. resolve AST and facts;
3. render temporary DOCX;
4. validate AST + bytes and persist semantic validation;
5. if failed: delete temp/no upload/no generation/no delivery, return stable issues;
6. if passed: upload to deterministic fingerprint path;
7. insert one immutable generation linked to validation;
8. schedule unique deliveries.

Crash after upload reuses the same path/fingerprint; terminal failure records repair/cleanup. Twenty concurrent calls produce one automatic generation. Manual regeneration requires `Idempotency-Key`, a non-empty `reason` and actor and creates a separate `generation_mode=manual` row.

Historical inspection downloads existing bytes and produces `validation_origin=historical_revalidation`; it never regenerates or overwrites. A byte-only inspection may add blocking issues but cannot return `passed`. Historical status becomes deliverable only if the system reconstructs the exact approved snapshot, resolved AST/manifest, matrix and template versions, renderer/ruleset, evidence and original legal approval, then proves the existing artifact hash matches that chain. Missing bytes or provenance remain `unverified`; regeneration from current approved sources creates a new generation.

Public generation response:

```json
{
  "generationId": "uuid",
  "semanticStatus": "passed",
  "generationStatus": "ready",
  "deliveryStatus": "pending",
  "fingerprint": "hex"
}
```

Semantic failure is `422 DOCUMENT_SEMANTIC_INVALID` with issue codes; it must not be flattened to `500`.

## 5. Sale commit and outbox event

`approve_sale` transaction:

```text
lock approval request + lot
validate same org/admin/pending/idempotency hash
require exact vendor has active user_id or return VENDOR_USER_LINK_REQUIRED before mutation
apply sale and buyer snapshot
set lot_records.etapa_proceso = espera_firma_escritura
update lots/lot_records timestamps
write atomic audit
insert one workflow_outbox event
commit
```

Outbox payload is versioned and contains IDs, approved matrix/template policy fingerprint and recipient snapshot, not buyer PII/document text.

```json
{
  "schemaVersion": 1,
  "approvalRequestId": "uuid",
  "approvedTransitionVersion": 1,
  "lotId": "uuid",
  "caseId": "uuid-or-null",
  "saleVendorUserId": "uuid",
  "adminUserIds": ["uuid"],
  "reviewPolicy": "exceptions_only",
  "policyFingerprint": "hex"
}
```

The unique event identity is `sha256('outbox-v1' | event_type | organization_id | approval_request_id | approved_transition_version)`. Replay of the same transition returns the same row; a legitimate reversal/new approval increments the transition version.

API/worker crash after commit cannot lose the event. Enqueueing ARQ is an optimization/wakeup, not the durable handoff.

## 6. Worker claim/retry contract

- resolve `automatic_escritura` inside the service-only claim RPC before leasing a due row;
- missing/error/OFF/hard-off atomically moves the row to `deferred_feature_off`, clears lease/heartbeat, preserves `attempt_count` and schedules an eligibility recheck with bounded backoff;
- ON claims due rows with DB time + `FOR UPDATE SKIP LOCKED`;
- lease 60 s, heartbeat every 15 s;
- re-resolve the control after claim and before the first effect; a flip to OFF calls the service-only release/defer RPC, clears the lease and consumes no attempt;
- increment `attempt_count` only when the first effect begins after the second eligibility check;
- max 8 attempts; backoff 5/15/30/60/120/300/900/1800 seconds;
- retryable: network, timeout, provider 429/5xx, temporary Storage/DB connectivity;
- terminal: tenant mismatch, semantic invalid, missing legal approval/evidence, corrupt immutable payload;
- expired lease is reclaimable with same operation/fingerprint;
- terminal after attempts -> `dead_letter` + alert/runbook; no silent completion.

An audited control wakeup/CAS returns eligible `deferred_feature_off` rows to `pending`; the scheduled `available_at` fallback prevents a hot-loop if no wakeup arrives. Deferral never creates a second outbox row, a retry error or a DLQ event.

Every step is idempotent and checks persisted result before executing.

## 7. Recipient and channel snapshot

At sale commit:

- seller = `vendor_id`/user bound to the exact approved `approval_request`, required;
- admins = all active admin members at that instant;
- web delivery to seller = required;
- seller Telegram and admin Telegram = create only when configured; secondary;
- admin web access through legal desk remains role-derived, not one capability per admin.

Retry uses the frozen IDs. Loss of seller assignment/membership revokes the capability; it cancels a still-unsatisfied obligation but does not erase a historical `available_at/sent_at`. A replacement recipient requires an audited admin operation. New admins do not receive historical obligations automatically.

## 8. Independent status axes

```json
{
  "semanticStatus": "unverified|failed|passed",
  "generationStatus": "pending|rendering|ready|failed",
  "deliveryStatus": "pending|partial|complete|failed|cancelled",
  "capabilityStatus": "none|active|expired|revoked",
  "signatureStatus": "awaiting|recorded",
  "nextRetryAt": "timestamp|null",
  "lastErrorCode": "string|null"
}
```

Rules:

- `generationStatus=ready` requires semantic passed and matching bytes;
- `deliveryStatus=complete` requires seller web `available` and records immutable `available_at`; optional first access is separate evidence;
- Telegram/admin secondary failure with seller web available => `partial`;
- any required web pending/failed/unavailable/cancelled => not complete;
- capability expiry/revocation changes current access status without erasing historical availability/delivery; renewal is an audited operation on the same obligation;
- `escritura_firmada` is unrelated to these axes and only follows a real signature event.

## 8A. External signature evidence event

```http
POST /api/v1/escritura-cases/{caseId}/signature-events
Idempotency-Key: <opaque>
```

```json
{
  "generationId": "uuid",
  "signedAt": "timestamp",
  "evidenceFileId": "uuid",
  "reason": "Constancia de escritura firmada"
}
```

The server derives organization/project/lot from the case, requires an active authorized actor, a `ready` generation with current semantic PASS, stage `espera_firma_escritura`, non-future time and an unconsumed `escritura_signature_evidence` file already bound to that exact case+generation. Same-project evidence is insufficient. `record_escritura_signature` locks the evidence and atomically writes immutable event, stage, idempotency result and audit; `evidence_file_id` is unique across events. Direct stage mutation is forbidden. Stable errors: `SIGNATURE_EVIDENCE_REQUIRED`, `SIGNATURE_SCOPE_MISMATCH`, `SIGNATURE_EVIDENCE_ALREADY_USED`, `SIGNATURE_GENERATION_NOT_READY` and `SIGNATURE_STAGE_CONFLICT`.

This is administrative recording of a signature completed outside Plotify; it is not an electronic-signature provider integration.

## 9. Delivery obligation

Unique `(generation_id, recipient_user_id, channel)`.

```json
{
  "generationId": "uuid",
  "recipientUserId": "uuid",
  "recipientRole": "sale_vendor",
  "channel": "web",
  "required": true,
  "deliveryStatus": "pending",
  "capabilityStatus": "none",
  "attemptCount": 0,
  "nextAttemptAt": "timestamp"
}
```

Web capability uses the security contract. Every access revalidates semantic `passed`, generation `ready`, artifact checksum/version, current legal approval/provenance/policy, delivery/capability state and recipient membership/assignment before streaming. Storage objects are immutable/no-upsert at the deterministic path; the gateway checks object metadata checksum and bounded-stream SHA-256 against `artifact_sha256`, and any mismatch returns `CAPABILITY_INVALID`, raises `SEM_ARTIFACT_HASH_MISMATCH`/incident and delivers zero bytes. Telegram client enforces allowlisted API host, normalized URL, total timeout ≤10 s and redacted errors. Provider calls never run inside a DB transaction. A retry updates the existing obligation; it never inserts another row.

## 10. Observability contract

Metrics without PII:

- `workflow_outbox_oldest_seconds{status}` and depth;
- `workflow_lease_expired_total`, retry and DLQ totals by code;
- `sale_to_case_seconds`, `case_to_document_seconds`, `document_to_web_seconds`;
- semantic rejects by stable code/ruleset;
- deliveries by channel/status/error class;
- deterministic Storage repair count.

Alert if a due obligation remains >120 s after worker/dependency recovery, any lease expires repeatedly, DLQ increases, required delivery fails, or the same semantic code repeats over threshold. Alert links a runbook and IDs only.

## 10A. Provider identity and general worker reliability

The first authenticated Telegram/Meta boundary derives `provider_event_key = sha256(provider | bot/account | update/message_id)` and claims one `idempotency_operations` row before any reservation, approval, enqueue or notification. The same `operation_id` is propagated without replacement; same provider identity with a different canonical payload is conflict, including a replay after the webhook claim or worker crash.

ARQ is not durable state. General jobs outside `workflow_outbox` wrap normal exceptions in explicit classified `arq.Retry` with bounded backoff or write a redacted durable `worker_job_failures` dead-letter record and alert. `on_job_end` consumes only documented ARQ outcome data and never treats absent context fields as success. The workflow outbox remains the sole durable state for escritura work and must not be duplicated by generic DLQ rows.

## 11. Required tests

- golden template valid/missing/not-applicable; extracted DOCX assertions;
- every issue code fixture, including fact mismatch and allowed legal duplicate;
- seller nationality evidenced/missing/manual-approved/manual-unapproved, with zero literal `[NACIONALIDAD]`;
- manual and system approval candidate PASS/fail/stale; failure changes no approval/state/upload/generation/delivery field;
- invalid document leaves no upload/generation/delivery;
- historical byte revalidation vs regeneration;
- crash after sale commit, render, upload and before generation insert;
- 20 concurrent cascades same fingerprint;
- recipient snapshot remains stable when a newer sale request/admin membership appears;
- seller membership loss revokes capability;
- Telegram unavailable/timeout => partial, web historically available, same delivery row retried;
- `escritura_firmada` impossible without signature evidence;
- signature event authorization, tenant/evidence scope, replay/payload conflict and 20-way race;
- integration host allowlist, redirect revalidation and ≤10 s timeout.
