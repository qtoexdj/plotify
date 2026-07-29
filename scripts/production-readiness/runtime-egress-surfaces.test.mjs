import assert from 'node:assert/strict'
import test from 'node:test'
import {
  compareRuntimeEgressInventory,
  generatedRuntimeEgressClassification,
  inventoryRuntimeEgressSurfaces,
} from './runtime-egress-surfaces.mjs'

test('derives exact HTTP, SDK and LLM egress', async () => {
  const classification = generatedRuntimeEgressClassification()
  assert.deepEqual(
    compareRuntimeEgressInventory(classification.surfaces, classification).issues,
    []
  )
  await assert.doesNotReject(
    inventoryRuntimeEgressSurfaces({
      classification:
        'specs/019-hardening-produccion/evidence/runtime-egress-surfaces.classification.json',
      assertComplete: true,
    })
  )
})

test('rejects an unclassified egress callsite', () => {
  const classification = generatedRuntimeEgressClassification()
  const issues = compareRuntimeEgressInventory(classification.surfaces, {
    ...classification,
    surfaces: [],
  }).issues.join(';')
  assert.match(issues, /missing/)
})
