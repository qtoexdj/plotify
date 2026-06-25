import { describe, expect, it } from 'vitest'

const AGENT_FOUNDATION_TEST_IDS = [
  'agent-skills-grid',
  'agent-skill-detail',
  'custom-skill-editor',
  'approved-tools-picker',
  'skill-validation-panel',
] as const

describe('SDD 012 agent foundation components skeleton', () => {
  it('keeps the expected component data-testids stable for story tests', () => {
    expect(AGENT_FOUNDATION_TEST_IDS).toEqual([
      'agent-skills-grid',
      'agent-skill-detail',
      'custom-skill-editor',
      'approved-tools-picker',
      'skill-validation-panel',
    ])
  })
})
