import { describe, expect, it } from 'vitest'
import {
  HARD_OFF_ENV_BY_FEATURE,
  WEB_SECURITY_FOUNDATION_NOT_IMPLEMENTED,
  parseHardOffEnvironment,
  parseHardOffValue,
  resolveFeatureRollout,
  type EffectiveFeatureRollout,
} from '@/lib/config/release-flags'

function record<T>(failures: string[], name: string, run: () => T, expected: T) {
  try {
    expect(run(), name).toEqual(expected)
  } catch (error) {
    if (error instanceof Error && error.message === WEB_SECURITY_FOUNDATION_NOT_IMPLEMENTED) {
      failures.push(`${name}: ${error.message}`)
      return
    }
    throw error
  }
}

const off = (reason: EffectiveFeatureRollout['reason'], version: number | null = null) => ({
  enabled: false,
  mode: 'off' as const,
  version,
  reason,
})

describe('release flag contract (RED)', () => {
  it('aggregates fail-closed rollout and exact hard-off parsing failures', () => {
    const failures: string[] = []

    record(failures, 'literal false disables hard-off', () => parseHardOffValue('false'), false)
    for (const value of [undefined, '', '0', 'TRUE', 'yes']) {
      record(failures, `invalid hard-off ${String(value)}`, () => parseHardOffValue(value), true)
    }
    record(failures, 'literal true enables hard-off', () => parseHardOffValue('true'), true)

    record(
      failures,
      'exact hard-off keys',
      () =>
        parseHardOffEnvironment({
          [HARD_OFF_ENV_BY_FEATURE.automatic_escritura]: 'false',
          [HARD_OFF_ENV_BY_FEATURE.canonical_geometry_import]: 'true',
          [HARD_OFF_ENV_BY_FEATURE.document_capabilities]: 'false',
        }),
      {
        automatic_escritura: false,
        canonical_geometry_import: true,
        document_capabilities: false,
      }
    )

    const base = {
      featureKey: 'document_capabilities' as const,
      organizationId: 'org-a',
      projectId: 'project-a',
      hardOff: false,
    }
    record(failures, 'missing control is off', () => resolveFeatureRollout(base), off('missing'))
    record(
      failures,
      'read error is off',
      () =>
        resolveFeatureRollout({
          ...base,
          controlReadError: true,
        }),
      off('read_error')
    )
    record(
      failures,
      'hard-off wins over persisted on',
      () =>
        resolveFeatureRollout({
          ...base,
          hardOff: true,
          control: { organizationId: 'org-a', mode: 'on', version: 4, projectIds: [] },
        }),
      off('hard_off', 4)
    )
    record(
      failures,
      'project scope enables matching project',
      () =>
        resolveFeatureRollout({
          ...base,
          control: {
            organizationId: 'org-a',
            mode: 'projects',
            version: 5,
            projectIds: ['project-a'],
          },
        }),
      { enabled: true, mode: 'projects', version: 5, reason: 'project' }
    )
    record(
      failures,
      'project scope denies non-matching project',
      () =>
        resolveFeatureRollout({
          ...base,
          projectId: 'project-b',
          control: {
            organizationId: 'org-a',
            mode: 'projects',
            version: 5,
            projectIds: ['project-a'],
          },
        }),
      off('off', 5)
    )

    expect(failures, WEB_SECURITY_FOUNDATION_NOT_IMPLEMENTED).toEqual([])
  })
})
