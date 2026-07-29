import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  canonicalRequestHash,
  canonicalUploadMetadata,
  canonicalizeJcs,
  decideReplay,
  type OperationIdentity,
} from '../src/lib/idempotency/operations'

const vectors = JSON.parse(
  readFileSync(
    resolve(
      process.cwd(),
      '../../specs/019-hardening-produccion/contracts/idempotency-jcs-vectors.json'
    ),
    'utf8'
  )
)

describe('jcs-rfc8785-v1 operation identity', () => {
  it('canonicalizes every shared contract vector', () => {
    for (const vector of vectors.canonicalization as Array<{
      name: string
      input: unknown
      canonical: string
    }>) {
      expect(canonicalizeJcs(vector.input), vector.name).toBe(vector.canonical)
    }
  })

  it('distinguishes explicit null from an omitted optional field', () => {
    expect(canonicalizeJcs(vectors.nullAndOmission.withNull)).toBe(
      vectors.nullAndOmission.canonicalWithNull
    )
    expect(canonicalizeJcs(vectors.nullAndOmission.withoutOptional)).toBe(
      vectors.nullAndOmission.canonicalWithoutOptional
    )
  })

  it('hashes canonical requests independent of object insertion order', async () => {
    await expect(canonicalRequestHash({ a: 2, z: 1 })).resolves.toBe(
      await canonicalRequestHash({ z: 1, a: 2 })
    )
  })

  it('canonicalizes upload bytes as metadata with a raw-byte SHA-256', async () => {
    const upload = vectors.upload
    await expect(
      canonicalUploadMetadata(
        new TextEncoder().encode(upload.utf8),
        upload.filename,
        upload.contentType
      )
    ).resolves.toEqual({
      filename: upload.filename,
      contentType: upload.contentType,
      size: upload.size,
      sha256: upload.sha256,
    })
  })

  it('replays only the same key, hash, and scope', () => {
    const identity: OperationIdentity = {
      operationKey: 'op-1',
      requestHash: 'sha256:abc',
      scope: 'org:org-a/project:project-a',
    }
    expect(decideReplay(null, identity)).toBe('claim')
    expect(decideReplay(identity, identity)).toBe('replay')
    expect(decideReplay(identity, { ...identity, requestHash: 'sha256:changed' })).toBe('conflict')
    expect(decideReplay(identity, { ...identity, scope: 'org:org-b' })).toBe('conflict')
  })
})
