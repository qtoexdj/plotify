export const WEB_SECURITY_FOUNDATION_NOT_IMPLEMENTED = 'WEB_SECURITY_FOUNDATION_NOT_IMPLEMENTED'

export type RuntimeEnvironment = 'development' | 'test' | 'preview' | 'production'
export type RuntimeLifecycle = 'active' | 'retired'

export interface WebRuntimeSecurityInput {
  environment: RuntimeEnvironment
  secrets: Readonly<Record<string, string | undefined>>
  remoteBaseUrls: Readonly<Record<string, string | undefined>>
  allowedRemoteHosts: readonly string[]
  browserEnvironment: Readonly<Record<string, string | undefined>>
}

export interface RuntimeSecurityValidation {
  valid: boolean
  issues: string[]
}

export interface WebRuntimeAttestation {
  environmentFingerprint: string
  deploymentId: string
  runtimeRole: 'web'
  slotId: string
  instanceId: string
  releaseSha: string
  artifactDigest: string
  configVersion: string
  hardOffFingerprint: string
  lifecycle: RuntimeLifecycle
  heartbeatAt: string
  retiredAt?: string | null
}

export type NewWebRuntimeAttestation = Omit<
  WebRuntimeAttestation,
  'runtimeRole' | 'lifecycle' | 'heartbeatAt' | 'retiredAt'
> & { heartbeatAt?: string }

/** Validates startup configuration without returning secret values. */
export function validateWebRuntimeSecurity(
  input: WebRuntimeSecurityInput
): RuntimeSecurityValidation {
  if (input.environment !== 'production') return { valid: true, issues: [] }

  const issues: string[] = []
  const unsafeSecret = /(?:default|changeme|change-me|placeholder|test-secret)/i
  for (const [key, value] of Object.entries(input.secrets)) {
    if (!value?.trim() || unsafeSecret.test(value)) issues.push(`${key}: unsafe production secret`)
  }
  for (const [key, value] of Object.entries(input.remoteBaseUrls)) {
    try {
      if (!value) throw new Error('missing')
      const url = new URL(value)
      if (url.protocol !== 'https:' || !input.allowedRemoteHosts.includes(url.hostname)) {
        issues.push(`${key}: unsafe or unallowlisted remote URL`)
      }
    } catch {
      issues.push(`${key}: invalid remote URL`)
    }
  }
  const browserAuthorityPattern = /(?:SECRET|SERVICE_ROLE|HARD_OFF|RELEASE_CONFIG)/
  for (const key of Object.keys(input.browserEnvironment)) {
    if (key.startsWith('NEXT_PUBLIC_') && browserAuthorityPattern.test(key)) {
      issues.push(`${key}: server authority exposed to browser`)
    }
  }
  return { valid: issues.length === 0, issues }
}

/** Builds the service-only heartbeat payload for a web runtime instance. */
export function buildWebRuntimeAttestation(input: NewWebRuntimeAttestation): WebRuntimeAttestation {
  return {
    ...input,
    runtimeRole: 'web',
    lifecycle: 'active',
    heartbeatAt: input.heartbeatAt ?? new Date().toISOString(),
    retiredAt: null,
  }
}

/** Enforces immutable artifact identity and valid active/retired transitions. */
export function validateWebAttestationTransition(
  previous: WebRuntimeAttestation,
  next: WebRuntimeAttestation
): RuntimeSecurityValidation {
  const issues: string[] = []
  const immutableKeys: Array<keyof WebRuntimeAttestation> = [
    'environmentFingerprint',
    'deploymentId',
    'runtimeRole',
    'slotId',
    'instanceId',
    'releaseSha',
    'artifactDigest',
  ]
  for (const key of immutableKeys) {
    if (previous[key] !== next[key]) issues.push(`${key} is immutable`)
  }
  if (previous.lifecycle === 'retired') {
    if (next.lifecycle !== 'retired') issues.push('retirement is terminal')
    if (next.heartbeatAt !== previous.heartbeatAt) issues.push('retired instance cannot heartbeat')
  } else if (next.lifecycle === 'retired' && !next.retiredAt) {
    issues.push('retirement requires retiredAt')
  }
  if (new Date(next.heartbeatAt).getTime() < new Date(previous.heartbeatAt).getTime()) {
    issues.push('heartbeat cannot move backwards')
  }
  return { valid: issues.length === 0, issues }
}
