#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(import.meta.dirname, '../..')
const CONFIG = join(ROOT, '.gitleaks.toml')
const ALLOWLIST = join(ROOT, 'scripts/production-readiness/security-allowlist.json')
const TOOL_VERSIONS = join(ROOT, 'scripts/production-readiness/tool-versions.json')
const DEFAULT_ROTATIONS = 'specs/019-hardening-produccion/evidence/secret-rotations.json'
const DEFAULT_DEPENDENCY_POLICY = 'scripts/production-readiness/dependency-security-policy.json'
const API_REQUIREMENTS = join(ROOT, 'apps/api/requirements.txt')
const PIP_AUDIT = join(ROOT, 'apps/api/.venv/bin/pip-audit')

function securityError(code, detail = '') {
  const error = new Error(detail ? `${code}: ${detail}` : code)
  error.code = code
  return error
}

function fail(error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`security-scan: ${message}`)
  process.exitCode = 1
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw securityError('SECURITY_SCAN_INPUT_INVALID', `${label} at ${path}: ${error.message}`)
  }
}

export function parseSecurityScanArgs(argv) {
  const options = {
    target: null,
    noRemote: false,
    output: null,
    rotationEvidence: DEFAULT_ROTATIONS,
    dependencyPolicy: DEFAULT_DEPENDENCY_POLICY,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--') continue
    if (argument === '--target') options.target = argv[++index]
    else if (argument === '--no-remote') options.noRemote = true
    else if (argument === '--output') options.output = argv[++index]
    else if (argument === '--rotation-evidence') options.rotationEvidence = argv[++index]
    else if (argument === '--dependency-policy') options.dependencyPolicy = argv[++index]
    else throw securityError('SECURITY_SCAN_ARGUMENT_UNKNOWN', argument)
  }
  if (options.target !== 'local') throw securityError('SECURITY_SCAN_LOCAL_ONLY')
  if (!options.noRemote) throw securityError('SECURITY_SCAN_NO_REMOTE_REQUIRED')
  if (!options.output) throw securityError('SECURITY_SCAN_OUTPUT_REQUIRED')
  return options
}

function parseLegacyArgs(argv) {
  const options = {
    scope: null,
    output: null,
    rotationEvidence: null,
    assertClean: false,
    assertResolved: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--') continue
    if (argument === '--scope') options.scope = argv[++index]
    else if (argument === '--output') options.output = argv[++index]
    else if (argument === '--require-rotation-evidence') options.rotationEvidence = argv[++index]
    else if (argument === '--assert-clean') options.assertClean = true
    else if (argument === '--assert-resolved') options.assertResolved = true
    else throw securityError('SECURITY_SCAN_ARGUMENT_UNKNOWN', argument)
  }
  if (!['current', 'history'].includes(options.scope))
    throw securityError('SECURITY_SCAN_SCOPE_INVALID')
  if (options.scope === 'current' && !options.assertClean)
    throw securityError('SECURITY_SCAN_CURRENT_ASSERT_REQUIRED')
  if (options.scope === 'history' && (!options.assertResolved || !options.rotationEvidence))
    throw securityError('SECURITY_SCAN_HISTORY_EVIDENCE_REQUIRED')
  return options
}

export function normalizeGitleaksFinding(finding, classification) {
  return {
    fingerprint: finding.Fingerprint,
    ruleId: finding.RuleID,
    file: finding.File,
    startLine: finding.StartLine,
    commit: finding.Commit || null,
    classification,
    redacted: true,
  }
}

export function validateRuntimeToolVersion(name, expected, versionText) {
  const actual = String(versionText).match(/\d+\.\d+\.\d+/)?.[0]
  if (actual !== expected) {
    throw securityError(
      'SECURITY_TOOL_VERSION_MISMATCH',
      `${name} expected ${expected}, received ${actual ?? 'unknown'}`
    )
  }
}

function exceptionIsCurrent(exception, finding, now) {
  return (
    exception?.id === finding.id &&
    exception?.package === finding.package &&
    typeof exception.owner === 'string' &&
    exception.owner.length > 0 &&
    typeof exception.evidence === 'string' &&
    exception.evidence.length > 0 &&
    Number.isFinite(Date.parse(exception.expiresAt)) &&
    Date.parse(exception.expiresAt) > now.getTime()
  )
}

export function classifyDependencyFindings(findings, policy, now = new Date()) {
  return findings.map((finding) => {
    const severity = String(finding.severity ?? 'unknown').toLowerCase()
    const policyRelevant =
      finding.runtime === true || ['critical', 'high', 'unknown'].includes(severity)
    if (!policyRelevant) return { ...finding, status: 'non_blocking' }
    const exception = (policy.exceptions ?? []).find((candidate) =>
      exceptionIsCurrent(candidate, finding, now)
    )
    return {
      ...finding,
      status: exception && finding.runtime === false ? 'accepted' : 'blocked',
    }
  })
}

function resolveExecutable(candidate) {
  if (!candidate) return null
  if (candidate.includes('/')) return existsSync(candidate) ? candidate : null
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    const path = join(directory, candidate)
    if (existsSync(path)) return path
  }
  return null
}

function sha256File(path) {
  return `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`
}

function commandResult(binary, arguments_, options = {}) {
  const result = spawnSync(binary, arguments_, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 30 * 1024 * 1024,
    ...options,
  })
  if (result.error) throw securityError('SECURITY_TOOL_EXECUTION_FAILED', result.error.message)
  return result
}

function requirePinnedTool(name, candidate, manifest) {
  const binary = resolveExecutable(candidate)
  if (!binary) throw securityError('SECURITY_TOOL_UNAVAILABLE', name)
  const pin = manifest.tools?.[name]
  if (!pin?.version) throw securityError('SECURITY_TOOL_PIN_MISSING', name)
  const version = commandResult(binary, ['--version'])
  if (version.status !== 0)
    throw securityError('SECURITY_TOOL_VERSION_FAILED', `${name} exit ${version.status}`)
  validateRuntimeToolVersion(name, pin.version, `${version.stdout}${version.stderr}`)
  const platformKey = `${process.platform}-${process.arch}`
  const expectedChecksum = pin.platformChecksums?.[platformKey]
  if (!expectedChecksum)
    throw securityError('SECURITY_TOOL_CHECKSUM_MISSING', `${name} ${platformKey}`)
  const actualChecksum = sha256File(binary)
  if (actualChecksum !== expectedChecksum)
    throw securityError(
      'SECURITY_TOOL_CHECKSUM_MISMATCH',
      `${name} expected ${expectedChecksum}, received ${actualChecksum}`
    )
  return { binary, version: pin.version, checksum: actualChecksum }
}

function scanGitleaks(scope, tool, rotationEvidence) {
  const temporary = mkdtempSync(join(tmpdir(), 'plotify-gitleaks-'))
  const rawReport = join(temporary, 'report.json')
  try {
    const mode = scope === 'current' ? 'dir' : 'git'
    const result = commandResult(tool.binary, [
      mode,
      '.',
      '--config',
      CONFIG,
      '--report-format',
      'json',
      '--report-path',
      rawReport,
      '--redact',
      '--no-banner',
      '--exit-code',
      '0',
    ])
    if (result.status !== 0)
      throw securityError('GITLEAKS_SCAN_FAILED', `${mode} exit ${result.status}`)
    const findings = existsSync(rawReport) ? readJson(rawReport, 'Gitleaks report') : []
    if (scope === 'current') {
      return {
        scope,
        findings: findings.map((finding) => normalizeGitleaksFinding(finding, 'unresolved')),
        verdict: findings.length === 0 ? 'clean' : 'blocked',
      }
    }

    const allowlist = readJson(ALLOWLIST, 'security allowlist')
    const rotations = readJson(resolve(ROOT, rotationEvidence), 'rotation evidence')
    const falsePositives = new Map(
      (allowlist.entries ?? []).map((entry) => [entry.fingerprint, entry])
    )
    const resolved = new Map((rotations.rotations ?? []).map((entry) => [entry.fingerprint, entry]))
    const classified = findings.map((finding) => {
      const falsePositive = falsePositives.get(finding.Fingerprint)
      const rotation = resolved.get(finding.Fingerprint)
      if (
        falsePositive?.classification === 'false_positive' &&
        falsePositive.proof &&
        Date.parse(falsePositive.expiresAt) > Date.now()
      ) {
        return normalizeGitleaksFinding(finding, 'false_positive')
      }
      if (rotation?.status === 'resolved' && rotation.evidence && rotation.rotatedAt) {
        return normalizeGitleaksFinding(finding, 'resolved')
      }
      return normalizeGitleaksFinding(finding, 'unresolved')
    })
    return {
      scope,
      findings: classified,
      verdict: classified.some(({ classification }) => classification === 'unresolved')
        ? 'blocked'
        : 'resolved',
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}

function pnpmFindings(document) {
  if (document.advisories) {
    return Object.values(document.advisories).map((advisory) => ({
      source: 'pnpm',
      id: String(advisory.github_advisory_id ?? advisory.id),
      package: advisory.module_name,
      severity: advisory.severity,
      runtime: advisory.dev !== true,
      redacted: true,
    }))
  }
  return Object.entries(document.vulnerabilities ?? {}).flatMap(([packageName, vulnerability]) =>
    (vulnerability.via ?? [])
      .filter((item) => typeof item === 'object')
      .map((item) => ({
        source: 'pnpm',
        id: String(item.url ?? item.source ?? item.name),
        package: packageName,
        severity: item.severity ?? vulnerability.severity,
        runtime: vulnerability.isDirect === true || vulnerability.effects?.length > 0,
        redacted: true,
      }))
  )
}

function pipAuditFindings(document) {
  const dependencies = Array.isArray(document) ? document : (document.dependencies ?? [])
  return dependencies.flatMap((dependency) =>
    (dependency.vulns ?? []).map((vulnerability) => ({
      source: 'pip-audit',
      id: vulnerability.id,
      package: dependency.name,
      severity: 'unknown',
      runtime: true,
      fixVersions: vulnerability.fix_versions ?? [],
      redacted: true,
    }))
  )
}

function auditDependencies(policy) {
  const pnpm = commandResult('pnpm', ['audit', '--prod', '--json'])
  if (![0, 1].includes(pnpm.status)) throw securityError('PNPM_AUDIT_FAILED', `exit ${pnpm.status}`)
  const pnpmDocument = JSON.parse(pnpm.stdout || '{}')

  const pip = commandResult(PIP_AUDIT, [
    '--no-deps',
    '--strict',
    '--format',
    'json',
    '--requirement',
    API_REQUIREMENTS,
  ])
  if (![0, 1].includes(pip.status)) throw securityError('PIP_AUDIT_FAILED', `exit ${pip.status}`)
  const pipDocument = JSON.parse(pip.stdout || '[]')
  const findings = classifyDependencyFindings(
    [...pnpmFindings(pnpmDocument), ...pipAuditFindings(pipDocument)],
    policy
  )
  return {
    findings,
    verdict: findings.some(({ status }) => status === 'blocked') ? 'blocked' : 'clean',
  }
}

function atomicWriteJson(path, document) {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`)
  writeFileSync(temporary, `${JSON.stringify(document, null, 2)}\n`, { mode: 0o600 })
  renameSync(temporary, path)
}

export function runLocalSecurityScan(options) {
  const toolManifest = readJson(TOOL_VERSIONS, 'tool versions')
  const gitleaks = requirePinnedTool(
    'gitleaks',
    process.env.GITLEAKS_BIN ??
      (existsSync('/private/tmp/plotify-security-tools/gitleaks')
        ? '/private/tmp/plotify-security-tools/gitleaks'
        : 'gitleaks'),
    toolManifest
  )
  requirePinnedTool('pip-audit', PIP_AUDIT, toolManifest)
  const current = scanGitleaks('current', gitleaks, options.rotationEvidence)
  const history = scanGitleaks('history', gitleaks, options.rotationEvidence)
  const dependencies = auditDependencies(
    readJson(resolve(ROOT, options.dependencyPolicy), 'dependency security policy')
  )
  const blockers = [
    ...(current.verdict === 'clean' ? [] : ['security:current_tree_secret']),
    ...(history.verdict === 'resolved' ? [] : ['security:unresolved_history_secret']),
    ...(dependencies.verdict === 'clean' ? [] : ['security:dependency_vulnerability']),
  ]
  const report = {
    schemaVersion: 1,
    target: 'local',
    remoteProjectAccess: false,
    generatedAt: new Date().toISOString(),
    redacted: true,
    tools: {
      gitleaks: { version: gitleaks.version, checksum: gitleaks.checksum },
      'pip-audit': {
        version: toolManifest.tools['pip-audit'].version,
        checksum:
          toolManifest.tools['pip-audit'].platformChecksums[`${process.platform}-${process.arch}`],
      },
    },
    secrets: {
      current: {
        count: current.findings.length,
        verdict: current.verdict,
        findings: current.findings,
      },
      history: {
        count: history.findings.length,
        verdict: history.verdict,
        findings: history.findings,
      },
    },
    dependencies,
    blockers,
    verdict: blockers.length === 0 ? 'PASS' : 'BLOCKED',
  }
  const output = resolve(options.output)
  atomicWriteJson(join(output, 'report.json'), report)
  return report
}

function runLegacySecurityScan(options) {
  const manifest = readJson(TOOL_VERSIONS, 'tool versions')
  const gitleaks = requirePinnedTool(
    'gitleaks',
    process.env.GITLEAKS_BIN ??
      (existsSync('/private/tmp/plotify-security-tools/gitleaks')
        ? '/private/tmp/plotify-security-tools/gitleaks'
        : 'gitleaks'),
    manifest
  )
  const result = scanGitleaks(
    options.scope,
    gitleaks,
    options.rotationEvidence ?? DEFAULT_ROTATIONS
  )
  if (options.output) atomicWriteJson(resolve(ROOT, options.output), result)
  if (
    (options.scope === 'current' && result.verdict !== 'clean') ||
    (options.scope === 'history' && result.verdict !== 'resolved')
  ) {
    throw securityError('GITLEAKS_FINDINGS_UNRESOLVED')
  }
  return result
}

async function main() {
  const argv = process.argv.slice(2)
  const report = argv.includes('--scope')
    ? runLegacySecurityScan(parseLegacyArgs(argv))
    : runLocalSecurityScan(parseSecurityScanArgs(argv))
  console.log(
    JSON.stringify({
      verdict: report.verdict,
      redacted: true,
      report: argv.includes('--scope')
        ? null
        : resolve(parseSecurityScanArgs(argv).output, 'report.json'),
    })
  )
  if (report.verdict === 'BLOCKED') process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(fail)
}
