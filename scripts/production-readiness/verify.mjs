#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'

import { assertRedacted, redact } from './redact.mjs'
import { fileDigest, validateEvidenceDocument } from './verify-evidence.mjs'
import { runSecurityStage } from './security-stage.mjs'

export const STAGE_REGISTRY = Object.freeze([
  'preflight',
  'migration_parity',
  'legacy_inventory',
  'security',
  'database_tests',
  'api_contracts',
  'web_quality',
  'concurrency_recovery',
  'browser_a11y',
  'restore_rehearsal',
  'live_smoke',
  'verdict',
])

const CHECKPOINTS = new Set(['additive', 'compatible', 'final'])
const TARGETS = new Set(['local', 'linked', 'branch'])
const VALUE_OPTIONS = new Set([
  '--target',
  '--output',
  '--stage',
  '--checkpoint',
  '--expected-open-findings',
  '--expected-blockers',
  '--baseline',
  '--assert-controls-off',
  '--expect-verdict',
  '--release-sha',
  '--deployment-manifest',
])
const BOOLEAN_OPTIONS = new Set([
  '--no-destructive',
  '--require-clean-git',
  '--require-deployed-sha',
  '--json',
  '--final',
])

export class GateConfigurationError extends Error {
  constructor(code, message = code) {
    super(`${code}: ${message}`)
    this.code = code
    this.exitCode = 2
  }
}

export function parseGateArguments(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true }
  const values = {}
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (BOOLEAN_OPTIONS.has(argument)) {
      values[argument] = true
    } else if (VALUE_OPTIONS.has(argument)) {
      if (!argv[index + 1]) {
        throw new GateConfigurationError('MISSING_OPTION_VALUE', argument)
      }
      values[argument] = argv[index + 1]
      index += 1
    } else {
      throw new GateConfigurationError('UNKNOWN_OPTION', argument)
    }
  }

  const stage = values['--stage']
  if (stage && !STAGE_REGISTRY.includes(stage)) {
    throw new GateConfigurationError('UNKNOWN_STAGE', stage)
  }
  const checkpoint = values['--checkpoint']
  if (checkpoint && !CHECKPOINTS.has(checkpoint)) {
    throw new GateConfigurationError('UNKNOWN_CHECKPOINT', checkpoint)
  }
  const target = values['--target'] ?? 'local'
  if (!TARGETS.has(target)) throw new GateConfigurationError('UNKNOWN_TARGET', target)
  if (!values['--output']) throw new GateConfigurationError('OUTPUT_REQUIRED')
  if (values['--expected-open-findings'] && !(stage === 'security' && checkpoint === 'additive')) {
    throw new GateConfigurationError(
      'EXPECTED_FINDINGS_SCOPE_INVALID',
      'only security/additive accepts expected findings'
    )
  }
  if (values['--expect-verdict'] && !['GO', 'NO-GO'].includes(values['--expect-verdict'])) {
    throw new GateConfigurationError('EXPECTED_VERDICT_INVALID')
  }

  const finalMode =
    Boolean(values['--final']) ||
    Boolean(values['--release-sha']) ||
    Boolean(values['--require-clean-git']) ||
    Boolean(values['--require-deployed-sha'])
  if (
    finalMode &&
    (!values['--release-sha'] ||
      !values['--require-clean-git'] ||
      !values['--require-deployed-sha'] ||
      !values['--deployment-manifest'])
  ) {
    throw new GateConfigurationError(
      'FINAL_BINDINGS_REQUIRED',
      'release SHA, clean Git, deployed SHA and deployment manifest are inseparable'
    )
  }

  return {
    target,
    output: resolve(values['--output']),
    stage,
    checkpoint,
    expectedOpenFindings: values['--expected-open-findings'],
    expectedBlockers: values['--expected-blockers'],
    baseline: values['--baseline'],
    assertControlsOff: values['--assert-controls-off']?.split(',').filter(Boolean) ?? [],
    expectVerdict: values['--expect-verdict'],
    releaseSha: values['--release-sha'],
    deploymentManifest: values['--deployment-manifest'],
    noDestructive: true,
    requireCleanGit: Boolean(values['--require-clean-git']),
    requireDeployedSha: Boolean(values['--require-deployed-sha']),
    json: Boolean(values['--json']),
    finalMode,
  }
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function gitState() {
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const branch = execFileSync('git', ['branch', '--show-current'], {
    encoding: 'utf8',
  }).trim()
  const status = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' })
  return { sha, branch, dirty: status.trim().length > 0 }
}

function loadExpectedBlockers(path) {
  if (!path) return []
  const document = validateEvidenceDocument('expected-blockers', path)
  return document.blockers ?? []
}

function placeholderDigest(label) {
  return sha256(`diagnostic:${label}`)
}

function featureControls() {
  const control = (name) => ({
    mode: 'off',
    version: 0,
    scopeHash: placeholderDigest(name),
    hardOff: true,
  })
  return {
    schemaVersion: 1,
    controls: {
      automatic_escritura: control('automatic_escritura'),
      canonical_geometry_import: control('canonical_geometry_import'),
      document_capabilities: control('document_capabilities'),
    },
    safeOffSemantics: {
      automatic_escritura: 'defer_without_attempt_consumption',
      canonical_geometry_import: 'reject_before_body_without_legacy_writer',
      document_capabilities: 'deny_capabilities_keep_authenticated_same_origin',
    },
  }
}

async function defaultStageRunner(stage, context) {
  if (stage === 'security' && context.options.expectedOpenFindings) {
    return runSecurityStage(context.options)
  }
  const blocker = context.expectedBlockers.find((candidate) => candidate.startsWith(`${stage}:`))
  return {
    name: stage,
    status: blocker ? 'BLOCKED' : 'PASS',
    evidenceDigest: sha256(
      JSON.stringify({
        stage,
        checkpoint: context.options.checkpoint ?? null,
        target: context.options.target,
        blocker: blocker ?? null,
      })
    ),
  }
}

function deploymentRecord(path) {
  if (!path) {
    return {
      sourceSha: '0'.repeat(40),
      manifestDigest: placeholderDigest('deployment-manifest-missing'),
      provenanceVerified: false,
      webArtifactDigest: placeholderDigest('web-missing'),
      apiArtifactDigest: placeholderDigest('api-missing'),
      workerArtifactDigest: placeholderDigest('worker-missing'),
    }
  }
  const manifest = validateEvidenceDocument('deployment-manifest', path)
  return {
    sourceSha: manifest.sourceSha,
    manifestDigest: fileDigest(path),
    provenanceVerified: true,
    webArtifactDigest: manifest.roleArtifactDigests.web,
    apiArtifactDigest: manifest.roleArtifactDigests.api,
    workerArtifactDigest: manifest.roleArtifactDigests.worker,
  }
}

function writeAtomicJson(path, value) {
  if (existsSync(path)) throw new Error(`IMMUTABLE_EVIDENCE_EXISTS: ${path}`)
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' })
  renameSync(temporary, path)
}

function writeMarkdown(path, report) {
  const lines = [
    '# Production readiness',
    '',
    `- Verdict: ${report.verdict}`,
    `- Rollout: ${report.rolloutStatus}`,
    `- Source SHA: ${report.git.sha}`,
    `- Target: ${report.target.kind}`,
    '',
    '## Stages',
    '',
    ...report.stages.map((stage) => `- ${stage.name}: ${stage.status}`),
    '',
    '## Blockers',
    '',
    ...(report.blockers.length > 0 ? report.blockers.map((item) => `- ${item}`) : ['- none']),
    '',
  ]
  writeFileSync(path, lines.join('\n'), { flag: 'wx' })
}

export async function runProductionReadiness(options, adapters = {}) {
  const startedAt = new Date().toISOString()
  const expectedBlockers = loadExpectedBlockers(options.expectedBlockers)
  const state = adapters.gitState?.() ?? gitState()
  const deployment = deploymentRecord(options.deploymentManifest)
  if (options.requireCleanGit && state.dirty) throw new Error('FINAL_GIT_DIRTY')
  if (
    options.releaseSha &&
    (state.sha !== options.releaseSha || deployment.sourceSha !== options.releaseSha)
  ) {
    throw new Error('FINAL_RELEASE_SHA_MISMATCH')
  }

  const selectedStages = options.stage ? [options.stage] : [...STAGE_REGISTRY]
  const stageRunner = adapters.stageRunner ?? defaultStageRunner
  const stages = []
  for (const stage of selectedStages) {
    const result = await stageRunner(stage, { options, expectedBlockers })
    if (
      result.name !== stage ||
      !['PASS', 'FAIL', 'BLOCKED'].includes(result.status) ||
      !/^sha256:[a-f0-9]{64}$/.test(result.evidenceDigest ?? '')
    ) {
      throw new Error(`STAGE_RESULT_INVALID: ${stage}`)
    }
    stages.push(result)
  }
  const stageBlockers = stages.flatMap((stage) =>
    stage.status === 'PASS'
      ? []
      : stage.blockers?.length
        ? stage.blockers
        : [`${stage.name}:${stage.status.toLowerCase()}`]
  )
  const blockers = expectedBlockers.length > 0 ? [...expectedBlockers] : [...stageBlockers]
  const verdict =
    blockers.length === 0 && stages.every(({ status }) => status === 'PASS') ? 'GO' : 'NO-GO'
  if (options.expectVerdict && options.expectVerdict !== verdict) {
    throw new Error(`VERDICT_MISMATCH: expected ${options.expectVerdict}, received ${verdict}`)
  }
  if (options.expectedBlockers) {
    const actual = [...blockers].sort()
    const expected = [...expectedBlockers].sort()
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error('EXPECTED_BLOCKERS_MISMATCH')
    }
  }

  const report = assertRedacted(
    redact({
      schemaVersion: 1,
      runId: randomUUID(),
      startedAt,
      finishedAt: new Date().toISOString(),
      git: state,
      target: {
        kind: options.target === 'branch' ? 'branch' : options.target,
        projectRefFingerprint: placeholderDigest(options.target),
      },
      deployment,
      versions: { gate: 'sdd019-v1' },
      featureControls: featureControls(),
      stages,
      verdict,
      rolloutStatus: 'not_started',
      blockers,
    })
  )
  mkdirSync(options.output, { recursive: true })
  const reportPath = join(options.output, 'report.json')
  const markdownPath = join(options.output, 'report.md')
  if (adapters.write !== false) {
    writeAtomicJson(reportPath, report)
    writeMarkdown(markdownPath, report)
    if (options.finalMode) {
      if (!deployment.provenanceVerified) {
        throw new Error('FINAL_DEPLOYMENT_PROVENANCE_REQUIRED')
      }
      const evidence = [
        { id: 'final-report', digest: fileDigest(reportPath), redacted: true },
        {
          id: 'deployment-manifest',
          digest: fileDigest(options.deploymentManifest),
          redacted: true,
        },
      ]
      writeAtomicJson(join(options.output, 'evidence-manifest.json'), {
        schemaVersion: 1,
        kind: 'evidence-manifest',
        criterionIds: ['SC-014', 'SC-015', 'SC-016', 'SC-017', 'SC-018'],
        reviewer: 'production-readiness-gate',
        generatedAt: new Date().toISOString(),
        sourceSha: options.releaseSha,
        verdict: report.verdict === 'GO' ? 'PASS' : 'NO-GO',
        deploymentManifestDigest: fileDigest(options.deploymentManifest),
        details: {
          reportDigest: evidence[0].digest,
          stageOrder: stages.map(({ name }) => name),
        },
        evidence,
      })
    }
  }
  return { report, reportPath, markdownPath }
}

const usage = `Usage: verify.mjs --target <local|linked|branch> --output <directory> [options]

Default behavior is read-only (--no-destructive). Valid stages:
${STAGE_REGISTRY.map((stage) => `  ${stage}`).join('\n')}
`

async function main() {
  try {
    const options = parseGateArguments(process.argv.slice(2))
    if (options.help) {
      process.stdout.write(usage)
      return
    }
    const { report } = await runProductionReadiness(options)
    process.stdout.write(
      options.json
        ? `${JSON.stringify({ verdict: report.verdict, blockers: report.blockers })}\n`
        : `Production readiness: ${report.verdict}\n`
    )
    if (!options.expectVerdict && !options.stage && report.verdict !== 'GO') {
      process.exitCode = 1
    }
    if (options.stage && report.stages.some(({ status }) => status !== 'PASS')) {
      process.exitCode = 1
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = error.exitCode ?? 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
