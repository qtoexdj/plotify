#!/usr/bin/env node

import { readdirSync } from 'node:fs'
import { join } from 'node:path'

import { isMain, packageDir, runSupabase } from './supabase-cli.mjs'

function main() {
  if (process.argv.includes('--help')) {
    console.log('Usage: test-db.mjs --linked <pgTAP path>')
    return 0
  }
  try {
    const linked = process.argv.includes('--linked')
    const paths = process.argv
      .slice(2)
      .filter((argument) => argument !== '--' && argument !== '--linked')
    if (!linked) throw new Error('Cloud-only policy requires --linked.')
    const testPaths = paths.length
      ? paths
      : readdirSync(join(packageDir, 'supabase', 'tests', 'database'))
          .filter((name) => name.endsWith('.test.sql'))
          .sort()
          .map((name) => `supabase/tests/database/${name}`)
    if (!testPaths.length) throw new Error('No linked pgTAP SQL files were found.')
    const failingPaths = []
    for (const testPath of testPaths) {
      const output = runSupabase(['db', 'query', '--linked', '--file', testPath])
      process.stdout.write(output)
      if (/not ok\b/.test(output)) {
        failingPaths.push(testPath)
      }
    }
    if (failingPaths.length) {
      throw new Error(`Linked pgTAP reported failing assertions in: ${failingPaths.join(', ')}.`)
    }
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    return 1
  }
}

if (isMain(import.meta.url)) process.exitCode = main()
