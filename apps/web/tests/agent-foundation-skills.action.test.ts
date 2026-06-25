import { describe, expect, it } from 'vitest'

const SHARED_AGENT_FOUNDATION_ACTIONS = [
  'toggle-cache-invalidation',
  'validate-custom-skill',
  'publish-custom-skill',
] as const

describe('SDD 012 agent foundation actions skeleton', () => {
  it('declares the action surfaces covered by shared and story tasks', () => {
    expect(SHARED_AGENT_FOUNDATION_ACTIONS).toContain('toggle-cache-invalidation')
    expect(SHARED_AGENT_FOUNDATION_ACTIONS).toContain('validate-custom-skill')
    expect(SHARED_AGENT_FOUNDATION_ACTIONS).toContain('publish-custom-skill')
  })
})
