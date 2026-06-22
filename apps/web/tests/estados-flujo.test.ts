/**
 * SDD 011 T019 — estados del flujo unificados en todas las superficies (FR-014).
 *
 * Un solo diccionario (`FLOW_STATE_LABELS`) alimenta notificaciones, CCL, mesa y
 * "mis documentos del vendedor": las frases son humanas e idénticas en todas.
 */

import { describe, expect, it } from 'vitest'

import {
  FLOW_STATE_DESCRIPTIONS,
  FLOW_STATE_LABELS,
  flowStateLabel,
  type FlowState,
} from '@/lib/documents/matriz-microcopy'
import { etiquetaEntrega } from '@/lib/documents/mis-documentos'
import type { EscrituraDeliveryView } from '@/lib/documents/matriz-types'

const CANONICAL: Record<FlowState, string> = {
  waiting_project_matriz: 'Esperando matriz del proyecto',
  in_preparation: 'En preparación',
  draft_for_review: 'Borrador por revisar',
  accepted: 'Aceptada',
  delivered: 'Entregada',
}

describe('SDD 011 T019 — estados del flujo unificados (FR-014)', () => {
  it('el diccionario único define las cinco frases humanas canónicas', () => {
    expect(FLOW_STATE_LABELS).toEqual(CANONICAL)
    for (const key of Object.keys(CANONICAL) as FlowState[]) {
      expect(flowStateLabel(key)).toBe(CANONICAL[key])
    }
  })

  it('cada estado del flujo viaja con frase y descripción humanas, sin jerga', () => {
    for (const key of Object.keys(CANONICAL) as FlowState[]) {
      expect(FLOW_STATE_DESCRIPTIONS[key]).toBeTruthy()
      expect(FLOW_STATE_LABELS[key].includes('_')).toBe(false)
    }
  })

  it('"mis documentos del vendedor" usa la MISMA frase "Entregada" del diccionario', () => {
    // El API envía status_label "Entregada" para una entrega completada; debe
    // ser idéntica a FLOW_STATE_LABELS.delivered (mismo vocabulario en todas
    // las superficies, no una copia redactada aparte).
    const entregada: EscrituraDeliveryView = {
      id: 'd',
      escritura_case_id: 'c',
      generation_id: 'g',
      recipient_user_id: 'v',
      channel: 'web',
      status: 'sent',
      link_expires_at: null,
      sent_at: null,
      created_at: '2026-06-16T00:00:00Z',
      download_url: 'https://signed.example/doc.docx',
      status_label: FLOW_STATE_LABELS.delivered,
    }
    expect(etiquetaEntrega(entregada)).toBe(FLOW_STATE_LABELS.delivered)
    expect(etiquetaEntrega(entregada)).toBe('Entregada')
  })
})
