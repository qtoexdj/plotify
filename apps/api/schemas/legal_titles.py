"""Pydantic contracts for SDD 009 title analysis."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, field_validator

ALERT_RESOLUTION_STATES = {"pending", "acknowledged", "clause_added", "dismissed_with_reason"}
# "pending" is the initial state and cannot be requested explicitly.
ALERT_RESOLUTION_REQUEST_STATES = ALERT_RESOLUTION_STATES - {"pending"}


class LegalTitleBaseModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class LegalTitleResponseModel(BaseModel):
    model_config = ConfigDict(extra="ignore")


# --- Core Extraction/Analysis Schema ---
# These models double as the LLM structured-output contract: a missing fact is
# represented as None (never as an empty placeholder instance), so consumers
# can rely on None-checks to detect absent data and route it to manual_review.

class Evidence(LegalTitleBaseModel):
    legal_document_id: str | None = None
    page_number: int | None = None
    snippet: str | None = None


class EvidencedValue(LegalTitleBaseModel):
    value: str | None = None
    evidence: Evidence | None = None
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    verified: bool | None = None


class PropertyDeslindes(LegalTitleBaseModel):
    norte: EvidencedValue | None = None
    sur: EvidencedValue | None = None
    oriente: EvidencedValue | None = None
    poniente: EvidencedValue | None = None


class PropertyIdentity(LegalTitleBaseModel):
    nombre_predio: EvidencedValue | None = None
    ubicacion: EvidencedValue | None = None
    comuna: EvidencedValue | None = None
    provincia: EvidencedValue | None = None
    region: EvidencedValue | None = None
    superficie_texto: EvidencedValue | None = None
    deslindes: PropertyDeslindes | None = None
    rol_avaluo: EvidencedValue | None = None


class Adquirente(LegalTitleBaseModel):
    nombre: EvidencedValue | None = None
    cuota: str | None = None


class Antecesor(LegalTitleBaseModel):
    nombre: EvidencedValue | None = None


class InscriptionEscritura(LegalTitleBaseModel):
    fecha: EvidencedValue | None = None
    notario: EvidencedValue | None = None
    notaria_ciudad: EvidencedValue | None = None
    repertorio: EvidencedValue | None = None


class InscriptionRectificatoria(LegalTitleBaseModel):
    fecha: EvidencedValue | None = None
    notario: EvidencedValue | None = None
    repertorio: EvidencedValue | None = None


class InscriptionDetalle(LegalTitleBaseModel):
    fojas: EvidencedValue | None = None
    numero: EvidencedValue | None = None
    anio: EvidencedValue | None = None
    cbr: EvidencedValue | None = None


class InscriptionObservacion(LegalTitleBaseModel):
    tipo: str | None = None
    evidence: Evidence | None = None


class TitleInscription(LegalTitleBaseModel):
    orden: int
    tipo_adquisicion: str  # compra | compra_derechos | herencia_posesion_efectiva | herencia_inscripcion_especial | cesion_derechos | otro
    adquirentes: list[Adquirente] = Field(default_factory=list)
    antecesor: Antecesor | None = None
    escritura: InscriptionEscritura | None = None
    rectificatorias: list[InscriptionRectificatoria] = Field(default_factory=list)
    inscripcion: InscriptionDetalle | None = None
    observaciones: list[InscriptionObservacion] = Field(default_factory=list)


class PropietarioActual(LegalTitleBaseModel):
    nombre: EvidencedValue | None = None
    rut: EvidencedValue | None = None
    estado_civil: EvidencedValue | None = None
    profesion: EvidencedValue | None = None
    domicilio: EvidencedValue | None = None
    cuota: str | None = None
    requiere_personeria: bool | None = None


class TitleAlert(LegalTitleBaseModel):
    tipo: str  # dl_3516 | vigente_en_el_resto | etc.
    detalle: str | None = None
    evidence: Evidence | None = None
    resolution: str = "pending"

    @field_validator("resolution")
    @classmethod
    def validate_resolution(cls, value: str) -> str:
        if value not in ALERT_RESOLUTION_STATES:
            raise ValueError(f"Unsupported resolution state: {value}")
        return value


class TitleAnalysis(LegalTitleBaseModel):
    structure_type: str | None = None  # dominio_unico, multiples_dominios, compra_derechos, herencia, mixto
    property_identity: PropertyIdentity | None = None
    inscripciones: list[TitleInscription] = Field(default_factory=list)
    propietarios_actuales: list[PropietarioActual] = Field(default_factory=list)
    alertas: list[TitleAlert] = Field(default_factory=list)


# --- API Endpoint Schemas ---

class TitleAnalysisRunDetails(LegalTitleResponseModel):
    extractor_name: str
    model_name: str
    prompt_version: str
    duration_ms: int | None = None
    created_at: datetime | None = None


class TitleAnalysisNarrativeBlock(LegalTitleResponseModel):
    generated: str | None = None
    edited: str | None = None
    effective: str | None = None


class TitleAnalysisNarrative(LegalTitleResponseModel):
    comparecencia: TitleAnalysisNarrativeBlock | None = None
    primero: TitleAnalysisNarrativeBlock | None = None


class TitleAnalysisVerificationFailure(LegalTitleResponseModel):
    path: str
    reason: str
    proposed_snippet: str | None = None


class TitleAnalysisVerification(LegalTitleResponseModel):
    verified_count: int = 0
    unverified_count: int = 0
    failures: list[TitleAnalysisVerificationFailure] = Field(default_factory=list)


class TitleAnalysisPendingReview(LegalTitleResponseModel):
    path: str
    state: str = "manual_review"


class TitleAnalysisSourceDocument(LegalTitleResponseModel):
    legal_document_id: str
    document_type: str
    filename: str | None = None
    version: int = 1


class TitleAnalysisResponseData(LegalTitleResponseModel):
    id: UUID
    status: str  # processing | proposed | needs_review | failed | llm_disabled | approved | superseded
    structure_type: str | None = None
    analysis: TitleAnalysis | None = None
    narrative: TitleAnalysisNarrative | None = None
    alerts: list[TitleAlert] = Field(default_factory=list)
    verification: TitleAnalysisVerification | None = None
    pending_review: list[TitleAnalysisPendingReview] = Field(default_factory=list)
    source_documents: list[TitleAnalysisSourceDocument] = Field(default_factory=list)
    run: TitleAnalysisRunDetails | None = None
    approved_by: UUID | None = None
    approved_at: datetime | None = None


class TitleCaseResponse(LegalTitleResponseModel):
    analysis: TitleAnalysisResponseData | None = None


class TitleAnalysisReanalyzeResponse(LegalTitleResponseModel):
    analysis_id: UUID
    status: str
    queued: bool


class TitleNarrativeUpdateRequest(LegalTitleBaseModel):
    block: str  # comparecencia | primero
    edited_text: str
    reason: str

    @field_validator("block")
    @classmethod
    def validate_block(cls, value: str) -> str:
        if value not in {"comparecencia", "primero"}:
            raise ValueError("block must be 'comparecencia' or 'primero'")
        return value

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("reason must not be empty")
        return value.strip()


class TitleAlertResolveRequest(LegalTitleBaseModel):
    resolution: str  # acknowledged | clause_added | dismissed_with_reason
    reason: str

    @field_validator("resolution")
    @classmethod
    def validate_resolution(cls, value: str) -> str:
        if value not in ALERT_RESOLUTION_REQUEST_STATES:
            options = ", ".join(sorted(ALERT_RESOLUTION_REQUEST_STATES))
            raise ValueError(f"resolution must be one of: {options}")
        return value

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("reason must not be empty")
        return value.strip()


class TitleAnalysisApproveBlockingReason(LegalTitleResponseModel):
    kind: str  # variable | alert
    key: str | None = None
    state: str | None = None
    tipo: str | None = None


class TitleAnalysisApproveErrorResponse(LegalTitleResponseModel):
    blocking: list[TitleAnalysisApproveBlockingReason] = Field(default_factory=list)
