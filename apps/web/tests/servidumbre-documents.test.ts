import { describe, expect, it } from 'vitest'
import { generateServidumbreText } from '@/lib/legal/servidumbre-generator'
import type { ServidumbreAnalysis } from '@/types/database.types'

type GenerateServidumbreTextWithOptions = (
  analysis: ServidumbreAnalysis,
  widthRoadMeters?: number,
  options?: { widthLabel?: string | null }
) => string

function servidumbreAnalysisFixture(): ServidumbreAnalysis {
  return {
    lotNumber: '7',
    areaM2: 300,
    isMultiTramo: false,
    tramos: [
      {
        direction: 'Norte',
        edges: [
          {
            direction: 'Norte',
            distance: 50,
            frontierType: 'internal',
            selfLotNumber: '7',
            neighbors: [],
            bearing: 90,
            p1: [-71.16, -34.87],
            p2: [-71.159, -34.87],
          },
          {
            direction: 'Oriente',
            distance: 5,
            frontierType: 'external',
            externalName: 'camino interior',
            neighbors: [],
            bearing: 0,
            p1: [-71.159, -34.87],
            p2: [-71.159, -34.8699],
          },
        ],
      },
    ],
    allEdges: [],
  }
}

describe('servidumbre document generation', () => {
  it('uses persisted servidumbre_ancho_label over the single numeric width', () => {
    const generateText = generateServidumbreText as GenerateServidumbreTextWithOptions

    const text = generateText(servidumbreAnalysisFixture(), 5, {
      widthLabel: '5 y 10',
    })

    expect(text.toLowerCase()).toContain('trescientos metros cuadrados')
    expect(text).toContain('5 y 10')
    expect(text).not.toContain(' 5 metros')
  })
})
