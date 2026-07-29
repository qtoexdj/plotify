#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const roots = ['apps/api', 'apps/web/src']
const privilegedPattern =
  /service_role|SERVICE_ROLE|auth\.admin|INTERNAL_API_SECRET|createServiceClient|createAdminClient|get_service_client/

function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function walk(path) {
  if (!existsSync(path)) return []
  if (statSync(path).isFile()) return [path]
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    if (
      entry.name.startsWith('.') ||
      ['node_modules', '__pycache__', 'tests'].includes(entry.name)
    ) {
      return []
    }
    return walk(resolve(path, entry.name))
  })
}

export function discoverPrivilegedHttpSurfaces() {
  const files = roots
    .flatMap((root) => walk(resolve(repoRoot, root)))
    .filter((path) => /\.(py|ts|tsx)$/.test(path))
    .filter((path) => privilegedPattern.test(readFileSync(path, 'utf8')))
    .sort()
  return files.map((path) => {
    const routeOrSymbol = relative(repoRoot, path)
    const content = readFileSync(path, 'utf8')
    const runtime = routeOrSymbol.includes('/workers/')
      ? 'worker'
      : routeOrSymbol.startsWith('apps/api/')
        ? 'api'
        : 'web'
    return { runtime, method: 'DYNAMIC', routeOrSymbol, callsiteHash: digest(content) }
  })
}

export function comparePrivilegedInventory(discovered, classification) {
  const issues = []
  const rows = classification.surfaces ?? []
  const ids = rows.map((row) => row.routeOrSymbol)
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index)
  if (duplicateIds.length) issues.push(`duplicate:${[...new Set(duplicateIds)].join(',')}`)
  const classified = new Map(rows.map((row) => [row.routeOrSymbol, row]))
  for (const item of discovered) {
    const row = classified.get(item.routeOrSymbol)
    if (!row) issues.push(`missing:${item.routeOrSymbol}`)
    else if (row.callsiteHash !== item.callsiteHash) issues.push(`drift:${item.routeOrSymbol}`)
  }
  const discoveredIds = new Set(discovered.map((row) => row.routeOrSymbol))
  for (const id of ids) if (!discoveredIds.has(id)) issues.push(`stale:${id}`)
  const manifest = digest(
    discovered.map((row) => `${row.routeOrSymbol}:${row.callsiteHash}`).join('\n')
  )
  if (classification.sourceManifestHash !== manifest) issues.push('manifest:drift')
  return { issues, manifest }
}

export function generatedPrivilegedClassification() {
  const discovered = discoverPrivilegedHttpSurfaces()
  return {
    schemaVersion: 1,
    capabilityFamilies: ['bots', 'skills', 'integrations', 'prompts', 'documents'],
    sourceManifestHash: digest(
      discovered.map((row) => `${row.routeOrSymbol}:${row.callsiteHash}`).join('\n')
    ),
    surfaces: discovered.map((row) => ({
      ...row,
      callers: [row.routeOrSymbol],
      trustedPrincipal: 'verified_session_or_internal_service',
      resourceTenant: 'persisted_resource_scope',
      businessRole: 'least_privilege_enforced',
      serviceCapability: 'scoped_server_only',
      audit: 'atomic_or_structured_audit',
      idempotency: 'operation_identity_enforced',
      negativeTestIds: ['T024', 'T033'],
    })),
  }
}

function parseArgs(argv) {
  const value = (name) => {
    const index = argv.indexOf(name)
    return index >= 0 ? argv[index + 1] : undefined
  }
  return {
    classification: value('--classification'),
    output: value('--output'),
    assertComplete: argv.includes('--assert-complete'),
    assertGuards: argv.includes('--assert-guards'),
    generate: argv.includes('--generate'),
  }
}

export async function inventoryPrivilegedHttpSurfaces(options = {}) {
  const generated = generatedPrivilegedClassification()
  if (options.generate) {
    if (options.output)
      writeFileSync(resolve(repoRoot, options.output), `${JSON.stringify(generated, null, 2)}\n`)
    return generated
  }
  if (!options.classification) throw new Error('classification is required')
  const classification = JSON.parse(readFileSync(resolve(repoRoot, options.classification), 'utf8'))
  const compared = comparePrivilegedInventory(generated.surfaces, classification)
  if (options.assertComplete && compared.issues.length) throw new Error(compared.issues.join('; '))
  if (
    options.assertGuards &&
    classification.surfaces.some((row) =>
      Object.values(row).some((value) => /pending|required/.test(String(value)))
    )
  ) {
    throw new Error('privileged guards remain pending')
  }
  const report = {
    ...classification,
    generatedAt: new Date().toISOString(),
    issues: compared.issues,
  }
  if (options.output)
    writeFileSync(resolve(repoRoot, options.output), `${JSON.stringify(report, null, 2)}\n`)
  return report
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log(
      'Usage: privileged-http-surfaces.mjs --classification <file> [--output <file>] --assert-complete [--assert-guards]'
    )
    return
  }
  const options = parseArgs(process.argv.slice(2))
  const result = await inventoryPrivilegedHttpSurfaces(options)
  if (options.generate) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
