import assert from 'node:assert/strict'
import test from 'node:test'

import { compareMigrationHistory, parseRemoteMigrationList } from './compare-migration-history.mjs'

test('parseRemoteMigrationList parses the JSON output of supabase migration list --linked', () => {
  const json = JSON.stringify({
    migrations: [
      { local: '20260713000100', remote: '20260713000100', time: '2026-07-13 00:01:00' },
      { local: '20260806000000', remote: '', time: '2026-08-06 00:00:00' },
      { local: '', remote: '20260729023506', time: '2026-07-29 02:35:06' },
    ],
  })
  const rows = parseRemoteMigrationList(`Initialising login role...\n${json}`)
  const versions = rows.map((row) => row.version)
  assert.deepEqual(versions, ['20260713000100', '20260729023506', '20260806000000'])
})

test('parseRemoteMigrationList still supports legacy pipe output', () => {
  const rows = parseRemoteMigrationList('20260713000100 | 20260713000100 | x\n')
  assert.deepEqual(rows.map((row) => row.version), ['20260713000100'])
})

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
