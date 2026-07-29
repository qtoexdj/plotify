import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { STAGE_REGISTRY, parseGateArguments, runProductionReadiness } from './verify.mjs'

const EXPECTED_STAGES = [
  'preflight',
  'migration_parity',
  'legacy_inventory',
  'security',
  'database_tests',
  'api_contracts',
  'web_quality',
  'concurrency_recovery',
  'browser_a11y',
  'restore_rehearsal',
  'live_smoke',
  'verdict',
]

test('uses the canonical twelve-stage registry in order', () => {
  assert.deepEqual(STAGE_REGISTRY, EXPECTED_STAGES)
})

test('rejects unknown stages and aliases with exit-contract marker', () => {
  assert.throws(
    () =>
      parseGateArguments([
        '--stage',
        'database_security',
        '--target',
        'linked',
        '--output',
        '/tmp/gate',
      ]),
    /UNKNOWN_STAGE/
  )
})

test('requires explicit final release SHA and authenticated deployment manifest', () => {
  assert.throws(
    () =>
      parseGateArguments([
        '--final',
        '--target',
        'linked',
        '--output',
        '/tmp/gate',
        '--no-destructive',
      ]),
    /FINAL_BINDINGS_REQUIRED/
  )
})

test('parses a diagnostic stage with no-destructive default', () => {
  const options = parseGateArguments([
    '--stage',
    'security',
    '--checkpoint',
    'additive',
    '--target',
    'linked',
    '--expected-open-findings',
    '/tmp/findings.json',
    '--output',
    '/tmp/gate',
  ])
  assert.equal(options.noDestructive, true)
  assert.equal(options.stage, 'security')
  assert.equal(options.checkpoint, 'additive')
})

test('runs every canonical stage through an injected read-only adapter', async () => {
  const options = parseGateArguments(['--target', 'local', '--output', '/tmp/gate'])
  const seen = []
  const result = await runProductionReadiness(options, {
    write: false,
    gitState: () => ({ sha: 'a'.repeat(40), branch: 'test', dirty: false }),
    stageRunner: async (stage) => {
      seen.push(stage)
      return { name: stage, status: 'PASS', evidenceDigest: `sha256:${'b'.repeat(64)}` }
    },
  })
  assert.deepEqual(seen, EXPECTED_STAGES)
  assert.equal(result.report.verdict, 'GO')
  assert.equal(result.report.rolloutStatus, 'not_started')
})

test('final mode atomically writes an immutable SHA-bound evidence manifest', async (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'plotify-final-gate-'))
  context.after(() => rmSync(directory, { recursive: true, force: true }))
  const sourceSha = 'a'.repeat(40)
  const digest = `sha256:${'b'.repeat(64)}`
  const authoritative = {
    schemaVersion: 1,
    deploymentId: 'deployment-1',
    environmentFingerprint: digest,
    sourceSha,
    expectedRoster: ['web', 'api', 'worker'].map((runtimeRole) => ({
      runtimeRole,
      slotId: `${runtimeRole}-slot`,
      instanceId: `${runtimeRole}-instance`,
      lifecycle: 'active',
      artifactDigest: digest,
    })),
    roleArtifactDigests: { web: digest, api: digest, worker: digest },
    buildOperationId: '00000000-0000-4000-8000-000000000001',
    deployOperationId: '00000000-0000-4000-8000-000000000002',
    issuedAt: '2026-07-28T12:00:00.000Z',
  }
  const statementDigest = `sha256:${createHash('sha256')
    .update(JSON.stringify(authoritative))
    .digest('hex')}`
  const manifestPath = join(directory, 'deployment.json')
  writeFileSync(
    manifestPath,
    JSON.stringify({
      ...authoritative,
      provenance: {
        issuer: 'ci',
        identity: 'plotify-release',
        statementDigest,
        signature: 'signature-placeholder',
        trustPolicyVersion: 'v1',
      },
    })
  )
  const output = join(directory, 'output')
  const options = parseGateArguments([
    '--target',
    'linked',
    '--output',
    output,
    '--release-sha',
    sourceSha,
    '--require-clean-git',
    '--require-deployed-sha',
    '--deployment-manifest',
    manifestPath,
  ])
  await runProductionReadiness(options, {
    gitState: () => ({ sha: sourceSha, branch: 'release', dirty: false }),
    stageRunner: async (stage) => ({
      name: stage,
      status: 'PASS',
      evidenceDigest: `sha256:${'c'.repeat(64)}`,
    }),
  })
  assert.equal(existsSync(join(output, 'evidence-manifest.json')), true)
  await assert.rejects(
    () =>
      runProductionReadiness(options, {
        gitState: () => ({ sha: sourceSha, branch: 'release', dirty: false }),
        stageRunner: async (stage) => ({
          name: stage,
          status: 'PASS',
          evidenceDigest: `sha256:${'c'.repeat(64)}`,
        }),
      }),
    /IMMUTABLE_EVIDENCE_EXISTS/
  )
})
