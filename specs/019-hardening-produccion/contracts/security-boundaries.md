# Contract: Security boundaries, workspace and private files

**Scope**: US1, FR-001–FR-009, FR-037, FR-042–FR-043.
**Default**: deny without revealing whether a foreign resource exists.

## 1. Request authorization order

Every protected route executes in this order:

1. verify session/capability signature and expiry;
2. resolve explicit active workspace (except a single-resource capability);
3. revalidate membership, role and Mini App session if applicable;
4. load the resource identifier carried by the URL/query through an organization-scoped query;
5. validate project assignment/ownership and requested operation;
6. validate request schema, headers, size and content;
7. execute the mutation + audit atomically, or use a compensable Storage operation;
8. return a redacted response.

For uploads, `projectId`, category and an optional replacement ID are URL/query parameters, not multipart fields. Steps 1–5 and header/declared-size checks happen before opening the multipart stream. The server then parses one bounded `file` part, validates actual bytes while streaming and only afterward may hash, decompress or parse it. `Content-Length` is an early hint, never the only size check.

## 2. Active workspace contract

`active_organization_id` is a selector, not an authority.

- **Web**: server-managed workspace context/cookie set after a user selection. A client may alter the selector, so every request still checks `organization_members`.
- **Mini App**: organization is bound to the server-issued Mini App session after Telegram `initData` verification; membership is revalidated on protected operations.
- **FastAPI/worker**: receives a verified user/service principal plus organization selected by the upstream event/resource; service role must load the resource and compare its organization.
- **Multiple memberships**: missing/ambiguous selection returns `409 WORKSPACE_REQUIRED`. No `.limit(1)`, insertion order or “most recent membership” fallback.

## 3. Actor/resource matrix

Legend: `R` read inventory, `S` read own sensitive data, `W` mutate, `—` deny, `C` exact capability read.

| Actor                           | Assigned project inventory     | Buyer/sale/doc data    | Private project file                | Own generated DOCX      | Project/file mutation            | Privileged internal operation  |
| ------------------------------- | ------------------------------ | ---------------------- | ----------------------------------- | ----------------------- | -------------------------------- | ------------------------------ |
| anonymous                       | —                              | —                      | —                                   | —                       | —                                | —                              |
| capability valid                | —                              | —                      | —                                   | C exact document        | —                                | —                              |
| capability expired/revoked      | —                              | —                      | —                                   | —                       | —                                | —                              |
| admin org A, active workspace A | R                              | S all in A             | R A                                 | R A                     | W A                              | only documented admin RPC      |
| seller A assigned to project    | R                              | S own operations only  | only explicitly seller-visible file | own sale DOCX           | business actions allowed by spec | —                              |
| seller A not assigned           | —                              | —                      | —                                   | —                       | —                                | —                              |
| user org B against A            | —                              | —                      | —                                   | —                       | —                                | —                              |
| Mini App valid admin/seller     | same as corresponding web role | same as role           | same as role/route                  | same as role            | same allowed operation           | —                              |
| Mini App expired/revoked        | —                              | —                      | —                                   | —                       | —                                | —                              |
| superadmin                      | audited support projection     | audited only           | via server support flow             | via server support flow | explicit support operation       | classified superadmin RPC only |
| worker/service role             | tenant-scoped job only         | tenant-scoped job only | exact object needed                 | exact generation        | service operation                | service-only grant             |

`superadmin` is not a blanket browser Storage policy. Elevated support access is a server operation with reason and audit.

“Assigned seller” has one authoritative meaning: an active `vendor_projects` row whose vendor, project and organization agree. `lots.vendedor_id`/approval ownership limits sensitive records to the seller's own operations but never grants or restores project inventory after `vendor_projects` is revoked. Web, Mini App, RLS helpers and service projections use this same rule and test revoke/reassign transitions.

## 4. Private file gateway

### Upload/replace

`POST /api/projects/{projectId}/files?category={category}&replacesFileId={optionalUuid}&caseId={signatureOnly}&generationId={signatureOnly}`

Required:

- authenticated admin and active workspace;
- `Idempotency-Key` header;
- URL-scoped `projectId`, allowlisted `category` and optional `replacesFileId` are authorized before body parsing;
- category `escritura_signature_evidence` additionally requires URL-scoped `caseId` and `generationId`; the server derives their project/tenant, requires a ready generation and freezes both bindings before body parsing;
- `multipart/form-data` contains exactly one bounded `file` part;
- server allowlist for category/MIME, magic bytes and size;
- project belongs to active workspace;
- canonical path created server-side.

Versioned category policy (also serialized in `scripts/production-readiness/thresholds.json`):

| Category                       | Accepted bytes                                     | Max each / active count  | Visibility       | Retention                          |
| ------------------------------ | -------------------------------------------------- | ------------------------ | ---------------- | ---------------------------------- |
| `project_image`                | JPEG, PNG or WebP extension+MIME+magic             | 15 MiB / 20 per project  | assigned project | soft-delete only; no auto purge    |
| `doc_dominio_vigente`          | PDF extension+MIME+`%PDF-` magic                   | 15 MiB / 1 current       | admin only       | legal; superseded retained         |
| `doc_hipoteca_gravamen`        | PDF                                                | 15 MiB / 1 current       | admin only       | legal; superseded retained         |
| `doc_roles`                    | PDF                                                | 15 MiB / 1 current       | admin only       | legal; superseded retained         |
| `doc_subdivision`              | PDF                                                | 15 MiB / 1 current       | admin only       | legal; superseded retained         |
| `doc_plano_oficial`            | PDF                                                | 15 MiB / 1 current       | admin only       | legal; superseded retained         |
| `doc_personeria`               | PDF                                                | 15 MiB / 1 current       | admin only       | legal; superseded retained         |
| `doc_otros`                    | PDF                                                | 15 MiB / 20 per project  | admin only       | legal; superseded retained         |
| `escritura_signature_evidence` | PDF                                                | 15 MiB / 1 per signature | admin only       | legal; immutable/retained          |
| `geometry_source`              | KMZ ZIP magic or KML XML root plus geometry limits | 20 MiB / 1 active import | admin only       | retained; no automatic hard delete |

Unknown category, extension/MIME/magic disagreement, count overflow or actual streamed size overflow fails before metadata commit. SDD019 performs no automatic hard delete in any category: the gateway marks/supersedes and records audit; any future organization retention policy requires a separate approved SDD.

Response:

```json
{
  "operationId": "uuid",
  "fileId": "uuid",
  "projectId": "uuid",
  "category": "doc_subdivision",
  "sha256": "hex",
  "status": "ready",
  "reference": { "type": "legal_document", "id": "uuid" }
}
```

The response never returns service keys, bucket listing, arbitrary storage path or signed URL. Same operation/payload returns `200` with the same IDs; first creation returns `201`.

For signature evidence the response reference is `{ "type": "escritura_signature_evidence", "caseId": "uuid", "generationId": "uuid" }`. Those bindings are immutable and the file can be consumed by at most one signature event; same-project alone is insufficient authority.

For legal categories, metadata, `legal_documents.project_file_object_id`, ingestion obligation and audit converge through the gateway contract. Onboarding/project creation never sends `storage_bucket`/`storage_path` and never launches best-effort per-document registration after returning success. A failure after byte acceptance returns `STORAGE_REPAIR_REQUIRED` with a durable finding; retrying the same operation converges to the same `fileId`/reference.

### Delete/revoke

`DELETE /api/projects/{projectId}/files/{fileId}` with `Idempotency-Key`.

The server scopes the metadata row first, performs an audited logical delete, revokes current references/capabilities and preserves the accepted object as retained evidence. SDD019 never physically removes an accepted or historical object through this endpoint. Physical compensation is allowed only for bytes that were uploaded by the same operation but never committed as accepted metadata; any metadata/reference/Storage mismatch creates a durable repair finding. A raw path from the client is never a delete authority.

### Authenticated read

`GET /api/files/{fileId}`. The server resolves resource kind, tenant, project, bucket and object key from the opaque ID; none is accepted as client authority.

The route validates role/assignment and resolves the canonical path from DB; it does not trust trailing path segments. It streams bytes server-side. A Storage signed URL may exist internally for at most 60 seconds, but is never returned in `Location`, JSON, logs or browser-visible network data. Foreign/not-found both return the same public `404 RESOURCE_NOT_FOUND`.

### Capability read

`GET /api/escritura-deliveries/capability/{token}`

- DB stores only `sha256(token)`;
- constant-time hash comparison;
- one delivery/generation/document;
- max issuance TTL: seven days;
- member/assignment that originated the link must remain valid;
- `revoked_at`, expired status or changed artifact hash denies;
- successful access logs token fingerprint prefix, delivery ID and result, never token/URL;
- revalidates access before every request and streams bytes server-side;
- may create a 60-second Storage URL only for the server-to-Storage hop; it is never exposed to the client and grants no list, replace or delete.

Renewal invalidates the previous hash before issuing a new token. Revocation, expiry or membership loss rejects every request started after that state change; bytes already received by a client cannot be recalled.

### Legacy plaintext capability cutover

The read-only preflight emits one fingerprinted row per non-null `link_token`: delivery/generation IDs, recipient resolution status, current access mode and proposed replacement, never the token. This cutover runs while persisted `document_capabilities` and its deployment hard-off remain OFF. After backup and human approval, a guarded idempotent operation may:

1. require an unambiguous active recipient and current ready artifact;
2. verify authenticated same-origin access to the exact artifact for that recipient; it must not issue or stage a hashed capability while the control is OFF;
3. record notification and replacement verification;
4. revoke the old link and only then set legacy `link_token` null in the same audited transition.

Ambiguous/inactive/unreachable recipients, or recipients without a verified authenticated replacement, remain `production_readiness_findings` blockers and prevent enforcement; they are never silently revoked. Replay uses the same plan fingerprint. T112 compares the executed report with the T105 plan before final direct-access revocation. New hashed capabilities may be issued only through the normal operation after GO, once T121 has cleared the hard-off and enabled `document_capabilities`; they are not a pre-enforcement escape hatch.

### No Storage URL projection

This invariant applies to every current and future producer, including:

- web matrix/document history;
- FastAPI generation create/list/detail responses;
- delivery list/renew and Telegram captions;
- Mini App `evidencia_url`/bandeja detail;
- legacy `/documents/generate` and `generated_documents`;
- legal evidence and onboarding responses.

`signedURL`, `signedUrl`, `download_url` pointing to Storage, Storage hostnames, bucket, `storage_path` and `object_path` must not appear in `Location`, public JSON/OpenAPI DTOs, Telegram/Mini App payloads, browser-visible requests or logs. Public identities are `fileId`, `generationId`, `deliveryId` and Plotify same-origin routes. Internal ≤60-second Storage access is consumed entirely server-side.

### Public avatar exception

Avatars are not legal/private project files, but public display does not authorize metadata enumeration. Anonymous and authenticated actors may fetch an already-known opaque object key; global `.list()` is denied. An authenticated user may create/update/delete only their own object, paths contain no email/phone/name and cross-user mutation is denied. If the Supabase advisor reports the public bucket generically, the finding closes only with pgTAP/API evidence for no-list and owner isolation, not by accepting the warning from its title.

## 5. Privileged operation classification

Every existing/new privileged function must appear in the implementation inventory with:

```text
schema.signature | class | security mode | allowed DB roles |
business actor | tenant derivation | caller(s) | audit event | test IDs |
definitionHash | grantFingerprint | searchPath | introducedByMigration
```

The authoritative set is discovered from `pg_proc`, routine ACLs, functions referenced by triggers and helpers referenced by RLS policies. The generated set and versioned classification must be exactly equal: zero missing, duplicate or stale signatures. The comparison runs after foundation and after every migration that creates/replaces a routine, then against the linked target before enforcement; no `length === N` assertion is valid.

| Class        | Exposure rule                                                                                      |
| ------------ | -------------------------------------------------------------------------------------------------- |
| trigger-only | no execute grant to PUBLIC/anon/authenticated; qualified tables; fixed empty search path           |
| RLS helper   | non-exposed schema; only minimum execute role; no arbitrary tenant parameter accepted as authority |
| user RPC     | preferably security invoker; auth.uid + persisted role/resource checks; explicit signature grant   |
| service-only | service_role only; API/worker still validates organization against resource                        |

New functions/tables/sequences receive explicit grants. For every owner that creates canonical migration objects and every application schema, `ALTER DEFAULT PRIVILEGES` revokes broad defaults from `PUBLIC`, `anon`, `authenticated` and `service_role`; required access is granted per object afterward. The inventory snapshots normalized `pg_default_acl` owner/schema/object-type/grantee/privilege rows, and pgTAP creates then drops transactional table/function/sequence probes as the migration owner to prove no privilege is inherited accidentally. RLS, current-object grants and future-object defaults are three separate assertions.

## 6. Stable errors

| HTTP | Code                       | Meaning                                                      |
| ---: | -------------------------- | ------------------------------------------------------------ |
|  400 | `INVALID_REQUEST`          | malformed schema/path/category                               |
|  401 | `AUTH_REQUIRED`            | missing/invalid session                                      |
|  401 | `CAPABILITY_INVALID`       | capability invalid/expired/revoked; same body for each cause |
|  403 | `OPERATION_FORBIDDEN`      | authenticated actor lacks role/assignment                    |
|  404 | `RESOURCE_NOT_FOUND`       | absent or foreign resource; no existence leak                |
|  409 | `WORKSPACE_REQUIRED`       | multiple memberships and no valid active selection           |
|  409 | `IDEMPOTENCY_CONFLICT`     | same key, different request hash                             |
|  409 | `APPROVAL_CANDIDATE_STALE` | matrix/snapshot/evidence/policy changed during validation    |
|  503 | `FEATURE_DISABLED`         | rollout control is OFF/fail-closed for this resource         |
|  413 | `FILE_TOO_LARGE`           | compressed/body limit                                        |
|  415 | `UNSUPPORTED_FILE_TYPE`    | MIME/magic mismatch                                          |
|  429 | `RATE_LIMITED`             | actor/org quota; includes safe retry-after                   |
|  500 | `STORAGE_REPAIR_REQUIRED`  | convergent repair recorded; no internal details              |

## 7. Audit and logging

- Critical mutations write `operation_id`, `event_key`, actor, organization, entity and result in the same DB commit.
- Denials log reason code and resource type without foreign IDs if that would reveal existence.
- Never log body, buyer data, document text, token, signed URL, service key or full stack to the client.
- External URLs must match allowlist and normalized host; redirects are revalidated; timeout total ≤10 seconds.

### Exact privileged HTTP/runtime inventory

`privileged-http-surfaces.json` is generated from FastAPI `app.routes`, Next Route Handlers/Server Actions and worker symbols that can reach service-role, Supabase Auth admin or `INTERNAL_API_SECRET`. Its versioned classification is exact—missing, stale or duplicate rows fail—and records method/path/symbol, callers, trusted principal source, resource→tenant derivation, business role, service capability, audit/idempotency and negative test IDs. A shared secret authenticates only the calling service; `X-User-Id`, `organization_id`, project/user/vendor IDs or body fields never authorize the human/tenant. User flows forward a verified user principal; service jobs use a short-lived audience/body-bound assertion and still derive tenant from persisted resources.

The inventory explicitly covers vendor invite/assign/remove, Prompt Ops, bots, skills, integrations, documents and all newly discovered surfaces. Removing membership from one organization never deletes the global Auth identity. Global identity deletion is a distinct superadmin operation that proves zero active memberships and has separate approval/audit. Vendor membership/profile/assignment mutations use an idempotent DB intent/finalize saga: Auth happens outside the transaction, while DB state+audit finalize atomically; failure leaves compensation/repair evidence, not an orphan silently accepted.

### Runtime egress and inbound webhook inventory

`runtime-egress-surfaces.json` derives all production `fetch`, HTTP library, provider SDK and LLM constructors/calls from web/API/worker. Classification records runtime class, callsite fingerprint, allowed scheme/host/path/redirects, total timeout ≤10 s, secret/data class, transaction boundary, retry/idempotency, redaction and test IDs. New/missing/stale rows fail. Browser components call only same-origin gateways; `microservice.client`, Prompt Ops, bots, Chile location/UF and LLM clients use centralized guarded adapters.

Meta webhooks verify `X-Hub-Signature-256` over raw bytes with constant-time HMAC before parsing/enqueue. Telegram webhook secret is mandatory/fail-closed in production and bound to the configured organization/bot. Both deduplicate provider/update ID before effects, reject missing/invalid/tampered/cross-org input, and never log raw body, callback/chat/phone, token or PII.

Production startup rejects blank/default/placeholder Mini App, webhook, encryption or internal secrets and non-HTTPS/unallowlisted remote base URLs. Deployment evidence contains only config schema version and fingerprints/presence. Prompt Ops and bot configuration are either functional through authenticated same-origin gateways or absent from navigation; a visible broken/direct-browser surface blocks GO.

## 8. Required tests

- pgTAP matrix for anon/authenticated/service roles over tables, functions and `storage.objects`;
- cross-tenant reads/writes/list/delete for admin A, seller assigned/unassigned and user B;
- valid/expired/revoked/tampered capability plus membership loss;
- Mini App valid/expired/revoked and workspace mismatch;
- superadmin support action requires reason/audit;
- every public/API/Mini App/Telegram document projection contains no Storage URL/path;
- legal onboarding registration converges by `fileId` and never returns partial success;
- avatars allow known-object read but deny global list and cross-user mutation;
- generated privileged inventory equals catalog/ACL/trigger/policy set after every migration;
- generated privileged HTTP inventory exactly equals reachable service-role/internal-secret Route/FastAPI/Action/worker surfaces, with cross-tenant tests;
- generated runtime egress inventory exactly equals HTTP/SDK/LLM callsites and every row proves allowlist/redirect/≤10 s/redaction/retry policy;
- Meta/Telegram webhook missing-invalid-tampered/replay/cross-org tests and production startup rejection of blank/default secrets;
- Prompt Ops and bot configuration same-origin happy path plus anon/cross-tenant denial; no browser token/base URL;
- secret scanner and dependency audit gates;
- verify no direct browser Storage mutation remains in source.

## 9. Capability issuance and rotation

Each capability is an issuance row, not a mutable token on the delivery. The server generates 32 CSPRNG bytes, base64url encodes them, returns plaintext only once and stores a globally unique contextual SHA-256 hash. A renewal locks delivery/current issuance, inserts a new row with a new seven-day TTL from `issued_at`, rotates/revokes the previous row and updates the active pointer plus audit atomically. A replay after the plaintext was consumed returns IDs/status and `CAPABILITY_TOKEN_ALREADY_CONSUMED`; a new operation identity rotates again. The old token fails immediately. `renewed` is historical, never an active-access state.
