import { describe, expect, it } from 'vitest'
import {
  WEB_SECURITY_FOUNDATION_NOT_IMPLEMENTED,
  buildWebRuntimeAttestation,
  validateWebAttestationTransition,
  validateWebRuntimeSecurity,
  type RuntimeSecurityValidation,
  type WebRuntimeAttestation,
  type WebRuntimeSecurityInput,
} from '@/lib/config/runtime-security'

const digestA = `sha256:${'a'.repeat(64)}`
const digestB = `sha256:${'b'.repeat(64)}`
const sourceSha = 'c'.repeat(40)

const validProductionConfig: WebRuntimeSecurityInput = {
  environment: 'production',
  secrets: {
    INTERNAL_API_SECRET: 'runtime-value-with-sufficient-entropy',
    SUPABASE_SERVICE_ROLE_KEY: 'service-value-with-sufficient-entropy',
  },
  remoteBaseUrls: { PLOTIFY_CHAT_BASE_URL: 'https://api.plotify.cl' },
  allowedRemoteHosts: ['api.plotify.cl'],
  browserEnvironment: { NEXT_PUBLIC_APP_URL: 'https://app.plotify.cl' },
}

function record<T>(failures: string[], name: string, run: () => T, verify: (value: T) => void) {
  try {
    verify(run())
  } catch (error) {
    if (error instanceof Error && error.message === WEB_SECURITY_FOUNDATION_NOT_IMPLEMENTED) {
      failures.push(`${name}: ${error.message}`)
      return
    }
    throw error
  }
}

function expectInvalid(result: RuntimeSecurityValidation) {
  expect(result.valid).toBe(false)
  expect(result.issues.length).toBeGreaterThan(0)
}

describe('web runtime security contract (RED)', () => {
  it('aggregates startup, browser-leakage and attestation lifecycle failures', () => {
    const failures: string[] = []

    record(
      failures,
      'valid production config',
      () => validateWebRuntimeSecurity(validProductionConfig),
      (result) => {
        expect(result).toEqual({ valid: true, issues: [] })
      }
    )

    for (const unsafeSecret of ['', 'default-secret', 'changeMe-placeholder']) {
      record(
        failures,
        `unsafe secret ${unsafeSecret || '<blank>'}`,
        () =>
          validateWebRuntimeSecurity({
            ...validProductionConfig,
            secrets: { ...validProductionConfig.secrets, INTERNAL_API_SECRET: unsafeSecret },
          }),
        expectInvalid
      )
    }

    for (const unsafeUrl of ['http://api.plotify.cl', 'https://evil.invalid']) {
      record(
        failures,
        `unsafe remote URL ${unsafeUrl}`,
        () =>
          validateWebRuntimeSecurity({
            ...validProductionConfig,
            remoteBaseUrls: { PLOTIFY_CHAT_BASE_URL: unsafeUrl },
          }),
        expectInvalid
      )
    }

    record(
      failures,
      'browser authority/config leakage',
      () =>
        validateWebRuntimeSecurity({
          ...validProductionConfig,
          browserEnvironment: {
            NEXT_PUBLIC_APP_URL: 'https://app.plotify.cl',
            NEXT_PUBLIC_INTERNAL_API_SECRET: 'leaked-value',
            NEXT_PUBLIC_PLOTIFY_HARD_OFF_DOCUMENT_CAPABILITIES: 'false',
          },
        }),
      expectInvalid
    )

    let attestation: WebRuntimeAttestation | undefined
    record(
      failures,
      'build web attestation',
      () =>
        buildWebRuntimeAttestation({
          environmentFingerprint: digestA,
          deploymentId: 'deploy-019',
          slotId: 'web-1',
          instanceId: 'instance-1',
          releaseSha: sourceSha,
          artifactDigest: digestA,
          configVersion: 'release-config-v1',
          hardOffFingerprint: digestB,
          heartbeatAt: '2026-07-20T12:00:00.000Z',
        }),
      (result) => {
        attestation = result
        expect(result.runtimeRole).toBe('web')
        expect(result.lifecycle).toBe('active')
        expect(result.artifactDigest).toBe(digestA)
      }
    )

    const previous: WebRuntimeAttestation = attestation ?? {
      environmentFingerprint: digestA,
      deploymentId: 'deploy-019',
      runtimeRole: 'web',
      slotId: 'web-1',
      instanceId: 'instance-1',
      releaseSha: sourceSha,
      artifactDigest: digestA,
      configVersion: 'release-config-v1',
      hardOffFingerprint: digestB,
      lifecycle: 'active',
      heartbeatAt: '2026-07-20T12:00:00.000Z',
      retiredAt: null,
    }

    record(
      failures,
      'same instance immutable digest',
      () =>
        validateWebAttestationTransition(previous, {
          ...previous,
          artifactDigest: digestB,
          heartbeatAt: '2026-07-20T12:01:00.000Z',
        }),
      expectInvalid
    )

    record(
      failures,
      'active to retired lifecycle',
      () =>
        validateWebAttestationTransition(previous, {
          ...previous,
          lifecycle: 'retired',
          retiredAt: '2026-07-20T12:01:00.000Z',
        }),
      (result) => expect(result).toEqual({ valid: true, issues: [] })
    )

    record(
      failures,
      'retired instance cannot heartbeat',
      () =>
        validateWebAttestationTransition(
          {
            ...previous,
            lifecycle: 'retired',
            retiredAt: '2026-07-20T12:01:00.000Z',
          },
          {
            ...previous,
            lifecycle: 'retired',
            retiredAt: '2026-07-20T12:01:00.000Z',
            heartbeatAt: '2026-07-20T12:02:00.000Z',
          }
        ),
      expectInvalid
    )

    expect(failures, WEB_SECURITY_FOUNDATION_NOT_IMPLEMENTED).toEqual([])
  })
})
