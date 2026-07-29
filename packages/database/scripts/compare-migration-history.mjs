#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SDD019_MIN_VERSION = '20260713000100'
const MIGRATION_PATTERN = /^(\d{14})_(.+)\.sql$/
const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const databaseRoot = resolve(scriptDirectory, '..')
const migrationsRoot = resolve(databaseRoot, 'supabase/migrations')

function digest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

export function readLocalMigrationHistory(root = migrationsRoot) {
  return readdirSync(root)
    .map((filename) => {
      const match = filename.match(MIGRATION_PATTERN)
      if (!match) return null
      return {
        version: match[1],
        name: match[2],
        filename,
        digest: digest(readFileSync(resolve(root, filename))),
      }
    })
    .filter(Boolean)
    .sort((left, right) => left.version.localeCompare(right.version))
}

export function parseRemoteMigrationList(output) {
  const rows = []
  for (const line of output.split(/\r?\n/)) {
    const columns = line.split('|').map((item) => item.trim())
    if (columns.length < 2) continue
    const remoteVersion = columns[1]
    if (!/^\d{14}$/.test(remoteVersion)) continue
    rows.push({ version: remoteVersion })
  }
  return rows.sort((left, right) => left.version.localeCompare(right.version))
}

export function inspectLinkedMigrationHistory(adapter = execFileSync) {
  const output = adapter(
    'pnpm',
    ['--filter', '@plotify/database', 'exec', 'supabase', 'migration', 'list', '--linked'],
    { cwd: resolve(databaseRoot, '../..'), encoding: 'utf8' }
  )
  return parseRemoteMigrationList(output)
}

function keyed(rows) {
  const result = new Map()
  for (const row of rows) {
    if (!row?.version || result.has(row.version)) {
      throw new Error(`MIGRATION_HISTORY_INVALID: duplicate/missing version ${row?.version ?? ''}`)
    }
    result.set(row.version, row)
  }
  return result
}

export function compareMigrationHistory({
  local,
  remote,
  assertFinalTargetFresh = false,
  localSchemaFingerprint,
  remoteSchemaFingerprint,
  localGrantFingerprint,
  remoteGrantFingerprint,
}) {
  const localByVersion = keyed(local)
  const remoteByVersion = keyed(remote)
  const localSdd019 = local.filter(({ version }) => version >= SDD019_MIN_VERSION)
  const remoteSdd019 = remote.filter(({ version }) => version >= SDD019_MIN_VERSION)

  if (assertFinalTargetFresh) {
    const conflicts = remoteSdd019.map(({ version }) => version)
    if (conflicts.length > 0) {
      return {
        ok: false,
        status: 'conflicting_final_target',
        conflicts,
        missing: [],
        extra: [],
        proposal:
          'STOP: provision or approve a separate migration/restore plan; never repair or push this target automatically.',
      }
    }
    return {
      ok: true,
      status: 'fresh_final_target',
      conflicts: [],
      missing: localSdd019.map(({ version }) => version),
      extra: [],
      proposal: 'Target is fresh; a separately approved guarded push may be proposed.',
    }
  }

  const missing = local
    .filter(({ version }) => !remoteByVersion.has(version))
    .map(({ version }) => version)
  const extra = remote
    .filter(({ version }) => !localByVersion.has(version))
    .map(({ version }) => version)
  const conflicts = local
    .filter(({ version, digest: localDigest }) => {
      const remoteRow = remoteByVersion.get(version)
      return remoteRow?.digest && localDigest && remoteRow.digest !== localDigest
    })
    .map(({ version }) => version)

  const fingerprintMismatches = []
  if (
    localSchemaFingerprint &&
    remoteSchemaFingerprint &&
    localSchemaFingerprint !== remoteSchemaFingerprint
  ) {
    fingerprintMismatches.push('schema')
  }
  if (
    localGrantFingerprint &&
    remoteGrantFingerprint &&
    localGrantFingerprint !== remoteGrantFingerprint
  ) {
    fingerprintMismatches.push('grants')
  }
  const ok =
    missing.length === 0 &&
    extra.length === 0 &&
    conflicts.length === 0 &&
    fingerprintMismatches.length === 0
  return {
    ok,
    status: ok ? 'exact_parity' : 'drift',
    missing,
    extra,
    conflicts,
    fingerprintMismatches,
    proposal: ok
      ? 'No action required.'
      : 'STOP: review an operator-approved repair/restore proposal; this command performs no mutation.',
  }
}

function option(argv, name) {
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] : undefined
}

function main() {
  const argv = process.argv.slice(2)
  if (argv.includes('--help')) {
    process.stdout.write(
      'Usage: compare-migration-history.mjs --target linked [--assert-final-target-fresh]\n'
    )
    return
  }
  const target = option(argv, '--target')
  if (target !== 'linked') {
    process.stderr.write(
      'TARGET_CONFIRMATION_REQUIRED: only explicit --target linked is supported\n'
    )
    process.exitCode = 2
    return
  }
  const local = readLocalMigrationHistory()
  const remote = inspectLinkedMigrationHistory()
  const result = compareMigrationHistory({
    local,
    remote,
    assertFinalTargetFresh: argv.includes('--assert-final-target-fresh'),
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  if (!result.ok) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
