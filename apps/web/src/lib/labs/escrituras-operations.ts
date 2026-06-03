import { normalizeLabPayload } from './escrituras'

export type LabOperationKind = 'process' | 'embeddings'

export interface LabOperationSnapshot {
  totalDocuments: number
  pendingDocuments: number
  processedDocuments: number
  lowQualityDocuments: number
  failedDocuments: number
  totalChunks: number
  embeddedChunks: number
  pendingChunks: number
}

export interface LabOperationProgress {
  total: number
  completed: number
  percentage: number
  label: string
  currentItem?: string
  pending: number
  processedDelta: number
  lowQualityDelta: number
  failedDelta: number
  chunksDelta: number
  embeddedDelta: number
}

export function getLabOperationSnapshot(payload: unknown): LabOperationSnapshot {
  const normalizedPayload = normalizeLabPayload(payload)

  return {
    totalDocuments:
      normalizedPayload.documentStats?.totalDocuments ?? normalizedPayload.documents.length,
    pendingDocuments:
      normalizedPayload.documentStats?.pendingDocuments ??
      normalizedPayload.documents.filter((document) =>
        ['uploaded', 'pending'].includes(document.processing_status)
      ).length,
    processedDocuments: normalizedPayload.documents.filter(
      (document) => document.processing_status === 'processed'
    ).length,
    lowQualityDocuments: normalizedPayload.documents.filter(
      (document) => document.processing_status === 'low_quality_extraction'
    ).length,
    failedDocuments: normalizedPayload.documents.filter(
      (document) => document.processing_status === 'failed'
    ).length,
    totalChunks: normalizedPayload.embeddingStats.totalChunks,
    embeddedChunks: normalizedPayload.embeddingStats.embeddedChunks,
    pendingChunks: normalizedPayload.embeddingStats.pendingChunks,
  }
}

export function getLabOperationSummary(
  kind: LabOperationKind,
  before: LabOperationSnapshot,
  after: LabOperationSnapshot
) {
  if (kind === 'embeddings') {
    return [
      { label: 'Chunks pendientes al iniciar', value: before.pendingChunks },
      {
        label: 'Embeddings generados',
        value: Math.max(after.embeddedChunks - before.embeddedChunks, 0),
      },
      { label: 'Chunks pendientes al cerrar', value: after.pendingChunks },
      { label: 'Chunks vectorizados totales', value: after.embeddedChunks },
    ]
  }

  return [
    { label: 'Documentos pendientes al iniciar', value: before.pendingDocuments },
    {
      label: 'Documentos procesados nuevos',
      value: Math.max(after.processedDocuments - before.processedDocuments, 0),
    },
    {
      label: 'Baja calidad nuevos',
      value: Math.max(after.lowQualityDocuments - before.lowQualityDocuments, 0),
    },
    {
      label: 'Documentos fallidos nuevos',
      value: Math.max(after.failedDocuments - before.failedDocuments, 0),
    },
    {
      label: 'Chunks generados nuevos',
      value: Math.max(after.totalChunks - before.totalChunks, 0),
    },
  ]
}

export function getCurrentProcessingDocument(payload: unknown) {
  return (
    normalizeLabPayload(payload).documents.find(
      (document) => document.processing_status === 'processing'
    ) ?? null
  )
}

export function getLabOperationProgress(
  kind: LabOperationKind,
  before: LabOperationSnapshot,
  latest: LabOperationSnapshot,
  currentItem?: string
): LabOperationProgress {
  if (kind === 'embeddings') {
    const total = Math.max(before.pendingChunks, 0)
    const completed = Math.min(Math.max(latest.embeddedChunks - before.embeddedChunks, 0), total)
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 100

    return {
      total,
      completed,
      percentage,
      label: `${completed}/${total} chunks vectorizados`,
      currentItem,
      pending: latest.pendingChunks,
      processedDelta: 0,
      lowQualityDelta: 0,
      failedDelta: 0,
      chunksDelta: Math.max(latest.totalChunks - before.totalChunks, 0),
      embeddedDelta: completed,
    }
  }

  const processedDelta = Math.max(latest.processedDocuments - before.processedDocuments, 0)
  const lowQualityDelta = Math.max(latest.lowQualityDocuments - before.lowQualityDocuments, 0)
  const failedDelta = Math.max(latest.failedDocuments - before.failedDocuments, 0)
  const completed = processedDelta + lowQualityDelta + failedDelta
  const total = Math.max(before.pendingDocuments, completed)
  const percentage = total > 0 ? Math.round((Math.min(completed, total) / total) * 100) : 100

  return {
    total,
    completed,
    percentage,
    label: `${completed}/${total} documentos finalizados`,
    currentItem,
    pending: latest.pendingDocuments,
    processedDelta,
    lowQualityDelta,
    failedDelta,
    chunksDelta: Math.max(latest.totalChunks - before.totalChunks, 0),
    embeddedDelta: Math.max(latest.embeddedChunks - before.embeddedChunks, 0),
  }
}

export function getLabOperationSteps(kind: LabOperationKind) {
  if (kind === 'embeddings') {
    return [
      'Preparar chunks pendientes',
      'Generar vectores',
      'Guardar embeddings',
      'Actualizar panel',
    ]
  }

  return [
    'Preparar documentos pendientes',
    'Convertir a Markdown',
    'Aplicar quality gate y OCR',
    'Guardar paginas y chunks',
    'Actualizar panel',
  ]
}
