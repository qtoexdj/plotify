import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const MARKER = 'STORAGE_URL_EXPOSED'

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('private file public projection contract (RED)', () => {
  it('projects only opaque IDs and same-origin Plotify routes', () => {
    const publicWebSurfaces = [
      'src/lib/documents/matriz-history.ts',
      'src/lib/documents/matriz-types.ts',
      'src/lib/documents/mis-documentos.ts',
      'src/lib/labs/escrituras.ts',
      'src/components/documents/mesa/historial-generaciones.tsx',
      'src/components/documents/mesa/workflow-acciones.tsx',
      'src/app/(dashboard)/mis-documentos/page.tsx',
    ]
      .map(source)
      .join('\n')

    expect(publicWebSurfaces, MARKER).toMatch(/fileId|generationId|deliveryId/)
    expect(publicWebSurfaces, MARKER).not.toMatch(
      /createSignedUrl|getPublicUrl|download_url|signedURL|signedUrl|storage_bucket|storage_path|object_path|supabase\.co\/storage/i
    )
  })

  it('does not project private Storage coordinates from API schemas or endpoints', () => {
    const publicApiSurfaces = [
      '../api/api/v1/endpoints/miniapp.py',
      '../api/api/v1/endpoints/documents.py',
      '../api/api/v1/endpoints/escritura_deliveries.py',
      '../api/api/v1/endpoints/escritura_matrices.py',
      '../api/schemas/escritura_matrices.py',
    ]
      .map(source)
      .join('\n')

    expect(publicApiSurfaces, MARKER).not.toMatch(
      /create_signed_url|download_url|evidencia_url|signedURL|signedUrl|storage_bucket|storage_path|object_path/i
    )
  })
})
