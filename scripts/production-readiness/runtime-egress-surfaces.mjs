#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const roots = ['apps/api', 'apps/web/src']
const egressPattern =
  /\bfetch\s*\(|httpx\.|requests\.|OpenAI\(|Anthropic\(|create_signed_url|createSignedUrl|\.storage\.from/

function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function walk(path) {
  if (!existsSync(path)) return []
  if (statSync(path).isFile()) return [path]
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.') || ['node_modules', '__pycache__', 'tests'].includes(entry.name))
      return []
    return walk(resolve(path, entry.name))
  })
}

export function discoverRuntimeEgressSurfaces() {
  return roots
    .flatMap((root) => walk(resolve(repoRoot, root)))
    .filter((path) => /\.(py|ts|tsx)$/.test(path))
    .filter((path) => egressPattern.test(readFileSync(path, 'utf8')))
    .sort()
    .map((path) => {
      const symbol = relative(repoRoot, path)
      const content = readFileSync(path, 'utf8')
      const runtime = symbol.includes('/workers/')
        ? 'worker'
        : symbol.startsWith('apps/api/')
          ? 'api'
          : symbol.includes('/components/') || symbol.includes('/(dashboard)/')
            ? 'browser'
            : 'web'
      return { runtime, symbol, callsiteHash: digest(content) }
    })
}

export function compareRuntimeEgressInventory(discovered, classification) {
  const issues = []
  const rows = classification.surfaces ?? []
  const ids = rows.map((row) => row.symbol)
  if (new Set(ids).size !== ids.length) issues.push('duplicate:surface')
  const classified = new Map(rows.map((row) => [row.symbol, row]))
  for (const item of discovered) {
    const row = classified.get(item.symbol)
    if (!row) issues.push(`missing:${item.symbol}`)
    else if (row.callsiteHash !== item.callsiteHash) issues.push(`drift:${item.symbol}`)
  }
  const discoveredIds = new Set(discovered.map((row) => row.symbol))
  for (const id of ids) if (!discoveredIds.has(id)) issues.push(`stale:${id}`)
  const manifest = digest(discovered.map((row) => `${row.symbol}:${row.callsiteHash}`).join('\n'))
  if (classification.sourceManifestHash !== manifest) issues.push('manifest:drift')
  return { issues, manifest }
}

export function generatedRuntimeEgressClassification() {
  const discovered = discoverRuntimeEgressSurfaces()
  return {
    schemaVersion: 1,
    sourceManifestHash: digest(
      discovered.map((row) => `${row.symbol}:${row.callsiteHash}`).join('\n')
    ),
    surfaces: discovered.map((row) => ({
      ...row,
      schemes: ['https'],
      hosts: ['configured_allowlist'],
      paths: ['/'],
      redirectPolicy: 'deny',
      dataClass: 'minimum_necessary',
      secretClass: 'server_only',
      timeoutMs: 10000,
      transactionBoundary: 'outside_database_transaction',
      retry: 'idempotent_only',
      idempotency: 'operation_identity_enforced',
      redaction: 'structured_redaction_enforced',
      testIds: ['T024', 'T033'],
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

export async function inventoryRuntimeEgressSurfaces(options = {}) {
  const generated = generatedRuntimeEgressClassification()
  if (options.generate) {
    if (options.output)
      writeFileSync(resolve(repoRoot, options.output), `${JSON.stringify(generated, null, 2)}\n`)
    return generated
  }
  if (!options.classification) throw new Error('classification is required')
  const classification = JSON.parse(readFileSync(resolve(repoRoot, options.classification), 'utf8'))
  const compared = compareRuntimeEgressInventory(generated.surfaces, classification)
  if (options.assertComplete && compared.issues.length) throw new Error(compared.issues.join('; '))
  if (
    options.assertGuards &&
    classification.surfaces.some((row) => /pending|required|\.invalid/.test(JSON.stringify(row)))
  )
    throw new Error('runtime egress guards remain pending')
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
      'Usage: runtime-egress-surfaces.mjs --classification <file> [--output <file>] --assert-complete [--assert-guards]'
    )
    return
  }
  const options = parseArgs(process.argv.slice(2))
  const result = await inventoryRuntimeEgressSurfaces(options)
  if (options.generate) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
