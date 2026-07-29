#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

const evidenceKinds = [
  'a11y-manual',
  'geometry-load',
  'story-gate',
  'source-manifest',
  'backup',
  'migration-repair-approval',
  'migration-repair',
  'migration-push-approval',
  'migration-push',
  'restore-approval',
  'restore-qualification',
  'restore',
  'capability-cutover-plan',
  'capability-cutover-approval',
  'capability-cutover',
  'legacy-preflight',
  'final-target-approval',
  'final-target-preflight',
  'browser-network',
  'live-state-change-approval',
  'browser-run',
  'rollout-approval',
  'human-gates',
  'expected-blockers',
  'security-a11y',
  'speckit-analyze',
  'release-receipt',
  'rollout-receipt',
  'auth-hardening-approval',
  'auth-hardening',
  'evidence-manifest',
]
const specializedKinds = ['deployment-manifest', 'final-verdict', 'evidence-archive']
export const supportedKinds = Object.freeze([...evidenceKinds, ...specializedKinds])

const usage = `Usage: node scripts/production-readiness/verify-evidence.mjs --kind <kind> <evidence>

Validate a production-readiness evidence document and its declared relations.

Options:
  --kind <kind>                Evidence kind
  --source-manifest <file>     Require source-manifest digest binding
  --preflight <file>           Require preflight digest binding
  --deployment-manifest <file> Require deployment-manifest digest binding
  --report <file>              Require report digest binding
  --evidence-manifest <file>   Require evidence-manifest digest binding
  --require-12-stages          Require the canonical stage set
  --require-rollout-not-started Require rolloutStatus=not_started
  -h, --help                   Show this help
`

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

export function fileDigest(path) {
  return sha256(readFileSync(path))
}

function loadJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`EVIDENCE_SCHEMA_INVALID: unable to read JSON ${path}: ${error.message}`)
  }
}

function schema(name) {
  return loadJson(new URL(`./${name}`, import.meta.url))
}

function compile(schemaDocument, referencedSchemas = []) {
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  addFormats(ajv)
  for (const referenced of referencedSchemas) ajv.addSchema(referenced)
  return { ajv, validate: ajv.compile(schemaDocument) }
}

function validateWithSchema(document, schemaDocument, referencedSchemas = []) {
  const { ajv, validate } = compile(schemaDocument, referencedSchemas)
  if (!validate(document)) {
    throw new Error(
      `EVIDENCE_SCHEMA_INVALID: ${ajv.errorsText(validate.errors, { separator: '; ' })}`
    )
  }
}

function assertDigestBinding(document, field, path) {
  if (!path) return
  const expected = fileDigest(path)
  if (document[field] !== expected) {
    throw new Error(
      `EVIDENCE_RELATION_MISMATCH: ${field} expected ${expected}, received ${document[field] ?? 'missing'}`
    )
  }
}

function validateDeploymentManifest(document) {
  validateWithSchema(document, schema('deployment-manifest.schema.json'))
  const rosterIds = new Set()
  const activeRoles = new Set()
  for (const instance of document.expectedRoster) {
    const identity = `${instance.runtimeRole}:${instance.slotId}:${instance.instanceId}`
    if (rosterIds.has(identity)) throw new Error(`DEPLOYMENT_ROSTER_DUPLICATE: ${identity}`)
    rosterIds.add(identity)
    if (instance.lifecycle === 'active') activeRoles.add(instance.runtimeRole)
    if (instance.artifactDigest !== document.roleArtifactDigests[instance.runtimeRole]) {
      throw new Error(`DEPLOYMENT_ARTIFACT_DIGEST_MISMATCH: ${identity}`)
    }
  }
  for (const role of ['web', 'api', 'worker']) {
    if (!activeRoles.has(role)) throw new Error(`DEPLOYMENT_ROSTER_ROLE_MISSING: ${role}`)
  }
  const authoritative = {
    schemaVersion: document.schemaVersion,
    deploymentId: document.deploymentId,
    environmentFingerprint: document.environmentFingerprint,
    sourceSha: document.sourceSha,
    expectedRoster: document.expectedRoster,
    roleArtifactDigests: document.roleArtifactDigests,
    buildOperationId: document.buildOperationId,
    deployOperationId: document.deployOperationId,
    issuedAt: document.issuedAt,
  }
  const statementDigest = sha256(JSON.stringify(authoritative))
  if (document.provenance.statementDigest !== statementDigest) {
    throw new Error('DEPLOYMENT_PROVENANCE_DIGEST_MISMATCH')
  }
  return document
}

function validateFinalVerdict(document, options) {
  validateWithSchema(document, schema('report.schema.json'), [
    schema('feature-controls.schema.json'),
  ])
  if (options.require12Stages) {
    const actual = document.stages.map(({ name }) => name)
    const expected = [
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
    ]
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error('FINAL_VERDICT_STAGE_ORDER_INVALID')
    }
  }
  if (options.requireRolloutNotStarted && document.rolloutStatus !== 'not_started') {
    throw new Error('FINAL_VERDICT_ROLLOUT_ALREADY_STARTED')
  }
  if (options.deploymentManifest) {
    const deploymentManifest = validateDeploymentManifest(loadJson(options.deploymentManifest))
    if (
      document.deployment.sourceSha !== deploymentManifest.sourceSha ||
      document.deployment.manifestDigest !== fileDigest(options.deploymentManifest)
    ) {
      throw new Error('FINAL_VERDICT_DEPLOYMENT_MISMATCH')
    }
  }
  return document
}

function receiptField(markdown, name) {
  const match = markdown.match(new RegExp(`^[-*]?\\s*${name}\\s*:\\s*\`?([^\\s\`]+)\`?\\s*$`, 'im'))
  return match?.[1]
}

function validateReleaseReceipt(evidencePath, options, rollout = false) {
  let markdown
  try {
    markdown = readFileSync(evidencePath, 'utf8')
  } catch (error) {
    throw new Error(`EVIDENCE_SCHEMA_INVALID: unable to read receipt: ${error.message}`)
  }
  if (!options.report) throw new Error('RECEIPT_REPORT_REQUIRED')
  const report = loadJson(options.report)
  const releaseSha = report.git?.sha
  if (!releaseSha || receiptField(markdown, 'releaseSha') !== releaseSha) {
    throw new Error('RECEIPT_RELEASE_SHA_MISMATCH')
  }
  if (receiptField(markdown, 'reportDigest') !== fileDigest(options.report)) {
    throw new Error('RECEIPT_REPORT_DIGEST_MISMATCH')
  }
  if (options.archiveReceipt) {
    const archive = loadJson(options.archiveReceipt)
    validateWithSchema(archive, schema('evidence-archive.schema.json'))
    if (archive.releaseSha !== releaseSha || archive.reportDigest !== fileDigest(options.report)) {
      throw new Error('RECEIPT_ARCHIVE_MISMATCH')
    }
  }
  const handoff = rollout ? options.rolloutReceiptSha : options.handoffSha
  if (handoff) {
    const workspaceRoot = resolve(new URL('../..', import.meta.url).pathname)
    const resolvedHandoff = execFileSync('git', ['rev-parse', handoff], {
      cwd: workspaceRoot,
      encoding: 'utf8',
    }).trim()
    const parent = execFileSync('git', ['rev-parse', `${resolvedHandoff}^`], {
      cwd: workspaceRoot,
      encoding: 'utf8',
    }).trim()
    if (parent !== releaseSha && !rollout) throw new Error('RECEIPT_NOT_DIRECT_RELEASE_CHILD')
    const changed = execFileSync('git', ['diff', '--name-only', parent, resolvedHandoff], {
      cwd: workspaceRoot,
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .filter(Boolean)
    const receiptRelative = relative(workspaceRoot, resolve(evidencePath))
    const allowed = new Set([receiptRelative, 'specs/019-hardening-produccion/tasks.md'])
    if (changed.some((path) => !allowed.has(path)) || !changed.includes(receiptRelative)) {
      throw new Error('RECEIPT_DIFF_NOT_DOCS_ONLY')
    }
    const taskDiff = execFileSync(
      'git',
      [
        'diff',
        '--unified=0',
        parent,
        resolvedHandoff,
        '--',
        'specs/019-hardening-produccion/tasks.md',
      ],
      { cwd: workspaceRoot, encoding: 'utf8' }
    )
    const expectedTask = rollout ? 'T121' : 'T120'
    const changedTaskLines = taskDiff
      .split('\n')
      .filter((line) => /^[+-]- \[[ x]\] T\d{3}\b/.test(line))
    if (
      changedTaskLines.length !== 2 ||
      changedTaskLines.some((line) => !line.includes(expectedTask))
    ) {
      throw new Error('RECEIPT_TASK_CHECKBOX_DIFF_INVALID')
    }
    const status = execFileSync('git', ['status', '--porcelain'], {
      cwd: workspaceRoot,
      encoding: 'utf8',
    }).trim()
    if (status) throw new Error('RECEIPT_HANDOFF_NOT_CLEAN')
  }
  return { releaseSha, markdown }
}

function validateAuthHardening(document, approval) {
  const details = document.details ?? {}
  const digest = /^sha256:[a-f0-9]{64}$/
  const common =
    document.targetFingerprint &&
    document.sourceManifestDigest &&
    details.operation === 'auth-hardening'
  if (!common) throw new Error('AUTH_HARDENING_EVIDENCE_INVALID')
  if (approval) {
    if (
      typeof details.actor !== 'string' ||
      !details.actor.trim() ||
      typeof details.reason !== 'string' ||
      !details.reason.trim() ||
      details.expectedSetting !== 'password_hibp_enabled' ||
      details.expectedBefore !== false ||
      details.expectedAfter !== true
    ) {
      throw new Error('AUTH_HARDENING_EVIDENCE_INVALID')
    }
  } else if (
    details.setting !== 'password_hibp_enabled' ||
    details.enabled !== true ||
    details.redacted !== true ||
    !digest.test(details.beforeFingerprint ?? '') ||
    !digest.test(details.afterFingerprint ?? '')
  ) {
    throw new Error('AUTH_HARDENING_EVIDENCE_INVALID')
  }
}

export function validateEvidenceDocument(kind, evidencePath, options = {}) {
  if (!supportedKinds.includes(kind)) {
    throw new Error(`EVIDENCE_SCHEMA_INVALID: unsupported evidence kind: ${kind}`)
  }

  if (kind === 'release-receipt') return validateReleaseReceipt(evidencePath, options)
  if (kind === 'rollout-receipt') return validateReleaseReceipt(evidencePath, options, true)
  const document = loadJson(evidencePath)
  if (kind === 'deployment-manifest') return validateDeploymentManifest(document)
  if (kind === 'final-verdict') return validateFinalVerdict(document, options)
  if (kind === 'evidence-archive') {
    validateWithSchema(document, schema('evidence-archive.schema.json'))
    return document
  }

  validateWithSchema(document, schema('evidence.schema.json'))
  if (document.kind !== kind) {
    throw new Error(
      `EVIDENCE_SCHEMA_INVALID: kind mismatch: expected ${kind}, received ${document.kind}`
    )
  }
  if (kind === 'auth-hardening-approval') validateAuthHardening(document, true)
  if (kind === 'auth-hardening') validateAuthHardening(document, false)
  assertDigestBinding(document, 'sourceManifestDigest', options.sourceManifest)
  assertDigestBinding(document, 'preflightDigest', options.preflight)
  assertDigestBinding(document, 'deploymentManifestDigest', options.deploymentManifest)
  return document
}

function parseArguments(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true }
  const booleanOptions = new Set([
    '--require-12-stages',
    '--require-rollout-not-started',
    '--require-release-sha-bindings',
    '--require-direct-docs-only-child',
    '--allow-t120-checkbox-only',
    '--allow-t121-checkbox-only',
    '--require-clean-handoff',
    '--require-readback',
  ])
  const valueOptions = new Set([
    '--kind',
    '--source-manifest',
    '--preflight',
    '--deployment-manifest',
    '--evidence-manifest',
    '--report',
    '--archive-receipt',
    '--handoff-sha',
    '--rollout-receipt-sha',
    '--min-retention-days',
  ])
  const values = {}
  const positional = []
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (booleanOptions.has(argument)) {
      values[argument] = true
    } else if (valueOptions.has(argument)) {
      if (!argv[index + 1]) return { error: `Missing value for ${argument}.` }
      values[argument] = argv[index + 1]
      index += 1
    } else if (argument.startsWith('-')) {
      return { error: `Unknown option: ${argument}.` }
    } else {
      positional.push(argument)
    }
  }
  if (!values['--kind']) return { error: 'Missing required --kind option.' }
  if (positional.length !== 1) return { error: 'Provide exactly one evidence file.' }
  return {
    kind: values['--kind'],
    evidencePath: positional[0],
    sourceManifest: values['--source-manifest'],
    preflight: values['--preflight'],
    deploymentManifest: values['--deployment-manifest'],
    evidenceManifest: values['--evidence-manifest'],
    report: values['--report'],
    archiveReceipt: values['--archive-receipt'],
    handoffSha: values['--handoff-sha'],
    rolloutReceiptSha: values['--rollout-receipt-sha'],
    require12Stages: Boolean(values['--require-12-stages']),
    requireRolloutNotStarted: Boolean(values['--require-rollout-not-started']),
  }
}

function main() {
  const options = parseArguments(process.argv.slice(2))
  if (options.help) {
    process.stdout.write(usage)
    return
  }
  if (options.error) {
    process.stderr.write(`${options.error}\n\n${usage}`)
    process.exitCode = 2
    return
  }
  try {
    validateEvidenceDocument(options.kind, options.evidencePath, options)
    process.stdout.write(`Evidence valid: ${options.kind}\n`)
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = error.message.startsWith('EVIDENCE_SCHEMA_INVALID: unsupported') ? 2 : 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
