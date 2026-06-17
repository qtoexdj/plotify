"""Pydantic contracts for SDD 007 legal variable resolution."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from services import legal_variable_catalog as catalog


class LegalVariableBaseModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class LegalVariableResponseModel(BaseModel):
    model_config = ConfigDict(extra="ignore")


class LegalDocumentRegisterRequest(LegalVariableBaseModel):
    organization_id: str
    project_id: str
    lot_id: str | None = None
    document_type: str
    source_field: str | None = None
    storage_bucket: str = "project-files"
    storage_path: str
    original_filename: str
    mime_type: str
    file_size_bytes: int = Field(ge=1)
    sha256_hash: str = Field(min_length=64, max_length=64)
    upload_source: str = "api"
    uploaded_by: str | None = None
    # FR-032: multi-active document types distinguish add (None) from replace
    # (supersede only the referenced document). Rejected for single-active types.
    replaces_legal_document_id: str | None = None

    @field_validator("document_type")
    @classmethod
    def validate_document_type(cls, value: str) -> str:
        if not catalog.is_legal_document_type(value):
            raise ValueError(f"Unsupported legal document type: {value}")
        return value

    @field_validator("upload_source")
    @classmethod
    def validate_upload_source(cls, value: str) -> str:
        if value not in catalog.LEGAL_DOCUMENT_UPLOAD_SOURCE_SET:
            raise ValueError(f"Unsupported legal document upload source: {value}")
        return value

    @field_validator("sha256_hash")
    @classmethod
    def validate_sha256_hash(cls, value: str) -> str:
        normalized = value.lower()
        if any(char not in "0123456789abcdef" for char in normalized):
            raise ValueError("sha256_hash must be a lowercase or uppercase hex digest")
        return normalized


class LegalDocumentResponse(LegalVariableResponseModel):
    id: str
    organization_id: str
    project_id: str
    lot_id: str | None = None
    document_type: str
    source_field: str | None = None
    storage_bucket: str
    storage_path: str
    original_filename: str
    mime_type: str
    file_size_bytes: int
    sha256_hash: str | None = None
    version_number: int = 1
    upload_source: str
    uploaded_by: str | None = None
    extraction_status: str
    superseded_by: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class LegalDocumentRegistrationQueuedResponse(LegalVariableResponseModel):
    legal_document_id: str
    ingestion_job_id: str
    extraction_status: str
    version_number: int


class LegalDocumentRetryResponse(LegalVariableResponseModel):
    legal_document_id: str
    ingestion_job_id: str
    extraction_status: str
    attempt_number: int


class LegalDocumentArchiveResponse(LegalVariableResponseModel):
    legal_document_id: str
    extraction_status: str
    title_analysis_superseded: bool
    title_reanalysis_recommended: bool
    reanalysis_queued: bool


class LegalDocumentListResponse(LegalVariableResponseModel):
    project_id: str | None = None
    documents: list[LegalDocumentResponse] = Field(default_factory=list)


class DocumentIngestionJobResponse(LegalVariableResponseModel):
    id: str
    organization_id: str
    project_id: str
    legal_document_id: str
    status: str
    pipeline_version: str | None = None
    converter: str | None = None
    attempt_number: int = 1
    started_at: datetime | None = None
    completed_at: datetime | None = None
    error_code: str | None = None
    error_message: str | None = None
    stats: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class LegalDocumentPageResponse(LegalVariableResponseModel):
    id: str
    organization_id: str
    project_id: str
    legal_document_id: str
    ingestion_job_id: str
    page_number: int
    page_kind: str
    text_content: str
    markdown_content: str | None = None
    char_count: int
    checksum: str
    created_at: datetime | None = None


class DocumentEvidenceResponse(LegalVariableResponseModel):
    id: str
    organization_id: str
    project_id: str
    variable_resolution_id: str
    legal_document_id: str
    legal_document_page_id: str | None = None
    chunk_index: int | None = None
    snippet: str | None = None
    snippet_hash: str
    bbox: dict[str, Any] | None = None
    confidence: float | None = Field(default=None, ge=0, le=1)
    created_at: datetime | None = None


class VariableResolutionResponse(LegalVariableResponseModel):
    id: str
    organization_id: str
    project_id: str
    lot_id: str | None = None
    escritura_case_id: str | None = None
    variable_key: str
    variable_group: str
    value_text: str | None = None
    value_json: dict[str, Any] | list[Any] | None = None
    state: str
    source_type: str
    source_ref: dict[str, Any] = Field(default_factory=dict)
    confidence: float | None = Field(default=None, ge=0, le=1)
    extractor_name: str | None = None
    reviewed_by: str | None = None
    reviewed_at: datetime | None = None
    approval_required: bool = False
    correction_reason: str | None = None
    superseded_by: str | None = None
    evidence: list[DocumentEvidenceResponse] = Field(default_factory=list)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class VariableInventoryResponse(LegalVariableResponseModel):
    project_id: str
    lot_id: str | None = None
    groups: dict[str, list[VariableResolutionResponse]] = Field(default_factory=dict)
    summary: dict[str, int] = Field(default_factory=dict)

    @field_validator("summary", mode="before")
    @classmethod
    def normalize_summary(cls, value: Any) -> dict[str, int]:
        source = value if isinstance(value, dict) else {}
        summary = {"total": int(source.get("total") or 0)}
        for state in catalog.VARIABLE_STATES:
            summary[state] = int(source.get(state) or 0)
        return summary


class VariableUpdateRequest(LegalVariableBaseModel):
    action: str
    value_text: str | None = None
    value_json: dict[str, Any] | list[Any] | None = None
    state: str | None = None
    correction_reason: str | None = None
    reviewed_by: str | None = None
    evidence_policy: str = "keep_existing"
    evidence_ids: list[str] = Field(default_factory=list)

    @field_validator("action")
    @classmethod
    def validate_action(cls, value: str) -> str:
        if value not in {"edit", "approve", "mark_not_applicable"}:
            raise ValueError(f"Unsupported legal variable review action: {value}")
        return value

    @field_validator("state")
    @classmethod
    def validate_state(cls, value: str | None) -> str | None:
        if value is not None and not catalog.is_variable_state(value):
            raise ValueError(f"Unsupported legal variable state: {value}")
        return value

    @field_validator("evidence_policy")
    @classmethod
    def validate_evidence_policy(cls, value: str) -> str:
        if value not in {"keep_existing"}:
            raise ValueError(f"Unsupported evidence policy: {value}")
        return value


class VariableReviewResponse(LegalVariableResponseModel):
    variable_resolution_id: str
    state: str
    reviewed_by: str | None = None
    reviewed_at: datetime | None = None
    audit_event_id: str


class RoleMatchingRequest(LegalVariableBaseModel):
    organization_id: str
    project_id: str
    legal_document_id: str | None = None
    reviewed_by: str | None = None
    force_recompute: bool = False


class RoleManualOverrideRequest(LegalVariableBaseModel):
    sii_unit_name: str | None = None
    sii_lot_number_normalized: str | None = None
    sii_comuna: str | None = None
    sii_role_matrix: str | None = None
    sii_pre_role: str | None = None
    sii_role_in_process_text: str | None = None
    sii_definitive_role: str | None = None
    sii_role_record: dict[str, Any] | None = None
    role_status: str
    matching_status: str = "manual_override"
    reason: str
    reviewed_by: str | None = None
    source_legal_document_id: str | None = None

    @field_validator("role_status")
    @classmethod
    def validate_role_status(cls, value: str) -> str:
        if value not in catalog.ROLE_STATUS_SET:
            raise ValueError(f"Unsupported SII role status: {value}")
        return value

    @field_validator("matching_status")
    @classmethod
    def validate_matching_status(cls, value: str) -> str:
        if value != "manual_override":
            raise ValueError("Manual role updates must use matching_status=manual_override")
        return value

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Manual SII role override requires a reason")
        return value.strip()


class LotLegalDataResponse(LegalVariableResponseModel):
    id: str
    organization_id: str
    project_id: str
    lot_id: str
    lot_number: str | None = None
    sii_unit_name: str | None = None
    sii_lot_number_normalized: str | None = None
    sii_comuna: str | None = None
    sii_role_matrix: str | None = None
    sii_pre_role: str | None = None
    sii_role_in_process_text: str | None = None
    sii_definitive_role: str | None = None
    role_status: str
    matching_status: str
    matching_score: float | None = Field(default=None, ge=0, le=1)
    source_type: str | None = None
    source_legal_document_id: str | None = None
    source_document_label: str | None = None
    source_status: str | None = None
    reviewed_by: str | None = None
    reviewed_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class RoleMatchingResponse(LegalVariableResponseModel):
    project_id: str
    matches: list[LotLegalDataResponse] = Field(default_factory=list)


class SiiRoleCertificateSummary(LegalVariableResponseModel):
    source_legal_document_ids: list[str] = Field(default_factory=list)
    comunas: list[str] = Field(default_factory=list)
    role_matrices: list[str] = Field(default_factory=list)
    extracted_unit_count: int = 0
    matched_count: int = 0
    manual_review_count: int = 0
    missing_count: int = 0
    active_certificate_count: int = 0
    superseded_certificate_count: int = 0
    ambiguous_matrix_role_count: int = 0
    ocr_required: bool | None = None
    text_source: str | None = None


class RoleMatchingInventoryResponse(LegalVariableResponseModel):
    project_id: str
    lots: list[LotLegalDataResponse] = Field(default_factory=list)
    summary: dict[str, int] = Field(default_factory=dict)
    certificate_summary: SiiRoleCertificateSummary | None = None
    review_counts: dict[str, int] = Field(default_factory=dict)


class ReadinessGateResponse(LegalVariableResponseModel):
    gate: str
    status: str
    blocking_variables: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class EscrituraReadinessResponse(LegalVariableResponseModel):
    organization_id: str
    project_id: str
    lot_id: str
    readiness_status: str
    gates: list[ReadinessGateResponse] = Field(default_factory=list)
    variable_snapshot: dict[str, Any] = Field(default_factory=dict)
    evidence_snapshot: dict[str, Any] = Field(default_factory=dict)


class EscrituraCaseCreateRequest(LegalVariableBaseModel):
    organization_id: str
    project_id: str
    created_by: str | None = None
    warning_acknowledged: bool = False


class EscrituraCaseResponse(LegalVariableResponseModel):
    id: str
    organization_id: str
    project_id: str
    lot_id: str
    case_status: str
    readiness_status: str
    readiness_gates: dict[str, Any] = Field(default_factory=dict)
    variable_snapshot: dict[str, Any] = Field(default_factory=dict)
    evidence_snapshot: dict[str, Any] = Field(default_factory=dict)
    template_id: str | None = None
    generated_document_id: str | None = None
    created_by: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class EscrituraCaseSnapshotResponse(LegalVariableResponseModel):
    escritura_case_id: str
    case_status: str
    readiness_status: str
    variable_snapshot_count: int
    evidence_snapshot_count: int
