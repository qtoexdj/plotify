import assert from 'node:assert/strict'
import test from 'node:test'

import { compareMigrationHistory } from './compare-migration-history.mjs'

test('detects conflicting, missing and extra final-target migration history', () => {
  const result = compareMigrationHistory({
    local: [{ version: '20260713000100', digest: 'local' }],
    remote: [{ version: '20260713000100', digest: 'different' }],
    assertFinalTargetFresh: true,
  })
  assert.equal(result.ok, false)
  assert.equal(result.status, 'conflicting_final_target')
  assert.deepEqual(result.conflicts, ['20260713000100'])
  assert.match(result.proposal, /STOP/)
})

test('does not accept equivalent DDL when versioned history is absent', () => {
  const result = compareMigrationHistory({
    local: [{ version: '20260713000100', digest: 'same-ddl' }],
    remote: [],
    localSchemaFingerprint: 'same-ddl',
    remoteSchemaFingerprint: 'same-ddl',
  })
  assert.equal(result.ok, false)
  assert.deepEqual(result.missing, ['20260713000100'])
})

test('accepts a fresh final target while reporting the pending guarded range', () => {
  const result = compareMigrationHistory({
    local: [
      { version: '20260601000000', digest: 'old' },
      { version: '20260713000100', digest: 'sdd019' },
    ],
    remote: [{ version: '20260601000000' }],
    assertFinalTargetFresh: true,
  })
  assert.equal(result.ok, true)
  assert.equal(result.status, 'fresh_final_target')
  assert.deepEqual(result.missing, ['20260713000100'])
})

test('requires exact schema and grant fingerprints after apply', () => {
  const result = compareMigrationHistory({
    local: [{ version: '20260713000100', digest: 'same' }],
    remote: [{ version: '20260713000100', digest: 'same' }],
    localSchemaFingerprint: 'schema-a',
    remoteSchemaFingerprint: 'schema-b',
    localGrantFingerprint: 'grants-a',
    remoteGrantFingerprint: 'grants-b',
  })
  assert.equal(result.ok, false)
  assert.deepEqual(result.fingerprintMismatches, ['schema', 'grants'])
})
