import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const MARKER = 'STORAGE_URL_EXPOSED'

function source(path: string) {
  try {
    return readFileSync(resolve(process.cwd(), path), 'utf8')
  } catch {
    return ''
  }
}

describe('escritura document capability contract (RED)', () => {
  it('uses hash-only, single-use, rotation-safe 256-bit capability issuances', () => {
    const migration = source(
      '../../packages/database/supabase/migrations/20260713000200_sdd019_security_storage.sql'
    )
    const delivery = source('../api/services/escritura_delivery.py')
    const resolver = source('../api/services/document_capabilities.py')
    const combined = `${migration}\n${delivery}\n${resolver}`

    expect(combined, MARKER).toMatch(/token_bytes\(32\)|gen_random_bytes\(32\)/)
    expect(combined, MARKER).toMatch(/capability_hash|token_hash/)
    expect(combined, MARKER).toMatch(/unique[\s\S]*(capability_hash|token_hash)/i)
    expect(combined, MARKER).toMatch(/issued_at[\s\S]*(7 days|7\s*\*\s*24)/i)
    expect(combined, MARKER).toMatch(/consumed_at|plaintext.*once/i)
    expect(combined, MARKER).toMatch(/for update|advisory_xact_lock|rotation/i)
    expect(combined, MARKER).toMatch(/revoked_at|status[\s\S]*revoked/i)
    expect(combined, MARKER).toMatch(/artifact_sha256|checksum/i)
    expect(combined, MARKER).toMatch(/document_capabilities/)
    expect(delivery, MARKER).not.toMatch(/"link_token"|create_signed_url|download_url/)
  })
})
