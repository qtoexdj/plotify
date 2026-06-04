export type UUID = string
export type ISODateTimeString = string

export type LegalJsonPrimitive = string | number | boolean | null
export type LegalJsonValue =
  | LegalJsonPrimitive
  | LegalJsonValue[]
  | { [key: string]: LegalJsonValue }

export const LEGAL_DOCUMENT_TYPES = [
  'dominio_vigente',
  'hipoteca_gravamen',
  'certificado_roles_sii',
  'certificado_sag',
  'plano_oficial',
  'personeria',
  'rnda',
  'instruccion_pago',
  'otro',
] as const

export type LegalDocumentType = (typeof LEGAL_DOCUMENT_TYPES)[number]

export const LEGAL_DOCUMENT_TYPE_LABELS = {
  dominio_vigente: 'Dominio vigente',
  hipoteca_gravamen: 'Hipotecas y gravamenes',
  certificado_roles_sii: 'Certificado de roles SII',
  certificado_sag: 'Certificado SAG',
  plano_oficial: 'Plano oficial',
  personeria: 'Personeria',
  rnda: 'RNDA',
  instruccion_pago: 'Instruccion de pago',
  otro: 'Otro documento',
} as const satisfies Record<LegalDocumentType, string>

export const LEGAL_UPLOAD_SOURCES = [
  'onboarding',
  'project_documents',
  'legal_control_center',
  'api',
] as const

export type LegalUploadSource = (typeof LEGAL_UPLOAD_SOURCES)[number]

export const LEGAL_EXTRACTION_STATUSES = [
  'pending',
  'queued',
  'processing',
  'text_extracted',
  'variables_proposed',
  'needs_review',
  'failed',
  'superseded',
] as const

export type LegalExtractionStatus = (typeof LEGAL_EXTRACTION_STATUSES)[number]

export const LEGAL_EXTRACTION_STATUS_LABELS = {
  pending: 'Pendiente',
  queued: 'En cola',
  processing: 'Extrayendo',
  text_extracted: 'Texto extraido',
  variables_proposed: 'Variables propuestas',
  needs_review: 'Requiere revision',
  failed: 'Error de extraccion',
  superseded: 'Reemplazado',
} as const satisfies Record<LegalExtractionStatus, string>

export const DOCUMENT_INGESTION_STATUSES = [
  'queued',
  'processing',
  'text_extracted',
  'variables_proposed',
  'failed',
  'cancelled',
] as const

export type DocumentIngestionStatus = (typeof DOCUMENT_INGESTION_STATUSES)[number]

export const DOCUMENT_CONVERTERS = ['pdf_text', 'ocr', 'docx', 'textutil_doc', 'manual'] as const

export type DocumentConverter = (typeof DOCUMENT_CONVERTERS)[number]

export const LEGAL_DOCUMENT_PAGE_KINDS = ['physical', 'logical', 'ocr_image'] as const

export type LegalDocumentPageKind = (typeof LEGAL_DOCUMENT_PAGE_KINDS)[number]

export const LEGAL_VARIABLE_GROUPS = [
  'documento',
  'revision_juridica',
  'vendedor',
  'comprador',
  'personeria',
  'matriz',
  'sag',
  'sii',
  'lote',
  'servidumbre',
  'transaccion',
  'clausulas',
  'mandato',
  'evidencia',
] as const

export type LegalVariableGroup = (typeof LEGAL_VARIABLE_GROUPS)[number]

export const LEGAL_VARIABLE_GROUP_LABELS = {
  documento: 'Documento',
  revision_juridica: 'Revision juridica',
  vendedor: 'Vendedor',
  comprador: 'Comprador',
  personeria: 'Personeria',
  matriz: 'Predio matriz',
  sag: 'SAG y plano',
  sii: 'Roles SII',
  lote: 'Lote',
  servidumbre: 'Servidumbre',
  transaccion: 'Precio y pago',
  clausulas: 'Clausulas',
  mandato: 'Mandato',
  evidencia: 'Evidencia',
} as const satisfies Record<LegalVariableGroup, string>

export const LEGAL_VARIABLE_STATES = [
  'missing',
  'proposed',
  'resolved',
  'approved',
  'manual_review',
  'conflict',
  'derived',
  'not_applicable',
  'superseded',
] as const

export type LegalVariableState = (typeof LEGAL_VARIABLE_STATES)[number]

export const LEGAL_VARIABLE_STATE_LABELS = {
  missing: 'Faltante',
  proposed: 'Propuesta',
  resolved: 'Resuelta',
  approved: 'Aprobada',
  manual_review: 'Revision manual',
  conflict: 'Conflicto',
  derived: 'Derivada',
  not_applicable: 'No aplica',
  superseded: 'Reemplazada',
} as const satisfies Record<LegalVariableState, string>

export const LEGAL_VARIABLE_SOURCE_TYPES = [
  'document',
  'system',
  'geometry',
  'derived',
  'manual',
  'legal_review',
  'post_minuta',
] as const

export type LegalVariableSourceType = (typeof LEGAL_VARIABLE_SOURCE_TYPES)[number]

export const LEGAL_VARIABLE_SOURCE_TYPE_LABELS = {
  document: 'Documento',
  system: 'Sistema',
  geometry: 'Geometria',
  derived: 'Derivada',
  manual: 'Manual',
  legal_review: 'Revision legal',
  post_minuta: 'Post minuta',
} as const satisfies Record<LegalVariableSourceType, string>

export const LEGAL_VARIABLE_SCOPES = ['project', 'lot', 'escritura_case'] as const

export type LegalVariableScope = (typeof LEGAL_VARIABLE_SCOPES)[number]

export const ROLE_STATUSES = ['missing', 'rol_en_tramite', 'definitive', 'not_applicable'] as const

export type LotRoleStatus = (typeof ROLE_STATUSES)[number]

export const ROLE_STATUS_LABELS = {
  missing: 'Sin rol',
  rol_en_tramite: 'Rol de avaluo en tramite',
  definitive: 'Rol definitivo',
  not_applicable: 'No aplica',
} as const satisfies Record<LotRoleStatus, string>

export const ROLE_MATCHING_STATUSES = [
  'matched',
  'ambiguous',
  'missing',
  'manual_override',
] as const

export type RoleMatchingStatus = (typeof ROLE_MATCHING_STATUSES)[number]

export const ROLE_MATCHING_STATUS_LABELS = {
  matched: 'Asociado',
  ambiguous: 'Ambiguo',
  missing: 'Faltante',
  manual_override: 'Ajuste manual',
} as const satisfies Record<RoleMatchingStatus, string>

export const ESCRITURA_CASE_STATUSES = [
  'draft',
  'variables_pending',
  'ready_for_minuta',
  'minuta_generated',
  'legal_review_pending',
  'minuta_approved',
  'sent_to_external',
  'cancelled',
] as const

export type EscrituraCaseStatus = (typeof ESCRITURA_CASE_STATUSES)[number]

export const READINESS_STATUSES = ['blocked', 'needs_review', 'ready'] as const

export type EscrituraReadinessStatus = (typeof READINESS_STATUSES)[number]
export type ReadinessGateStatus = EscrituraReadinessStatus

export const ESCRITURA_READINESS_GATE_KEYS = [
  'title_verified',
  'sii_verified',
  'sag_plano_verified',
  'geometry_verified',
  'party_verified',
  'price_verified',
  'legal_review_ready',
  'warning_acknowledged',
] as const

export type EscrituraReadinessGateKey = (typeof ESCRITURA_READINESS_GATE_KEYS)[number]

export const ESCRITURA_READINESS_GATE_LABELS = {
  title_verified: 'Dominio y titulo',
  sii_verified: 'Roles SII',
  sag_plano_verified: 'SAG y plano',
  geometry_verified: 'Deslindes y superficie',
  party_verified: 'Partes',
  price_verified: 'Precio y pago',
  legal_review_ready: 'Revision legal',
  warning_acknowledged: 'Advertencia legal',
} as const satisfies Record<EscrituraReadinessGateKey, string>

export const LEGAL_REVIEW_WARNING =
  'La minuta generada automaticamente debe ser revisada y aprobada por abogado antes de usarse en notaria o como instrumento final.'

export const LEGAL_REVIEW_DECISION_TYPES = [
  'approve_variable',
  'reject_variable',
  'manual_override',
  'approve_case',
  'reject_case',
  'assign_lawyer',
  'mark_not_applicable',
] as const

export type LegalReviewDecisionType = (typeof LEGAL_REVIEW_DECISION_TYPES)[number]

export const LEGAL_REVIEW_DECISION_STATUSES = ['approved', 'rejected', 'needs_changes'] as const

export type LegalReviewDecisionStatus = (typeof LEGAL_REVIEW_DECISION_STATUSES)[number]

export const LEGAL_VARIABLE_EDIT_ACTIONS = [
  'edit',
  'approve',
  'reject',
  'resolve_conflict',
  'mark_not_applicable',
  'request_review',
] as const

export type LegalVariableEditAction = (typeof LEGAL_VARIABLE_EDIT_ACTIONS)[number]

export const LEGAL_EVIDENCE_POLICIES = [
  'keep_existing',
  'replace_existing',
  'clear_existing',
  'manual_only',
] as const

export type LegalEvidencePolicy = (typeof LEGAL_EVIDENCE_POLICIES)[number]

export interface LegalStatusCounts<TStatus extends string = string> {
  total: number
  by_status: Partial<Record<TStatus, number>>
}

export interface LegalDocumentSummaryCounts {
  pages: number
  variables_proposed: number
  variables_conflict: number
  variables_missing: number
}

export interface LegalDocument {
  id: UUID
  organization_id: UUID
  project_id: UUID
  lot_id: UUID | null
  document_type: LegalDocumentType
  source_field: string | null
  storage_bucket: string
  storage_path: string
  original_filename: string
  mime_type: string
  file_size_bytes: number
  sha256_hash: string
  version_number: number
  upload_source: LegalUploadSource
  uploaded_by: UUID | null
  extraction_status: LegalExtractionStatus
  superseded_by: UUID | null
  created_at: ISODateTimeString
  updated_at: ISODateTimeString
}

export interface LegalDocumentListItem extends Pick<
  LegalDocument,
  'id' | 'document_type' | 'original_filename' | 'version_number' | 'extraction_status'
> {
  latest_job_id: UUID | null
  uploaded_at: ISODateTimeString
  summary: LegalDocumentSummaryCounts
}

export interface LegalDocumentsResponse {
  project_id: UUID
  documents: LegalDocumentListItem[]
  summary?: LegalStatusCounts<LegalExtractionStatus>
}

export interface RegisterLegalDocumentPayload {
  organization_id: UUID
  project_id: UUID
  lot_id?: UUID | null
  document_type: LegalDocumentType
  source_field?: string | null
  storage_bucket: string
  storage_path: string
  original_filename: string
  mime_type: string
  file_size_bytes: number
  sha256_hash: string
  upload_source: LegalUploadSource
  uploaded_by?: UUID | null
}

export interface RegisterLegalDocumentResponse {
  legal_document_id: UUID
  ingestion_job_id: UUID
  extraction_status: LegalExtractionStatus
  version_number: number
}

export interface RetryLegalDocumentResponse extends RegisterLegalDocumentResponse {
  attempt_number: number
}

export interface DocumentIngestionStats {
  pages?: number
  char_count?: number
  token_count?: number
  ocr_confidence?: number
  [key: string]: LegalJsonValue | undefined
}

export interface DocumentIngestionJob {
  id: UUID
  organization_id: UUID
  project_id: UUID
  legal_document_id: UUID
  status: DocumentIngestionStatus
  pipeline_version: string
  converter: DocumentConverter | null
  attempt_number: number
  started_at: ISODateTimeString | null
  completed_at: ISODateTimeString | null
  error_code: string | null
  error_message: string | null
  stats: DocumentIngestionStats
  created_at: ISODateTimeString
  updated_at: ISODateTimeString
}

export interface LegalDocumentPage {
  id: UUID
  organization_id: UUID
  project_id: UUID
  legal_document_id: UUID
  ingestion_job_id: UUID
  page_number: number
  page_kind: LegalDocumentPageKind
  text_content: string
  markdown_content: string | null
  char_count: number
  checksum: string
  created_at: ISODateTimeString
}

export interface DocumentEvidence {
  id?: UUID
  organization_id?: UUID
  project_id?: UUID
  variable_resolution_id?: UUID
  legal_document_id: UUID
  legal_document_page_id?: UUID | null
  document_type?: LegalDocumentType
  document_name?: string
  page_number?: number | null
  page_kind?: LegalDocumentPageKind | null
  chunk_index?: number | null
  snippet?: string | null
  snippet_hash?: string | null
  bbox?: LegalJsonValue | null
  confidence?: number | null
  source_url?: string | null
  created_at?: ISODateTimeString
}

export interface LegalVariableSourceRef {
  table?: string
  field?: string
  id?: UUID
  path?: string
  legal_document_id?: UUID
  legal_document_page_id?: UUID
  lot_id?: UUID
  [key: string]: LegalJsonValue | undefined
}

export interface LegalVariableDefinition {
  key: string
  group: LegalVariableGroup
  label: string
  description?: string
  scope: LegalVariableScope
  required: boolean
  critical?: boolean
  approval_required: boolean
  source_types: LegalVariableSourceType[]
  document_types?: LegalDocumentType[]
  readiness_gate?: EscrituraReadinessGateKey
}

export interface VariableResolution {
  id: UUID
  organization_id: UUID
  project_id: UUID
  lot_id: UUID | null
  escritura_case_id: UUID | null
  variable_key: string
  variable_group: LegalVariableGroup
  value_text: string | null
  value_json: LegalJsonValue | null
  state: LegalVariableState
  source_type: LegalVariableSourceType
  source_ref: LegalVariableSourceRef
  confidence: number | null
  extractor_name: string | null
  reviewed_by: UUID | null
  reviewed_at: ISODateTimeString | null
  approval_required: boolean
  correction_reason: string | null
  superseded_by: UUID | null
  created_at: ISODateTimeString
  updated_at: ISODateTimeString
}

export interface VariableInventoryItem extends Pick<
  VariableResolution,
  | 'id'
  | 'lot_id'
  | 'escritura_case_id'
  | 'variable_key'
  | 'variable_group'
  | 'value_text'
  | 'value_json'
  | 'state'
  | 'source_type'
  | 'confidence'
  | 'approval_required'
  | 'correction_reason'
  | 'reviewed_by'
  | 'reviewed_at'
> {
  label?: string
  description?: string
  source_ref?: LegalVariableSourceRef
  evidence: DocumentEvidence[]
}

export type VariableInventoryGroups = Partial<Record<LegalVariableGroup, VariableInventoryItem[]>>

export interface VariableInventorySummary extends Record<LegalVariableState, number> {
  total: number
  approval_required?: number
  critical_blocking?: number
}

export interface VariableInventoryQuery {
  lot_id?: UUID
  state?: LegalVariableState
  group?: LegalVariableGroup
  include_evidence?: boolean
}

export interface VariableInventoryResponse {
  project_id: UUID
  lot_id: UUID | null
  groups: VariableInventoryGroups
  summary: VariableInventorySummary
}

export interface LegalVariableEditPayload {
  action: LegalVariableEditAction
  value_text?: string | null
  value_json?: LegalJsonValue | null
  state?: LegalVariableState
  correction_reason?: string | null
  evidence_policy?: LegalEvidencePolicy
  evidence?: DocumentEvidence[]
}

export interface LegalVariableEditResponse {
  variable_resolution_id: UUID
  state: LegalVariableState
  reviewed_by: UUID | null
  reviewed_at: ISODateTimeString | null
  audit_event_id: UUID
}

export interface LotRoleMatch {
  lot_id: UUID
  lot_number: string
  sii_unit_name: string | null
  sii_role_matrix?: string | null
  sii_pre_role: string | null
  sii_role_in_process_text?: string | null
  sii_definitive_role?: string | null
  role_status: LotRoleStatus
  matching_status: RoleMatchingStatus
  matching_score?: number | null
  source_legal_document_id: UUID | null
  reviewed_by?: UUID | null
  reviewed_at?: ISODateTimeString | null
}

export interface RoleMatchingSummary extends Record<RoleMatchingStatus, number> {
  total: number
}

export interface LegalRoleMatchesResponse {
  project_id: UUID
  lots: LotRoleMatch[]
  summary: RoleMatchingSummary
}

export interface LegalRoleMatchUpdatePayload {
  sii_unit_name?: string | null
  sii_role_matrix?: string | null
  sii_pre_role?: string | null
  sii_definitive_role?: string | null
  sii_role_in_process_text?: string | null
  role_status: LotRoleStatus
  matching_status: Extract<RoleMatchingStatus, 'manual_override' | 'matched' | 'missing'>
  reason: string
}

export interface EscrituraReadinessGate {
  key: EscrituraReadinessGateKey
  status: ReadinessGateStatus
  message: string
  blocking_variables?: string[]
  evidence?: DocumentEvidence[]
}

export interface EscrituraReadinessResponse {
  lot_id: UUID
  project_id: UUID
  escritura_case_id?: UUID | null
  readiness_status: EscrituraReadinessStatus
  case_status: EscrituraCaseStatus
  gates: EscrituraReadinessGate[]
  warning: string
}

export interface VariableSnapshotValue {
  variable_key: string
  variable_group: LegalVariableGroup
  value_text: string | null
  value_json: LegalJsonValue | null
  state: Extract<LegalVariableState, 'resolved' | 'approved' | 'derived' | 'not_applicable'>
  source_type: LegalVariableSourceType
  evidence_ids?: UUID[]
}

export type VariableSnapshot = Record<string, VariableSnapshotValue>

export interface EvidenceSnapshotValue {
  variable_key: string
  evidence: DocumentEvidence[]
}

export type EvidenceSnapshot = Record<string, EvidenceSnapshotValue>

export interface EscrituraCase {
  id: UUID
  organization_id: UUID
  project_id: UUID
  lot_id: UUID
  case_status: EscrituraCaseStatus
  readiness_status: EscrituraReadinessStatus
  readiness_gates: EscrituraReadinessGate[]
  variable_snapshot: VariableSnapshot
  evidence_snapshot: EvidenceSnapshot
  template_id: UUID | null
  generated_document_id: UUID | null
  created_by: UUID | null
  created_at: ISODateTimeString
  updated_at: ISODateTimeString
}

export interface CreateEscrituraCasePayload {
  acknowledge_legal_review_required: boolean
}

export interface CreateEscrituraCaseResponse {
  escritura_case_id: UUID
  case_status: EscrituraCaseStatus
  readiness_status: EscrituraReadinessStatus
  variable_snapshot_count: number
  evidence_snapshot_count: number
}

export interface LegalReviewDecision {
  id: UUID
  organization_id: UUID
  project_id: UUID
  lot_id: UUID | null
  escritura_case_id: UUID | null
  variable_resolution_id: UUID | null
  decision_type: LegalReviewDecisionType
  decision_status: LegalReviewDecisionStatus
  reason: string | null
  lawyer_name: string | null
  lawyer_rut: string | null
  lawyer_email: string | null
  decided_by: UUID
  decided_at: ISODateTimeString
}

export interface LegalReviewDecisionPayload {
  lot_id?: UUID | null
  escritura_case_id?: UUID | null
  variable_resolution_id?: UUID | null
  decision_type: LegalReviewDecisionType
  decision_status: LegalReviewDecisionStatus
  reason?: string | null
  lawyer_name?: string | null
  lawyer_rut?: string | null
  lawyer_email?: string | null
}
