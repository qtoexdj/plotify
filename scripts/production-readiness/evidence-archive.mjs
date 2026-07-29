#!/usr/bin/env node

import { chmodSync, copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

import { atomicWriteJson, fileDigest, parseOptions, readJson, sha256 } from './operator-io.mjs'

const usage = `Usage: pnpm evidence:archive -- --evidence-manifest <file> --deployment-manifest <file> --report <file> --retention-days <n> --output <receipt>

Requires PLOTIFY_WORM_ARCHIVE_ROOT. Writes a versioned object, performs readback and emits a receipt.
`

function main() {
  try {
    const options = parseOptions(process.argv.slice(2), {
      values: [
        '--evidence-manifest',
        '--deployment-manifest',
        '--report',
        '--retention-days',
        '--output',
      ],
    })
    if (options.help) {
      process.stdout.write(usage)
      return
    }
    const archiveRoot = process.env.PLOTIFY_WORM_ARCHIVE_ROOT
    if (!archiveRoot) throw new Error('WORM_ARCHIVE_ROOT_REQUIRED')
    const retentionDays = Number(options['--retention-days'])
    if (!Number.isInteger(retentionDays) || retentionDays < 365)
      throw new Error('WORM_RETENTION_TOO_SHORT')
    const report = readJson(options['--report'])
    const runId = randomUUID()
    const object = resolve(archiveRoot, `${runId}.evidence-manifest.json`)
    mkdirSync(resolve(archiveRoot), { recursive: true })
    copyFileSync(resolve(options['--evidence-manifest']), object)
    chmodSync(object, 0o400)
    const archiveDigest = sha256(readFileSync(object))
    if (archiveDigest !== fileDigest(options['--evidence-manifest']))
      throw new Error('WORM_ARCHIVE_READBACK_MISMATCH')
    const now = new Date()
    const retentionUntil = new Date(now.getTime() + retentionDays * 86_400_000)
    atomicWriteJson(options['--output'], {
      schemaVersion: 1,
      runId,
      releaseSha: report.git.sha,
      evidenceManifestDigest: fileDigest(options['--evidence-manifest']),
      immutableLocator: `worm://${runId}`,
      archiveDigest,
      sourceManifestDigest: report.sourceManifestDigest,
      reportDigest: fileDigest(options['--report']),
      deploymentManifestDigest: fileDigest(options['--deployment-manifest']),
      provenance: 'plotify-evidence-archive-v1',
      readbackAt: now.toISOString(),
      retentionUntil: retentionUntil.toISOString(),
      redactionPolicyVersion: 'redaction-v1',
    })
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
}

main()
