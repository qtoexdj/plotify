"""Pydantic contracts for SDD 008 matriz builder and minuta generation.

Mirrors `specs/008-creador-matriz/contracts/api-contracts.md`. Clause content
travels as raw ProseMirror JSON (`schema_version: 1`, research D2); deep node
validation lives in `services/matriz_template_validation.py`, not here.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

TEMPLATE_STATUSES = ("draft", "published", "retired")
MATRIZ_STATUSES = ("draft", "legal_review_pending", "approved", "superseded")
CONDITION_MODES = ("omit", "block")
TOKEN_RESOLUTION_STATUSES = ("resolved", "missing", "blocked")
# SDD 011 (data-model §1): scope de la matriz. proyecto => escritura_case_id
# NULL ("esperando ventas"); lote => borrador instanciado al validar la venta.
MATRIZ_SCOPES = ("project", "lot")
# SDD 011 (data-model §4): entrega del borrador al vendedor.
DELIVERY_CHANNELS = ("telegram", "web")
DELIVERY_STATUSES = ("pending", "sent", "failed", "unavailable", "expired")

TemplateStatus = Literal["draft", "published", "retired"]
MatrizStatus = Literal["draft", "legal_review_pending", "approved", "superseded"]
ConditionMode = Literal["omit", "block"]
TokenResolutionStatus = Literal["resolved", "missing", "blocked"]
MatrizScope = Literal["project", "lot"]
DeliveryChannel = Literal["telegram", "web"]
DeliveryStatus = Literal["pending", "sent", "failed", "unavailable", "expired"]


class MatrizBaseModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class MatrizResponseModel(BaseModel):
    model_config = ConfigDict(extra="ignore")


# SDD 010 (research D6): catalogo humanizado para el picker "Insertar dato".
# Fuente unica para la mesa (manifiesto) y el editor de plantillas.
class InsertableVariable(MatrizResponseModel):
    key: str
    label: str
    category: str
    category_label: str


# ─── Biblioteca de plantillas ────────────────────────────────────────────────


class TemplateClause(MatrizResponseModel):
    id: UUID | None = None
    clause_key: str
    title: str
    position: int
    fixed_position: bool = False
    content_json: dict[str, Any]
    condition_key: str | None = None
    condition_mode: ConditionMode | None = None
    alert_tipo: str | None = None


class EscrituraTemplateSummary(MatrizResponseModel):
    id: UUID
    name: str
    document_type: str
    version: int
    status: TemplateStatus
    published_at: datetime | None = None
    clause_count: int = 0
    updated_at: datetime | None = None


class EscrituraTemplateDetail(EscrituraTemplateSummary):
    clauses: list[TemplateClause] = Field(default_factory=list)


class TemplateListResponse(MatrizResponseModel):
    templates: list[EscrituraTemplateSummary] = Field(default_factory=list)
    # Catalogo canonico para el picker del editor de plantillas (FR-014): el
    # mismo que la mesa, servido para evitar una copia que derive del catalogo.
    insertable_variables: list[InsertableVariable] = Field(default_factory=list)


class TemplateCreateRequest(MatrizBaseModel):
    name: str = Field(min_length=1, max_length=200)
    document_type: str = "compraventa"
    clone_from_template_id: UUID | None = None


class TemplatePublishRequest(MatrizBaseModel):
    published_by: UUID


class ClauseUpsertRequest(MatrizBaseModel):
    title: str = Field(min_length=1, max_length=300)
    position: int = Field(ge=0)
    fixed_position: bool = False
    content_json: dict[str, Any]
    condition_key: str | None = None
    condition_mode: ConditionMode | None = None
    alert_tipo: str | None = None


class InvalidTemplateKey(MatrizResponseModel):
    key: str
    reason: Literal["unknown_key", "removed_key", "invalid_node"]
    suggested_migration: str | None = None
    display_text: str | None = None
    suggested_label: str | None = None


class TemplateValidationErrorResponse(MatrizResponseModel):
    code: str = "invalid_keys"
    message: str
    invalid_keys: list[InvalidTemplateKey] = Field(default_factory=list)


# ─── Resolución de tokens (manifiesto, research D6) ──────────────────────────


class MatrizEvidenceRef(MatrizResponseModel):
    legal_document_id: str | None = None
    legal_document_page_id: str | None = None
    page_number: int | None = None
    snippet: str | None = None


class TokenResolution(MatrizResponseModel):
    variableKey: str
    status: TokenResolutionStatus
    value_text: str | None = None
    state: str | None = None
    source_type: str | None = None
    evidence_refs: list[MatrizEvidenceRef] = Field(default_factory=list)
    # SDD 010 (contracts/api-contracts.md §1): campos humanos aditivos.
    # Opcionales para tolerar manifiestos persistidos antes de SDD 010.
    label: str | None = None
    category: str | None = None
    category_label: str | None = None
    source_label: str | None = None


class BlockResolution(MatrizResponseModel):
    blockKey: str
    status: TokenResolutionStatus
    text: str | None = None
    label: str | None = None


class ResolutionManifest(MatrizResponseModel):
    tokens: list[TokenResolution] = Field(default_factory=list)
    blocks: list[BlockResolution] = Field(default_factory=list)
    missing_count: int = 0


# ─── Blockers de aprobación (FR-007) ─────────────────────────────────────────


class ApprovalBlocker(MatrizResponseModel):
    kind: Literal[
        "token_missing",
        "readiness_gate",
        "alert_clause_missing",
        "snapshot_stale",
    ]
    key: str | None = None
    gate: str | None = None
    cause: str | None = None
    alert_tipo: str | None = None
    required_clause: str | None = None
    fix_url: str | None = None
    message: str | None = None
    # SDD 010 (FR-005): pendiente humanizado redactado server-side.
    title: str | None = None
    description: str | None = None
    action_label: str | None = None
    action_href: str | None = None


class DismissedAlert(MatrizResponseModel):
    tipo: str
    reason: str | None = None


# ─── Matriz por caso ─────────────────────────────────────────────────────────


class MatrizClauseCondition(MatrizResponseModel):
    key: str
    mode: ConditionMode
    active: bool


class MatrizClauseView(MatrizResponseModel):
    clause_key: str
    title: str
    position: int
    fixed_position: bool
    content_json: dict[str, Any]
    resolved_content: dict[str, Any] | None = None
    overridden: bool = False
    disabled: bool = False
    condition: MatrizClauseCondition | None = None
    alert_tipo: str | None = None
    # SDD 010 (FR-010): explicacion humana cuando la condicion no se cumple.
    omitted_reason: str | None = None


class MatrizTemplateRef(MatrizResponseModel):
    id: UUID
    name: str
    version: int


class MatrizView(MatrizResponseModel):
    id: UUID
    # SDD 011 (data-model §1): NULL => matriz de la escritura del PROYECTO
    # (scope proyecto, "esperando ventas"); presente => borrador del lote.
    escritura_case_id: UUID | None = None
    project_id: UUID
    status: MatrizStatus
    version: int
    # SDD 011: discriminador explicito de scope para la mesa/web; deriva de
    # escritura_case_id pero se expone para no inferir desde null. Default
    # "lot" preserva la construccion existente (aditividad).
    scope: MatrizScope = "lot"
    # SDD 011 (FR-012): matriz de proyecto desde la que se instancio este
    # borrador del lote (solo en scope lote).
    source_project_matriz_id: UUID | None = None
    template: MatrizTemplateRef
    snapshot_stale: bool = False
    clause_order: list[str] = Field(default_factory=list)
    clauses: list[MatrizClauseView] = Field(default_factory=list)
    resolution: ResolutionManifest = Field(default_factory=ResolutionManifest)
    approval_blockers: list[ApprovalBlocker] = Field(default_factory=list)
    dismissed_alerts: list[DismissedAlert] = Field(default_factory=list)


class MatrizCaseResponse(MatrizResponseModel):
    matriz: MatrizView
    insertable_variables: list[InsertableVariable] = Field(default_factory=list)


class MatrizClauseOverride(MatrizBaseModel):
    disabled: bool | None = None
    title: str | None = None
    content_json: dict[str, Any] | None = None


class MatrizSaveRequest(MatrizBaseModel):
    version: int = Field(ge=1)
    clause_order: list[str] = Field(default_factory=list)
    clause_overrides: dict[str, MatrizClauseOverride] = Field(default_factory=dict)


class MatrizSubmitRequest(MatrizBaseModel):
    submitted_by: UUID


class MatrizApproveRequest(MatrizBaseModel):
    approved_by: UUID


class MatrizRejectRequest(MatrizBaseModel):
    rejected_by: UUID
    reason: str = Field(min_length=1, max_length=2000)


# ─── Generaciones de minuta ──────────────────────────────────────────────────


class GenerateMinutaRequest(MatrizBaseModel):
    warning_acknowledged: bool
    generated_by: UUID


class MinutaGeneration(MatrizResponseModel):
    id: UUID
    escritura_case_id: UUID
    matriz_id: UUID
    matriz_version: int
    template_id: UUID
    snapshot_hash: str
    content_hash: str
    storage_path: str
    warning_acknowledged_by: UUID
    warning_acknowledged_at: datetime
    generated_by: UUID | None = None
    generated_at: datetime
    download_url: str | None = None


class MinutaGenerationListResponse(MatrizResponseModel):
    generations: list[MinutaGeneration] = Field(default_factory=list)


# ─── Puente operacional (US6) ────────────────────────────────────────────────


class StageOperationalResult(MatrizResponseModel):
    proposed: list[str] = Field(default_factory=list)
    skipped_same_hash: list[str] = Field(default_factory=list)
    superseded: list[str] = Field(default_factory=list)
    missing: list[str] = Field(default_factory=list)
    # Claves con estado revisado por humano (approved/resolved/not_applicable)
    # que el puente jamás toca (FR-021).
    protected: list[str] = Field(default_factory=list)


# ─── Entrega del borrador al vendedor (SDD 011, data-model §4) ────────────────


class EscrituraDeliveryView(MatrizResponseModel):
    id: UUID
    escritura_case_id: UUID
    generation_id: UUID
    recipient_user_id: UUID | None = None
    channel: DeliveryChannel
    status: DeliveryStatus
    link_expires_at: datetime | None = None
    sent_at: datetime | None = None
    created_at: datetime
    # Campos humanos/resueltos: URL firmada lista para descargar y la frase de
    # estado del diccionario unico (FR-014). El `link_token` crudo NUNCA viaja
    # en el contrato (secreto): `extra="ignore"` lo descarta si llega.
    download_url: str | None = None
    status_label: str | None = None


class EscrituraDeliveryListResponse(MatrizResponseModel):
    deliveries: list[EscrituraDeliveryView] = Field(default_factory=list)


class DeliverDraftRequest(MatrizBaseModel):
    # Disparo de entrega al aceptar el borrador (US4, FR-010). El destinatario
    # por defecto es el vendedor asignado; `channels` controla Telegram/web.
    recipient_user_id: UUID | None = None
    channels: list[DeliveryChannel] = Field(
        default_factory=lambda: ["telegram", "web"]
    )


class RenewDeliveryLinkRequest(MatrizBaseModel):
    # El vendedor renueva el enlace vencido desde "mis documentos" sin
    # intervencion del administrador (FR-010, edge case enlace vencido).
    requested_by: UUID


# ─── Trazabilidad del flujo por escritura (SDD 011 T020, FR-012) ─────────────

TRACE_EVENT_KINDS = (
    "project_matriz_approved",
    "sale_validated",
    "draft_generated",
    "draft_accepted",
    "delivered",
)
TraceEventKind = Literal[
    "project_matriz_approved",
    "sale_validated",
    "draft_generated",
    "draft_accepted",
    "delivered",
]


class EscrituraTraceEvent(MatrizResponseModel):
    kind: TraceEventKind
    label: str
    at: datetime | None = None
    actor_id: UUID | None = None
    # Campos opcionales segun el evento.
    matriz_version: int | None = None
    approval_id: UUID | None = None
    input_keys: list[str] = Field(default_factory=list)
    channel: DeliveryChannel | None = None
    status: DeliveryStatus | None = None
    recipient_user_id: UUID | None = None


class EscrituraTraceResponse(MatrizResponseModel):
    escritura_case_id: UUID
    source_project_matriz_id: UUID | None = None
    events: list[EscrituraTraceEvent] = Field(default_factory=list)
