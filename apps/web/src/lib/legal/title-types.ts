export type TitleAnalysisStatus =
  // Sintético: hay documentos de título activos pero ningún análisis vigente.
  | 'not_started'
  | 'processing'
  | 'proposed'
  | 'needs_review'
  | 'failed'
  | 'llm_disabled'
  | 'approved'
  | 'superseded'

export type TitleStructureType =
  | 'dominio_unico'
  | 'multiples_dominios'
  | 'compra_derechos'
  | 'herencia'
  | 'mixto'

export interface EvidenceRef {
  legal_document_id: string
  page_number: number
  snippet: string
}

export interface EvidencedValue<T> {
  value: T
  evidence: EvidenceRef | null
  confidence: number | null
  verified: boolean | null
}

export interface Deslindes {
  norte: EvidencedValue<string | null>
  sur: EvidencedValue<string | null>
  oriente: EvidencedValue<string | null>
  poniente: EvidencedValue<string | null>
}

export interface PropertyIdentity {
  nombre_predio: EvidencedValue<string | null>
  ubicacion: EvidencedValue<string | null>
  comuna: EvidencedValue<string | null>
  provincia: EvidencedValue<string | null>
  region: EvidencedValue<string | null>
  superficie_texto: EvidencedValue<string | null>
  deslindes: Deslindes
  rol_avaluo: EvidencedValue<string | null>
}

export type AdquisicionTipo =
  | 'compra'
  | 'compra_derechos'
  | 'herencia_posesion_efectiva'
  | 'herencia_inscripcion_especial'
  | 'cesion_derechos'
  | 'otro'

export interface Adquirente {
  nombre: EvidencedValue<string>
  cuota: string
}

export interface InscriptionDetails {
  fojas: EvidencedValue<string>
  numero: EvidencedValue<string>
  anio: EvidencedValue<string>
  cbr: EvidencedValue<string>
}

export interface EscrituraDetails {
  fecha: EvidencedValue<string | null>
  notario: EvidencedValue<string | null>
  notaria_ciudad: EvidencedValue<string | null>
  repertorio: EvidencedValue<string | null>
}

export interface RectificatoriaDetails {
  fecha: EvidencedValue<string>
  notario: EvidencedValue<string>
  repertorio: EvidencedValue<string>
}

export interface InscripcionObservacion {
  tipo: string
  evidence: EvidenceRef
}

export interface InscripcionChainLink {
  orden: number
  tipo_adquisicion: AdquisicionTipo
  adquirentes: Adquirente[]
  antecesor: {
    nombre: EvidencedValue<string>
  }
  escritura: EscrituraDetails
  rectificatorias: RectificatoriaDetails[]
  inscripcion: InscriptionDetails
  observaciones: InscripcionObservacion[]
}

export interface PropietarioActual {
  nombre: EvidencedValue<string>
  rut: EvidencedValue<string | null>
  estado_civil: EvidencedValue<string | null>
  profesion: EvidencedValue<string | null>
  domicilio: EvidencedValue<string | null>
  // FR-036: hechos con evidencia, nunca inferidos del nombre de pila.
  nacionalidad?: EvidencedValue<string | null> | null
  tratamiento?: EvidencedValue<string | null> | null
  cuota: string
  requiere_personeria: boolean
}

export type TitleAlertTipo =
  | 'dl_3516'
  | 'derechos_aguas'
  | 'vigente_en_el_resto'
  | 'multi_inmueble'
  | 'gravamen'
  | 'personeria_requerida'
  | 'discrepancia_declaracion'
  | 'otro'

export type TitleAlertResolution =
  | 'pending'
  | 'acknowledged'
  | 'clause_added'
  | 'dismissed_with_reason'

export interface TitleAlert {
  tipo: TitleAlertTipo
  detalle: string
  evidence: EvidenceRef
  resolution: TitleAlertResolution
  reason?: string
}

export interface TitleAnalysisData {
  structure_type: TitleStructureType
  property_identity: PropertyIdentity
  inscripciones: InscripcionChainLink[]
  propietarios_actuales: PropietarioActual[]
  alertas: TitleAlert[]
}

export interface TitleNarrative {
  comparecencia: {
    generated: string
    edited: string | null
    effective: string
  }
  primero: {
    generated: string
    edited: string | null
    effective: string
  }
}

export interface VerificationFailure {
  path: string
  reason: string
  proposed_snippet: string
}

export interface BlockCheckIssue {
  hecho: string
  motivo: string
}

/** FR-006: fact-check determinístico del bloque redactado por el agente. */
export interface BlockCheck {
  ok: boolean
  issues: BlockCheckIssue[]
}

export interface VerificationStats {
  verified_count: number
  unverified_count: number
  failures: VerificationFailure[]
  block_checks?: Record<string, BlockCheck> | null
  agent_notes?: string[]
}

export interface PendingReviewItem {
  path: string
  state: 'manual_review' | 'conflict'
}

export interface SourceDocumentInfo {
  legal_document_id: string
  document_type: string
  filename: string
  version: number
}

export interface RunMetadata {
  extractor_name: string
  model_name: string
  prompt_version: string
  duration_ms: number
  created_at: string
}

export interface ProjectTitleCase {
  id: string
  status: TitleAnalysisStatus
  structure_type: TitleStructureType | null
  analysis: TitleAnalysisData | null
  narrative: TitleNarrative | null
  alerts: TitleAlert[]
  verification: VerificationStats | null
  pending_review: PendingReviewItem[]
  source_documents: SourceDocumentInfo[]
  run: RunMetadata | null
  approved_by: string | null
  approved_at: string | null
}

export interface ProjectTitleCaseResponse {
  analysis: ProjectTitleCase
}

export interface TitleReanalyzeResponse {
  analysis_id: string
  status: TitleAnalysisStatus
  queued: boolean
}

export interface TitleNarrativeEditPayload {
  block: 'comparecencia' | 'primero'
  edited_text: string
  reason: string
}

export interface TitleApproveBlockingItem {
  kind: 'variable' | 'alert'
  key?: string | null
  state?: string | null
  tipo?: string | null
}

export interface TitleApproveBlockingDetail {
  blocking: TitleApproveBlockingItem[]
}

/**
 * Panel-level state: the analysis statuses plus the empty state used when the
 * project has no title documents (proxy returns 404).
 */
export type TitleCasePanelState = TitleAnalysisStatus | 'no_documents'

export interface TitleAlertResolvePayload {
  resolution: Exclude<TitleAlertResolution, 'pending'>
  reason: string
}

/**
 * SDD 009 US5: blocking causes surfaced by the title_verified readiness gate
 * (escritura_readiness.py). They arrive mixed with variable keys inside
 * `blocking_variables`.
 */
export const TITLE_VERIFIED_BLOCKING_CAUSES = [
  'no_title_documents',
  'analysis_processing',
  'analysis_needs_review',
  'analysis_failed',
  'llm_disabled',
  'analysis_superseded',
  'pending_manual_review',
  'unresolved_alerts',
] as const

export type TitleVerifiedBlockingCause = (typeof TITLE_VERIFIED_BLOCKING_CAUSES)[number]

export const TITLE_VERIFIED_BLOCKING_CAUSE_LABELS = {
  no_title_documents: 'Sin documentos de titulo',
  analysis_processing: 'Analisis en curso',
  analysis_needs_review: 'Analisis en revision',
  analysis_failed: 'Analisis fallido',
  llm_disabled: 'Agente de titulo deshabilitado',
  analysis_superseded: 'Analisis supersedido',
  pending_manual_review: 'Revision manual pendiente',
  unresolved_alerts: 'Alertas sin resolver',
} as const satisfies Record<TitleVerifiedBlockingCause, string>

export function isTitleVerifiedBlockingCause(value: string): value is TitleVerifiedBlockingCause {
  return (TITLE_VERIFIED_BLOCKING_CAUSES as readonly string[]).includes(value)
}

/** In-page anchor of the title case panel inside the Centro de Control Legal. */
export const TITLE_CASE_PANEL_ANCHOR = 'title-case-panel'
