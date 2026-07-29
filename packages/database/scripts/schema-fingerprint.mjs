#!/usr/bin/env node

import { catalogSnapshot, isMain, sha256 } from './supabase-cli.mjs'

function main() {
  const arguments_ = process.argv.slice(2).filter((argument) => argument !== '--')
  if (arguments_.includes('--help')) {
    console.log('Usage: schema-fingerprint.mjs --target linked')
    return 0
  }
  const targetIndex = arguments_.indexOf('--target')
  const target = targetIndex >= 0 ? arguments_[targetIndex + 1] : undefined
  if (target !== 'linked') {
    console.error('Cloud-only policy requires schema:fingerprint --target linked')
    return 2
  }
  try {
    console.log(JSON.stringify({ target, fingerprint: sha256(catalogSnapshot(target)) }))
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    return 1
  }
}

if (isMain(import.meta.url)) process.exitCode = main()
