#!/usr/bin/env node

import { execFileSync } from 'node:child_process'

const usage = `Usage: pnpm --filter @plotify/database assert:linked -- --read-only --expected-max-version <version>

Reads the linked cloud migration history and verifies its maximum version.
This command never starts, resets or inspects a local Supabase instance.
`

function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    process.stdout.write(usage)
    return
  }
  const readOnly = process.argv.includes('--read-only')
  const index = process.argv.indexOf('--expected-max-version')
  const expected = index >= 0 ? process.argv[index + 1] : undefined
  if (!readOnly || !/^\d{14}$/.test(expected ?? '')) {
    throw new Error('ASSERT_LINKED_READ_ONLY_ARGUMENTS_REQUIRED')
  }
  const projectRef = process.env.SUPABASE_PROJECT_REF
  if (!projectRef) throw new Error('SUPABASE_PROJECT_REF_REQUIRED')
  if (projectRef === 'swkrnjdpnlrgxgotmfxy') throw new Error('LEGACY_FREE_PROJECT_FORBIDDEN')
  const output = execFileSync('pnpm', ['exec', 'supabase', 'migration', 'list', '--linked'], {
    encoding: 'utf8',
    env: process.env,
  })
  const versions = [...output.matchAll(/\b(\d{14})\b/g)].map((match) => match[1])
  const maximum = versions.sort().at(-1)
  if (maximum !== expected) {
    throw new Error(
      `LINKED_MAX_VERSION_MISMATCH: expected ${expected}, received ${maximum ?? 'none'}`
    )
  }
  process.stdout.write(`${JSON.stringify({ projectRef, maximum, readOnly: true })}\n`)
}

try {
  main()
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
}
