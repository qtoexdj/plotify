import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const workspaceRoot = resolve(packageDir, '..', '..')

export function runSupabase(arguments_, options = {}) {
  const result = spawnSync(process.env.SUPABASE_BIN || 'supabase', arguments_, {
    cwd: packageDir,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  })
  if (result.error) throw new Error(`Unable to start Supabase CLI: ${result.error.message}`)
  if (result.status !== 0) {
    throw new Error(`Supabase CLI failed (${result.status}): ${result.stderr || result.stdout}`)
  }
  return result.stdout
}

export function catalogSnapshot(target) {
  const python = join(workspaceRoot, 'apps', 'api', '.venv', 'bin', 'python')
  const script = join(packageDir, 'scripts', 'catalog_snapshot.py')
  const result = spawnSync(python, [script, '--target', target], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.error) throw new Error(`Unable to start catalog inventory: ${result.error.message}`)
  if (result.status !== 0) throw new Error(`Catalog inventory failed: ${result.stderr}`)
  return result.stdout
}

export function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

export function isMain(importMetaUrl) {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(importMetaUrl)
}
