import assert from 'node:assert/strict'
import test from 'node:test'

import {
  compareInventoryToClassification,
  normalizeDefaultAcl,
  parseArguments,
  validateClassificationRows,
} from './privileged-operations-inventory.mjs'

const completeRow = {
  signature: 'public.example(uuid)',
  class: 'security_definer_function',
  actor: 'authenticated',
  tenant: 'resource.organization_id',
  callers: ['server'],
  audit: 'audit_logs',
  hash: 'sha256:abc',
  grant: ['authenticated:EXECUTE'],
  searchPath: 'public, pg_temp',
  introduction: '20260414000100_baseline_local_validated.sql',
}

test('normalizes default ACL by owner, schema, object type, grantee and privilege', () => {
  const normalized = normalizeDefaultAcl({
    owner: 'postgres',
    schema: null,
    objectType: 'FUNCTION',
    grantee: 'PUBLIC',
    privilege: 'EXECUTE',
  })

  assert.equal(normalized, 'postgres|*|function|PUBLIC|EXECUTE')
})

test('rejects missing fields, duplicate signatures and broad unreviewed grants', () => {
  assert.throws(() => validateClassificationRows([{ ...completeRow, actor: '' }]), /actor/)
  assert.throws(
    () => validateClassificationRows([completeRow, { ...completeRow }]),
    /duplicate signature/
  )
  assert.throws(
    () =>
      validateClassificationRows([
        { ...completeRow, grant: ['PUBLIC:EXECUTE'], actor: 'authenticated' },
      ]),
    /broad grant/
  )
})

test('fails missing and stale classification rows', () => {
  const second = { ...completeRow, signature: 'public.second()' }

  assert.throws(
    () => compareInventoryToClassification([completeRow, second], [completeRow]),
    /missing classification.*public\.second/s
  )
  assert.throws(
    () => compareInventoryToClassification([completeRow], [completeRow, second]),
    /stale classification.*public\.second/s
  )
})

test('accepts an explicit linked read-only inventory target', () => {
  const options = parseArguments([
    '--target',
    'linked',
    '--classification',
    'classification.json',
    '--output',
    'baseline.json',
  ])

  assert.equal(options.target, 'linked')
})

test('fails when a classified definition hash drifts', () => {
  assert.throws(
    () =>
      compareInventoryToClassification([{ ...completeRow, hash: 'sha256:changed' }], [completeRow]),
    /classification drift.*hash/
  )
})
