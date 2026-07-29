#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

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

export function discoverStructuredLogSinks() {
  return ['apps/api', 'apps/web/src']
    .flatMap((root) => walk(resolve(repoRoot, root)))
    .filter((path) => /\.(py|ts|tsx)$/.test(path))
    .filter((path) =>
      /logger\.(debug|info|warn|warning|error|fatal)|get_logger\(/.test(readFileSync(path, 'utf8'))
    )
    .sort()
    .map((path) => ({
      symbol: relative(repoRoot, path),
      callsiteHash: digest(readFileSync(path, 'utf8')),
    }))
}

export function compareStructuredLogInventory(discovered, policy) {
  const issues = []
  const rows = policy.policies ?? []
  const ids = rows.map((row) => row.symbol)
  if (new Set(ids).size !== ids.length) issues.push('duplicate:symbol')
  const classified = new Set(ids)
  for (const row of discovered)
    if (!classified.has(row.symbol)) issues.push(`missing:${row.symbol}`)
  const found = new Set(discovered.map((row) => row.symbol))
  for (const id of ids) if (!found.has(id)) issues.push(`stale:${id}`)
  return issues
}

export function generatedStructuredLogPolicy() {
  return {
    schemaVersion: 1,
    policies: discoverStructuredLogSinks().map((row) => ({
      logger: row.symbol.startsWith('apps/api/') ? 'python-structured' : 'web-structured',
      sink: 'runtime',
      symbol: row.symbol,
      allowedFields: ['event', 'resource_id', 'organization_hash'],
      prohibitedFields: [
        'pii',
        'secret',
        'request_body',
        'response_body',
        'stack',
        'document_text',
        'signed_url',
      ],
      redactionRule: `deny-by-default:${row.callsiteHash}`,
      minimumSeverity: 'info',
      retentionDays: 30,
      captureTestIds: ['T024', 'T033'],
    })),
  }
}

function parseArgs(argv) {
  const index = argv.indexOf('--policy')
  const outputIndex = argv.indexOf('--output')
  return {
    policy: index >= 0 ? argv[index + 1] : undefined,
    assertClean: argv.includes('--assert-clean'),
    generate: argv.includes('--generate'),
    output: outputIndex >= 0 ? argv[outputIndex + 1] : undefined,
  }
}

export async function inventoryStructuredLogs(options = {}) {
  if (options.generate) {
    const generated = generatedStructuredLogPolicy()
    if (options.output)
      writeFileSync(resolve(repoRoot, options.output), `${JSON.stringify(generated, null, 2)}\n`)
    return generated
  }
  if (!options.policy) throw new Error('policy is required')
  const policy = JSON.parse(readFileSync(resolve(repoRoot, options.policy), 'utf8'))
  const issues = compareStructuredLogInventory(discoverStructuredLogSinks(), policy)
  if (options.assertClean && issues.length) throw new Error(issues.join('; '))
  return { policy, issues }
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log('Usage: structured-log-inventory.mjs --policy <file> --assert-clean')
    return
  }
  const options = parseArgs(process.argv.slice(2))
  const result = await inventoryStructuredLogs(options)
  if (options.generate) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
