import assert from 'node:assert/strict'
import test from 'node:test'

import { verifyRollout } from './verify-rollout.mjs'

test('fails closed when rollout transition evidence is incomplete', () => {
  assert.throws(
    () =>
      verifyRollout({
        plan: { transitions: ['internal', 'project', 'pilot'] },
        transitions: [],
        smokes: [],
      }),
    /EVIDENCE_SCHEMA_INVALID/
  )
})
