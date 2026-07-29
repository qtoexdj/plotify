import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  runSecurityStage,
  validateAdditiveSecurityFindings,
  validateToolPins,
} from './security-stage.mjs'

const expectedPath = 'scripts/production-readiness/additive-security-findings.json'

test('accepts only exact T112 grant/policy revoke findings', () => {
  const valid = JSON.parse(
    JSON.stringify({
      schemaVersion: 1,
      checkpoint: 'additive',
      scheduledEnforcementTask: 'T112',
      findings: [
        {
          code: 'FINAL_REVOKE',
          object: 'public.example()',
          changeClass: 'grant_revoke',
          fingerprint: `sha256:${'a'.repeat(64)}`,
          owner: 'release',
          reason: 'compatible gateway first',
          reviewDate: '2099-01-01',
        },
      ],
      avatarPolicyOutcome: {
        knownObjectRead: true,
        globalListDenied: true,
        crossUserMutationDenied: true,
        evidenceDigest: `sha256:${'b'.repeat(64)}`,
      },
      performanceWarnings: [],
    })
  )
  assert.equal(validateAdditiveSecurityFindings(valid), valid)
  assert.throws(
    () =>
      validateAdditiveSecurityFindings({
        ...valid,
        findings: [{ ...valid.findings[0], changeClass: 'secret_waiver' }],
      }),
    /ADDITIVE_SECURITY_FINDING_INVALID/
  )
  assert.throws(
    () =>
      validateAdditiveSecurityFindings({
        ...valid,
        performanceWarnings: [
          {
            fingerprint: `sha256:${'c'.repeat(64)}`,
            owner: 'database',
            measuredImpact: 'p95 +2ms',
            budget: 'p95 <= 50ms',
          },
        ],
      }),
    /PERFORMANCE_WARNING_POLICY_INVALID/
  )
})

test('validates deterministic tool pin checksums', () => {
  const tools = {
    schemaVersion: 1,
    digestScope: 'utf8(name@version)',
    tools: {
      example: {
        version: '1.0.0',
        sha256: 'sha256:8e2953b859b0e74fbfd38d9735c034938b4c4a283c3c2c9034477374318fea01',
      },
    },
  }
  assert.equal(validateToolPins(tools), tools)
})

test('passes only with pinned tools and redacted enabled auth evidence', (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'plotify-security-stage-'))
  context.after(() => rmSync(directory, { recursive: true, force: true }))
  const authPath = join(directory, 'auth.json')
  writeFileSync(
    authPath,
    JSON.stringify({
      enabled: true,
      beforeFingerprint: `sha256:${'a'.repeat(64)}`,
      afterFingerprint: `sha256:${'b'.repeat(64)}`,
      redacted: true,
    })
  )
  const expected = JSON.parse(readFileSync(join(process.cwd(), expectedPath), 'utf8'))
  const result = runSecurityStage(
    { expectedOpenFindings: expectedPath },
    {
      authEvidencePath: authPath,
      commandAvailable: () => true,
      advisorFindings: expected.findings,
      secretFindings: [],
      dependencyFindings: [],
    }
  )
  assert.equal(result.status, 'PASS')
  assert.deepEqual(result.blockers, [])
})

test('fails closed when Auth evidence is missing, disabled or not redacted', (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'plotify-security-auth-'))
  context.after(() => rmSync(directory, { recursive: true, force: true }))
  const missing = runSecurityStage(
    { expectedOpenFindings: expectedPath },
    {
      authEvidencePath: join(directory, 'missing.json'),
      commandAvailable: () => true,
      advisorFindings: [],
    }
  )
  assert.ok(missing.blockers.includes('security:leaked_password_protection_evidence_missing'))

  const disabledPath = join(directory, 'disabled.json')
  writeFileSync(
    disabledPath,
    JSON.stringify({
      enabled: false,
      beforeFingerprint: `sha256:${'a'.repeat(64)}`,
      afterFingerprint: `sha256:${'b'.repeat(64)}`,
      redacted: true,
    })
  )
  const disabled = runSecurityStage(
    { expectedOpenFindings: expectedPath },
    {
      authEvidencePath: disabledPath,
      commandAvailable: () => true,
      advisorFindings: [],
    }
  )
  assert.ok(disabled.blockers.includes('security:leaked_password_protection_disabled'))

  const unredactedPath = join(directory, 'unredacted.json')
  writeFileSync(
    unredactedPath,
    JSON.stringify({
      enabled: true,
      beforeFingerprint: `sha256:${'a'.repeat(64)}`,
      afterFingerprint: `sha256:${'b'.repeat(64)}`,
      redacted: false,
    })
  )
  const unredacted = runSecurityStage(
    { expectedOpenFindings: expectedPath },
    {
      authEvidencePath: unredactedPath,
      commandAvailable: () => true,
      advisorFindings: [],
    }
  )
  assert.ok(unredacted.blockers.includes('security:leaked_password_protection_disabled'))

  const malformedPath = join(directory, 'malformed.json')
  writeFileSync(malformedPath, '{"enabled":true')
  assert.throws(
    () =>
      runSecurityStage(
        { expectedOpenFindings: expectedPath },
        {
          authEvidencePath: malformedPath,
          commandAvailable: () => true,
          advisorFindings: [],
        }
      ),
    /JSON/
  )
})

test('matches additive Advisor findings by exact fingerprint, code and object', (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'plotify-security-advisor-'))
  context.after(() => rmSync(directory, { recursive: true, force: true }))
  const authPath = join(directory, 'auth.json')
  writeFileSync(
    authPath,
    JSON.stringify({
      enabled: true,
      beforeFingerprint: `sha256:${'a'.repeat(64)}`,
      afterFingerprint: `sha256:${'b'.repeat(64)}`,
      redacted: true,
    })
  )
  const expected = JSON.parse(readFileSync(join(process.cwd(), expectedPath), 'utf8'))
  const exact = runSecurityStage(
    { expectedOpenFindings: expectedPath },
    {
      authEvidencePath: authPath,
      commandAvailable: () => true,
      advisorFindings: expected.findings,
    }
  )
  assert.equal(exact.status, 'PASS')

  const sameCountWrongObject = runSecurityStage(
    { expectedOpenFindings: expectedPath },
    {
      authEvidencePath: authPath,
      commandAvailable: () => true,
      advisorFindings: expected.findings.map((finding, index) =>
        index === 0 ? { ...finding, object: 'public.different(uuid)' } : finding
      ),
    }
  )
  assert.ok(
    sameCountWrongObject.blockers.includes('security:unexpected_advisor_finding'),
    JSON.stringify(sameCountWrongObject)
  )
  assert.ok(sameCountWrongObject.blockers.includes('security:expected_advisor_finding_missing'))
})
