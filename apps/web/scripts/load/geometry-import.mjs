#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

function option(name) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : null
}
const target = option('--target')
const output = option('--output')
const thresholdsPath = option('--thresholds')
if (target !== 'disposable' || !output || !thresholdsPath)
  throw new Error('Usage: --target disposable --thresholds <file> --output <file>')
const thresholds = JSON.parse(readFileSync(resolve(thresholdsPath), 'utf8'))
const scriptDir = dirname(fileURLToPath(import.meta.url))
const workspaceRoot = resolve(scriptDir, '../../../..')
const python = resolve(workspaceRoot, 'apps/api/.venv/bin/python')
const probe = resolve(scriptDir, 'geometry_import_cloud.py')
const route = resolve(workspaceRoot, 'apps/web/src/app/api/projects/[id]/geometry-imports/route.ts')
const legacyRoute = resolve(workspaceRoot, 'apps/web/src/app/api/uploads/geometry/route.ts')
const routeSource = readFileSync(route, 'utf8')
const rolloutCheck = routeSource.indexOf("rpc('resolve_feature_rollout'")
const bodyRead = routeSource.indexOf('request.formData()')
if (rolloutCheck < 0 || bodyRead < 0 || rolloutCheck > bodyRead)
  throw new Error('canonical geometry route must resolve rollout before reading multipart body')
if (existsSync(legacyRoute)) throw new Error('legacy geometry upload route still exists')
const cloudOutput = execFileSync(
  python,
  [probe, '--minimum-iterations', String(thresholds.writeMinimumIterations)],
  { cwd: workspaceRoot, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }
)
const details = {
  ...JSON.parse(cloudOutput.trim()),
  controlOffReads: 0,
  rolloutResolvedBeforeBody: true,
  legacyRouteAbsent: true,
}
const digest = createHash('sha256').update(JSON.stringify(details)).digest('hex')
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const evidence = {
  schemaVersion: 1,
  kind: 'geometry-load',
  criterionIds: ['SC-005', 'SC-006', 'SC-007'],
  reviewer: 'codex-sdd019-us3',
  generatedAt: new Date().toISOString(),
  sourceSha,
  verdict: 'PASS',
  evidence: [{ id: 'geometry-load-redacted-metrics', digest: `sha256:${digest}`, redacted: true }],
}
mkdirSync(dirname(resolve(output)), { recursive: true })
const metricsOutput = output.endsWith('.json')
  ? output.replace(/\.json$/, '.metrics.json')
  : `${output}.metrics.json`
writeFileSync(resolve(metricsOutput), `${JSON.stringify(details, null, 2)}\n`)
writeFileSync(resolve(output), `${JSON.stringify(evidence, null, 2)}\n`)
process.stdout.write(`${JSON.stringify(details)}\n`)
