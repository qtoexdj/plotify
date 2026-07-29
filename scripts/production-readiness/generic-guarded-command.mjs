#!/usr/bin/env node

import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import { parseOptions } from './operator-io.mjs'

const descriptions = {
  'feature-controls': 'Guarded deployment-config and one-step CAS rollout operations.',
  'capabilities-cutover': 'Guarded authenticated same-origin legacy capability cutover.',
  'migrations-push-guarded': 'Guarded canonical migration push with approval and backup binding.',
  'restore-rehearsal': 'Guarded restore rehearsal for an approved disposable cloud target.',
}

export function genericHelp(command) {
  return `Usage: ${command} [operation] --target <linked|disposable> --approval-evidence <file> --source-manifest <file> [--apply] --output <dir>

${descriptions[command]}
Defaults to non-mutating validation. Unknown or mismatched bindings make zero adapter calls.
`
}

export function main() {
  const command = process.env.PLOTIFY_GUARDED_COMMAND
  const options = parseOptions(process.argv.slice(2), {
    booleans: ['--apply', '--allow-disposable-reset'],
    values: [
      '--target',
      '--approval-evidence',
      '--source-manifest',
      '--output',
      '--plan',
      '--deployment-manifest',
      '--require-backup-evidence',
      '--require-zero-cutover-blockers',
      '--from',
      '--through',
      '--only',
      '--expected-max-version',
      '--candidate-sha',
      '--require-controls-off',
      '--require-hard-off-active',
      '--require-config-attestations',
    ],
  })
  if (options.help) {
    process.stdout.write(genericHelp(command))
    return
  }
  process.stderr.write(`${command.toUpperCase().replaceAll('-', '_')}_OPERATOR_ADAPTER_REQUIRED\n`)
  process.exitCode = 1
}

if (
  process.argv[1] &&
  (resolve(process.argv[1]) === fileURLToPath(import.meta.url) ||
    process.env.PLOTIFY_GUARDED_COMMAND)
)
  main()
