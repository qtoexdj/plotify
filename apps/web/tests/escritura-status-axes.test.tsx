import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const MARKER = 'signatureStatus'

function source(path: string): string {
  try {
    return readFileSync(resolve(process.cwd(), path), 'utf8')
  } catch {
    return ''
  }
}

describe('truthful escritura status axes (RED)', () => {
  const types = source('src/lib/documents/matriz-types.ts')
  const mesa = [
    source('src/components/documents/mesa/mesa-escritura.tsx'),
    source('src/components/documents/mesa/historial-generaciones.tsx'),
  ].join('\n')
  const seller = [
    source('src/lib/documents/mis-documentos.ts'),
    source('src/app/(dashboard)/mis-documentos/page.tsx'),
  ].join('\n')

  it('models semantic, generation, delivery, capability and signature independently', () => {
    expect(types, MARKER).toMatch(/semanticStatus|semantic_status/)
    expect(types, MARKER).toMatch(/generationStatus|generation_status/)
    expect(types, MARKER).toMatch(/deliveryStatus|delivery_status/)
    expect(types, MARKER).toMatch(/capabilityStatus|capability_status/)
    expect(types, MARKER).toMatch(/signatureStatus|signature_status/)
    expect(types, MARKER).toMatch(/nextRetryAt|next_retry_at/)
    expect(types, MARKER).toMatch(/lastErrorCode|last_error_code/)
  })

  it('renders awaiting/recorded signature without deriving it from delivery', () => {
    const surfaces = `${mesa}\n${seller}`
    expect(surfaces, MARKER).toMatch(/signatureStatus|signature_status/)
    expect(surfaces, MARKER).toMatch(/awaiting|Pendiente de firma/)
    expect(surfaces, MARKER).toMatch(/recorded|Firma registrada/)
    expect(surfaces, MARKER).not.toMatch(
      /deliveryStatus\s*===?\s*['"](?:complete|sent)['"][\s\S]{0,160}escritura_firmada/
    )
  })

  it('keeps historical web availability separate from current capability expiry', () => {
    const surfaces = `${types}\n${mesa}\n${seller}`
    expect(surfaces, MARKER).toMatch(/availableAt|available_at/)
    expect(surfaces, MARKER).toMatch(/firstAccessedAt|first_accessed_at/)
    expect(surfaces, MARKER).toMatch(/expired|Vencid/)
    expect(surfaces, MARKER).toMatch(/attemptCount|attempt_count/)
  })
})
