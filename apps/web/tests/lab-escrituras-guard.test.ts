import { afterEach, describe, expect, it, vi } from 'vitest'
import { isEscriturasLabEnabled } from '../src/lib/labs/escrituras.guard'

describe('Escrituras lab local-only guard', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('requires the explicit local lab flag', () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('PLOTIFY_ENABLE_ESCRITURAS_LAB', '')

    expect(isEscriturasLabEnabled()).toBe(false)

    vi.stubEnv('PLOTIFY_ENABLE_ESCRITURAS_LAB', 'true')
    expect(isEscriturasLabEnabled()).toBe(true)
  })

  it('stays disabled in production even with the flag', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('PLOTIFY_ENABLE_ESCRITURAS_LAB', 'true')

    expect(isEscriturasLabEnabled()).toBe(false)
  })
})
