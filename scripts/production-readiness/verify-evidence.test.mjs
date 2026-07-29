import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { validateEvidenceDocument } from './verify-evidence.mjs'

test('rejects malformed or tampered evidence with a stable code', (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'plotify-evidence-t103-'))
  context.after(() => rmSync(directory, { recursive: true, force: true }))
  const evidencePath = join(directory, 'tampered.json')
  writeFileSync(
    evidencePath,
    JSON.stringify({
      schemaVersion: 1,
      kind: 'deployment-manifest',
      sourceSha: 'a'.repeat(40),
      secret: 'must not pass',
    })
  )

  assert.throws(
    () => validateEvidenceDocument('deployment-manifest', evidencePath),
    /EVIDENCE_SCHEMA_INVALID/
  )
})

test('accepts an exact candidate blocker manifest', (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'plotify-evidence-t103-'))
  context.after(() => rmSync(directory, { recursive: true, force: true }))
  const path = join(directory, 'expected-blockers.json')
  writeFileSync(
    path,
    JSON.stringify({
      schemaVersion: 1,
      kind: 'expected-blockers',
      criterionIds: ['SC-014'],
      reviewer: 'release-engineering',
      generatedAt: '2026-07-28T12:00:00.000Z',
      sourceSha: 'a'.repeat(40),
      verdict: 'NO-GO',
      blockers: ['phase9:T117', 'phase9:T118'],
      evidence: [{ id: 'phase9:T117', digest: `sha256:${'b'.repeat(64)}`, redacted: true }],
    })
  )
  const document = validateEvidenceDocument('expected-blockers', path)
  assert.deepEqual(document.blockers, ['phase9:T117', 'phase9:T118'])
})

test('validates target/source-bound Auth hardening approval and redacted result', async (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'plotify-auth-evidence-'))
  context.after(() => rmSync(directory, { recursive: true, force: true }))
  const sourceManifest = join(directory, 'source-manifest.json')
  writeFileSync(sourceManifest, JSON.stringify({ schemaVersion: 1, files: [] }))
  const { createHash } = await import('node:crypto')
  const sourceDigest = `sha256:${createHash('sha256')
    .update(JSON.stringify({ schemaVersion: 1, files: [] }))
    .digest('hex')}`
  const common = {
    schemaVersion: 1,
    criterionIds: ['FR-043'],
    reviewer: 'release-operator',
    generatedAt: '2026-07-28T12:00:00.000Z',
    sourceSha: 'a'.repeat(40),
    targetFingerprint: `sha256:${'b'.repeat(64)}`,
    sourceManifestDigest: sourceDigest,
    verdict: 'PASS',
    evidence: [{ id: 'auth-config', digest: `sha256:${'c'.repeat(64)}`, redacted: true }],
  }
  const approvalPath = join(directory, 'approval.json')
  writeFileSync(
    approvalPath,
    JSON.stringify({
      ...common,
      kind: 'auth-hardening-approval',
      details: {
        operation: 'auth-hardening',
        actor: 'release-operator',
        reason: 'approved final target hardening',
        expectedSetting: 'password_hibp_enabled',
        expectedBefore: false,
        expectedAfter: true,
      },
    })
  )
  assert.equal(
    validateEvidenceDocument('auth-hardening-approval', approvalPath, {
      sourceManifest,
    }).kind,
    'auth-hardening-approval'
  )

  const reportPath = join(directory, 'report.json')
  writeFileSync(
    reportPath,
    JSON.stringify({
      ...common,
      kind: 'auth-hardening',
      details: {
        operation: 'auth-hardening',
        setting: 'password_hibp_enabled',
        enabled: true,
        beforeFingerprint: `sha256:${'d'.repeat(64)}`,
        afterFingerprint: `sha256:${'e'.repeat(64)}`,
        redacted: true,
      },
    })
  )
  assert.equal(
    validateEvidenceDocument('auth-hardening', reportPath, { sourceManifest }).kind,
    'auth-hardening'
  )
})

test('rejects Auth hardening evidence with a wrong setting or unredacted result', (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'plotify-auth-evidence-'))
  context.after(() => rmSync(directory, { recursive: true, force: true }))
  const path = join(directory, 'bad-auth.json')
  writeFileSync(
    path,
    JSON.stringify({
      schemaVersion: 1,
      kind: 'auth-hardening',
      criterionIds: ['FR-043'],
      reviewer: 'release-operator',
      generatedAt: '2026-07-28T12:00:00.000Z',
      sourceSha: 'a'.repeat(40),
      targetFingerprint: `sha256:${'b'.repeat(64)}`,
      sourceManifestDigest: `sha256:${'c'.repeat(64)}`,
      verdict: 'PASS',
      details: {
        operation: 'auth-hardening',
        setting: 'different_setting',
        enabled: true,
        beforeFingerprint: `sha256:${'d'.repeat(64)}`,
        afterFingerprint: `sha256:${'e'.repeat(64)}`,
        redacted: false,
      },
      evidence: [{ id: 'auth-config', digest: `sha256:${'f'.repeat(64)}`, redacted: true }],
    })
  )
  assert.throws(
    () => validateEvidenceDocument('auth-hardening', path),
    /AUTH_HARDENING_EVIDENCE_INVALID/
  )
})
