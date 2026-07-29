export const WEB_SECURITY_FOUNDATION_NOT_IMPLEMENTED = 'WEB_SECURITY_FOUNDATION_NOT_IMPLEMENTED'

export const FEATURE_KEYS = [
  'automatic_escritura',
  'canonical_geometry_import',
  'document_capabilities',
] as const

export type FeatureKey = (typeof FEATURE_KEYS)[number]
export type RolloutMode = 'off' | 'projects' | 'on'

export const HARD_OFF_ENV_BY_FEATURE: Record<FeatureKey, string> = {
  automatic_escritura: 'PLOTIFY_HARD_OFF_AUTOMATIC_ESCRITURA',
  canonical_geometry_import: 'PLOTIFY_HARD_OFF_CANONICAL_GEOMETRY_IMPORT',
  document_capabilities: 'PLOTIFY_HARD_OFF_DOCUMENT_CAPABILITIES',
}

export interface RolloutControl {
  organizationId: string
  mode: RolloutMode
  version: number
  projectIds: readonly string[]
}

export interface ResolveFeatureRolloutInput {
  featureKey: FeatureKey
  organizationId: string
  projectId?: string | null
  control?: RolloutControl | null
  controlReadError?: boolean
  hardOff: boolean
}

export interface EffectiveFeatureRollout {
  enabled: boolean
  mode: RolloutMode
  version: number | null
  reason: 'hard_off' | 'missing' | 'read_error' | 'off' | 'project' | 'on'
}

export type HardOffState = Record<FeatureKey, boolean>

/** Missing or non-canonical values must resolve to the safe hard-off state. */
export function parseHardOffValue(value: string | undefined): boolean {
  return value !== 'false'
}

export function parseHardOffEnvironment(
  environment: Readonly<Record<string, string | undefined>>
): HardOffState {
  return Object.fromEntries(
    FEATURE_KEYS.map((featureKey) => [
      featureKey,
      parseHardOffValue(environment[HARD_OFF_ENV_BY_FEATURE[featureKey]]),
    ])
  ) as HardOffState
}

export function resolveFeatureRollout(input: ResolveFeatureRolloutInput): EffectiveFeatureRollout {
  const version = input.control?.version ?? null
  const off = (reason: EffectiveFeatureRollout['reason']): EffectiveFeatureRollout => ({
    enabled: false,
    mode: 'off',
    version,
    reason,
  })

  if (input.hardOff) return off('hard_off')
  if (input.controlReadError) return off('read_error')
  if (!input.control) return off('missing')
  if (input.control.organizationId !== input.organizationId) return off('off')
  if (input.control.mode === 'off') return off('off')
  if (input.control.mode === 'on') {
    return { enabled: true, mode: 'on', version, reason: 'on' }
  }
  if (input.projectId && input.control.projectIds.includes(input.projectId)) {
    return { enabled: true, mode: 'projects', version, reason: 'project' }
  }
  return off('off')
}
