import assert from 'node:assert/strict'
import test from 'node:test'

import { buildCapabilityCutoverPlan, inspectProductionData } from './production-data-preflight.mjs'

test('classifies legacy blockers without proposing deletes or pre-GO capabilities', () => {
  const result = inspectProductionData({
    geometries: [{ projectId: 'p1' }, { projectId: 'p1' }],
    generations: [{ caseId: 'c1' }, { caseId: 'c1' }],
    deliveries: [{ recipient: 'recipient-1', linkToken: 'plaintext' }],
    lotStages: [{ stage: 'escritura_firmada', signatureEventId: null }],
  })
  const plan = buildCapabilityCutoverPlan(result, 'a'.repeat(40))
  assert.equal(result.zeroConstraintBlockers, false)
  assert.equal(plan.verdict, 'NO-GO')
  assert.equal(plan.details.createsHashCapabilityBeforeGo, false)
  assert.deepEqual(plan.details.deleteStatements, [])
  assert.ok(plan.blockers.includes('PLAINTEXT_CAPABILITY'))
})
