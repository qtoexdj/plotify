#!/usr/bin/env node

import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import { runGuardedMutation } from './guarded-mutators.mjs'
import {
  atomicWriteJson,
  fileDigest,
  parseOptions,
  readJson,
  sha256,
  targetFingerprint,
} from './operator-io.mjs'

const usage = `Usage: pnpm auth:hardening-guarded -- --target linked --approval-evidence <file> --source-manifest <file> [--apply] --output <dir>

Defaults to dry-run. Apply is allowed only for an approved non-legacy final project.
`

function configFingerprint(config) {
  return sha256(
    JSON.stringify({
      password_hibp_enabled: config.password_hibp_enabled === true,
    })
  )
}

async function managementRequest(projectRef, method, body) {
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) throw new Error('SUPABASE_ACCESS_TOKEN_REQUIRED')
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`SUPABASE_AUTH_CONFIG_REQUEST_FAILED: ${response.status}`)
  return response.json()
}

export async function applyAuthHardening(request) {
  const before = await managementRequest(request.projectRef, 'GET')
  if (before.password_hibp_enabled !== request.expectedBefore) {
    throw new Error('AUTH_HARDENING_BEFORE_STATE_MISMATCH')
  }
  await managementRequest(request.projectRef, 'PATCH', { password_hibp_enabled: true })
  const after = await managementRequest(request.projectRef, 'GET')
  if (after.password_hibp_enabled !== request.expectedAfter) {
    throw new Error('AUTH_HARDENING_LIVE_READ_MISMATCH')
  }
  return {
    status: 'APPLIED',
    beforeFingerprint: configFingerprint(before),
    afterFingerprint: configFingerprint(after),
    liveRead: { password_hibp_enabled: true },
    redacted: true,
  }
}

export async function runAuthHardening(argv) {
  const options = parseOptions(argv, {
    booleans: ['--apply'],
    values: ['--target', '--approval-evidence', '--source-manifest', '--output'],
  })
  if (options.help) return { help: true }
  if (
    options['--target'] !== 'linked' ||
    !options['--approval-evidence'] ||
    !options['--source-manifest'] ||
    !options['--output']
  ) {
    throw new Error('AUTH_HARDENING_ARGUMENTS_REQUIRED')
  }
  const projectRef = process.env.SUPABASE_PROJECT_REF
  if (!projectRef) throw new Error('SUPABASE_PROJECT_REF_REQUIRED')
  const approval = readJson(options['--approval-evidence'])
  const sourceManifest = readJson(options['--source-manifest'])
  const result = await runGuardedMutation(
    {
      operation: 'auth-hardening',
      target: {
        kind: 'linked',
        projectRef,
        fingerprint: targetFingerprint(projectRef),
      },
      sourceManifest: {
        digest: fileDigest(options['--source-manifest']),
        sourceSha: sourceManifest.sourceSha,
        dirty: sourceManifest.git?.dirty,
      },
      approval,
      apply: options['--apply'] === true,
    },
    applyAuthHardening
  )
  const applied = result.status === 'APPLIED'
  const report = {
    schemaVersion: 1,
    kind: 'auth-hardening',
    criterionIds: ['FR-043'],
    reviewer: approval.details.actor,
    generatedAt: new Date().toISOString(),
    sourceSha: result.sourceSha,
    targetFingerprint: result.targetFingerprint,
    sourceManifestDigest: result.sourceManifestDigest,
    verdict: applied ? 'PASS' : 'NO-GO',
    details: {
      operation: 'auth-hardening',
      setting: 'password_hibp_enabled',
      enabled: applied && result.liveRead?.password_hibp_enabled === true,
      beforeFingerprint: result.beforeFingerprint ?? sha256('dry-run:before'),
      afterFingerprint: result.afterFingerprint ?? sha256('dry-run:after'),
      redacted: true,
    },
    evidence: [
      {
        id: 'auth-config-before-after',
        digest: sha256(
          JSON.stringify({
            before: result.beforeFingerprint ?? null,
            after: result.afterFingerprint ?? null,
            status: result.status,
          })
        ),
        redacted: true,
      },
    ],
  }
  atomicWriteJson(resolve(options['--output'], 'report.json'), report)
  return report
}

async function main() {
  try {
    const result = await runAuthHardening(process.argv.slice(2))
    if (result.help) process.stdout.write(usage)
    else process.stdout.write(`${JSON.stringify({ verdict: result.verdict, redacted: true })}\n`)
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
