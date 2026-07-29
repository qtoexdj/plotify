import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const ROOT = resolve(import.meta.dirname, '../..')
const AUTH_EVIDENCE = resolve(
  ROOT,
  'specs/019-hardening-produccion/evidence/auth-leaked-password-protection.json'
)

function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'))
}

export function validateAdditiveSecurityFindings(document, now = new Date()) {
  if (
    document.schemaVersion !== 1 ||
    document.checkpoint !== 'additive' ||
    document.scheduledEnforcementTask !== 'T112' ||
    !Array.isArray(document.findings)
  ) {
    throw new Error('ADDITIVE_SECURITY_FINDINGS_INVALID')
  }
  const seen = new Set()
  for (const finding of document.findings) {
    if (
      !finding.code ||
      !finding.object ||
      !['grant_revoke', 'policy_revoke'].includes(finding.changeClass) ||
      !/^sha256:[a-f0-9]{64}$/.test(finding.fingerprint) ||
      !finding.owner ||
      !finding.reason ||
      !finding.reviewDate ||
      new Date(`${finding.reviewDate}T23:59:59Z`) < now
    ) {
      throw new Error(`ADDITIVE_SECURITY_FINDING_INVALID: ${finding.code ?? 'unknown'}`)
    }
    if (seen.has(finding.fingerprint)) {
      throw new Error(`ADDITIVE_SECURITY_FINDING_DUPLICATE: ${finding.fingerprint}`)
    }
    seen.add(finding.fingerprint)
  }
  const avatar = document.avatarPolicyOutcome
  if (
    avatar?.knownObjectRead !== true ||
    avatar?.globalListDenied !== true ||
    avatar?.crossUserMutationDenied !== true ||
    !/^sha256:[a-f0-9]{64}$/.test(avatar?.evidenceDigest ?? '')
  ) {
    throw new Error('AVATAR_POLICY_OUTCOME_INVALID')
  }
  for (const warning of document.performanceWarnings ?? []) {
    if (
      !warning.fingerprint ||
      !warning.owner ||
      !warning.measuredImpact ||
      !warning.budget ||
      !warning.reviewDate ||
      new Date(`${warning.reviewDate}T23:59:59Z`) < now
    ) {
      throw new Error('PERFORMANCE_WARNING_POLICY_INVALID')
    }
  }
  return document
}

export function validateToolPins(document) {
  if (document.schemaVersion !== 1 || document.digestScope !== 'utf8(name@version)') {
    throw new Error('TOOL_PIN_POLICY_INVALID')
  }
  for (const [name, tool] of Object.entries(document.tools ?? {})) {
    if (tool.sha256 !== digest(`${name}@${tool.version}`)) {
      throw new Error(`TOOL_PIN_CHECKSUM_INVALID: ${name}`)
    }
  }
  return document
}

function commandAvailable(command, arguments_) {
  const result = spawnSync(command, arguments_, { cwd: ROOT, encoding: 'utf8' })
  return !result.error && result.status === 0
}

function advisorIdentity(finding) {
  return JSON.stringify([finding.fingerprint, finding.code, finding.object])
}

export function runSecurityStage(options, adapters = {}) {
  const blockers = []
  const expected = validateAdditiveSecurityFindings(readJson(options.expectedOpenFindings))
  const tools = validateToolPins(readJson('scripts/production-readiness/tool-versions.json'))
  const requirements = readFileSync(
    resolve(ROOT, 'scripts/production-readiness/security-tools.requirements.txt'),
    'utf8'
  )
  if (
    !requirements.includes(`pip-audit==${tools.tools['pip-audit'].version}`) ||
    !/--hash=sha256:[a-f0-9]{64}/.test(requirements)
  ) {
    blockers.push('security:pip_audit_requirements_unpinned')
  }

  const available =
    adapters.commandAvailable ?? ((name, arguments_) => commandAvailable(name, arguments_))
  const gitleaksBinary = process.env.GITLEAKS_BIN ?? 'gitleaks'
  if (!available(gitleaksBinary, ['version'])) {
    blockers.push('security:gitleaks_unavailable')
  }
  if (!available(resolve(ROOT, 'apps/api/.venv/bin/pip-audit'), ['--version'])) {
    blockers.push('security:pip_audit_unavailable')
  }

  const authEvidencePath = adapters.authEvidencePath ?? AUTH_EVIDENCE
  if (!existsSync(authEvidencePath)) {
    blockers.push('security:leaked_password_protection_evidence_missing')
  } else {
    const authEvidence = JSON.parse(readFileSync(authEvidencePath, 'utf8'))
    if (
      authEvidence.enabled !== true ||
      !/^sha256:[a-f0-9]{64}$/.test(authEvidence.beforeFingerprint ?? '') ||
      !/^sha256:[a-f0-9]{64}$/.test(authEvidence.afterFingerprint ?? '') ||
      authEvidence.redacted !== true
    ) {
      blockers.push('security:leaked_password_protection_disabled')
    }
  }

  const expectedAdvisorIdentities = new Set(expected.findings.map(advisorIdentity))
  const actualAdvisorIdentities = new Set((adapters.advisorFindings ?? []).map(advisorIdentity))
  if (
    actualAdvisorIdentities.size !== (adapters.advisorFindings ?? []).length ||
    [...actualAdvisorIdentities].some((identity) => !expectedAdvisorIdentities.has(identity))
  ) {
    blockers.push('security:unexpected_advisor_finding')
  }
  if ([...expectedAdvisorIdentities].some((identity) => !actualAdvisorIdentities.has(identity))) {
    blockers.push('security:expected_advisor_finding_missing')
  }
  const expectedPerformanceFingerprints = new Set(
    (expected.performanceWarnings ?? []).map(({ fingerprint }) => fingerprint)
  )
  const actualPerformanceFingerprints = new Set(
    (adapters.performanceWarnings ?? []).map(({ fingerprint }) => fingerprint)
  )
  if (
    actualPerformanceFingerprints.size !== (adapters.performanceWarnings ?? []).length ||
    [...actualPerformanceFingerprints].some(
      (fingerprint) => !expectedPerformanceFingerprints.has(fingerprint)
    )
  ) {
    blockers.push('security:unexpected_performance_warning')
  }
  if (
    [...expectedPerformanceFingerprints].some(
      (fingerprint) => !actualPerformanceFingerprints.has(fingerprint)
    )
  ) {
    blockers.push('security:expected_performance_warning_missing')
  }
  if ((adapters.secretFindings ?? []).some((finding) => finding.status !== 'resolved')) {
    blockers.push('security:active_secret')
  }
  if (
    (adapters.dependencyFindings ?? []).some(
      (finding) => finding.status === 'blocked' || finding.reachable === true
    )
  ) {
    blockers.push('security:reachable_high_dependency')
  }

  return {
    name: 'security',
    status: blockers.length === 0 ? 'PASS' : 'BLOCKED',
    evidenceDigest: digest(
      JSON.stringify({
        expectedFingerprints: expected.findings.map(({ fingerprint }) => fingerprint),
        blockers,
      })
    ),
    blockers,
  }
}
