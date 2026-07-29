#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

function loadJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`EVIDENCE_SCHEMA_INVALID: ${path}: ${error.message}`)
  }
}

export function verifyRollout({ plan, transitions, smokes, postEnableCapability }) {
  const expected = plan?.transitions
  if (!Array.isArray(expected) || expected.length === 0) {
    throw new Error('EVIDENCE_SCHEMA_INVALID: rollout plan has no transitions')
  }
  if (!Array.isArray(transitions) || transitions.length !== expected.length) {
    throw new Error('EVIDENCE_SCHEMA_INVALID: rollout transitions are incomplete')
  }
  if (!Array.isArray(smokes) || smokes.length !== expected.length) {
    throw new Error('EVIDENCE_SCHEMA_INVALID: rollout smoke evidence is incomplete')
  }
  for (let index = 0; index < expected.length; index += 1) {
    const transition = transitions[index]
    const smoke = smokes[index]
    if (
      transition.id !== expected[index] ||
      transition.status !== 'applied' ||
      transition.versionAfter !== transition.versionBefore + 1 ||
      !transition.auditDigest ||
      smoke.transitionId !== transition.id ||
      smoke.verdict !== 'PASS'
    ) {
      throw new Error(`EVIDENCE_SCHEMA_INVALID: rollout transition ${expected[index]} is invalid`)
    }
  }
  if (
    plan.requiresCapabilityLifecycle &&
    (!postEnableCapability ||
      postEnableCapability.issued !== true ||
      postEnableCapability.read !== true ||
      postEnableCapability.revoked !== true ||
      postEnableCapability.deniedAfterRevoke !== true ||
      postEnableCapability.plaintextPersisted !== false)
  ) {
    throw new Error('EVIDENCE_SCHEMA_INVALID: capability lifecycle is incomplete')
  }
  return {
    verdict: 'PASS',
    rolloutStatus: 'complete',
    transitionIds: [...expected],
  }
}

function parse(argv) {
  const values = {}
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith('--')) throw new Error(`Unknown argument: ${argv[index]}`)
    const key = argv[index]
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) {
      values[key] = true
    } else {
      values[key] = value
      index += 1
    }
  }
  return values
}

function main() {
  if (process.argv.includes('--help')) {
    process.stdout.write('Usage: verify-rollout.mjs --plan <json> --write-summary <json> ...\n')
    return
  }
  const options = parse(process.argv.slice(2))
  const summary = verifyRollout({
    plan: loadJson(options['--plan']),
    transitions: loadJson(options['--transitions']),
    smokes: loadJson(options['--smoke-root']),
    postEnableCapability: options['--post-enable-capability']
      ? loadJson(options['--post-enable-capability'])
      : undefined,
  })
  if (options['--write-summary']) {
    writeFileSync(options['--write-summary'], `${JSON.stringify(summary, null, 2)}\n`, {
      flag: 'wx',
    })
  }
  process.stdout.write(`${JSON.stringify(summary)}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main()
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
}
