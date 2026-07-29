#!/usr/bin/env node

import { renameSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { isMain, packageDir, runSupabase } from './supabase-cli.mjs'

function main() {
  const arguments_ = process.argv.slice(2).filter((argument) => argument !== '--')
  if (arguments_.includes('--help')) {
    console.log('Usage: generate-types.mjs --target linked [--output <path>]')
    return 0
  }
  const targetIndex = arguments_.indexOf('--target')
  const target = targetIndex >= 0 ? arguments_[targetIndex + 1] : undefined
  if (target !== 'linked') {
    console.error('Cloud-only policy requires explicit --target linked')
    return 2
  }
  const outputIndex = arguments_.indexOf('--output')
  const output = resolve(
    packageDir,
    outputIndex >= 0 ? arguments_[outputIndex + 1] : 'types/database.generated.ts'
  )
  try {
    const generated = runSupabase([
      'gen',
      'types',
      `--${target}`,
      '--lang',
      'typescript',
      '--schema',
      'public',
    ])
    const temporary = `${output}.tmp`
    writeFileSync(temporary, generated)
    renameSync(temporary, output)
    console.log(`Generated ${target} database types at ${output}`)
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    return 1
  }
}

if (isMain(import.meta.url)) process.exitCode = main()
