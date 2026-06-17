/**
 * SDD 008 — tipos del creador de matriz y minuta DOCX.
 *
 * Espejo de los contratos API (`specs/008-creador-matriz/contracts/`):
 * snake_case en payloads del API, camelCase solo en atributos de nodos
 * ProseMirror (variableKey/blockKey/arrayKey/conditionKey, research D2).
 */

// ─── ProseMirror JSON canónico (schema_version 1, research D2) ───────────────

export type MatrizSchemaVersion = 1

/** Formato de render de un token: palabras legales vía motor compartido. */
export type TokenFormat = 'words' | 'date_words' | 'rut_words'

export interface TextNodeJson {
  type: 'text'
  text: string
}

export interface VariableTokenJson {
  type: 'variable_token'
  attrs: {
    variableKey: string
    label: string
    format?: TokenFormat | null
  }
}

/** Bloque aprobado de título (no editable inline en la matriz, FR-004). */
export interface BlockTokenJson {
  type: 'block_token'
  attrs: {
    blockKey: string
    label?: string | null
  }
}

export interface ParagraphNodeJson {
  type: 'paragraph'
  content?: InlineNodeJson[]
}

export interface RepeatSectionJson {
  type: 'repeat_section'
  attrs: {
    arrayKey: string
  }
  content: BlockNodeJson[]
}

export type ConditionMode = 'omit' | 'block'

export interface ConditionalSectionJson {
  type: 'conditional_section'
  attrs: {
    conditionKey: string
    mode: ConditionMode
  }
  content: BlockNodeJson[]
}

export type InlineNodeJson = TextNodeJson | VariableTokenJson
export type BlockNodeJson =
  | ParagraphNodeJson
  | BlockTokenJson
  | RepeatSectionJson
  | ConditionalSectionJson

export interface ClauseContentJson {
  schema_version: MatrizSchemaVersion
  type: 'doc'
  content: BlockNodeJson[]
}

// ─── Biblioteca de plantillas ────────────────────────────────────────────────

export type TemplateStatus = 'draft' | 'published' | 'retired'

export type AlertTipo =
  | 'dl_3516'
  | 'derechos_aguas'
  | 'vigente_en_el_resto'
  | 'multi_inmueble'
  | 'gravamen'
  | 'personeria_requerida'
  | 'discrepancia_declaracion'
  | 'otro'

export interface TemplateClause {
  id: string
  clause_key: string
  title: string
  position: number
  fixed_position: boolean
  content_json: ClauseContentJson
  condition_key: string | null
  condition_mode: ConditionMode | null
  alert_tipo: AlertTipo | null
}

export interface EscrituraTemplateSummary {
  id: string
  name: string
  document_type: string
  version: number
  status: TemplateStatus
  published_at: string | null
  clause_count: number
  updated_at: string
}

export interface EscrituraTemplateDetail extends EscrituraTemplateSummary {
  clauses: TemplateClause[]
}

export interface TemplateListResponse {
  templates: EscrituraTemplateSummary[]
  // SDD 010 FR-014: catalogo canonico para el picker del editor de plantillas,
  // servido para no derivar de una copia hardcodeada. Opcional para tolerar
  // respuestas previas a la extension.
  insertable_variables?: InsertableVariable[]
}

export interface TemplateCreateRequest {
  name: string
  document_type?: string
  clone_from_template_id?: string | null
}

export interface TemplatePublishRequest {
  published_by: string
}

export interface ClauseUpsertRequest {
  title: string
  position: number
  fixed_position: boolean
  content_json: ClauseContentJson
  condition_key?: string | null
  condition_mode?: ConditionMode | null
  alert_tipo?: AlertTipo | null
}

/** 422 del upsert de cláusula: claves fuera del catálogo (FR-015). */
export interface InvalidTemplateKey {
  key: string
  reason: 'unknown_key' | 'removed_key' | 'invalid_node'
  suggested_migration: string | null
  display_text?: string | null
  suggested_label?: string | null
}

// ─── Matriz por caso ─────────────────────────────────────────────────────────

export type MatrizStatus = 'draft' | 'legal_review_pending' | 'approved' | 'superseded'

/** SDD 011 (data-model §1): scope de la matriz. `project` => escritura_case_id
 * null ("esperando ventas"); `lot` => borrador instanciado al validar la venta. */
export type MatrizScope = 'project' | 'lot'

/** Estados de variable del snapshot (SDD 007). */
export type SnapshotVariableState =
  | 'proposed'
  | 'resolved'
  | 'approved'
  | 'derived'
  | 'not_applicable'

export interface MatrizEvidenceRef {
  legal_document_id: string | null
  legal_document_page_id: string | null
  page_number: number | null
  snippet: string | null
}

export type TokenResolutionStatus = 'resolved' | 'missing' | 'blocked'

export interface TokenResolution {
  variableKey: string
  status: TokenResolutionStatus
  value_text: string | null
  state: SnapshotVariableState | null
  source_type: string | null
  evidence_refs: MatrizEvidenceRef[]
  /** SDD 010: campos humanos del manifiesto (opcionales en manifiestos pre-010). */
  label?: string | null
  category?: string | null
  category_label?: string | null
  /** Origen operacional descrito; solo cuando no hay evidencia documental. */
  source_label?: string | null
}

export interface BlockResolution {
  blockKey: string
  status: TokenResolutionStatus
  text: string | null
  label?: string | null
}

/** Manifiesto del resolutor único server-side (research D6). */
export interface ResolutionManifest {
  tokens: TokenResolution[]
  blocks: BlockResolution[]
  missing_count: number
}

/** SDD 010 (FR-005): pendiente redactado server-side; la UI no traduce códigos. */
export interface BlockerMicrocopyFields {
  title?: string | null
  description?: string | null
  action_label?: string | null
  action_href?: string | null
}

export type ApprovalBlocker = BlockerMicrocopyFields &
  (
    | {
        kind: 'token_missing'
        key: string
        fix_url: string
        message?: string | null
      }
    | {
        kind: 'readiness_gate'
        gate: string
        cause: string | null
        fix_url: string
        message?: string | null
      }
    | {
        kind: 'alert_clause_missing'
        alert_tipo: AlertTipo
        required_clause: string
      }
    | {
        kind: 'snapshot_stale'
        message: string
        fix_url?: string | null
      }
  )

/** Razón visible de alertas descartadas (sidebar de revisión, FR-008). */
export interface DismissedAlert {
  tipo: AlertTipo
  reason: string | null
}

export interface MatrizClauseCondition {
  key: string
  mode: ConditionMode
  active: boolean
}

export interface MatrizClauseView {
  clause_key: string
  title: string
  position: number
  fixed_position: boolean
  content_json: ClauseContentJson
  resolved_content: ClauseContentJson | null
  overridden: boolean
  disabled: boolean
  condition: MatrizClauseCondition | null
  alert_tipo: AlertTipo | null
  /** SDD 010 (FR-010): explicación humana cuando la condición no se cumple. */
  omitted_reason?: string | null
}

/** Override local por cláusula dentro de `escritura_matrices.clause_overrides`. */
export interface MatrizClauseOverride {
  disabled?: boolean
  title?: string
  content_json?: ClauseContentJson
}

export interface MatrizTemplateRef {
  id: string
  name: string
  version: number
}

export interface MatrizView {
  id: string
  /** SDD 011: null => matriz de la escritura del PROYECTO (esperando ventas);
   * presente => borrador del lote. */
  escritura_case_id: string | null
  project_id: string
  status: MatrizStatus
  version: number
  /** SDD 011: discriminador de scope (deriva de escritura_case_id; expuesto
   * para no inferir desde null en la mesa/web). */
  scope: MatrizScope
  /** SDD 011 (FR-012): matriz de proyecto desde la que se instanció este
   * borrador del lote (solo en scope `lot`). */
  source_project_matriz_id: string | null
  template: MatrizTemplateRef
  snapshot_stale: boolean
  clause_order: string[]
  clauses: MatrizClauseView[]
  resolution: ResolutionManifest
  approval_blockers: ApprovalBlocker[]
  dismissed_alerts: DismissedAlert[]
}

/** SDD 010 (research D6): catálogo humanizado para el picker "Insertar dato". */
export interface InsertableVariable {
  key: string
  label: string
  category: string
  category_label: string
}

export interface MatrizCaseResponse {
  matriz: MatrizView
  insertable_variables?: InsertableVariable[]
}

export interface MatrizSaveRequest {
  version: number
  clause_order: string[]
  clause_overrides: Record<string, MatrizClauseOverride>
}

export type MatrizSubmitRequest = Record<string, never>

export type MatrizApproveRequest = Record<string, never>

export interface MatrizRejectRequest {
  reason: string
}

// ─── Generaciones de minuta ──────────────────────────────────────────────────

export interface MinutaGeneration {
  id: string
  project_id?: string | null
  project_name?: string | null
  lot_id?: string | null
  lot_label?: string | null
  escritura_case_id: string
  matriz_id: string
  matriz_version: number
  template_id: string
  snapshot_hash: string
  content_hash: string
  storage_path: string
  warning_acknowledged_by: string
  warning_acknowledged_at: string
  generated_by: string | null
  generated_at: string
  download_url: string | null
}

export interface MinutaGenerationListResponse {
  generations: MinutaGeneration[]
}

export interface GenerateMinutaRequest {
  warning_acknowledged: boolean
}

// ─── Puente operacional (US6) ────────────────────────────────────────────────

export interface StageOperationalResult {
  proposed: string[]
  skipped_same_hash: string[]
  superseded: string[]
  missing: string[]
  /** Claves con estado revisado (approved/resolved/not_applicable): el puente no las toca. */
  protected: string[]
}

// ─── Entrega del borrador al vendedor (SDD 011, data-model §4) ────────────────

export type DeliveryChannel = 'telegram' | 'web'

export type DeliveryStatus = 'pending' | 'sent' | 'failed' | 'unavailable' | 'expired'

/** Entrega auditada del borrador aceptado. El `link_token` crudo NUNCA viaja
 * al cliente (el contrato server-side lo descarta): solo la URL firmada lista
 * para descargar y la frase de estado del diccionario único (FR-010/FR-014). */
export interface EscrituraDeliveryView {
  id: string
  escritura_case_id: string
  generation_id: string
  recipient_user_id: string | null
  channel: DeliveryChannel
  status: DeliveryStatus
  link_expires_at: string | null
  sent_at: string | null
  created_at: string
  download_url: string | null
  status_label: string | null
}

export interface EscrituraDeliveryListResponse {
  deliveries: EscrituraDeliveryView[]
}

/** Disparo de entrega al aceptar el borrador (US4): destinatario por defecto el
 * vendedor asignado; `channels` controla Telegram/web. */
export interface DeliverDraftRequest {
  recipient_user_id?: string | null
  channels?: DeliveryChannel[]
}

/** El vendedor renueva el enlace vencido desde "mis documentos" (FR-010). */
export interface RenewDeliveryLinkRequest {
  requested_by: string
}
