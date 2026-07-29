# Contract: Production readiness gate and release evidence

**Scope**: US5 + US6, FR-033–FR-044, SC-001–SC-018.
**Default mode**: read-only / no destructive actions.

## 1. Command interface

```bash
pnpm verify:production-readiness -- \
  --target linked \
  --deployment-manifest artifacts/production-readiness/deployment/manifest.json \
  --output artifacts/production-readiness/<run-id> \
  --no-destructive
```

Required environment is validated by name only. The report records presence/version/fingerprint where safe, never values. Live credentials for admin/vendor are entered interactively or supplied through ignored environment variables.

Options:

| Option                            | Meaning                                                                                         |
| --------------------------------- | ----------------------------------------------------------------------------------------------- |
| `--target <kind>`                 | explicit `local`, `linked` or `branch` database/app target                                      |
| `--output <dir>`                  | report/evidence directory                                                                       |
| `--no-destructive`                | mandatory default; no cleanup, migration repair, push or restore                                |
| `--stage <name>`                  | run one stage for diagnosis; final GO still requires all                                        |
| `--checkpoint <name>`             | `additive`, `compatible` or `final`; narrows expected evidence without creating a stage alias   |
| `--expected-open-findings <file>` | exact fingerprint manifest allowed only for an additive checkpoint                              |
| `--expected-blockers <file>`      | exact blocker-ID manifest for an intentionally incomplete candidate; any extra/missing ID fails |
| `--baseline <file>`               | approved advisor/performance baseline                                                           |
| `--assert-controls-off <csv>`     | require named rollout controls effective OFF for linked smoke                                   |
| `--expect-verdict <GO\|NO-GO>`    | report assertion; exits 0 only when a valid report has exactly that verdict                     |
| `--release-sha <hex>`             | final-only immutable source commit; must equal checked-out clean commit during release phase A  |
| `--require-clean-git`             | final-only: require `git.dirty=false` and record the exact commit                               |
| `--require-deployed-sha`          | final-only: require deployment SHA/digests and fresh role attestations to match that commit     |
| `--deployment-manifest <file>`    | CI/deployer-authenticated source SHA, expected roster and immutable artifact digests            |
| `--json`                          | machine-readable stdout summary                                                                 |

The gate refuses target `linked` if project ref/URL does not match the confirmation shown to the operator.

The deployment manifest is an independent authority, never synthesized from runtime heartbeats. The build/deploy system emits `schemaVersion`, environment fingerprint, source SHA, expected role/instance roster, per-role immutable artifact digests, build/deploy operation IDs, timestamp and a signed provenance statement. The gate validates that statement against a versioned trust policy/public identity before comparing attestations. Missing, tampered, stale, wrong-environment, unexpected-instance or digest-mismatched manifests fail closed. Compatibility and final deployments use different immutable manifests.

## 2. Ordered stages

|   # | Stage                  | Evidence                                                                                                                                                                      | Blocking rule                                                                                                               |
| --: | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
|   1 | `preflight`            | versions, git SHA/status, target fingerprint, flags                                                                                                                           | missing tool/config or dirty generated contract                                                                             |
|   2 | `migration_parity`     | local list, remote history, schema fingerprint                                                                                                                                | any missing/extra/mismatched migration/schema                                                                               |
|   3 | `legacy_inventory`     | finding counts/fingerprints, Storage reconciliation                                                                                                                           | any blocking open/unknown item                                                                                              |
|   4 | `security`             | grants, RLS/Storage matrix, exact DB/HTTP/egress/log inventories, runtime config/webhook/Prompt Ops/bot checks, advisors, leaked-password protection, secret/dependency scans | cross-tenant, exposed privileged op/callsite, unsafe config/webhook, active/high-confidence secret, reachable critical/high |
|   5 | `database_tests`       | pgTAP + clean rebuild                                                                                                                                                         | any failure                                                                                                                 |
|   6 | `api_contracts`        | OpenAPI diff/generation + pytest                                                                                                                                              | any failure or generated diff not committed                                                                                 |
|   7 | `web_quality`          | Vitest, lint, format, types, build                                                                                                                                            | any failure                                                                                                                 |
|   8 | `concurrency_recovery` | fault injection, 20-way races, outbox/lease/DLQ                                                                                                                               | duplicate/lost event/false completed                                                                                        |
|   9 | `browser_a11y`         | Playwright viewports, console/network, axe, manual checklist                                                                                                                  | functional error, cross-tenant leak, critical/serious a11y                                                                  |
|  10 | `restore_rehearsal`    | disposable target, timings, schema/data invariants                                                                                                                            | no successful restore/forward-fix evidence                                                                                  |
|  11 | `live_smoke`           | admin/vendor real-browser walkthrough                                                                                                                                         | core flow failure or unresolved human gate                                                                                  |
|  12 | `verdict`              | SC coverage, owners, rollback, waivers                                                                                                                                        | any non-dispensable criterion not PASS                                                                                      |

Stages do not mutate the linked target. Migration repair/push, data remediation and restore are separate operator-approved actions whose before/after evidence can be consumed by the gate.

The `security` stage implementation and local scanner are completed before guarded mutators, but their task-local verification is non-remote and uses deterministic fixtures for advisor/Auth evidence. The authoritative linked additive invocation is ordered after final-target provisioning and a separately approved `auth:hardening-guarded` operation; it consumes and re-hashes that operation's redacted before/after report and confirms the setting by live read. The legacy Free project is never reconfigured to satisfy this stage.

The table above is the only valid stage registry. `database_security`, `gateway_compat` and any unknown name are configuration errors (exit 2), not implicit aliases. Human checkpoints compose canonical stages:

| Checkpoint                    | Canonical stage calls                                                                                            | Verdict behavior                                                                        |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| additive DB applied           | `migration_parity`, `security --checkpoint additive --expected-open-findings <versioned-file>`, `database_tests` | exact pre-enforcement fingerprints only; forced NO-GO until compatible code/enforcement |
| compatible code, controls OFF | `live_smoke --checkpoint compatible --assert-controls-off ...`                                                   | forced NO-GO; proves safe degraded paths only                                           |
| final candidate               | all ordered stages                                                                                               | may produce GO only under section 10                                                    |

`--stage` returns 0 when the selected registered stage satisfies its checkpoint contract; it never claims global GO. At `additive`, only exact versioned fingerprints for final Storage/grant revocations scheduled in T112 may remain open. Cross-tenant access, secrets, unclassified routines, unexpected advisor findings or data-integrity failures always fail. A full run returns 0 only for GO unless `--expect-verdict` is supplied; that option validates an intentionally incomplete report and cannot convert its stored NO-GO to GO.

## 3. Canonical commands

```bash
pnpm verify:migrations
pnpm --filter @plotify/database test:db:linked
pnpm contracts:generate
pnpm test:api
pnpm test:web
pnpm --filter web lint
pnpm format:check
pnpm typecheck:web
pnpm build:web
pnpm --filter web test:e2e:production -- \
  --target local \
  --scenario all \
  --output artifacts/production-readiness/local-e2e
```

Additional scripts compare migrations/schema, query advisors, run secret/dependency scans, inject failures and create the report. Each command records exit code, duration and redacted log path.

For any state-changing `--target live` browser scenario, `--approval-evidence` and `--deployment-manifest` are both mandatory. The approval contains the manifest digest, target fingerprint, release SHA and exact action/test-data fingerprints. The runner independently validates provenance, re-hashes the manifest and live-reads exact-roster SHA/artifact attestations immediately before opening a mutating body and again after the final mutation. It atomically writes redacted `report.json` and `network.json` with both snapshots; separate earlier validation cannot satisfy this TOCTOU boundary.

## 4. Browser/a11y matrix

Required authenticated roles: admin A, seller A assigned, seller A unassigned, user/admin B. Mini App: valid admin/seller and expired/revoked session. Credentials are never persisted in artifacts.

Viewports:

```text
320x568 | 375x667 | 769x880 | 1440x900 | 320 CSS px at 200% zoom
```

Canonical direct consumers: `OperationsTable.tsx`, `ui/sidebar.tsx`, `legal-variable-editor.tsx`, `lots-tab.tsx`, `geometry-viewer/index.tsx` and `mesa-escritura.tsx`. The browser fixture gives each one a stable test ID; no alias may create a seventh count. Assertions:

- panel bounding box within visual viewport/safe area;
- exactly one internal scroll area;
- title, close and primary actions reachable;
- focus trapped, logical, visible/not obscured; Escape closes;
- touch target size ≥44×44 CSS px; a documented compact non-touch exception is spaced and never below 24×24;
- accessible name + description; zero critical/serious axe findings;
- no console error, hydration error or failed core request;
- manual VoiceOver pass and 200% zoom/reflow checklist.

## 5. Advisor, dependency and secret policy

- Security advisors: zero exploitable warning. `SECURITY DEFINER` grants and Storage policies have explicit assertions, not just advisor absence. Findings are matched by fingerprint, not count; the avatar public-bucket finding closes only when known-object read remains possible while anon/authenticated global list and cross-user mutation are denied.
- Performance: no regression from versioned baseline; every remaining fingerprint has owner, impact, budget and review date. New, missing-owner or expired-review findings fail.
- Dependencies: critical/high reachable runtime vulnerability blocks. Unreachable/dev-only exception needs evidence, owner and expiry.
- Secrets: pinned Gitleaks scans current files with `dir` and Git history with `git` separately, always redacted. Any current active/high-confidence match blocks. A historical true secret is a resolved finding only after rotation fingerprint/evidence; it is never mislabeled as an allowlist false positive. Allowlist stores rule + file fingerprint + expiry, never the matched value.
- Reports redact JWTs, cookies, Authorization headers, signed URLs, email/phone/buyer fields and document text.

## 6. Migration parity and repair evidence

Parity requires all three:

```text
canonical filenames == remote migration versions
canonical replay schema fingerprint == target schema fingerprint
target constraints/policies/grants == expected assertions
```

DDL existing remotely without the canonical version is drift. Repair procedure is proposed and printed, never automatically run. An operator-approved guarded repair run captures:

- target confirmation;
- before/after migration lists;
- exact repair version/status, approval fingerprint and wrapper result, without credentials;
- repeated schema/security tests.

The later additive/enforcement apply gates have separate approval/evidence objects and separate immutable output directories. `migrations:push-guarded` must receive `--output`, record exact range, migration fingerprint, approval/backup/target fingerprints, before/after state and adapter result, then pass `verify-evidence --kind migration-push` before any downstream parity assertion is accepted. Additive and enforcement reports cannot overwrite each other. Push evidence is never folded into or inferred from the history-repair report, and post-state parity alone is insufficient proof of the approved mutation.

## 7. Legacy and test-data policy

The gate inventories test organizations/users/projects/files and marks `keep | clean | unknown`. It never deletes.

- `unknown` or blocking readiness finding => NO-GO;
- cleanup requires backup, explicit human approval and separate script/run;
- ambiguous duplicate/false signature state remains quarantined;
- clean rebuild may use versioned seeds/fixtures; seeds are not migration history.

## 8. Restore/rollback rehearsal

Performed only in an approved disposable Supabase cloud branch:

1. restore/rebuild baseline from canonical migrations + controlled seed;
2. clean-apply every SDD019 migration through `20260713000600_sdd019_security_enforcement.sql`;
3. run invariants and sample core flow;
4. disable kill switches/deploy prior reader or apply documented forward-fix;
5. verify no orphan/duplicate and measure RTO;
6. destroy disposable environment through separate approved operation.

The report records backup/version, migration maximum, candidate SHA and timing, not connection credentials. Evidence produced before `00600` exists is diagnostic only; the final PASS must replay through `00600` on the exact candidate SHA. A note saying “irreversible” without rehearsal is not PASS.

## 9. Report schema

`report.json` minimum:

```json
{
  "schemaVersion": 1,
  "runId": "uuid",
  "startedAt": "timestamp",
  "finishedAt": "timestamp",
  "git": { "sha": "hex", "branch": "019-hardening-produccion", "dirty": false },
  "target": { "kind": "linked", "projectRefFingerprint": "sha256-prefix" },
  "deployment": {
    "sourceSha": "hex",
    "manifestDigest": "sha256:hex",
    "provenanceVerified": true,
    "webArtifactDigest": "sha256:hex",
    "apiArtifactDigest": "sha256:hex",
    "workerArtifactDigest": "sha256:hex"
  },
  "versions": {},
  "featureControls": {
    "automatic_escritura": { "mode": "off", "version": 3, "scopeHash": "hex", "hardOff": true },
    "canonical_geometry_import": {
      "mode": "off",
      "version": 4,
      "scopeHash": "hex",
      "hardOff": true
    },
    "document_capabilities": { "mode": "off", "version": 2, "scopeHash": "hex", "hardOff": true },
    "runtimeAttestations": {
      "configVersion": "release-config-v1",
      "fingerprint": "sha256",
      "maxAgeSeconds": 120,
      "expectedRosterHash": "sha256",
      "roles": { "web": "fresh", "api": "fresh", "worker": "fresh" },
      "instances": [
        {
          "role": "web",
          "instanceId": "web-opaque",
          "releaseSha": "hex",
          "artifactDigest": "sha256:hex",
          "fresh": true
        },
        {
          "role": "api",
          "instanceId": "api-opaque",
          "releaseSha": "hex",
          "artifactDigest": "sha256:hex",
          "fresh": true
        },
        {
          "role": "worker",
          "instanceId": "worker-opaque",
          "releaseSha": "hex",
          "artifactDigest": "sha256:hex",
          "fresh": true
        }
      ]
    }
  },
  "stages": [
    {
      "name": "security",
      "status": "pass|fail|waived",
      "durationMs": 1000,
      "commandIds": ["security-pgtap"],
      "metrics": {},
      "evidence": ["relative/path.json"],
      "findingIds": []
    }
  ],
  "successCriteria": { "SC-001": "pass" },
  "testData": { "keep": 0, "clean": 0, "unknown": 0 },
  "blockers": [],
  "waivers": [],
  "rollback": {
    "runbook": "relative/path.md",
    "rehearsedAt": "timestamp",
    "rtoSeconds": 0,
    "candidateSha": "hex",
    "maxMigration": "20260713000600"
  },
  "owners": {},
  "verdict": "GO|NO-GO",
  "rolloutStatus": "not_started|internal|pilot|complete|rolled_back"
}
```

`instances` must cover the deployer-authoritative expected roster exactly: at least one fresh attestation for every expected role/instance and no unmanifested instance accepted as release evidence.

Markdown summary is generated from JSON; it is not a second source of truth.

For a final run, explicit `--release-sha` must equal the clean checked-out `git.sha`, `deployment.sourceSha` and every runtime attestation release SHA; each role-specific immutable `artifact_digest` must match the deployment manifest. T111 may record an earlier compatibility candidate, but only the exact clean T120 revision deployed and re-tested can authorize rollout.

T120 is a two-phase, non-reentrant protocol:

1. **Release phase A**: while `HEAD=releaseSha`, run final restore, linked browser walkthrough and the complete 12-stage gate with explicit `--release-sha`, `--require-clean-git` and `--require-deployed-sha`. The gate atomically writes immutable `report.json` plus `evidence-manifest.json`; the latter hashes the deployment manifest and every restore/live/stage artifact consumed by the verdict.
2. **Handoff phase B**: only after phase A succeeds, write the SDD019 receipt containing `releaseSha`, deployment-manifest hash, evidence-manifest hash, report hash, verdict and rollout status; commit exactly one clean direct child `handoffSha` whose tracked diff is restricted to that receipt. The post-handoff validator derives `releaseSha` from the report, requires `parent(handoffSha)=releaseSha`, re-hashes every referenced artifact, permits only the ignored evidence root named by the evidence manifest, rejects any other tracked/untracked change and never invokes restore, browser mutation or the production gate again.

Before phase B, archive the complete redacted evidence manifest in WORM/versioned storage, prove readback and retention of at least 365 days, and bind the archive receipt to the report, deployment manifest and evidence-manifest hashes. The only permitted tracked phase-B diff is the derived SDD019 receipt plus the T120 checkbox. After rollout, `rolloutReceiptSha` permits only the derived rollout summary/receipt plus the T121 checkbox.

Phase A must not be rerun after `HEAD` becomes `handoffSha`: the deployed authority remains `releaseSha`. The validator never rewrites the report's `git.sha`, and T121 stays bound to the recorded release SHA rather than the documentation branch HEAD.

## 10. Waiver and verdict policy

Never waivable:

- US1–US4 / every P1 acceptance scenario;
- migration/schema drift;
- cross-tenant or privileged operation exposure;
- active/high-confidence secret or reachable critical/high vulnerability;
- invalid deliverable DOCX;
- data loss, duplicate generation/delivery or lost outbox event;
- failed restore rehearsal;
- unresolved blocking legacy finding.

Only P2 non-critical findings may be waived with `findingId`, owner, reason, compensating control, expiry, review date and rollback trigger. Expired waiver becomes FAIL.

GO requires SC-001–SC-018 PASS except a valid P2 waiver. Previous human gates from SDD010/011/016/017/018 must be executed or mapped to equivalent newer evidence.

## 11. Exit codes

| Code | Meaning                                                                    |
| ---: | -------------------------------------------------------------------------- |
|    0 | selected stage/checkpoint passed, expected verdict matched, or full run GO |
|    1 | functional/quality stage failed                                            |
|    2 | configuration/tooling invalid                                              |
|    3 | migration/schema drift                                                     |
|    4 | security/secrets blocker                                                   |
|    5 | integrity/concurrency/recovery blocker                                     |
|    6 | human/live gate incomplete                                                 |

## 12. Rollout monitoring thresholds

Kill switches: `automatic_escritura`, `canonical_geometry_import`, `document_capabilities`.

They are persisted as versioned Supabase controls with `off | projects | on`, organization/project scope, compare-and-set, actor, reason and atomic audit. Missing row, resolution error, unknown key or cross-tenant project is effective OFF. Independent deployment hard-offs use the exact keys `PLOTIFY_HARD_OFF_AUTOMATIC_ESCRITURA`, `PLOTIFY_HARD_OFF_CANONICAL_GEOMETRY_IMPORT`, `PLOTIFY_HARD_OFF_DOCUMENT_CAPABILITIES` and `PLOTIFY_RELEASE_CONFIG_VERSION`; missing/invalid means hard-off enabled. Fresh (<120 s) service-only attestations from every expected web/API/worker runtime must agree on release SHA, config version and ordered hard-off fingerprint, and each instance's immutable artifact digest must match the expected digest for its role in the deployment manifest. Missing/stale/disagreeing runtime or mismatched digest forces all effective OFF and blocks expansion. The gate records mode/version/scope hash, hard-off booleans/config fingerprint, role artifact digest and freshness, never raw project lists or environment values.

OFF semantics are testable and safe:

- automatic escritura leaves the outbox obligation durable/deferred without consuming an attempt;
- canonical geometry import rejects new import/replace with `FEATURE_DISABLED` and never calls the legacy writer;
- document capabilities stops issue/renew/read while authenticated same-origin download remains server-streamed;
- no control state can restore direct Storage, signed URL projection or broad grants.

The comparison is defined by `scripts/production-readiness/thresholds.json` and records `schemaVersion`, target fingerprint, release SHA, workload version and operation labels. Baseline and candidate must use the same target class and workload. Core labels are workspace/project reads, project create in disposable fixtures, geometry parse/commit in disposable fixtures, sale→case, document status/download gateway and outbox claim/delivery.

- disposable write/concurrency baseline: at least 20 completed iterations per write label and the 50–100-lot plus near-limit geometry workloads;
- linked pilot: rolling 15-minute windows and at least 30 observations per read/status label;
- if organic pilot traffic has fewer than 30 observations, execute ten authenticated non-mutating probes every five minutes until 30; no expansion is allowed from an undersampled window;
- compare error-rate ratio with an absolute floor: candidate must be `<= max(baseline × 1.10, baseline + 0.1 percentage points)` and p95 `<= baseline × 1.20`;
- two consecutive five-minute windows above warning thresholds stop expansion; one integrity/security event stops immediately regardless of sample size.

After GO, clear the relevant deployment hard-off first without changing the runtime artifact: increment `PLOTIFY_RELEASE_CONFIG_VERSION`, set the exact `PLOTIFY_HARD_OFF_*` boolean false, wait for fresh matching web/API/worker attestations on the same release SHA/artifact digests, and record prior/new config fingerprints. Only then advance persisted OFF → internal organization/projects → one pilot project → pilot through version-checked audited control mutations. Rollback reverses this order: activate hard-off first, wait for matching attestations, then CAS the persisted control OFF. Advance only when:

Every transition/rollback is produced by guarded `feature-controls rollout --apply-approved-next` from an approval bound to target fingerprint, immutable final-report hash, authenticated deployment manifest, expected control version/scope, actor/reason and threshold plan. One invocation performs exactly one eligible CAS; operators repeat it for the plan's complete internal → one project → pilot sequence for each control. The wrapper writes an append-only transition report and immediately live-reads the resulting version/audit/effective scope plus exact-roster attestations.

Before the next CAS, a manifest-bound `rollout-smoke` run writes a separate immutable browser/document report keyed by transition ID. When `document_capabilities` first becomes effectively ON, the required post-enable run issues one test capability whose plaintext exists only in the client request, proves DB hash-only persistence, reads the exact generation, revokes it and proves a later read is denied; no Storage URL/path may appear. `verify-rollout` rejects missing, duplicate or out-of-order transitions, missing per-transition smoke, absent capability lifecycle, incomplete first-hour/week monitoring or any manifest/attestation drift, and derives its summary from evidence. It never applies a CAS and never trusts a hand-authored summary.

- no new error type;
- no security/integrity finding;
- outbox oldest due <120 s and zero DLQ;
- no duplicate resource invariant;
- error rate `<= max(baseline × 1.10, baseline + 0.1 percentage points)` and p95 `<= baseline × 1.20` for the comparable versioned baseline;
- browser/document smoke succeeds.

Rollback/disable immediately for any leak, invalid document, corruption/duplicate, error rate `> max(baseline × 2, baseline + 1 percentage point)` or p95 `>1.5×` baseline in two consecutive five-minute windows. Monitor first hour continuously and one week after full pilot enablement. `GO` means authorized to start staged rollout; completion is recorded separately as `rolloutStatus=complete`, while any trigger records `rolled_back` without rewriting the original evidence.

## 13. Archive, attestation lifecycle and terminal receipts

`artifacts/production-readiness` is a working cache, not release authority. Before Phase B, `evidence:archive` uploads the complete redacted bundle referenced by `evidence-manifest.json` to versioned immutable/WORM storage, performs a readback and writes `archive-receipt.json` with opaque locator, object/version identity, root hash, manifest/deployment/report hashes, provenance, redaction policy and `retentionUntil >= 365 days`. A digest without retrievable preimage fails final verdict validation.

The manifest identifies environment, deployment/revision and exact role/slot/instance roster. Attestations are historical rows keyed by deployment/role/slot/instance. Only retired or stale historical rows stop counting; any fresh non-retired runtime in the same environment that is absent from the current manifest, including an old deployment, blocks. Replacement/scale-down requires a release-owner retirement event; heartbeat after retirement is a blocker.

Phase B's direct child allowlist is exactly the SDD019 release receipt and the `[ ] → [x]` transition for T120. After rollout, the separate `rolloutReceiptSha` allowlist is exactly the derived rollout receipt/summary and `[ ] → [x]` for T121. Both validators require archive readback/hash linkage and remain bound to `releaseSha`; neither is deploy authority.
