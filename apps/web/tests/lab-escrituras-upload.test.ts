import { describe, expect, it } from 'vitest'
import { validateLabUploadFile } from '../src/app/api/labs/escrituras/upload/route'
import { LAB_ACCEPT_ATTRIBUTE, LAB_SUPPORTED_UPLOADS } from '../src/lib/labs/escrituras'

function file(bytes: number[], name: string, type = 'application/octet-stream') {
  return new File([new Uint8Array(bytes)], name, { type })
}

describe('Escrituras lab upload validation', () => {
  it('exposes the supported upload extensions for the UI input', () => {
    expect(LAB_ACCEPT_ATTRIBUTE).toBe('.pdf,.doc,.docx,.rtf')
  })

  it('accepts PDF signatures', async () => {
    const result = await validateLabUploadFile(file([0x25, 0x50, 0x44, 0x46, 0x2d], 'a.pdf'))

    expect('sourceFormat' in result && result.sourceFormat).toBe('pdf')
    expect('contentType' in result && result.contentType).toBe(
      LAB_SUPPORTED_UPLOADS.pdf.contentType
    )
  })

  it('accepts DOC and RTF signatures', async () => {
    const doc = await validateLabUploadFile(
      file([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], 'legacy.doc')
    )
    const rtf = await validateLabUploadFile(
      file([0x7b, 0x5c, 0x72, 0x74, 0x66, 0x31], 'sample.rtf')
    )

    expect('sourceFormat' in doc && doc.sourceFormat).toBe('doc')
    expect('sourceFormat' in rtf && rtf.sourceFormat).toBe('rtf')
  })

  it('rejects unsupported files before persistence can happen', async () => {
    const result = await validateLabUploadFile(file([0x89, 0x50, 0x4e, 0x47], 'image.png'))

    expect('error' in result && result.error).toContain('Solo se permiten')
  })
})
