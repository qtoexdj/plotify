#!/usr/bin/env node

import { spawnSync } from 'node:child_process'

const usage = `Usage: pnpm verify:generated-clean -- [paths...]

Fails when generated contracts, clients or database types differ from Git.
`

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  process.stdout.write(usage)
} else {
  const defaults = [
    'packages/contracts',
    'apps/web/src/lib/services/plotify-chat.generated.ts',
    'packages/database/types/database.generated.ts',
  ]
  const paths = process.argv.slice(2).filter((argument) => argument !== '--')
  const result = spawnSync(
    'git',
    ['diff', '--exit-code', '--', ...(paths.length ? paths : defaults)],
    {
      stdio: 'inherit',
    }
  )
  process.exitCode = result.status ?? 1
}
