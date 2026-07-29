import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const verifier = fileURLToPath(new URL('./verify-evidence.mjs', import.meta.url))

function run(...arguments_) {
  return spawnSync(process.execPath, [verifier, ...arguments_], { encoding: 'utf8' })
}

function evidence(kind) {
  return {
    schemaVersion: 1,
    kind,
    criterionIds: ['SC-012'],
    reviewer: 'automation',
    generatedAt: '2026-07-15T12:00:00.000Z',
    sourceSha: 'a'.repeat(40),
    verdict: 'PASS',
    evidence: [{ id: 'fixture', digest: `sha256:${'b'.repeat(64)}`, redacted: true }],
  }
}

test('prints help without reading evidence', () => {
  const result = run('--help')
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /--kind/)
})

test('accepts every pre-T103 evidence kind', (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'plotify-evidence-'))
  context.after(() => rmSync(directory, { recursive: true, force: true }))

  for (const kind of ['a11y-manual', 'geometry-load', 'story-gate']) {
    const path = join(directory, `${kind}.json`)
    writeFileSync(path, JSON.stringify(evidence(kind)))
    const result = run('--kind', kind, path)
    assert.equal(result.status, 0, `${kind}: ${result.stderr}`)
  }
})

test('rejects an unknown kind and malformed evidence', (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'plotify-evidence-'))
  context.after(() => rmSync(directory, { recursive: true, force: true }))
  const path = join(directory, 'bad.json')
  writeFileSync(path, JSON.stringify({ ...evidence('story-gate'), secret: 'must-not-pass' }))

  assert.equal(run('--kind', 'unknown', path).status, 2)
  const malformed = run('--kind', 'story-gate', path)
  assert.equal(malformed.status, 1)
  assert.match(malformed.stderr, /additional properties/i)
})

test('production readiness artifacts are ignored', () => {
  const ignore = fileURLToPath(new URL('../../.gitignore', import.meta.url))
  const result = spawnSync('rg', ['-q', '^/artifacts/production-readiness/', ignore])
  assert.equal(result.status, 0)
})
