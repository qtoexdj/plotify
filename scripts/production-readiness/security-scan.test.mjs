import assert from 'node:assert/strict'
import test from 'node:test'

import {
  classifyDependencyFindings,
  normalizeGitleaksFinding,
  parseSecurityScanArgs,
  validateRuntimeToolVersion,
} from './security-scan.mjs'

test('accepts only an explicitly local non-remote aggregate scan', () => {
  assert.deepEqual(
    parseSecurityScanArgs([
      '--',
      '--target',
      'local',
      '--no-remote',
      '--output',
      '/tmp/plotify-security',
    ]),
    {
      target: 'local',
      noRemote: true,
      output: '/tmp/plotify-security',
      rotationEvidence: 'specs/019-hardening-produccion/evidence/secret-rotations.json',
      dependencyPolicy: 'scripts/production-readiness/dependency-security-policy.json',
    }
  )
  assert.throws(
    () => parseSecurityScanArgs(['--target', 'linked', '--no-remote', '--output', '/tmp/out']),
    /SECURITY_SCAN_LOCAL_ONLY/
  )
  assert.throws(
    () => parseSecurityScanArgs(['--target', 'local', '--output', '/tmp/out']),
    /SECURITY_SCAN_NO_REMOTE_REQUIRED/
  )
})

test('normalizes Gitleaks findings without retaining secret material', () => {
  const normalized = normalizeGitleaksFinding(
    {
      Fingerprint: 'fixture:file:rule:1',
      RuleID: 'fixture-rule',
      File: 'fixture.txt',
      StartLine: 4,
      Commit: 'abc123',
      Secret: 'must-not-survive',
      Match: 'also-must-not-survive',
    },
    'resolved'
  )
  assert.deepEqual(normalized, {
    fingerprint: 'fixture:file:rule:1',
    ruleId: 'fixture-rule',
    file: 'fixture.txt',
    startLine: 4,
    commit: 'abc123',
    classification: 'resolved',
    redacted: true,
  })
  assert.doesNotMatch(JSON.stringify(normalized), /must-not-survive/)
})

test('requires exact runtime tool versions', () => {
  assert.doesNotThrow(() => validateRuntimeToolVersion('gitleaks', '8.28.0', '8.28.0'))
  assert.throws(
    () => validateRuntimeToolVersion('gitleaks', '8.28.0', '8.27.2'),
    /SECURITY_TOOL_VERSION_MISMATCH/
  )
})

test('blocks high or critical dependencies unless a current evidence-backed exception exists', () => {
  const findings = [
    {
      id: 'CVE-EXAMPLE-1',
      package: 'runtime-package',
      severity: 'high',
      runtime: true,
    },
    {
      id: 'CVE-EXAMPLE-2',
      package: 'dev-package',
      severity: 'high',
      runtime: false,
    },
  ]
  const result = classifyDependencyFindings(
    findings,
    {
      exceptions: [
        {
          id: 'CVE-EXAMPLE-2',
          package: 'dev-package',
          owner: 'security',
          evidence: 'not shipped in production artifacts',
          expiresAt: '2099-01-01T00:00:00.000Z',
        },
      ],
    },
    new Date('2026-07-28T00:00:00.000Z')
  )
  assert.deepEqual(
    result.map(({ id, status }) => ({ id, status })),
    [
      { id: 'CVE-EXAMPLE-1', status: 'blocked' },
      { id: 'CVE-EXAMPLE-2', status: 'accepted' },
    ]
  )
})

test('expired or incomplete dependency exceptions remain blocked', () => {
  const [result] = classifyDependencyFindings(
    [{ id: 'CVE-EXAMPLE-3', package: 'example', severity: 'critical', runtime: false }],
    {
      exceptions: [
        {
          id: 'CVE-EXAMPLE-3',
          package: 'example',
          owner: 'security',
          evidence: 'dev only',
          expiresAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    },
    new Date('2026-07-28T00:00:00.000Z')
  )
  assert.equal(result.status, 'blocked')
})
