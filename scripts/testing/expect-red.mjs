#!/usr/bin/env node

import { spawnSync } from 'node:child_process'

const SETUP_FAILURE_PATTERNS = [
  /\b(?:ERR_)?MODULE_NOT_FOUND\b/i,
  /cannot find module/i,
  /\bENOENT\b/i,
  /command not found/i,
  /\bimporterror\b/i,
  /failed to (?:load|resolve) (?:url|import)/i,
  /cannot import name/i,
  /does not provide an export named/i,
  /\bsyntaxerror\b/i,
  /no test files found/i,
  /collection(?:\s+errors?|\s+failed)/i,
  /test suite failed to run/i,
]

const ASSERTION_FAILURE_PATTERN =
  /\b(?:assertionerror|err_assertion|assert\.?(?:equal|deep(?:strict)?equal|ok|throws)|\d+\s+(?:failed|failing)|failed\s+tests?)\b/i

function usage() {
  return 'Usage: expect-red.mjs --expect <functional-marker> -- <command> [args...]'
}

function parseArguments(arguments_) {
  const separatorIndex = arguments_.indexOf('--')
  const expectIndex = arguments_.indexOf('--expect')

  if (
    expectIndex === -1 ||
    expectIndex + 1 >= arguments_.length ||
    separatorIndex === -1 ||
    separatorIndex <= expectIndex + 1 ||
    separatorIndex + 1 >= arguments_.length
  ) {
    return null
  }

  const expectedMarker = arguments_[expectIndex + 1]
  if (!expectedMarker || expectedMarker.startsWith('--')) {
    return null
  }

  return {
    expectedMarker,
    command: arguments_[separatorIndex + 1],
    commandArguments: arguments_.slice(separatorIndex + 2),
  }
}

function reportFailure(message, output) {
  process.stderr.write(`expect-red: ${message}\n`)
  if (output) {
    process.stderr.write(`${output}\n`)
  }
}

function main() {
  const parsed = parseArguments(process.argv.slice(2))
  if (!parsed) {
    process.stderr.write(`${usage()}\n`)
    return 2
  }

  const result = spawnSync(parsed.command, parsed.commandArguments, {
    encoding: 'utf8',
    shell: false,
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`

  if (result.error) {
    reportFailure(`could not start command: ${result.error.message}`, output)
    return 1
  }

  if (result.signal) {
    reportFailure(`command ended from signal ${result.signal}, not an assertion failure`, output)
    return 1
  }

  if (result.status === 0) {
    reportFailure('command passed; an expected RED failure is required', output)
    return 1
  }

  if (SETUP_FAILURE_PATTERNS.some((pattern) => pattern.test(output))) {
    reportFailure('command failed during setup, import, or test collection', output)
    return 1
  }

  if (!output.includes(parsed.expectedMarker)) {
    reportFailure(
      `expected functional marker ${JSON.stringify(parsed.expectedMarker)} was absent`,
      output
    )
    return 1
  }

  if (!ASSERTION_FAILURE_PATTERN.test(output)) {
    reportFailure('marker was not accompanied by assertion-failure evidence', output)
    return 1
  }

  return 0
}

process.exitCode = main()
