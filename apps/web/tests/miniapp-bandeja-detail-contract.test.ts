import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * El detalle de bandeja de la mini app debe consumir el contrato real de
 * BandejaDetail (apps/api/schemas/miniapp.py): detalles_lote{numero,precio,
 * proyecto}, comprador{nombre,rut,email,telefono}, conflictos[]{nombre,
 * valor_certificado, valor_vendedor, diferencia_detectada} y evidence_file_id
 * (UUID opaco, nunca URLs de storage).
 */

const PAGE = path.resolve(__dirname, '..', 'src', 'app', 'mini', 'bandeja', '[id]', 'page.tsx')

describe('Detalle de bandeja usa el contrato BandejaDetail del backend', () => {
  const source = fs.readFileSync(PAGE, 'utf-8')

  it('consume detalles_lote y comprador estructurado', () => {
    expect(source).toContain('detalles_lote')
    expect(source).toMatch(/comprador\.nombre/)
  })

  it('mapea conflictos con valor_certificado y valor_vendedor', () => {
    expect(source).toContain('valor_certificado')
    expect(source).toContain('valor_vendedor')
    expect(source).toContain('diferencia_detectada')
  })

  it('no usa campos inexistentes del contrato anterior', () => {
    expect(source).not.toContain('valor_db')
    expect(source).not.toContain('evidence_url')
    expect(source).not.toMatch(/detalle\.numero_lote/)
    expect(source).not.toMatch(/detalle\.proyecto/)
    expect(source).not.toMatch(/detalle\.vendedor/)
  })

  it('trata evidence_file_id como referencia opaca (sin construir URLs)', () => {
    expect(source).toContain('evidence_file_id')
    expect(source).not.toMatch(/evidence_file_id.*https?:\/\//)
  })
})
