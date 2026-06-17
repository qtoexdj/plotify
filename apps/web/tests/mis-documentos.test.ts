/**
 * SDD 011 T017 — "Mis documentos del vendedor": acciones por entrega.
 */

import { describe, expect, it } from 'vitest'

import {
  MIS_DOCUMENTOS_TEXT,
  etiquetaEntrega,
  puedeDescargar,
  puedeRenovar,
} from '@/lib/documents/mis-documentos'
import type { EscrituraDeliveryView } from '@/lib/documents/matriz-types'

function entrega(over: Partial<EscrituraDeliveryView>): EscrituraDeliveryView {
  return {
    id: 'd1',
    escritura_case_id: 'c1',
    generation_id: 'g1',
    recipient_user_id: 'vendor-1',
    channel: 'web',
    status: 'sent',
    link_expires_at: null,
    sent_at: null,
    created_at: '2026-06-16T00:00:00Z',
    download_url: 'https://signed.example/doc.docx',
    status_label: 'Entregada',
    ...over,
  }
}

describe('SDD 011 T017 — mis documentos del vendedor', () => {
  it('descargable solo si fue entregada y conserva URL', () => {
    expect(puedeDescargar(entrega({}))).toBe(true)
    expect(puedeDescargar(entrega({ download_url: null }))).toBe(false)
    expect(puedeDescargar(entrega({ status: 'expired', download_url: null }))).toBe(false)
  })

  it('renovable solo cuando el enlace venció', () => {
    expect(puedeRenovar(entrega({ status: 'expired' }))).toBe(true)
    expect(puedeRenovar(entrega({ status: 'sent' }))).toBe(false)
    expect(puedeRenovar(entrega({ status: 'unavailable' }))).toBe(false)
  })

  it('la etiqueta usa la frase humana del servidor, sin jerga', () => {
    expect(etiquetaEntrega(entrega({ status_label: 'Entregada' }))).toBe('Entregada')
    expect(etiquetaEntrega(entrega({ status_label: null }))).toBe('Entrega')
    for (const value of Object.values(MIS_DOCUMENTOS_TEXT)) {
      expect(value.includes('_')).toBe(false)
    }
  })
})
