import assert from 'node:assert/strict'
import test from 'node:test'
import {
  comparePrivilegedInventory,
  generatedPrivilegedClassification,
  inventoryPrivilegedHttpSurfaces,
} from './privileged-http-surfaces.mjs'

test('derives an exact privileged HTTP inventory', async () => {
  const classification = generatedPrivilegedClassification()
  assert.deepEqual(comparePrivilegedInventory(classification.surfaces, classification).issues, [])
  await assert.doesNotReject(
    inventoryPrivilegedHttpSurfaces({
      classification:
        'specs/019-hardening-produccion/evidence/privileged-http-surfaces.classification.json',
      assertComplete: true,
    })
  )
})

test('rejects missing, stale, duplicate and drifted classifications', () => {
  const classification = generatedPrivilegedClassification()
  const row = classification.surfaces[0]
  assert.ok(row)
  const broken = {
    ...classification,
    surfaces: [{ ...row, callsiteHash: `sha256:${'0'.repeat(64)}` }, row],
  }
  const issues = comparePrivilegedInventory(
    classification.surfaces.slice(0, 1),
    broken
  ).issues.join(';')
  assert.match(issues, /duplicate/)
  assert.match(issues, /drift/)
})
