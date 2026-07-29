#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { atomicWriteJson, parseOptions, sha256 } from './operator-io.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const usage = `Usage: pnpm release:preflight -- --source-manifest <file>
       pnpm release:preflight -- --verify-source-manifest <file>

Generates or verifies a deterministic manifest for runtime, build, configuration,
migration and generated inputs. The manifest records dirty state and hashes every
changed source file; documentation and evidence outputs are excluded.
`

function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
}

function isReleaseInput(path) {
  if (
    !path ||
    path.startsWith('.git/') ||
    path.includes('/node_modules/') ||
    path.includes('/.next/') ||
    path.startsWith('artifacts/') ||
    path.startsWith('docs/') ||
    path.startsWith('plotify_memori/') ||
    path.startsWith('specs/') ||
    path.startsWith('.codegraph/')
  ) {
    return false
  }
  return (
    path.startsWith('apps/') ||
    path.startsWith('packages/') ||
    path.startsWith('scripts/') ||
    path.startsWith('.github/') ||
    path === 'package.json' ||
    path === 'pnpm-lock.yaml' ||
    path === 'pnpm-workspace.yaml' ||
    path === 'turbo.json' ||
    path.startsWith('tsconfig')
  )
}

function releaseFiles() {
  const listed = git('ls-files', '--cached', '--others', '--exclude-standard', '-z')
    .split('\0')
    .filter(isReleaseInput)
    .filter((path) => existsSync(resolve(ROOT, path)))
    .sort()
  return listed.map((path) => ({
    path,
    digest: sha256(readFileSync(resolve(ROOT, path))),
  }))
}

function currentState() {
  const sourceSha = git('rev-parse', 'HEAD')
  const status = git('status', '--porcelain=v1', '--untracked-files=all')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const path = line.slice(3).split(' -> ').at(-1)
      return { code: line.slice(0, 2), path }
    })
    .filter(({ path }) => isReleaseInput(path))
    .sort(
      (left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code)
    )
  const files = releaseFiles()
  return { sourceSha, status, files }
}

export function buildSourceManifest(now = new Date()) {
  const state = currentState()
  const contentDigest = sha256(
    JSON.stringify({
      sourceSha: state.sourceSha,
      status: state.status,
      files: state.files,
    })
  )
  return {
    schemaVersion: 1,
    kind: 'source-manifest',
    criterionIds: ['SC-014'],
    reviewer: 'release-preflight',
    generatedAt: now.toISOString(),
    sourceSha: state.sourceSha,
    verdict: 'PASS',
    details: {
      scope: 'runtime-build-config-migrations-generated',
      dirty: state.status.length > 0,
      status: state.status,
      files: state.files,
      fileCount: state.files.length,
    },
    evidence: [{ id: 'source-tree', digest: contentDigest, redacted: true }],
  }
}

export function verifySourceManifest(path) {
  const expected = JSON.parse(readFileSync(resolve(path), 'utf8'))
  const current = buildSourceManifest(new Date(expected.generatedAt))
  if (
    expected.sourceSha !== current.sourceSha ||
    JSON.stringify(expected.details) !== JSON.stringify(current.details) ||
    expected.evidence?.[0]?.digest !== current.evidence[0].digest
  ) {
    throw new Error('SOURCE_MANIFEST_MISMATCH')
  }
  return expected
}

function main() {
  try {
    const options = parseOptions(process.argv.slice(2), {
      values: ['--source-manifest', '--verify-source-manifest'],
    })
    if (options.help) {
      process.stdout.write(usage)
      return
    }
    const output = options['--source-manifest']
    const verify = options['--verify-source-manifest']
    if ((output ? 1 : 0) + (verify ? 1 : 0) !== 1) {
      throw new Error('SOURCE_MANIFEST_MODE_REQUIRED')
    }
    const document = verify ? verifySourceManifest(verify) : buildSourceManifest()
    if (output) atomicWriteJson(output, document)
    process.stdout.write(
      `${JSON.stringify({
        verdict: document.verdict,
        dirty: document.details.dirty,
        files: document.details.fileCount,
      })}\n`
    )
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
