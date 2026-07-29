# Quickstart: Production readiness verification for SDD019

**Current status**: **NO-GO**. This quickstart is the acceptance protocol for the implementation; the existence of this document does not make the current system production-ready.

## 0. Safety rules

- Use test data only until the final approved pilot run.
- Default every script to `--no-destructive`.
- Confirm project ref/URL before any linked Supabase command.
- Never paste admin/vendor passwords, JWTs, service keys, signed URLs or document text into reports or git.
- Migration repair, `db push`, data remediation, branch deletion and restore require explicit operator approval and backup/evidence.
- The gate inventories data; it never cleans automatically.

## 1. Prerequisites

- Branch `019-hardening-produccion`.
- Node.js `>=22.13`, pnpm 11, Python 3.13 virtualenv, Supabase CLI and Chromium for Playwright. Docker is not part of the Supabase workflow.
- `gitleaks` and `pip-audit` versions/checksums match `scripts/production-readiness/tool-versions.json`; package-manager audits use committed lockfiles and the wrapper separates current-tree from Git-history findings.
- API, worker and web running when a live scenario requires them.
- The currently linked Free-plan project `swkrnjdpnlrgxgotmfxy` is read-only for SDD019. The final project ref and fingerprint are recorded in the approved final-target cutover evidence; a cloud branch may be used only when an approved disposable-target rehearsal explicitly requires it.
- Two test organizations and these accounts/sessions:
  - admin A;
  - seller A assigned to the test project;
  - seller A not assigned;
  - admin/user B;
  - valid and expired/revoked Mini App sessions;
  - superadmin support actor whenever that role/grant exists in the target; otherwise evidence that the bypass is absent.
- Credentials entered interactively or through ignored environment variables. Do not write them into this directory.

## 2. Read-only preflight

```bash
git status --short
codegraph status .
codegraph sync .
pnpm verify:migrations
```

Expected:

- intended branch and only expected changes;
- healthy/up-to-date CodeGraph index;
- canonical migration source valid;
- target confirmation printed without credentials.

Capture read-only evidence:

```bash
cd packages/database
supabase migration list
```

The current Free-plan linked project is a legacy verification target only. It must not receive SDD019 migrations, migration-history repairs, or schema changes: it has no recoverable backup on that plan. The canonical SDD019 migration files remain append-only and unchanged so they can be applied to the final, newly provisioned Supabase project.

Fetch Supabase security/performance advisors through the approved MCP/management path and store only redacted JSON/counts. Starting audit was 83 security warnings and 558 performance notices; a final gate compares both exact findings and baseline, not only totals.

Generate exact DB privileged, HTTP/internal-service, runtime-egress and structured-log inventories from the real catalog/code. A hard-coded count is invalid; missing, duplicate or stale classifications, unsafe runtime config, broken same-origin Prompt Ops/bot paths, invalid webhooks or leaked-password protection disabled keep NO-GO.

## 3. Final Supabase project cutover

Do not reconcile, fetch, rename, or repair migration history from the current Free-plan project. When the final Supabase project exists, link the workspace to that new project and confirm its fingerprint. Its migration history must be reviewed before the first controlled push; if it is not a fresh target, stop and produce an approved migration/restore plan instead of guessing.

Before a state-changing push to the final project, record explicit operator approval, target fingerprint, a recoverable backup/restore plan, and the dry-run result. Then use only the approved guarded migration-push gate. T077's database application and linked pgTAP verification remain pending until that final project is linked; local source and `pnpm verify:migrations` can be verified now, but do not substitute for the final-target receipt.

Never invoke raw Supabase repair, MCP `apply_migration` or raw `db push`. Both the additive and enforcement push use distinct output directories and pass `verify-evidence --kind migration-push`; a successful parity check after the fact does not replace the mutation receipt.

## 4. Cloud-only database testing

Never create or use a local Supabase database. Foundation pgTAP tests run transaction-rolled-back against the linked project. A disposable Supabase cloud branch is permitted only for a later reset/restore rehearsal with its fingerprint confirmed and explicit operator approval. `supabase start`, `--local`, local Docker and local `db reset` are prohibited.

On the confirmed disposable target, create approval evidence binding actor/reason, target fingerprint, candidate SHA and expected migration maximum, then use only the guarded wrapper:

```bash
node scripts/production-readiness/verify-evidence.mjs \
  --kind restore-approval \
  artifacts/production-readiness/restore/approval.json
pnpm restore:rehearsal -- \
  --target disposable \
  --approval-evidence artifacts/production-readiness/restore/approval.json \
  --allow-disposable-reset \
  --expected-max-version 20260713000600 \
  --candidate-sha HEAD \
  --output artifacts/production-readiness/restore
```

Expected:

- all canonical migrations replay in timestamp order;
- controlled seed/fixtures create test roles/tenants only;
- pgTAP exits green;
- schema/grant/policy fingerprint matches the expected artifact.

Do not use the linked project for `db reset`.

## 5. Canonical quality gates

From repository root:

```bash
pnpm verify:migrations
pnpm --filter @plotify/database test:db:linked -- supabase/tests/database/sdd019_foundation.test.sql
pnpm contracts:generate
pnpm --filter @plotify/database types:generate:linked
git diff --exit-code -- packages/contracts apps/web/src/lib/services/plotify-chat.generated.ts packages/database/types/database.generated.ts
pnpm test:api
pnpm test:web
pnpm --filter web lint
pnpm format:check
pnpm typecheck:web
pnpm build:web
pnpm --filter @plotify/database privileged:inventory -- \
  --target linked \
  --classification specs/019-hardening-produccion/evidence/privileged-operations.classification.json \
  --output specs/019-hardening-produccion/evidence/privileged-operations.json \
  --assert-complete --assert-default-acl
```

If contract generation intentionally changes outputs, review and commit both OpenAPI and the generated web client before using `git diff --exit-code` as the gate. Never hand-edit `packages/contracts/openapi/plotify-chat.v1.json` or `apps/web/src/lib/services/plotify-chat.generated.ts`.

## 6. Scenario A — Tenant and Storage matrix

Fixtures: private project/file/document in org A; another project in B; seller assigned and unassigned; capability valid/expired/revoked.

For each actor, exercise list/read/upload/replace/delete plus privileged RPCs:

| Actor                               | Expected                                 |
| ----------------------------------- | ---------------------------------------- |
| anonymous                           | all private operations denied            |
| admin A / workspace A               | org A admin operations pass              |
| seller assigned A                   | project inventory + own sale/doc only    |
| seller unassigned A                 | no project data                          |
| admin/user B                        | no existence/path/metadata from A        |
| valid Mini App                      | same permissions as bound role/workspace |
| expired/revoked Mini App            | denied                                   |
| valid capability                    | one exact DOCX read only                 |
| expired/revoked/tampered capability | same generic denial                      |
| service worker                      | exact tenant-scoped job only             |

Assertions:

- no browser source calls `.storage.from('project-files').upload/remove` directly;
- auth/workspace/resource checks happen before reading upload bodies;
- changing active workspace or membership revokes access immediately;
- capability ≤7 days and DB stores hash only; the gateway streams server-side and no signed Storage URL appears in redirects, JSON, logs or browser-visible requests;
- matrix generation/list, delivery/list/renew, Telegram captions, Mini App evidence and legacy document generation expose only Plotify IDs/routes; no `signedURL`, Storage host, bucket or path appears;
- onboarding and project update exchange only `fileId`; legal metadata/reference/ingestion failure returns error+repair finding rather than project success;
- avatar retrieval by a known opaque key works, while anon/authenticated global list and cross-user mutation fail;
- pgTAP proves grants and RLS independently;
- denied requests reveal no foreign IDs/paths.

Any cross-tenant success is an immediate NO-GO.

## 7. Scenario B — Project and geometry

1. Create a project with N lots using one `Idempotency-Key`.
2. Repeat the exact request 20 times concurrently.
3. Reuse the key with one changed field.
4. Inject a failure after each project/lot write.

Expected: one project, exactly N lots, one audit chain; changed payload `409`; injected failure leaves zero partial core rows.

Then upload a four-feature KMZ/KML:

1. exact same bytes/name and same bytes/different name;
2. same key/different bytes;
3. assign four existing geometry IDs;
4. race 20 assignments onto one lot;
5. combine two source features into one road derivation;
6. fail servidumbre recalculation;
7. replace the import explicitly.
8. set `canonical_geometry_import` OFF, resolve-error, another-project ON and target-project ON.

Expected:

- exactly four canonical feature rows before/after assignment;
- same content replays; key/different payload conflicts;
- one active geometry on the raced lot and consistent reverse FK;
- road derivation references two source IDs without cloning/consuming them;
- failed enrichment remains visible/retryable and blocks document readiness;
- replacement preserves old evidence and invalidates derivatives/readiness.
- `GeometryUploadPanel` calls only `/api/projects/{projectId}/geometry-imports`; `/api/uploads/geometry` is absent;
- OFF/fail-closed reads zero upload bytes and returns `FEATURE_DISABLED`; scoped ON never enables another tenant/project.

Run boundary fixtures for compressed/expanded bytes, entries/ratio, XML depth/nodes/text, features, coordinates, deadline, actor/org concurrency and rate. Each rejects with its stable code before partial persistence.

## 8. Scenario C — DOCX semantic gate

Run fixtures:

- complete golden case;
- seller nationality evidenced, missing, manual-approved and manual-unapproved for one/multiple comparecientes;
- optional fields `not_applicable`;
- literal placeholder/filler line;
- orphan connectors/punctuation;
- duplicate saneamiento clause and one allowlisted legal repetition;
- factual mismatch against snapshot/evidence;
- unknown token/schema v1 migration;
- historical generation with present/missing bytes and complete/incomplete original provenance.

For each passing fixture, inspect extracted DOCX text and the persisted hashes/versions. For each failing fixture assert:

```text
semantic validation = failed with stable issue code
no deliverable Storage upload
no ready generation
no delivery obligation
UI/readiness uses the same issues
```

For both manual `approve_case_matriz` and inherited/system approval:

1. begin an immutable approval attempt while matrix remains pending;
2. validate AST + temporary DOCX;
3. on invalid fixture assert `422`, no `approved_at`/decision/stage/upload/generation/delivery mutation;
4. change snapshot/version during validation and assert `409 APPROVAL_CANDIDATE_STALE`;
5. finalize a valid unchanged candidate and assert approval+PASS binding+audit are atomic.

As an authorized legal reviewer, edit one seller compareciente field through the typed per-person UI/API with value, mandatory reason, attestation/reference and expected version. Assert a new version/audit, and reject missing grant/reason/attestation, stale version or stringified JSON. The approval candidate must bind exactly once from `approval_id=NULL` to the new approval; a second binding or hash mutation fails.

The title prompt/output contains no `[NACIONALIDAD]`; a required missing seller fact remains a structured blocker.

Historical revalidation must verify existing bytes without overwriting; regeneration creates a new generation.

A historical artifact can become deliverable only when its exact approved snapshot, resolved AST/manifest, matrix/template versions, renderer/ruleset, evidence and original legal approval are reconstructable and match the bytes. Byte-only inspection may fail an artifact, but never promotes it from `unverified` to ready.

## 9. Scenario D — Sale/outbox/recovery/delivery

Use one approved sale with a known seller and two active admins.

Inject process death:

1. immediately after sale commit;
2. after outbox claim;
3. after case creation;
4. after render;
5. after deterministic upload but before generation insert;
6. before/after web delivery;
7. during Telegram timeout/429/5xx;
8. after lease expiry/worker restart.

Also run 20 concurrent cascades for the same fingerprint.

Exercise rollout controls:

- `automatic_escritura=off` leaves one durable deferred outbox row without consuming an attempt;
- flip `automatic_escritura` OFF immediately after a lease is obtained and assert the release RPC clears lease/heartbeat, leaves `attempt_count` unchanged, creates no retry/DLQ/hot-loop, then resumes the same row after an audited ON transition;
- scoped ON processes only the authorized project; hard-off/resolve failure pauses it again;
- `document_capabilities=off` stops issue/renew/read while authenticated same-origin download stays safe;
- unset/invalid `PLOTIFY_HARD_OFF_AUTOMATIC_ESCRITURA`, `PLOTIFY_HARD_OFF_CANONICAL_GEOMETRY_IMPORT`, `PLOTIFY_HARD_OFF_DOCUMENT_CAPABILITIES` or `PLOTIFY_RELEASE_CONFIG_VERSION` fails closed; web/API/worker attestations must be <120 s old and agree on SHA/config/fingerprint;
- no OFF path emits signed URLs or calls a legacy writer.

Expected:

- sale commit always has exactly one outbox obligation and atomic audit;
- worker resumes within 2 minutes after worker/dependencies recover;
- one automatic generation, one delivery per recipient/channel, no orphan file;
- recipient snapshot remains the original seller/admin set even if a newer request/admin appears;
- seller web `available` + Telegram failed => document ready, delivery `partial` and retry scheduled;
- required web pending/failed/unavailable/cancelled => never `complete`; capability expiry/revoke is shown separately and does not erase historical availability/access;
- terminal item reaches DLQ with alert/runbook, never silent `completed`;
- sale stage is `espera_firma_escritura`; generation/delivery never marks it signed;
- upload accepted `escritura_signature_evidence` bound before body to the exact case+ready generation and call the signature endpoint with one idempotency key; exact replay returns one event, changed payload conflicts and 20 races leave one event/audit/stage transition;
- foreign, same-project/wrong-generation or already-consumed evidence, future date, unauthorized actor or non-ready generation fails, status stays `awaiting` and direct mutation to `escritura_firmada` is impossible;
- with persisted control and hard-off still OFF, inventory plaintext delivery links, block ambiguous/inactive recipients, verify authenticated same-origin replacement, then revoke/null legacy values; no hash capability is issued before GO, old links fail, and normal hashed issuance is tested only after T121 enables the feature.

## 10. Scenario E — Browser and accessibility

Start web/API/worker and run Playwright against:

```text
320x568
375x667
769x880
1440x900
320 CSS px with browser zoom/text at 200%
```

Open the six direct `Sheet` consumers: `OperationsTable`, mobile sidebar, legal variable editor, lots tab, geometry viewer and escritura desk.

Automated assertions:

- surface remains inside visual viewport/safe area;
- one internal scroll container;
- title, close and primary action reachable;
- focus remains inside, is visible/not obscured, and Escape closes;
- 44×44 CSS px for touch controls; compact non-touch exceptions are documented, spaced and never below 24×24;
- accessible name/description and zero critical/serious axe findings;
- no console/hydration error or failed core request.

Manual check with VoiceOver:

- logical title/description/read order;
- Tab/Shift+Tab, Enter/Space and Escape;
- status/errors announced;
- 200% zoom/reflow without horizontal scroll or lost action.

## 11. Live browser walkthrough

The operator starts API, worker and web. The tester asks the user to enter credentials only when the login page is visible; never requests them in chat or stores them.

Admin A:

1. select workspace A explicitly;
2. create a test project + lots;
3. upload/import/assign geometry;
4. assign seller A;
5. approve a test sale;
6. observe case, semantic status, generation and delivery axes;
7. download through authenticated route/capability;
8. verify retry/error UI.

Seller A:

1. verify project appears consistently in dashboard/list/viewer;
2. verify only own buyer/sale/document data;
3. open web document/capability and Telegram when configured.

Seller unassigned/B:

1. verify project and sensitive data do not appear;
2. direct URL/API attempts return generic denial.

Mini App and inherited human gates:

| Source gate | Status entering SDD019 | Evidence required in SDD019                                                                                                  |
| ----------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| SDD010 T023 | approved 2026-06-16    | reuse the approved record; link regression evidence for the 4/5 tasks, <15-minute flow and admin template, do not reopen it  |
| SDD011 T026 | open                   | admin validates and accepts in <5 minutes with zero buyer retyping, followed by seller visibility and delivery               |
| SDD016 T082 | open                   | first-time user, ≤12 actions, sale completed in two acts and explicit evidence for SDD016 SC-005                             |
| SDD017 T036 | completed              | reuse its completed reset/clean evidence and prove the destructive-target guard has not regressed                            |
| SDD018 T044 | open                   | execute all six real Mini App scenarios 0–5, including unlinked chat, admin and seller, with role/tenant/Telegram assertions |

The report links each source criterion to timestamps, screenshots/log references and verdict. A prior approved/completed gate is reused, not silently reopened; an open gate remains NO-GO until its exact criteria pass.

## 12. Legacy inventory and test-data decision

Run the read-only preflight and review counts for:

- duplicate/ambiguous geometry links;
- null/duplicate idempotency keys;
- duplicate generations/deliveries;
- `escritura_firmada` without signature evidence;
- stale timestamps;
- missing semantic verdicts;
- Storage objects without metadata and metadata without objects;
- organizations/users/projects/files identified as test data.

Every item receives `resolved`, `false_positive` (scanner only, with proof) or `open`. Ambiguous business/legal rows remain `open` and block GO. The user decides `keep | clean`; cleanup is a separate approved, backed-up operation.

## 13. Restore/forward-fix rehearsal

Only in an approved disposable Supabase cloud branch:

1. rebuild/restore canonical baseline + controlled seed;
2. clean-apply every SDD019 migration through `20260713000600_sdd019_security_enforcement.sql` and assert that exact migration maximum;
3. execute scenarios A–D smoke subset;
4. disable each rollout control and verify safe degraded behavior: outbox deferred, geometry writer denied, capability issuance denied, authenticated reader still safe; no legacy writer/direct Storage returns;
5. apply documented forward-fix/restore path;
6. compare invariants, measure RTO and store evidence;
7. delete the disposable environment only after separate approval.

An early rehearsal before `00600` exists qualifies the tooling only. The authoritative rehearsal is refreshed after enforcement exists and again on the exact final candidate SHA; without that successful evidence the verdict is NO-GO.

## 14. Final gate — phase A on the immutable release SHA

After T117–T119, commit all implementation and pre-release evidence. Capture that clean commit as `releaseSha`, build/deploy exactly it, and keep it checked out for the final restore, live walkthrough and gate. The approvals, deployment manifest and every evidence record must contain this same SHA.

```bash
release_sha="$(git rev-parse HEAD)"
test -z "$(git status --porcelain)"

node scripts/production-readiness/verify-evidence.mjs \
  --kind restore-approval \
  artifacts/production-readiness/restore-final/approval.json \
  --source-manifest artifacts/production-readiness/source-manifest.json
pnpm restore:rehearsal -- \
  --target disposable \
  --approval-evidence artifacts/production-readiness/restore-final/approval.json \
  --source-manifest artifacts/production-readiness/source-manifest.json \
  --allow-disposable-reset \
  --expected-max-version 20260713000600 \
  --candidate-sha "$release_sha" \
  --output artifacts/production-readiness/restore-final

node scripts/production-readiness/verify-evidence.mjs \
  --kind live-state-change-approval \
  artifacts/production-readiness/live-final/approval.json
pnpm --filter web test:e2e:production -- \
  --target live \
  --scenario all \
  --approval-evidence artifacts/production-readiness/live-final/approval.json \
  --deployment-manifest artifacts/production-readiness/deployment/manifest.json \
  --output artifacts/production-readiness/live-final

pnpm verify:production-readiness -- \
  --target linked \
  --release-sha "$release_sha" \
  --output artifacts/production-readiness/final \
  --no-destructive \
  --require-clean-git \
  --require-deployed-sha \
  --deployment-manifest artifacts/production-readiness/deployment/manifest.json
```

The live runner re-hashes the manifest and exact-roster attestations immediately before/after mutation and emits `live-final/report.json`; prevalidating those files in a separate command is not sufficient. The gate writes immutable `report.json` and `evidence-manifest.json`, binding restore/live/stage inputs and outputs by hash.

Review `report.json` and generated Markdown:

| Condition                       | Required for GO                           |
| ------------------------------- | ----------------------------------------- |
| SC-001–SC-018                   | PASS, except valid non-critical P2 waiver |
| US1–US4 / P1                    | all PASS, never waivable                  |
| migration/schema parity         | exact                                     |
| security/cross-tenant/secrets   | zero blocker                              |
| semantic document fixtures      | all expected pass/fail                    |
| project/geometry/workflow races | zero partial/duplicate/lost event         |
| open legacy blockers            | zero                                      |
| restore rehearsal               | PASS with measured RTO                    |
| live admin/vendor walkthrough   | PASS                                      |
| rollback/runbooks/owners        | present                                   |

If any row fails, verdict stays **NO-GO**.

Before phase B, archive and read back the complete redacted evidence bundle:

```bash
pnpm evidence:archive -- \
  --evidence-manifest artifacts/production-readiness/final/evidence-manifest.json \
  --deployment-manifest artifacts/production-readiness/deployment/manifest.json \
  --report artifacts/production-readiness/final/report.json \
  --retention-days 365 \
  --output artifacts/production-readiness/final/archive-receipt.json

node scripts/production-readiness/verify-evidence.mjs \
  --kind evidence-archive \
  artifacts/production-readiness/final/archive-receipt.json \
  --require-readback \
  --min-retention-days 365
```

### Phase B — documentation-only handoff

Only after the immutable report exists, write its exact receipt and commit it as a single direct child of `releaseSha`. With that new commit checked out:

```bash
node scripts/production-readiness/verify-evidence.mjs \
  --kind final-verdict \
  artifacts/production-readiness/final/report.json \
  --deployment-manifest artifacts/production-readiness/deployment/manifest.json \
  --evidence-manifest artifacts/production-readiness/final/evidence-manifest.json \
  --require-release-sha-bindings \
  --require-12-stages \
  --require-rollout-not-started

node scripts/production-readiness/verify-evidence.mjs \
  --kind release-receipt \
  'plotify_memori/50 - Implementaciones/SDD019 - Release receipt.md' \
  --report artifacts/production-readiness/final/report.json \
  --handoff-sha HEAD \
  --archive-receipt artifacts/production-readiness/final/archive-receipt.json \
  --require-direct-docs-only-child \
  --allow-t120-checkbox-only \
  --require-clean-handoff
```

Do not rerun phase A after `HEAD` becomes `handoffSha`; the post-handoff commands validate stored evidence and Git ancestry without mutating the linked target.

Before creating `handoffSha`, archive the complete redacted final bundle to immutable/versioned storage and verify readback. The receipt records the archive locator, root digest, manifest/report/deployment hashes, provenance and retention of at least 365 days; local ignored artifacts alone are not release evidence. The direct-child diff is restricted to that receipt and the T120 checkbox transition. After the rollout verifier passes, close T121 only in a separate `rolloutReceiptSha` containing the derived rollout receipt/summary plus its checkbox; both receipts remain bound to `releaseSha`, not to the documentation HEAD.

## 15. Staged rollout after GO

1. confirm that the immutable report's clean `releaseSha` is still deployed (`deployment.sourceSha = report.git.sha`) with the recorded web/API/worker digests and exact-roster fresh attestations; a later docs-only receipt HEAD is not deploy authority and T111 is only compatibility rehearsal. The versioned controls must resolve OFF for every pilot scope; do not deploy different code after the verdict;
2. repeat health/log/metric smoke against that SHA;
3. without changing the T120 artifact, increment `PLOTIFY_RELEASE_CONFIG_VERSION`, clear only the relevant `PLOTIFY_HARD_OFF_*`, wait for fresh matching web/API/worker attestations on the same SHA/digests and record prior/new config fingerprints;
4. enable for internal test organization/projects through compare-and-set with actor/reason/audit and record returned versions;
5. enable one pilot project with the same guarded operation; a stale version or foreign scope must fail;
6. monitor continuously for first hour and at least one week across pilot;
7. expand only under the versioned `scripts/production-readiness/thresholds.json` rules: outbox <120 s, zero DLQ/integrity/security findings, at least the required samples, error rate `<= max(baseline × 1.10, baseline + 0.1 percentage points)` and p95 `<= baseline × 1.20`; two consecutive five-minute warning windows stop expansion;
8. disable/rollback immediately for any leak, invalid document or corruption/duplicate, or for two consecutive five-minute windows with error rate `> max(baseline × 2, baseline + 1 percentage point)` or p95 `> baseline × 1.5`: activate hard-off and confirm matching attestations first, then CAS persisted mode OFF.

Each invocation below advances exactly one approved transition; repeat it until the plan's internal → one-project → pilot sequence is complete for all three controls. After each transition, run `rollout-smoke` with the same approval/manifest and an output keyed by the transition ID before advancing again. The first run after `document_capabilities` becomes effective ON must use the canonical `post-enable-capability` output and prove hashed issue/read/revoke/denied-after-revoke.

```bash
pnpm feature-controls -- rollout \
  --target linked \
  --plan specs/019-hardening-produccion/evidence/rollout-plan.json \
  --approval-evidence artifacts/production-readiness/rollout/approval.json \
  --deployment-manifest artifacts/production-readiness/deployment/manifest.json \
  --verdict artifacts/production-readiness/final/report.json \
  --apply-approved-next \
  --output artifacts/production-readiness/rollout/transitions

pnpm --filter web test:e2e:production -- \
  --target live \
  --scenario rollout-smoke \
  --approval-evidence artifacts/production-readiness/rollout/approval.json \
  --deployment-manifest artifacts/production-readiness/deployment/manifest.json \
  --output artifacts/production-readiness/rollout/smoke/<transition-id>
```

The final verifier is read-only: it requires the complete ordered transition set, one browser/document smoke per transition, the post-enable capability lifecycle, first-hour evidence and the one-week window. It must not call `--apply-approved-next` again.

Rollback keeps restrictive security policies; a security regression is fixed forward rather than reopening broad access.
