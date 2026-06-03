export const LAB_ESCRITURAS_BUCKET = 'lab-escrituras-documents'

export const LAB_SOURCE_FORMATS = ['pdf', 'docx', 'doc', 'rtf'] as const

export type LabSourceFormat = (typeof LAB_SOURCE_FORMATS)[number]

export const LAB_ACCEPT_ATTRIBUTE = '.pdf,.doc,.docx,.rtf'

export const LAB_SUPPORTED_UPLOADS: Record<
  LabSourceFormat,
  { extension: string; contentType: string; label: string }
> = {
  pdf: { extension: 'pdf', contentType: 'application/pdf', label: 'PDF' },
  docx: {
    extension: 'docx',
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    label: 'DOCX',
  },
  doc: { extension: 'doc', contentType: 'application/msword', label: 'DOC' },
  rtf: { extension: 'rtf', contentType: 'application/rtf', label: 'RTF' },
}

export const LAB_DOCUMENT_TYPES = [
  { value: 'escritura', label: 'Escritura' },
  { value: 'dominio_vigente', label: 'Dominio vigente' },
  { value: 'roles_sii', label: 'Roles SII' },
  { value: 'plano', label: 'Plano' },
  { value: 'certificado_sag', label: 'Certificado SAG' },
  { value: 'personeria', label: 'Personeria' },
  { value: 'otro', label: 'Otro' },
] as const

export type LabDocumentType = (typeof LAB_DOCUMENT_TYPES)[number]['value']

export interface LabSourceDocument {
  id: string
  run_id: string | null
  original_filename: string
  document_type: LabDocumentType
  source_format: LabSourceFormat
  content_type: string
  size_bytes: number
  sha256: string
  storage_bucket: string
  storage_path: string
  processing_status: string
  detected_pdf_type: string | null
  detection_confidence: number | null
  page_count: number | null
  error_message: string | null
  created_at: string
  updated_at: string
}

export interface LabVariableCandidate {
  id: string
  canonical_variable: string
  proposed_value: string | null
  confidence: number
  evidence: string
  future_source: string
  source_table: string | null
  source_field: string | null
  status: string
  created_at: string
}

export interface LabTemplateCandidate {
  id: string
  name: string
  document_type: string
  draft_markdown: string
  status: string
  created_at: string
}

export interface LabSourceMapEntry {
  id: string
  canonical_variable: string
  future_source: string
  source_table: string | null
  source_field: string | null
  rationale: string
  status: string
  created_at: string
}

export interface LabPayload {
  documents: LabSourceDocument[]
  variables: LabVariableCandidate[]
  templates: LabTemplateCandidate[]
  sourceMap: LabSourceMapEntry[]
  embeddingStats: {
    totalChunks: number
    embeddedChunks: number
    pendingChunks: number
  }
  documentStats: {
    totalDocuments: number
    pendingDocuments: number
  }
  setupRequired: boolean
  error?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object'
}

function arrayOrEmpty<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function numberOrDefault(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function normalizeLabPayload(value: unknown): LabPayload {
  const payload = isRecord(value) ? value : {}
  const documents = arrayOrEmpty<LabSourceDocument>(payload.documents)
  const variables = arrayOrEmpty<LabVariableCandidate>(payload.variables)
  const templates = arrayOrEmpty<LabTemplateCandidate>(payload.templates)
  const sourceMap = arrayOrEmpty<LabSourceMapEntry>(payload.sourceMap)
  const embeddingStats = isRecord(payload.embeddingStats) ? payload.embeddingStats : {}
  const documentStats = isRecord(payload.documentStats) ? payload.documentStats : {}
  const pendingDocuments = documents.filter((document) =>
    ['uploaded', 'pending'].includes(document.processing_status)
  ).length

  return {
    documents,
    variables,
    templates,
    sourceMap,
    embeddingStats: {
      totalChunks: numberOrDefault(embeddingStats.totalChunks, 0),
      embeddedChunks: numberOrDefault(embeddingStats.embeddedChunks, 0),
      pendingChunks: numberOrDefault(embeddingStats.pendingChunks, 0),
    },
    documentStats: {
      totalDocuments: numberOrDefault(documentStats.totalDocuments, documents.length),
      pendingDocuments: numberOrDefault(documentStats.pendingDocuments, pendingDocuments),
    },
    setupRequired: payload.setupRequired === true,
    ...(typeof payload.error === 'string' ? { error: payload.error } : {}),
  }
}

export function isLabDocumentType(value: string): value is LabDocumentType {
  return LAB_DOCUMENT_TYPES.some((type) => type.value === value)
}

export function isLabSourceFormat(value: string): value is LabSourceFormat {
  return LAB_SOURCE_FORMATS.includes(value as LabSourceFormat)
}

export function sanitizeFileName(fileName: string) {
  return fileName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140)
}
