import { describe, expect, it } from 'vitest'
import {
  getCurrentProcessingDocument,
  getLabOperationSnapshot,
  getLabOperationProgress,
  getLabOperationSteps,
  getLabOperationSummary,
} from '../src/lib/labs/escrituras-operations'
import { normalizeLabPayload, type LabPayload } from '../src/lib/labs/escrituras'

function payload(overrides: Partial<LabPayload> = {}): LabPayload {
  return {
    documents: [],
    variables: [],
    templates: [],
    sourceMap: [],
    embeddingStats: {
      totalChunks: 0,
      embeddedChunks: 0,
      pendingChunks: 0,
    },
    documentStats: {
      totalDocuments: 0,
      pendingDocuments: 0,
    },
    setupRequired: false,
    ...overrides,
  }
}

describe('Escrituras lab operation helpers', () => {
  it('normalizes auth/setup error payloads into a render-safe lab payload', () => {
    const normalized = normalizeLabPayload({ error: 'No autenticado' })

    expect(normalized.documents).toEqual([])
    expect(normalized.templates[0]).toBeUndefined()
    expect(normalized.embeddingStats.pendingChunks).toBe(0)
    expect(normalized.documentStats.pendingDocuments).toBe(0)
    expect(normalized.error).toBe('No autenticado')
  })

  it('does not crash when polling receives a partial error payload', () => {
    const authErrorPayload = { error: 'No autenticado' }

    expect(getCurrentProcessingDocument(authErrorPayload)).toBeNull()
    expect(getLabOperationSnapshot(authErrorPayload)).toEqual({
      totalDocuments: 0,
      pendingDocuments: 0,
      processedDocuments: 0,
      lowQualityDocuments: 0,
      failedDocuments: 0,
      totalChunks: 0,
      embeddedChunks: 0,
      pendingChunks: 0,
    })
  })

  it('summarizes processing deltas for the progress dialog', () => {
    const before = getLabOperationSnapshot(
      payload({
        documentStats: { totalDocuments: 3, pendingDocuments: 4 },
        documents: [
          { processing_status: 'processed' },
          { processing_status: 'low_quality_extraction' },
        ] as LabPayload['documents'],
        embeddingStats: { totalChunks: 10, embeddedChunks: 0, pendingChunks: 10 },
      })
    )
    const after = getLabOperationSnapshot(
      payload({
        documentStats: { totalDocuments: 30, pendingDocuments: 0 },
        documents: [
          { processing_status: 'processed' },
          { processing_status: 'processed' },
          { processing_status: 'processed' },
          { processing_status: 'low_quality_extraction' },
          { processing_status: 'low_quality_extraction' },
          { processing_status: 'failed' },
        ] as LabPayload['documents'],
        embeddingStats: { totalChunks: 34, embeddedChunks: 0, pendingChunks: 34 },
      })
    )

    const summary = getLabOperationSummary('process', before, after)

    expect(summary).toContainEqual({ label: 'Documentos pendientes al iniciar', value: 4 })
    expect(summary).toContainEqual({ label: 'Documentos procesados nuevos', value: 2 })
    expect(summary).toContainEqual({ label: 'Baja calidad nuevos', value: 1 })
    expect(summary).toContainEqual({ label: 'Documentos fallidos nuevos', value: 1 })
    expect(summary).toContainEqual({ label: 'Chunks generados nuevos', value: 24 })
  })

  it('summarizes embedding deltas for the progress dialog', () => {
    const before = {
      totalDocuments: 0,
      pendingDocuments: 0,
      processedDocuments: 0,
      lowQualityDocuments: 0,
      failedDocuments: 0,
      totalChunks: 34,
      embeddedChunks: 10,
      pendingChunks: 24,
    }
    const after = { ...before, embeddedChunks: 34, pendingChunks: 0 }

    const summary = getLabOperationSummary('embeddings', before, after)

    expect(summary).toContainEqual({ label: 'Chunks pendientes al iniciar', value: 24 })
    expect(summary).toContainEqual({ label: 'Embeddings generados', value: 24 })
    expect(summary).toContainEqual({ label: 'Chunks pendientes al cerrar', value: 0 })
  })

  it('computes live processing progress for the dialog', () => {
    const before = {
      totalDocuments: 69,
      pendingDocuments: 48,
      processedDocuments: 21,
      lowQualityDocuments: 0,
      failedDocuments: 0,
      totalChunks: 0,
      embeddedChunks: 0,
      pendingChunks: 0,
    }
    const latest = {
      ...before,
      pendingDocuments: 25,
      processedDocuments: 37,
      lowQualityDocuments: 6,
      totalChunks: 258,
    }

    const progress = getLabOperationProgress('process', before, latest, 'Dominio.pdf')

    expect(progress.completed).toBe(22)
    expect(progress.total).toBe(48)
    expect(progress.percentage).toBe(46)
    expect(progress.currentItem).toBe('Dominio.pdf')
    expect(progress.chunksDelta).toBe(258)
  })

  it('computes live embedding progress for the dialog', () => {
    const before = {
      totalDocuments: 0,
      pendingDocuments: 0,
      processedDocuments: 0,
      lowQualityDocuments: 0,
      failedDocuments: 0,
      totalChunks: 300,
      embeddedChunks: 10,
      pendingChunks: 290,
    }
    const latest = { ...before, embeddedChunks: 155, pendingChunks: 145 }

    const progress = getLabOperationProgress('embeddings', before, latest)

    expect(progress.completed).toBe(145)
    expect(progress.total).toBe(290)
    expect(progress.percentage).toBe(50)
    expect(progress.pending).toBe(145)
  })

  it('exposes the process steps shown while running', () => {
    expect(getLabOperationSteps('process')).toContain('Aplicar quality gate y OCR')
    expect(getLabOperationSteps('embeddings')).toContain('Generar vectores')
  })
})
