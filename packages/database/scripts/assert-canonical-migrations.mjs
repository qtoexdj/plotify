import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const workspaceRoot = resolve(packageDir, '..', '..')
const canonicalDir = join(packageDir, 'supabase', 'migrations')

const expectedBaselineFiles = [
  '20260414000100_baseline_local_validated.sql',
  '20260414000200_fix_security_definer_search_path.sql',
  '20260414000300_add_missing_fk_indexes.sql',
]

const legacyMigrationDirs = [
  join(workspaceRoot, 'apps', 'web', 'supabase', 'migrations'),
  join(workspaceRoot, 'apps', 'api', 'supabase', 'migrations'),
]

function fail(message) {
  console.error(`Migration source check failed: ${message}`)
  process.exitCode = 1
}

function listSqlFiles(dir) {
  if (!existsSync(dir)) return []

  return readdirSync(dir)
    .filter((entry) => entry.endsWith('.sql'))
    .sort()
}

if (!existsSync(canonicalDir) || !statSync(canonicalDir).isDirectory()) {
  fail(`canonical migrations directory is missing: ${relative(workspaceRoot, canonicalDir)}`)
} else {
  const canonicalSqlFiles = listSqlFiles(canonicalDir)

  for (const expectedFile of expectedBaselineFiles) {
    if (!canonicalSqlFiles.includes(expectedFile)) {
      fail(`expected baseline migration is missing: ${relative(workspaceRoot, join(canonicalDir, expectedFile))}`)
    }
  }

  for (const migrationFile of canonicalSqlFiles) {
    if (!/^\d{14}_[a-z0-9_]+\.sql$/.test(migrationFile)) {
      fail(`canonical migration does not follow timestamp_name.sql format: ${migrationFile}`)
    }
  }
}

for (const legacyDir of legacyMigrationDirs) {
  const legacySqlFiles = listSqlFiles(legacyDir)

  if (legacySqlFiles.length > 0) {
    fail(
      `legacy migration directory must stay empty or absent: ${relative(workspaceRoot, legacyDir)} contains ${legacySqlFiles.join(', ')}`,
    )
  }
}

if (!process.exitCode) {
  console.log('Canonical Supabase migration source is valid.')
  console.log(`Use only ${relative(workspaceRoot, canonicalDir)} for new migrations.`)
}
