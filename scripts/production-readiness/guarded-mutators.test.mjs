import assert from 'node:assert/strict'
import test from 'node:test'

import { runGuardedMutation } from './guarded-mutators.mjs'

const digest = (character) => `sha256:${character.repeat(64)}`

function validInput(overrides = {}) {
  return {
    operation: 'auth-hardening',
    target: {
      kind: 'linked',
      fingerprint: digest('a'),
      projectRef: 'final-project-ref',
    },
    sourceManifest: {
      digest: digest('b'),
      sourceSha: 'c'.repeat(40),
      dirty: true,
    },
    approval: {
      schemaVersion: 1,
      kind: 'auth-hardening-approval',
      verdict: 'PASS',
      sourceSha: 'c'.repeat(40),
      targetFingerprint: digest('a'),
      sourceManifestDigest: digest('b'),
      details: {
        operation: 'auth-hardening',
        actor: 'release-operator',
        reason: 'enable leaked-password protection on the approved final target',
        expectedSetting: 'password_hibp_enabled',
        expectedBefore: false,
        expectedAfter: true,
      },
    },
    apply: true,
    ...overrides,
  }
}

test('makes zero adapter calls when approval binding is incomplete', async () => {
  let calls = 0
  const input = validInput({
    approval: {
      ...validInput().approval,
      details: { ...validInput().approval.details, reason: '' },
    },
  })

  await assert.rejects(
    () =>
      runGuardedMutation(input, async () => {
        calls += 1
      }),
    /GUARDED_MUTATION_REASON_REQUIRED/
  )
  assert.equal(calls, 0)
})

test('makes zero adapter calls on target, source or operation mismatch', async () => {
  for (const input of [
    validInput({ target: { ...validInput().target, fingerprint: digest('d') } }),
    validInput({
      sourceManifest: { ...validInput().sourceManifest, digest: digest('e') },
    }),
    validInput({ operation: 'migration-push' }),
  ]) {
    let calls = 0
    await assert.rejects(
      () =>
        runGuardedMutation(input, async () => {
          calls += 1
        }),
      /GUARDED_MUTATION_(TARGET|SOURCE|OPERATION)_MISMATCH/
    )
    assert.equal(calls, 0)
  }
})

test('defaults to dry-run and makes zero adapter calls', async () => {
  let calls = 0
  const result = await runGuardedMutation({ ...validInput(), apply: false }, async () => {
    calls += 1
  })
  assert.equal(calls, 0)
  assert.equal(result.status, 'DRY_RUN')
  assert.equal(result.redacted, true)
  assert.equal(result.targetFingerprint, digest('a'))
  assert.equal(result.sourceManifestDigest, digest('b'))
})

test('calls the adapter once only after all guards pass and records redacted fingerprints', async () => {
  let calls = 0
  const result = await runGuardedMutation(validInput(), async (request) => {
    calls += 1
    assert.deepEqual(request, {
      operation: 'auth-hardening',
      projectRef: 'final-project-ref',
      expectedSetting: 'password_hibp_enabled',
      expectedBefore: false,
      expectedAfter: true,
    })
    return {
      status: 'APPLIED',
      beforeFingerprint: digest('f'),
      afterFingerprint: digest('1'),
      liveRead: { password_hibp_enabled: true },
      redacted: true,
    }
  })

  assert.equal(calls, 1)
  assert.equal(result.status, 'APPLIED')
  assert.equal(result.beforeFingerprint, digest('f'))
  assert.equal(result.afterFingerprint, digest('1'))
  assert.equal(result.liveRead.password_hibp_enabled, true)
  assert.equal(result.redacted, true)
})

test('rejects adapter output containing unredacted or unexpected fields', async () => {
  await assert.rejects(
    () =>
      runGuardedMutation(validInput(), async () => ({
        status: 'APPLIED',
        beforeFingerprint: digest('f'),
        afterFingerprint: digest('1'),
        liveRead: { password_hibp_enabled: true },
        redacted: false,
        accessToken: 'must-never-survive',
      })),
    /GUARDED_MUTATION_RESULT_UNSAFE/
  )
})
