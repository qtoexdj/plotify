import assert from 'node:assert/strict'
import test from 'node:test'
import {
  compareStructuredLogInventory,
  discoverStructuredLogSinks,
  generatedStructuredLogPolicy,
  inventoryStructuredLogs,
} from './structured-log-inventory.mjs'

test('classifies every structured log sink and its redaction', async () => {
  const policy = generatedStructuredLogPolicy()
  assert.deepEqual(compareStructuredLogInventory(discoverStructuredLogSinks(), policy), [])
  await assert.doesNotReject(
    inventoryStructuredLogs({
      policy: 'scripts/production-readiness/structured-log-policy.json',
      assertClean: true,
    })
  )
})

test('rejects missing log policy rows', () => {
  assert.match(
    compareStructuredLogInventory(discoverStructuredLogSinks(), { policies: [] }).join(';'),
    /missing/
  )
})
