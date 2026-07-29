#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const workspaceRoot = resolve(scriptDirectory, '../../..')
const python = resolve(workspaceRoot, 'apps/api/.venv/bin/python')
const inspector = resolve(workspaceRoot, 'apps/api/scripts/verify_production_readiness.py')

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function finding(code, count, blocking = true) {
  return {
    code,
    count,
    blocking: count > 0 && blocking,
    fingerprint: sha256(`${code}:${count}`),
  }
}

export function inspectProductionData(snapshot) {
  if (snapshot.findings) {
    return {
      targetFingerprint: snapshot.targetFingerprint,
      findings: snapshot.findings,
      zeroConstraintBlockers: !snapshot.findings.some(
        (item) => item.blocking && item.constraintBlocker !== false
      ),
    }
  }
  const duplicateBy = (rows, key) => {
    const counts = new Map()
    for (const row of rows ?? []) counts.set(row[key], (counts.get(row[key]) ?? 0) + 1)
    return [...counts.values()].filter((count) => count > 1).length
  }
  const findings = [
    finding('DUPLICATE_GEOMETRY', duplicateBy(snapshot.geometries, 'projectId')),
    finding('DUPLICATE_GENERATION', duplicateBy(snapshot.generations, 'caseId')),
    finding('DUPLICATE_DELIVERY', duplicateBy(snapshot.deliveries, 'recipient')),
    finding(
      'PLAINTEXT_CAPABILITY',
      (snapshot.deliveries ?? []).filter((row) => row.linkToken || row.recipient).length
    ),
    finding(
      'FALSE_SIGNED_STAGE',
      (snapshot.lotStages ?? []).filter(
        (row) => row.stage === 'escritura_firmada' && !row.signatureEventId
      ).length
    ),
  ]
  return {
    targetFingerprint: snapshot.targetFingerprint ?? sha256('fixture-target'),
    findings,
    zeroConstraintBlockers: !findings.some((item) => item.blocking),
  }
}

export function buildCapabilityCutoverPlan(result, sourceSha = '0'.repeat(40)) {
  const blockingFindings = result.findings.filter(({ blocking }) => blocking)
  return {
    schemaVersion: 1,
    kind: 'capability-cutover-plan',
    criterionIds: ['FR-041', 'SC-014'],
    reviewer: 'production-data-preflight',
    generatedAt: new Date().toISOString(),
    sourceSha,
    verdict: blockingFindings.length === 0 ? 'PASS' : 'NO-GO',
    targetFingerprint: result.targetFingerprint,
    blockers: blockingFindings.map(({ code }) => code),
    details: {
      mode: 'authenticated_same_origin_replacement_only',
      createsHashCapabilityBeforeGo: false,
      deleteStatements: [],
      ambiguousRecipientsBlock: true,
      inactiveRecipientsBlock: true,
    },
    evidence: result.findings.map((item) => ({
      id: item.code,
      digest: item.fingerprint,
      redacted: true,
    })),
  }
}

function option(argv, name) {
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] : undefined
}

function writeJson(path, value) {
  mkdirSync(dirname(resolve(path)), { recursive: true })
  writeFileSync(resolve(path), `${JSON.stringify(value, null, 2)}\n`, { flag: 'w' })
}

function main() {
  const argv = process.argv.slice(2)
  if (argv.includes('--help')) {
    process.stdout.write(
      'Usage: production-data-preflight.mjs --target linked --dry-run [--output <json>] [--capability-plan <json>]\n'
    )
    return
  }
  if (option(argv, '--target') !== 'linked' || !argv.includes('--dry-run')) {
    process.stderr.write('READ_ONLY_LINKED_TARGET_REQUIRED\n')
    process.exitCode = 2
    return
  }
  const raw = execFileSync(python, [inspector, '--target', 'linked', '--json'], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  })
  const result = inspectProductionData(JSON.parse(raw))
  const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: workspaceRoot,
    encoding: 'utf8',
  }).trim()
  const plan = buildCapabilityCutoverPlan(result, sourceSha)
  const output = option(argv, '--output')
  const capabilityPlan = option(argv, '--capability-plan')
  if (output) {
    writeJson(output, {
      ...plan,
      kind: 'legacy-preflight',
      details: { ...plan.details, zeroConstraintBlockers: result.zeroConstraintBlockers },
    })
  }
  if (capabilityPlan) writeJson(capabilityPlan, plan)
  process.stdout.write(
    `${JSON.stringify({
      targetFingerprint: result.targetFingerprint,
      findingCount: result.findings.length,
      blockerCount: plan.blockers.length,
      zeroConstraintBlockers: result.zeroConstraintBlockers,
    })}\n`
  )
  if (argv.includes('--assert-zero-constraint-blockers') && !result.zeroConstraintBlockers) {
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
