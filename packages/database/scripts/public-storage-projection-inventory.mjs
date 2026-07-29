#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { extname, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const workspaceRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)))
const SOURCE_ROOTS = ['apps/web/src', 'apps/api', 'packages/contracts']
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.py', '.json'])
const SIGNED_AUTHORITY =
  /\b(create_signed_url|createSignedUrl|signedURL|signedUrl|download_url)\b|https?:\/\/[^\s"']+(?:token|signature|sig)=/i
const RAW_COORDINATE =
  /\b(storage_bucket|storage_path|object_path|storageBucket|storagePath|objectPath)\b/
const PUBLIC_BOUNDARY =
  /(apps\/web\/src\/(components|lib)\/|apps\/api\/schemas\/|packages\/contracts\/openapi\/)/

function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function walk(path) {
  const entries = readdirSync(path, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const child = resolve(path, entry.name)
    if (
      entry.name === '__pycache__' ||
      entry.name === '.venv' ||
      entry.name === 'venv' ||
      entry.name === 'node_modules' ||
      entry.name === 'tests' ||
      entry.name.endsWith('.test.ts') ||
      entry.name.endsWith('.test.tsx')
    ) {
      return []
    }
    return entry.isDirectory() ? walk(child) : [child]
  })
}

export function inspectPublicStorageProjection({ files, allowlist = [], browserEvidence }) {
  const allowed = new Set(
    allowlist.map((entry) => (typeof entry === 'string' ? entry : entry.path))
  )
  const findings = []
  for (const file of files) {
    if (allowed.has(file.path)) continue
    const signed = SIGNED_AUTHORITY.test(file.source)
    SIGNED_AUTHORITY.lastIndex = 0
    const rawPublicCoordinate = PUBLIC_BOUNDARY.test(file.path) && RAW_COORDINATE.test(file.source)
    RAW_COORDINATE.lastIndex = 0
    if (!signed && !rawPublicCoordinate) continue
    findings.push({
      path: file.path,
      code: signed ? 'SIGNED_STORAGE_AUTHORITY_PROJECTED' : 'RAW_STORAGE_COORDINATE_PROJECTED',
      fingerprint: digest(`${file.path}:${signed ? 'signed' : 'raw'}`),
    })
  }
  if (browserEvidence) {
    const serialized = JSON.stringify(browserEvidence)
    if (SIGNED_AUTHORITY.test(serialized) || RAW_COORDINATE.test(serialized)) {
      findings.push({
        path: 'browser-network',
        code: 'BROWSER_STORAGE_AUTHORITY_PROJECTED',
        fingerprint: digest('browser-network:storage-authority'),
      })
    }
  }
  return { clean: findings.length === 0, findings }
}

function option(argv, name) {
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] : undefined
}

function main() {
  const argv = process.argv.slice(2)
  if (argv.includes('--help')) {
    process.stdout.write(
      'Usage: public-storage-projection-inventory.mjs --target linked --allowlist <json> --assert-clean\n'
    )
    return
  }
  if (option(argv, '--target') !== 'linked') {
    process.stderr.write('LINKED_TARGET_CONFIRMATION_REQUIRED\n')
    process.exitCode = 2
    return
  }
  const allowlistPath = option(argv, '--allowlist')
  if (!allowlistPath) {
    process.stderr.write('INTERNAL_ADAPTER_ALLOWLIST_REQUIRED\n')
    process.exitCode = 2
    return
  }
  const allowlist = JSON.parse(readFileSync(resolve(workspaceRoot, allowlistPath), 'utf8')).adapters
  const files = SOURCE_ROOTS.flatMap((root) =>
    walk(resolve(workspaceRoot, root))
      .filter((path) => EXTENSIONS.has(extname(path)))
      .map((path) => ({
        path: relative(workspaceRoot, path),
        source: readFileSync(path, 'utf8'),
      }))
  )
  const browserEvidencePath = option(argv, '--browser-evidence')
  const browserEvidence = browserEvidencePath
    ? JSON.parse(readFileSync(resolve(workspaceRoot, browserEvidencePath), 'utf8'))
    : undefined
  const result = inspectPublicStorageProjection({ files, allowlist, browserEvidence })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  if (argv.includes('--assert-clean') && !result.clean) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
