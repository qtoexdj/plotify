import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const verifier = fileURLToPath(new URL('./expect-red.mjs', import.meta.url))

function runVerifier(...arguments_) {
  return spawnSync(process.execPath, [verifier, ...arguments_], {
    encoding: 'utf8',
  })
}

function failingCommand(output) {
  return [
    process.execPath,
    ['-e', `process.stderr.write(${JSON.stringify(output)}); process.exit(1)`],
  ]
}

test('accepts a named functional assertion failure', () => {
  const [command, arguments_] = failingCommand(
    'AssertionError: SDD019_FOUNDATION_NOT_IMPLEMENTED\n'
  )

  const result = runVerifier(
    '--expect',
    'SDD019_FOUNDATION_NOT_IMPLEMENTED',
    '--',
    command,
    ...arguments_
  )

  assert.equal(result.status, 0, result.stderr)
})

test('does not confuse Vitest import timing with an import failure', () => {
  const [command, arguments_] = failingCommand(
    'AssertionError: WEB_SECURITY_FOUNDATION_NOT_IMPLEMENTED\nDuration 660ms (transform 213ms, setup 146ms, import 152ms, tests 52ms)\n'
  )

  const result = runVerifier(
    '--expect',
    'WEB_SECURITY_FOUNDATION_NOT_IMPLEMENTED',
    '--',
    command,
    ...arguments_
  )

  assert.equal(result.status, 0, result.stderr)
})

test('rejects a command that passes', () => {
  const result = runVerifier('--expect', 'EXPECTED_MARKER', '--', process.execPath, '-e', '')

  assert.equal(result.status, 1)
  assert.match(result.stderr, /command passed/)
})

test('rejects a missing functional marker', () => {
  const [command, arguments_] = failingCommand('AssertionError: ANOTHER_FAILURE\n')
  const result = runVerifier('--expect', 'EXPECTED_MARKER', '--', command, ...arguments_)

  assert.equal(result.status, 1)
  assert.match(result.stderr, /was absent/)
})

test('rejects setup and import failures even when they contain the marker', () => {
  const [command, arguments_] = failingCommand(
    'Error [ERR_MODULE_NOT_FOUND]: EXPECTED_MARKER\nAssertionError: EXPECTED_MARKER\n'
  )
  const result = runVerifier('--expect', 'EXPECTED_MARKER', '--', command, ...arguments_)

  assert.equal(result.status, 1)
  assert.match(result.stderr, /setup, import, or test collection/)
})

test('rejects commands that cannot be spawned', () => {
  const result = runVerifier('--expect', 'EXPECTED_MARKER', '--', 'definitely-not-a-command')

  assert.equal(result.status, 1)
  assert.match(result.stderr, /could not start command/)
})

test('rejects malformed verifier arguments', () => {
  const result = runVerifier('--expect', 'EXPECTED_MARKER')

  assert.equal(result.status, 2)
  assert.match(result.stderr, /Usage:/)
})
