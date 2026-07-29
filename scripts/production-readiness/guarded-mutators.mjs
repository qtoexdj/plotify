#!/usr/bin/env node

const DIGEST = /^sha256:[a-f0-9]{64}$/
const SHA = /^[a-f0-9]{40,64}$/
const LEGACY_FREE_PROJECT = 'swkrnjdpnlrgxgotmfxy'

function guard(condition, code) {
  if (!condition) throw new Error(code)
}

export function assertMutationGuards(input) {
  guard(input && typeof input === 'object', 'GUARDED_MUTATION_INPUT_REQUIRED')
  guard(
    typeof input.operation === 'string' && input.operation.length > 0,
    'GUARDED_MUTATION_OPERATION_REQUIRED'
  )
  guard(['linked', 'disposable'].includes(input.target?.kind), 'GUARDED_MUTATION_TARGET_REQUIRED')
  guard(
    input.target.projectRef && input.target.projectRef !== LEGACY_FREE_PROJECT,
    'GUARDED_MUTATION_LEGACY_TARGET_FORBIDDEN'
  )
  guard(DIGEST.test(input.target.fingerprint ?? ''), 'GUARDED_MUTATION_TARGET_REQUIRED')
  guard(
    DIGEST.test(input.sourceManifest?.digest ?? '') &&
      SHA.test(input.sourceManifest?.sourceSha ?? ''),
    'GUARDED_MUTATION_SOURCE_REQUIRED'
  )

  const approval = input.approval
  guard(
    approval?.schemaVersion === 1 && approval.verdict === 'PASS',
    'GUARDED_MUTATION_APPROVAL_REQUIRED'
  )
  guard(
    typeof approval.details?.actor === 'string' && approval.details.actor.trim().length > 0,
    'GUARDED_MUTATION_ACTOR_REQUIRED'
  )
  guard(
    typeof approval.details?.reason === 'string' && approval.details.reason.trim().length > 0,
    'GUARDED_MUTATION_REASON_REQUIRED'
  )
  guard(approval.details?.operation === input.operation, 'GUARDED_MUTATION_OPERATION_MISMATCH')
  guard(approval.targetFingerprint === input.target.fingerprint, 'GUARDED_MUTATION_TARGET_MISMATCH')
  guard(
    approval.sourceManifestDigest === input.sourceManifest.digest &&
      approval.sourceSha === input.sourceManifest.sourceSha,
    'GUARDED_MUTATION_SOURCE_MISMATCH'
  )
  return input
}

function safeResult(result) {
  const allowed = new Set([
    'status',
    'beforeFingerprint',
    'afterFingerprint',
    'liveRead',
    'details',
    'redacted',
  ])
  guard(
    result &&
      typeof result === 'object' &&
      result.redacted === true &&
      Object.keys(result).every((key) => allowed.has(key)),
    'GUARDED_MUTATION_RESULT_UNSAFE'
  )
  for (const field of ['beforeFingerprint', 'afterFingerprint']) {
    if (result[field] !== undefined) {
      guard(DIGEST.test(result[field]), 'GUARDED_MUTATION_RESULT_UNSAFE')
    }
  }
  const serialized = JSON.stringify(result)
  guard(
    !/(authorization|access.?token|service.?role|secret|signed.?url)/i.test(serialized),
    'GUARDED_MUTATION_RESULT_UNSAFE'
  )
  return result
}

export async function runGuardedMutation(input, adapter) {
  assertMutationGuards(input)
  const common = {
    operation: input.operation,
    targetFingerprint: input.target.fingerprint,
    sourceManifestDigest: input.sourceManifest.digest,
    sourceSha: input.sourceManifest.sourceSha,
    redacted: true,
  }
  if (input.apply !== true) return { ...common, status: 'DRY_RUN' }
  guard(typeof adapter === 'function', 'GUARDED_MUTATION_ADAPTER_REQUIRED')
  const details = input.approval.details
  const result = safeResult(
    await adapter({
      operation: input.operation,
      projectRef: input.target.projectRef,
      expectedSetting: details.expectedSetting,
      expectedBefore: details.expectedBefore,
      expectedAfter: details.expectedAfter,
    })
  )
  return { ...common, ...result }
}
