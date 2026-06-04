"""Legal variable proposal, classification, and persistence skeleton for SDD 007.

This module has no import-time side effects. Supabase is resolved lazily only
when persistence is requested, and callers may inject a mock client in tests.
"""

from __future__ import annotations

import asyncio
import hashlib
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from schemas.legal_variables import (
    DocumentEvidenceResponse,
    VariableInventoryResponse,
    VariableResolutionResponse,
    VariableReviewResponse,
    VariableUpdateRequest,
)
from services.legal_variable_catalog import (
    READINESS_REQUIRED_VARIABLES_BY_GATE,
    VARIABLE_STATES,
    is_variable_group,
    VARIABLE_BLOCKING_STATES,
    is_source_type,
    is_variable_key,
    is_variable_state,
    variable_group_for_key,
)


MANUAL_REVIEW_CONFIDENCE_THRESHOLD = 0.75
DEFAULT_PROPOSAL_STATE = "proposed"
DEFAULT_SOURCE_TYPE = "document"
DOMINIO_VIGENTE_EXTRACTOR_NAME = "dominio_vigente_rules_v1"
SII_ROLES_EXTRACTOR_NAME = "sii_roles_rules_v1"
SAG_PLANO_EXTRACTOR_NAME = "sag_plano_rules_v1"
DOMINIO_VIGENTE_REQUIRED_VARIABLES = (
    "matriz.nombre_predio",
    "matriz.ubicacion",
    "matriz.superficie_total",
    "matriz.inscripcion_fojas",
    "matriz.inscripcion_numero",
    "matriz.inscripcion_anio",
    "matriz.inscripcion_cbr",
    "matriz.rol_avaluo",
)
SII_ROLES_REQUIRED_VARIABLES = (
    "sii.certificado_asignacion_roles_numero",
    "sii.certificado_fecha_emision",
    "sii.solicitud_numero",
    "sii.rol_matriz",
    "sii.unidad_nombre",
    "sii.pre_rol_lote",
    "sii.rol_avaluo_en_tramite_texto",
)
SAG_PLANO_REQUIRED_VARIABLES = (
    "sag.certificado_numero",
    "sag.certificado_fecha",
    "sag.oficina_sectorial",
    "sag.plano_cbr_numero",
    "sag.plano_cbr_anio",
    "sag.plano_cbr_registro",
)
CRITICAL_VARIABLE_KEYS = frozenset(
    key
    for keys in READINESS_REQUIRED_VARIABLES_BY_GATE.values()
    for key in keys
) | frozenset(
    (
        "matriz.superficie_total",
        "matriz.rol_avaluo",
        "sag.certificado_numero",
        "sag.certificado_fecha",
        "sag.oficina_sectorial",
        "sag.plano_cbr_numero",
        "sag.plano_cbr_anio",
        "sag.plano_cbr_registro",
        "sii.certificado_asignacion_roles_numero",
        "sii.certificado_fecha_emision",
        "sii.solicitud_numero",
    )
)
EDIT_TARGET_STATES = frozenset(("resolved", "manual_review"))
APPROVABLE_STATES = frozenset(("proposed", "resolved", "manual_review", "derived"))
NOT_APPLICABLE_SOURCE_STATES = frozenset(
    ("missing", "proposed", "resolved", "manual_review", "conflict", "derived")
)

_INSCRIPTION_RE = re.compile(
    r"(?:inscrit[ao]?\s+)?(?:a\s+)?fojas\s+(?P<fojas>[\w.-]+).*?"
    r"(?:n[uú]mero|n[°ºro.]*|num\.?)\s+(?P<numero>[\w.-]+).*?"
    r"(?:a(?:n|ñ)o|del\s+a(?:n|ñ)o)\s+(?P<anio>\d{4})",
    re.IGNORECASE | re.DOTALL,
)
_CBR_RE = re.compile(
    r"(?:conservador(?:a)?(?:\s+de\s+bienes\s+ra[ií]ces)?\s+(?:de\s+)?)"
    r"(?P<cbr>[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ '-]{2,80}?)(?=\.|,|;|$)",
    re.IGNORECASE,
)
_ROL_RE = re.compile(
    r"(?:rol(?:\s+de\s+aval[uú]o)?|rol\s+matriz)\s*(?:n[°ºro.]*|numero)?\s*"
    r"(?P<rol>\d{1,7}\s*[-/]\s*\d{1,7})",
    re.IGNORECASE,
)
_PREDIO_RE = re.compile(
    r"(?:(?:predio|inmueble|propiedad|fundo)\s+(?:denominad[ao]\s+)?|parcela\s+)"
    r"(?P<predio>[A-ZÁÉÍÓÚÑ0-9][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 .'-]{2,80}?)"
    r"(?=\s+se\s+encuentra|\s+ubicad[ao]|\.|,|;|$)",
    re.IGNORECASE,
)
_UBICACION_RE = re.compile(
    r"(?:ubicad[ao]\s+en|situad[ao]\s+en)\s+"
    r"(?P<ubicacion>[^.;\n]{5,140})",
    re.IGNORECASE,
)
_SUPERFICIE_RE = re.compile(
    r"(?:superficie(?:\s+aproximada)?(?:\s+de)?|cabida(?:\s+de)?)\s+"
    r"(?P<superficie>\d[\d.,]*\s*(?:m2|m²|metros\s+cuadrados|hect[aá]reas|has?\.?))",
    re.IGNORECASE,
)
_ADQUISICION_RE = re.compile(
    r"(?:adquiri[oó]\s+(?:el\s+inmueble\s+)?(?:por|a\s+t[ií]tulo\s+de)\s+)"
    r"(?P<modo>compraventa|donaci[oó]n|herencia|adjudicaci[oó]n|permuta)",
    re.IGNORECASE,
)
_SII_CERTIFICATE_NUMBER_RE = re.compile(
    r"(?:certificado(?:\s+de\s+asignaci[oó]n\s+de\s+roles)?\s*(?:n[uú]mero|n[°ºro.]*)?\s*)"
    r"(?P<number>[A-Z0-9][A-Z0-9.-]{2,40})",
    re.IGNORECASE,
)
_SII_CERTIFICATE_DATE_RE = re.compile(
    r"(?:fecha\s+(?:de\s+)?(?:emisi[oó]n|certificado)|emitido\s+con\s+fecha)\s*"
    r"(?P<date>\d{1,2}[-/]\d{1,2}[-/]\d{4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})",
    re.IGNORECASE,
)
_SII_REQUEST_RE = re.compile(
    r"(?:(?:solicitud|formulario)\s*(?:F?2118)?\s*(?:n[°ºro.]*|numero)?\s*|F2118\s*)"
    r"(?P<number>[A-Z0-9][A-Z0-9.-]{2,40})",
    re.IGNORECASE,
)
_SII_MATRIX_ROLE_RE = re.compile(
    r"(?:rol\s+matriz|rol\s+de\s+origen|predio\s+matriz)\s*(?:n[°ºro.]*|numero)?\s*"
    r"(?P<role>\d{1,7}\s*[-/]\s*\d{1,7})",
    re.IGNORECASE,
)
_SII_ROLE_IN_PROCESS_RE = re.compile(
    r"(?P<text>rol\s+de\s+aval[uú]o\s+en\s+tr[aá]mite)",
    re.IGNORECASE,
)
_SII_UNIT_BLOCK_RE = re.compile(
    r"(?P<unit>(?:unidad\s+)?(?:lote|parcela|unidad)\s*[A-Z0-9.-]+).*?"
    r"(?:(?:pre[- ]?rol|rol\s+en\s+tr[aá]mite|rol\s+de\s+aval[uú]o\s+en\s+tr[aá]mite)"
    r"\s*(?:n[°ºro.]*|numero)?\s*)(?P<pre_role>\d{1,7}\s*[-/]\s*\d{1,7})",
    re.IGNORECASE | re.DOTALL,
)
_SAG_CERTIFICATE_NUMBER_RE = re.compile(
    r"(?:certificado|resoluci[oó]n)\s*(?:SAG)?\s*(?:exenta)?\s*"
    r"(?:n[uú]mero|n[°ºro.]*)?\s*(?P<number>[A-Z0-9][A-Z0-9.-]{2,40})",
    re.IGNORECASE,
)
_SAG_CERTIFICATE_DATE_RE = re.compile(
    r"(?:fecha(?:\s+de\s+certificado|\s+de\s+emisi[oó]n)?|de\s+fecha)\s*"
    r"(?P<date>\d{1,2}[-/]\d{1,2}[-/]\d{4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})",
    re.IGNORECASE,
)
_SAG_OFFICE_RE = re.compile(
    r"(?:oficina\s+(?:sectorial\s+)?SAG|SAG\s+oficina\s+sectorial)\s+"
    r"(?P<office>[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ .'-]{2,80}?)(?=\.|,|;|$)",
    re.IGNORECASE,
)
_PLANO_CBR_RE = re.compile(
    r"(?:plano(?:\s+archivad[ao])?(?:\s+CBR)?|archivo\s+de\s+plano)\s*"
    r"(?:n[uú]mero|n[°ºro.]*)?\s*(?:posiblemente|probablemente|dudoso)?\s*"
    r"(?P<number>[A-Z0-9.-]*\d[A-Z0-9.-]{0,30}).{0,80}?"
    r"(?:a(?:n|ñ)o|del\s+a(?:n|ñ)o)\s*(?P<year>\d{4})",
    re.IGNORECASE | re.DOTALL,
)
_PLANO_REGISTRY_RE = re.compile(
    r"(?:registro|archivo|conservador(?:a)?(?:\s+de\s+bienes\s+ra[ií]ces)?(?:\s+de)?)\s+"
    r"(?P<registry>[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ .'-]{2,80}?)(?=\.|,|;|$)",
    re.IGNORECASE,
)
_LOW_CONFIDENCE_MARKERS_RE = re.compile(
    r"\b(?:borroso|ilegible|posiblemente|probablemente|dudoso|no\s+se\s+lee|OCR)\b",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class VariableEvidenceInput:
    """Source evidence attached to a variable proposal."""

    legal_document_id: str
    legal_document_page_id: str | None = None
    chunk_index: int | None = None
    snippet: str | None = None
    bbox: dict[str, Any] | None = None
    confidence: float | None = None

    @property
    def snippet_hash(self) -> str:
        payload = (self.snippet or "").encode("utf-8")
        return hashlib.sha256(payload).hexdigest()


@dataclass(frozen=True)
class VariableProposalInput:
    """Canonical variable proposal produced by extraction or system sources."""

    organization_id: str
    project_id: str
    variable_key: str
    value_text: str | None = None
    value_json: dict[str, Any] | list[Any] | None = None
    variable_group: str | None = None
    state: str = DEFAULT_PROPOSAL_STATE
    source_type: str = DEFAULT_SOURCE_TYPE
    source_ref: dict[str, Any] = field(default_factory=dict)
    confidence: float | None = None
    extractor_name: str | None = None
    lot_id: str | None = None
    escritura_case_id: str | None = None
    approval_required: bool = True
    evidence: tuple[VariableEvidenceInput, ...] = ()


@dataclass(frozen=True)
class ClassifiedVariableProposal:
    """Validated proposal with SDD 007 readiness classification."""

    proposal: VariableProposalInput
    classification: str
    reasons: tuple[str, ...] = ()

    @property
    def blocks_readiness(self) -> bool:
        return self.classification in VARIABLE_BLOCKING_STATES


@dataclass(frozen=True)
class VariablePersistenceResult:
    """Result returned by placeholder Supabase persistence."""

    variable_rows: tuple[dict[str, Any], ...]
    evidence_rows: tuple[dict[str, Any], ...]


@dataclass(frozen=True)
class LegalDocumentPageInput:
    """Extracted page text used by document-specific variable rules."""

    id: str | None
    legal_document_id: str
    page_number: int
    text_content: str


class LegalVariableResolutionError(ValueError):
    """Raised when a variable proposal violates the canonical catalog."""


class LegalVariableInventoryScopeError(PermissionError):
    """Raised when inventory access violates project tenant scope."""


class LegalVariableInventoryNotFoundError(LookupError):
    """Raised when the inventory project cannot be found."""


class LegalVariableAuditError(RuntimeError):
    """Raised when review audit persistence fails after a validated mutation."""


@dataclass(frozen=True)
class VariableReviewMutation:
    """Validated review mutation and immutable decision payload."""

    update_payload: dict[str, Any]
    decision_payload: dict[str, Any]
    response_state: str
    reviewed_by: str
    reviewed_at: datetime


class LegalVariableResolutionService:
    """Service boundary for future extraction rules and variable review flows."""

    def extract_dominio_vigente_variables(
        self,
        *,
        organization_id: str,
        project_id: str,
        legal_document_id: str,
        pages: tuple[LegalDocumentPageInput | dict[str, Any], ...]
        | list[LegalDocumentPageInput | dict[str, Any]],
        required_variable_keys: tuple[str, ...] = DOMINIO_VIGENTE_REQUIRED_VARIABLES,
    ) -> tuple[ClassifiedVariableProposal, ...]:
        normalized_pages = tuple(
            normalize_document_page(page, legal_document_id=legal_document_id)
            for page in pages
        )
        proposals: list[VariableProposalInput] = []
        for page in normalized_pages:
            proposals.extend(
                self._extract_dominio_vigente_page_variables(
                    organization_id=organization_id,
                    project_id=project_id,
                    page=page,
                )
            )
        return self.classify_proposals(
            proposals,
            required_variable_keys=required_variable_keys,
        )

    def extract_sii_roles_variables(
        self,
        *,
        organization_id: str,
        project_id: str,
        legal_document_id: str,
        pages: tuple[LegalDocumentPageInput | dict[str, Any], ...]
        | list[LegalDocumentPageInput | dict[str, Any]],
        required_variable_keys: tuple[str, ...] = SII_ROLES_REQUIRED_VARIABLES,
    ) -> tuple[ClassifiedVariableProposal, ...]:
        normalized_pages = tuple(
            normalize_document_page(page, legal_document_id=legal_document_id)
            for page in pages
        )
        proposals: list[VariableProposalInput] = []
        for page in normalized_pages:
            proposals.extend(
                self._extract_sii_roles_page_variables(
                    organization_id=organization_id,
                    project_id=project_id,
                    page=page,
                )
            )
        return self.classify_proposals(
            proposals,
            required_variable_keys=required_variable_keys,
        )

    def extract_sag_plano_variables(
        self,
        *,
        organization_id: str,
        project_id: str,
        legal_document_id: str,
        pages: tuple[LegalDocumentPageInput | dict[str, Any], ...]
        | list[LegalDocumentPageInput | dict[str, Any]],
        required_variable_keys: tuple[str, ...] = SAG_PLANO_REQUIRED_VARIABLES,
    ) -> tuple[ClassifiedVariableProposal, ...]:
        normalized_pages = tuple(
            normalize_document_page(page, legal_document_id=legal_document_id)
            for page in pages
        )
        proposals: list[VariableProposalInput] = []
        for page in normalized_pages:
            proposals.extend(
                self._extract_sag_plano_page_variables(
                    organization_id=organization_id,
                    project_id=project_id,
                    page=page,
                )
            )
        return self.classify_proposals(
            proposals,
            required_variable_keys=required_variable_keys,
        )

    def validate_proposal(self, proposal: VariableProposalInput) -> VariableProposalInput:
        group = proposal.variable_group or variable_group_for_key(proposal.variable_key)
        if not is_variable_key(proposal.variable_key):
            raise LegalVariableResolutionError(
                f"Unknown legal variable key: {proposal.variable_key}"
            )
        if not group or not is_variable_group(group):
            raise LegalVariableResolutionError(
                f"Unknown legal variable group for {proposal.variable_key}: {group}"
            )
        expected_group = variable_group_for_key(proposal.variable_key)
        if expected_group and group != expected_group:
            raise LegalVariableResolutionError(
                f"Variable {proposal.variable_key} belongs to {expected_group}, not {group}"
            )
        if not is_variable_state(proposal.state):
            raise LegalVariableResolutionError(f"Unknown variable state: {proposal.state}")
        if not is_source_type(proposal.source_type):
            raise LegalVariableResolutionError(f"Unknown source type: {proposal.source_type}")
        if proposal.confidence is not None and not 0 <= proposal.confidence <= 1:
            raise LegalVariableResolutionError("Variable confidence must be between 0 and 1")

        return VariableProposalInput(
            **{**proposal.__dict__, "variable_group": group}
        )

    def propose_variable(
        self,
        *,
        organization_id: str,
        project_id: str,
        variable_key: str,
        value_text: str | None = None,
        value_json: dict[str, Any] | list[Any] | None = None,
        **kwargs: Any,
    ) -> ClassifiedVariableProposal:
        proposal = VariableProposalInput(
            organization_id=organization_id,
            project_id=project_id,
            variable_key=variable_key,
            value_text=value_text,
            value_json=value_json,
            **kwargs,
        )
        return self.classify_proposals((proposal,))[0]

    def _extract_dominio_vigente_page_variables(
        self,
        *,
        organization_id: str,
        project_id: str,
        page: LegalDocumentPageInput,
    ) -> list[VariableProposalInput]:
        text = normalize_whitespace(page.text_content)
        if not text:
            return []

        proposals: list[VariableProposalInput] = []
        common_ref = {
            "document_type": "dominio_vigente",
            "page_number": page.page_number,
        }

        inscription = _INSCRIPTION_RE.search(text)
        if inscription:
            snippet = _snippet_for_match(text, inscription)
            proposals.extend(
                [
                    build_document_proposal(
                        organization_id=organization_id,
                        project_id=project_id,
                        legal_document_id=page.legal_document_id,
                        legal_document_page_id=page.id,
                        variable_key="matriz.inscripcion_fojas",
                        value_text=clean_legal_value(inscription.group("fojas")),
                        source_ref=common_ref,
                        snippet=snippet,
                        confidence=0.92,
                    ),
                    build_document_proposal(
                        organization_id=organization_id,
                        project_id=project_id,
                        legal_document_id=page.legal_document_id,
                        legal_document_page_id=page.id,
                        variable_key="matriz.inscripcion_numero",
                        value_text=clean_legal_value(inscription.group("numero")),
                        source_ref=common_ref,
                        snippet=snippet,
                        confidence=0.92,
                    ),
                    build_document_proposal(
                        organization_id=organization_id,
                        project_id=project_id,
                        legal_document_id=page.legal_document_id,
                        legal_document_page_id=page.id,
                        variable_key="matriz.inscripcion_anio",
                        value_text=clean_legal_value(inscription.group("anio")),
                        source_ref=common_ref,
                        snippet=snippet,
                        confidence=0.92,
                    ),
                ]
            )

        pattern_specs = (
            ("matriz.inscripcion_cbr", _CBR_RE, "cbr", 0.84),
            ("matriz.rol_avaluo", _ROL_RE, "rol", 0.88),
            ("matriz.nombre_predio", _PREDIO_RE, "predio", 0.78),
            ("matriz.ubicacion", _UBICACION_RE, "ubicacion", 0.78),
            ("matriz.superficie_total", _SUPERFICIE_RE, "superficie", 0.82),
            ("matriz.adquisicion_modo", _ADQUISICION_RE, "modo", 0.8),
        )
        for variable_key, pattern, group_name, confidence in pattern_specs:
            match = pattern.search(text)
            if not match:
                continue
            proposals.append(
                build_document_proposal(
                    organization_id=organization_id,
                    project_id=project_id,
                    legal_document_id=page.legal_document_id,
                    legal_document_page_id=page.id,
                    variable_key=variable_key,
                    value_text=clean_legal_value(match.group(group_name)),
                    source_ref=common_ref,
                    snippet=_snippet_for_match(text, match),
                    confidence=confidence,
                )
            )

        return proposals

    def _extract_sii_roles_page_variables(
        self,
        *,
        organization_id: str,
        project_id: str,
        page: LegalDocumentPageInput,
    ) -> list[VariableProposalInput]:
        text = normalize_whitespace(page.text_content)
        if not text:
            return []

        proposals: list[VariableProposalInput] = []
        common_ref = {
            "document_type": "certificado_roles_sii",
            "page_number": page.page_number,
        }
        pattern_specs = (
            (
                "sii.certificado_asignacion_roles_numero",
                _SII_CERTIFICATE_NUMBER_RE,
                "number",
                0.86,
            ),
            ("sii.certificado_fecha_emision", _SII_CERTIFICATE_DATE_RE, "date", 0.86),
            ("sii.solicitud_numero", _SII_REQUEST_RE, "number", 0.84),
            ("sii.rol_matriz", _SII_MATRIX_ROLE_RE, "role", 0.88),
        )
        for variable_key, pattern, group_name, confidence in pattern_specs:
            match = pattern.search(text)
            if not match:
                continue
            proposals.append(
                build_document_proposal(
                    organization_id=organization_id,
                    project_id=project_id,
                    legal_document_id=page.legal_document_id,
                    legal_document_page_id=page.id,
                    variable_key=variable_key,
                    value_text=clean_legal_value(match.group(group_name)),
                    source_ref=common_ref,
                    snippet=_snippet_for_match(text, match),
                    confidence=confidence,
                    extractor_name=SII_ROLES_EXTRACTOR_NAME,
                )
            )

        unit_matches = list(_SII_UNIT_BLOCK_RE.finditer(text))
        for index, match in enumerate(unit_matches, start=1):
            source_ref = {**common_ref, "unit_index": index}
            snippet = _snippet_for_match(text, match)
            unit_name = clean_legal_value(match.group("unit"))
            pre_role = normalize_role_number(match.group("pre_role"))
            proposals.append(
                build_document_proposal(
                    organization_id=organization_id,
                    project_id=project_id,
                    legal_document_id=page.legal_document_id,
                    legal_document_page_id=page.id,
                    variable_key="sii.unidad_nombre",
                    value_text=unit_name,
                    source_ref=source_ref,
                    snippet=snippet,
                    confidence=0.88,
                    extractor_name=SII_ROLES_EXTRACTOR_NAME,
                )
            )
            proposals.append(
                build_document_proposal(
                    organization_id=organization_id,
                    project_id=project_id,
                    legal_document_id=page.legal_document_id,
                    legal_document_page_id=page.id,
                    variable_key="sii.pre_rol_lote",
                    value_text=pre_role,
                    source_ref=source_ref,
                    snippet=snippet,
                    confidence=0.88,
                    extractor_name=SII_ROLES_EXTRACTOR_NAME,
                )
            )

        role_in_process = _SII_ROLE_IN_PROCESS_RE.search(text)
        if role_in_process:
            proposals.append(
                build_document_proposal(
                    organization_id=organization_id,
                    project_id=project_id,
                    legal_document_id=page.legal_document_id,
                    legal_document_page_id=page.id,
                    variable_key="sii.rol_avaluo_en_tramite_texto",
                    value_text=sentence_case(clean_legal_value(role_in_process.group("text"))),
                    source_ref=common_ref,
                    snippet=_snippet_for_match(text, role_in_process),
                    confidence=0.9,
                    extractor_name=SII_ROLES_EXTRACTOR_NAME,
                )
            )

        return proposals

    def _extract_sag_plano_page_variables(
        self,
        *,
        organization_id: str,
        project_id: str,
        page: LegalDocumentPageInput,
    ) -> list[VariableProposalInput]:
        text = normalize_whitespace(page.text_content)
        if not text:
            return []

        proposals: list[VariableProposalInput] = []
        common_ref = {
            "document_type": "certificado_sag_plano",
            "page_number": page.page_number,
        }
        confidence = 0.58 if _LOW_CONFIDENCE_MARKERS_RE.search(text) else 0.84
        pattern_specs = (
            ("sag.certificado_numero", _SAG_CERTIFICATE_NUMBER_RE, "number", confidence),
            ("sag.certificado_fecha", _SAG_CERTIFICATE_DATE_RE, "date", confidence),
            ("sag.oficina_sectorial", _SAG_OFFICE_RE, "office", confidence),
        )
        for variable_key, pattern, group_name, pattern_confidence in pattern_specs:
            match = pattern.search(text)
            if not match:
                continue
            proposals.append(
                build_document_proposal(
                    organization_id=organization_id,
                    project_id=project_id,
                    legal_document_id=page.legal_document_id,
                    legal_document_page_id=page.id,
                    variable_key=variable_key,
                    value_text=clean_legal_value(match.group(group_name)),
                    source_ref=common_ref,
                    snippet=_snippet_for_match(text, match),
                    confidence=pattern_confidence,
                    extractor_name=SAG_PLANO_EXTRACTOR_NAME,
                )
            )

        plano = _PLANO_CBR_RE.search(text)
        if plano:
            snippet = _snippet_for_match(text, plano)
            plano_confidence = 0.55 if _LOW_CONFIDENCE_MARKERS_RE.search(snippet) else confidence
            proposals.extend(
                [
                    build_document_proposal(
                        organization_id=organization_id,
                        project_id=project_id,
                        legal_document_id=page.legal_document_id,
                        legal_document_page_id=page.id,
                        variable_key="sag.plano_cbr_numero",
                        value_text=clean_legal_value(plano.group("number")),
                        source_ref=common_ref,
                        snippet=snippet,
                        confidence=plano_confidence,
                        extractor_name=SAG_PLANO_EXTRACTOR_NAME,
                    ),
                    build_document_proposal(
                        organization_id=organization_id,
                        project_id=project_id,
                        legal_document_id=page.legal_document_id,
                        legal_document_page_id=page.id,
                        variable_key="sag.plano_cbr_anio",
                        value_text=clean_legal_value(plano.group("year")),
                        source_ref=common_ref,
                        snippet=snippet,
                        confidence=plano_confidence,
                        extractor_name=SAG_PLANO_EXTRACTOR_NAME,
                    ),
                ]
            )

        registry = _PLANO_REGISTRY_RE.search(text)
        if registry:
            proposals.append(
                build_document_proposal(
                    organization_id=organization_id,
                    project_id=project_id,
                    legal_document_id=page.legal_document_id,
                    legal_document_page_id=page.id,
                    variable_key="sag.plano_cbr_registro",
                    value_text=clean_legal_value(registry.group("registry")),
                    source_ref=common_ref,
                    snippet=_snippet_for_match(text, registry),
                    confidence=confidence,
                    extractor_name=SAG_PLANO_EXTRACTOR_NAME,
                )
            )

        return proposals

    def classify_proposals(
        self,
        proposals: tuple[VariableProposalInput, ...] | list[VariableProposalInput],
        *,
        required_variable_keys: tuple[str, ...] = (),
    ) -> tuple[ClassifiedVariableProposal, ...]:
        validated = [self.validate_proposal(proposal) for proposal in proposals]
        conflicts = self._conflicting_keys(validated)
        output: list[ClassifiedVariableProposal] = []

        for proposal in validated:
            reasons: list[str] = []
            classification = proposal.state
            has_value = proposal.value_text not in (None, "") or proposal.value_json is not None
            is_critical = proposal.variable_key in CRITICAL_VARIABLE_KEYS

            if proposal.variable_key in conflicts:
                classification = "conflict"
                reasons.append(
                    "critical_multiple_values_for_same_scope"
                    if is_critical
                    else "multiple_values_for_same_scope"
                )
            elif not has_value and proposal.state not in {"not_applicable", "superseded"}:
                classification = "missing"
                reasons.append("critical_value_missing" if is_critical else "empty_value")
            elif self._needs_manual_review(proposal):
                classification = "manual_review"
                reasons.append(self._manual_review_reason(proposal))

            output.append(
                ClassifiedVariableProposal(
                    proposal=proposal,
                    classification=classification,
                    reasons=tuple(reasons),
                )
            )

        present = {proposal.variable_key for proposal in validated}
        for variable_key in required_variable_keys:
            if variable_key in present:
                continue
            missing = self.validate_proposal(
                VariableProposalInput(
                    organization_id=validated[0].organization_id if validated else "",
                    project_id=validated[0].project_id if validated else "",
                    variable_key=variable_key,
                    state="missing",
                    source_type="system",
                    approval_required=True,
                )
            )
            output.append(
                ClassifiedVariableProposal(
                    proposal=missing,
                    classification="missing",
                    reasons=(
                        "critical_required_variable_absent"
                        if variable_key in CRITICAL_VARIABLE_KEYS
                        else "required_variable_absent",
                    ),
                )
            )

        return tuple(output)

    async def persist_proposals(
        self,
        proposals: tuple[ClassifiedVariableProposal, ...]
        | list[ClassifiedVariableProposal],
        *,
        supabase: Any | None = None,
    ) -> VariablePersistenceResult:
        client = supabase or self._get_supabase_client()
        variable_payloads = [self._variable_payload(item) for item in proposals]
        if not variable_payloads:
            return VariablePersistenceResult(variable_rows=(), evidence_rows=())

        variable_result = await asyncio.to_thread(
            lambda: client.table("variable_resolutions").insert(variable_payloads).execute()
        )
        variable_rows = tuple(variable_result.data or ())
        evidence_payloads = self._evidence_payloads(proposals, variable_rows)

        evidence_rows: tuple[dict[str, Any], ...] = ()
        if evidence_payloads:
            evidence_result = await asyncio.to_thread(
                lambda: client.table("document_evidence").insert(evidence_payloads).execute()
            )
            evidence_rows = tuple(evidence_result.data or ())

        return VariablePersistenceResult(
            variable_rows=variable_rows,
            evidence_rows=evidence_rows,
        )

    def _needs_manual_review(self, proposal: VariableProposalInput) -> bool:
        if proposal.state == "manual_review":
            return True
        if proposal.source_type == "document" and not proposal.evidence:
            return True
        return (
            proposal.confidence is not None
            and proposal.confidence < MANUAL_REVIEW_CONFIDENCE_THRESHOLD
        )

    def _manual_review_reason(self, proposal: VariableProposalInput) -> str:
        is_critical = proposal.variable_key in CRITICAL_VARIABLE_KEYS
        if proposal.state == "manual_review":
            return "manual_review_required"
        if proposal.source_type == "document" and not proposal.evidence:
            return "critical_evidence_missing" if is_critical else "evidence_missing"
        if (
            proposal.confidence is not None
            and proposal.confidence < MANUAL_REVIEW_CONFIDENCE_THRESHOLD
        ):
            return "critical_low_confidence" if is_critical else "low_confidence"
        return "manual_review_required"

    def _conflicting_keys(self, proposals: list[VariableProposalInput]) -> set[str]:
        seen: dict[tuple[str | None, str | None, str], Any] = {}
        conflicts: set[str] = set()
        for proposal in proposals:
            scope = (proposal.lot_id, proposal.escritura_case_id, proposal.variable_key)
            value = normalized_conflict_value(proposal)
            if scope in seen and seen[scope] != value:
                conflicts.add(proposal.variable_key)
            seen[scope] = value
        return conflicts

    def _variable_payload(self, item: ClassifiedVariableProposal) -> dict[str, Any]:
        proposal = item.proposal
        return {
            "organization_id": proposal.organization_id,
            "project_id": proposal.project_id,
            "lot_id": proposal.lot_id,
            "escritura_case_id": proposal.escritura_case_id,
            "variable_key": proposal.variable_key,
            "variable_group": proposal.variable_group,
            "value_text": proposal.value_text,
            "value_json": proposal.value_json,
            "state": item.classification,
            "source_type": proposal.source_type,
            "source_ref": {**proposal.source_ref, "classification_reasons": item.reasons},
            "confidence": proposal.confidence,
            "extractor_name": proposal.extractor_name,
            "approval_required": proposal.approval_required,
        }

    def _evidence_payloads(
        self,
        proposals: tuple[ClassifiedVariableProposal, ...] | list[ClassifiedVariableProposal],
        variable_rows: tuple[dict[str, Any], ...],
    ) -> list[dict[str, Any]]:
        payloads: list[dict[str, Any]] = []
        for item, row in zip(proposals, variable_rows, strict=False):
            variable_id = row.get("id")
            if not variable_id:
                continue
            for evidence in item.proposal.evidence:
                payloads.append(
                    {
                        "organization_id": item.proposal.organization_id,
                        "project_id": item.proposal.project_id,
                        "variable_resolution_id": variable_id,
                        "legal_document_id": evidence.legal_document_id,
                        "legal_document_page_id": evidence.legal_document_page_id,
                        "chunk_index": evidence.chunk_index,
                        "snippet": evidence.snippet,
                        "snippet_hash": evidence.snippet_hash,
                        "bbox": evidence.bbox,
                        "confidence": evidence.confidence,
                    }
                )
        return payloads

    def _get_supabase_client(self) -> Any:
        from core.database import get_supabase_client

        return get_supabase_client()


def resolve_document_variables(
    service: LegalVariableResolutionService,
    *,
    organization_id: str,
    project_id: str,
    legal_document_id: str,
    document_type: str,
    pages: tuple[LegalDocumentPageInput | dict[str, Any], ...]
    | list[LegalDocumentPageInput | dict[str, Any]],
) -> tuple[ClassifiedVariableProposal, ...]:
    if document_type == "dominio_vigente":
        return service.extract_dominio_vigente_variables(
            organization_id=organization_id,
            project_id=project_id,
            legal_document_id=legal_document_id,
            pages=pages,
        )
    if document_type == "certificado_roles_sii":
        return service.extract_sii_roles_variables(
            organization_id=organization_id,
            project_id=project_id,
            legal_document_id=legal_document_id,
            pages=pages,
        )
    if document_type in {"certificado_sag", "plano_oficial"}:
        return service.extract_sag_plano_variables(
            organization_id=organization_id,
            project_id=project_id,
            legal_document_id=legal_document_id,
            pages=pages,
        )
    return ()


async def get_project_variable_inventory(
    *,
    project_id: str,
    organization_id: str,
    lot_id: str | None = None,
    state: str | None = None,
    group: str | None = None,
    include_evidence: bool = True,
    supabase: Any | None = None,
) -> VariableInventoryResponse:
    if state and not is_variable_state(state):
        raise LegalVariableResolutionError(f"Unknown variable state: {state}")
    if group and not is_variable_group(group):
        raise LegalVariableResolutionError(f"Unknown variable group: {group}")

    client = supabase or _get_supabase_client()
    await _ensure_inventory_project_scope(
        supabase=client,
        organization_id=organization_id,
        project_id=project_id,
        lot_id=lot_id,
    )
    variable_rows = await _fetch_variable_resolution_rows(
        supabase=client,
        organization_id=organization_id,
        project_id=project_id,
        lot_id=lot_id,
        state=state,
        group=group,
    )
    evidence_by_variable: dict[str, list[DocumentEvidenceResponse]] = {}
    if include_evidence and variable_rows:
        evidence_by_variable = await _fetch_evidence_by_variable(
            supabase=client,
            organization_id=organization_id,
            project_id=project_id,
            variable_ids=[
                str(row["id"]) for row in variable_rows if row.get("id") is not None
            ],
        )

    grouped: dict[str, list[VariableResolutionResponse]] = {}
    summary = {"total": 0, **{state_name: 0 for state_name in VARIABLE_STATES}}
    for row in variable_rows:
        variable_id = str(row.get("id"))
        payload = {**row, "evidence": evidence_by_variable.get(variable_id, [])}
        variable = VariableResolutionResponse.model_validate(payload)
        grouped.setdefault(variable.variable_group, []).append(variable)
        summary["total"] += 1
        if variable.state in summary:
            summary[variable.state] += 1

    return VariableInventoryResponse(
        project_id=project_id,
        lot_id=lot_id,
        groups=grouped,
        summary=summary,
    )


async def update_legal_variable(
    *,
    variable_resolution_id: str,
    organization_id: str,
    payload: VariableUpdateRequest,
    project_id: str,
    supabase: Any | None = None,
) -> VariableReviewResponse:
    client = supabase or _get_supabase_client()
    variable = await _fetch_variable_for_review(
        supabase=client,
        variable_resolution_id=variable_resolution_id,
    )
    if variable.get("organization_id") != organization_id:
        raise LegalVariableInventoryScopeError(
            "variable_resolution_id does not belong to organization_id."
        )
    if variable.get("project_id") != project_id:
        raise LegalVariableInventoryScopeError(
            "variable_resolution_id does not belong to project_id."
        )

    mutation = _build_variable_review_mutation(
        variable=variable,
        payload=payload,
    )
    updated = await _update_variable_resolution_row(
        supabase=client,
        variable_resolution_id=variable_resolution_id,
        update_payload=mutation.update_payload,
    )
    try:
        audit_row = await _insert_legal_review_decision(
            supabase=client,
            decision_payload=mutation.decision_payload,
        )
    except Exception as exc:
        await _rollback_variable_review_mutation(
            supabase=client,
            variable_resolution_id=variable_resolution_id,
            previous_variable=variable,
        )
        raise LegalVariableAuditError("Legal variable review audit could not be persisted.") from exc

    return VariableReviewResponse(
        variable_resolution_id=str(updated.get("id") or variable_resolution_id),
        state=str(updated.get("state") or mutation.response_state),
        reviewed_by=str(updated.get("reviewed_by") or mutation.reviewed_by),
        reviewed_at=updated.get("reviewed_at") or mutation.reviewed_at,
        audit_event_id=str(audit_row["id"]),
    )


async def _fetch_variable_for_review(
    *,
    supabase: Any,
    variable_resolution_id: str,
) -> dict[str, Any]:
    result = await asyncio.to_thread(
        lambda: (
            supabase.table("variable_resolutions")
            .select("*")
            .eq("id", variable_resolution_id)
            .single()
            .execute()
        )
    )
    variable = _first_row(result)
    if not variable:
        raise LegalVariableInventoryNotFoundError("Variable resolution not found.")
    return variable


async def _update_variable_resolution_row(
    *,
    supabase: Any,
    variable_resolution_id: str,
    update_payload: dict[str, Any],
) -> dict[str, Any]:
    result = await asyncio.to_thread(
        lambda: (
            supabase.table("variable_resolutions")
            .update(update_payload)
            .eq("id", variable_resolution_id)
            .select("*")
            .single()
            .execute()
        )
    )
    updated = _first_row(result)
    if not updated:
        raise LegalVariableInventoryNotFoundError("Variable resolution not found.")
    return updated


async def _insert_legal_review_decision(
    *,
    supabase: Any,
    decision_payload: dict[str, Any],
) -> dict[str, Any]:
    result = await asyncio.to_thread(
        lambda: (
            supabase.table("legal_review_decisions")
            .insert(decision_payload)
            .select("*")
            .single()
            .execute()
        )
    )
    audit_row = _first_row(result)
    if not audit_row or not audit_row.get("id"):
        raise LegalVariableAuditError("Legal review decision insert did not return an audit id.")
    return audit_row


async def _rollback_variable_review_mutation(
    *,
    supabase: Any,
    variable_resolution_id: str,
    previous_variable: dict[str, Any],
) -> None:
    rollback_payload = {
        key: previous_variable.get(key)
        for key in (
            "value_text",
            "value_json",
            "state",
            "source_type",
            "reviewed_by",
            "reviewed_at",
            "correction_reason",
        )
    }
    await asyncio.to_thread(
        lambda: (
            supabase.table("variable_resolutions")
            .update(rollback_payload)
            .eq("id", variable_resolution_id)
            .execute()
        )
    )


def _build_variable_review_mutation(
    *,
    variable: dict[str, Any],
    payload: VariableUpdateRequest,
) -> VariableReviewMutation:
    current_state = str(variable.get("state") or "")
    if current_state == "superseded":
        raise LegalVariableResolutionError("Superseded variables cannot be reviewed.")
    if not payload.reviewed_by:
        raise LegalVariableResolutionError("reviewed_by is required for legal variable review.")

    reviewed_at = datetime.now(UTC)
    action = payload.action
    if action == "edit":
        return _build_edit_mutation(variable, payload, reviewed_at)
    if action == "approve":
        return _build_approve_mutation(variable, payload, reviewed_at)
    if action == "mark_not_applicable":
        return _build_not_applicable_mutation(variable, payload, reviewed_at)
    raise LegalVariableResolutionError(f"Unsupported legal variable review action: {action}")


def _build_edit_mutation(
    variable: dict[str, Any],
    payload: VariableUpdateRequest,
    reviewed_at: datetime,
) -> VariableReviewMutation:
    target_state = payload.state or "resolved"
    current_state = str(variable.get("state") or "")
    if target_state not in EDIT_TARGET_STATES:
        raise LegalVariableResolutionError(
            f"Edit action cannot transition variable to {target_state}."
        )
    if current_state in {"approved", "not_applicable"}:
        raise LegalVariableResolutionError(
            f"Cannot edit variable from terminal state {current_state}."
        )
    next_value_text = _normalized_payload_text(payload.value_text)
    if not _has_review_value(next_value_text, payload.value_json):
        raise LegalVariableResolutionError("Manual variable edits require a value.")
    reason = _required_reason(payload)
    update_payload = {
        "value_text": next_value_text,
        "value_json": payload.value_json,
        "state": target_state,
        "source_type": "manual",
        "reviewed_by": payload.reviewed_by,
        "reviewed_at": reviewed_at.isoformat(),
        "correction_reason": reason,
    }
    return _mutation(
        variable=variable,
        payload=payload,
        reviewed_at=reviewed_at,
        update_payload=update_payload,
        response_state=target_state,
        decision_type="manual_override",
        decision_status="approved",
        reason=reason,
    )


def _build_approve_mutation(
    variable: dict[str, Any],
    payload: VariableUpdateRequest,
    reviewed_at: datetime,
) -> VariableReviewMutation:
    current_state = str(variable.get("state") or "")
    if payload.state is not None and payload.state != "approved":
        raise LegalVariableResolutionError("Approve action must target approved state.")
    if current_state not in APPROVABLE_STATES:
        raise LegalVariableResolutionError(
            f"Cannot approve variable from state {current_state}."
        )
    next_value_text = (
        _normalized_payload_text(payload.value_text)
        if payload.value_text is not None
        else _normalized_payload_text(variable.get("value_text"))
    )
    next_value_json = (
        payload.value_json if payload.value_json is not None else variable.get("value_json")
    )
    if not _has_review_value(next_value_text, next_value_json):
        raise LegalVariableResolutionError("Approved variables require a value.")
    reason = payload.correction_reason
    update_payload = {
        "value_text": next_value_text,
        "value_json": next_value_json,
        "state": "approved",
        "reviewed_by": payload.reviewed_by,
        "reviewed_at": reviewed_at.isoformat(),
    }
    if reason:
        update_payload["correction_reason"] = reason
    return _mutation(
        variable=variable,
        payload=payload,
        reviewed_at=reviewed_at,
        update_payload=update_payload,
        response_state="approved",
        decision_type="approve_variable",
        decision_status="approved",
        reason=reason,
    )


def _build_not_applicable_mutation(
    variable: dict[str, Any],
    payload: VariableUpdateRequest,
    reviewed_at: datetime,
) -> VariableReviewMutation:
    current_state = str(variable.get("state") or "")
    if payload.state is not None and payload.state != "not_applicable":
        raise LegalVariableResolutionError(
            "mark_not_applicable action must target not_applicable state."
        )
    if current_state not in NOT_APPLICABLE_SOURCE_STATES:
        raise LegalVariableResolutionError(
            f"Cannot mark variable from state {current_state} as not_applicable."
        )
    reason = _required_reason(payload)
    update_payload = {
        "value_text": None,
        "value_json": None,
        "state": "not_applicable",
        "source_type": "legal_review",
        "reviewed_by": payload.reviewed_by,
        "reviewed_at": reviewed_at.isoformat(),
        "correction_reason": reason,
    }
    return _mutation(
        variable=variable,
        payload=payload,
        reviewed_at=reviewed_at,
        update_payload=update_payload,
        response_state="not_applicable",
        decision_type="mark_not_applicable",
        decision_status="approved",
        reason=reason,
    )


def _mutation(
    *,
    variable: dict[str, Any],
    payload: VariableUpdateRequest,
    reviewed_at: datetime,
    update_payload: dict[str, Any],
    response_state: str,
    decision_type: str,
    decision_status: str,
    reason: str | None,
) -> VariableReviewMutation:
    decision_payload = {
        "organization_id": variable["organization_id"],
        "project_id": variable["project_id"],
        "lot_id": variable.get("lot_id"),
        "escritura_case_id": variable.get("escritura_case_id"),
        "variable_resolution_id": variable["id"],
        "decision_type": decision_type,
        "decision_status": decision_status,
        "reason": reason,
        "decided_by": payload.reviewed_by,
        "decided_at": reviewed_at.isoformat(),
    }
    return VariableReviewMutation(
        update_payload=update_payload,
        decision_payload=decision_payload,
        response_state=response_state,
        reviewed_by=str(payload.reviewed_by),
        reviewed_at=reviewed_at,
    )


def _required_reason(payload: VariableUpdateRequest) -> str:
    reason = (payload.correction_reason or "").strip()
    if not reason:
        raise LegalVariableResolutionError(
            "correction_reason is required for this legal variable review action."
        )
    return reason


def _normalized_payload_text(value: Any) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _has_review_value(value_text: str | None, value_json: Any) -> bool:
    return value_text is not None or value_json is not None


async def _ensure_inventory_project_scope(
    *,
    supabase: Any,
    organization_id: str,
    project_id: str,
    lot_id: str | None = None,
) -> None:
    result = await asyncio.to_thread(
        lambda: (
            supabase.table("projects")
            .select("id, organization_id")
            .eq("id", project_id)
            .single()
            .execute()
        )
    )
    project = _first_row(result)
    if not project:
        raise LegalVariableInventoryNotFoundError("Project not found.")
    if project.get("organization_id") != organization_id:
        raise LegalVariableInventoryScopeError(
            "project_id does not belong to organization_id."
        )
    if lot_id:
        lot_result = await asyncio.to_thread(
            lambda: (
                supabase.table("lots")
                .select("id, project_id")
                .eq("id", lot_id)
                .eq("project_id", project_id)
                .single()
                .execute()
            )
        )
        if not _first_row(lot_result):
            raise LegalVariableInventoryNotFoundError("Lot not found in project.")


async def _fetch_variable_resolution_rows(
    *,
    supabase: Any,
    organization_id: str,
    project_id: str,
    lot_id: str | None,
    state: str | None,
    group: str | None,
) -> list[dict[str, Any]]:
    def _fetch() -> list[dict[str, Any]]:
        query = (
            supabase.table("variable_resolutions")
            .select("*")
            .eq("organization_id", organization_id)
            .eq("project_id", project_id)
            .order("variable_group")
            .order("variable_key")
        )
        if lot_id:
            query = query.eq("lot_id", lot_id)
        if state:
            query = query.eq("state", state)
        if group:
            query = query.eq("variable_group", group)
        result = query.execute()
        return _rows(result)

    return await asyncio.to_thread(_fetch)


async def _fetch_evidence_by_variable(
    *,
    supabase: Any,
    organization_id: str,
    project_id: str,
    variable_ids: list[str],
) -> dict[str, list[DocumentEvidenceResponse]]:
    if not variable_ids:
        return {}

    def _fetch() -> dict[str, list[DocumentEvidenceResponse]]:
        result = (
            supabase.table("document_evidence")
            .select("*")
            .eq("organization_id", organization_id)
            .eq("project_id", project_id)
            .in_("variable_resolution_id", variable_ids)
            .execute()
        )
        grouped: dict[str, list[DocumentEvidenceResponse]] = {}
        for row in _rows(result):
            evidence = DocumentEvidenceResponse.model_validate(row)
            grouped.setdefault(evidence.variable_resolution_id, []).append(evidence)
        return grouped

    return await asyncio.to_thread(_fetch)


def normalize_document_page(
    page: LegalDocumentPageInput | dict[str, Any],
    *,
    legal_document_id: str,
) -> LegalDocumentPageInput:
    if isinstance(page, LegalDocumentPageInput):
        return page
    return LegalDocumentPageInput(
        id=page.get("id") or page.get("legal_document_page_id"),
        legal_document_id=str(page.get("legal_document_id") or legal_document_id),
        page_number=int(page.get("page_number") or 1),
        text_content=str(page.get("text_content") or ""),
    )


def normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("\r", "\n")).strip()


def clean_legal_value(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "").strip(" .,:;")).strip()


def build_document_proposal(
    *,
    organization_id: str,
    project_id: str,
    legal_document_id: str,
    legal_document_page_id: str | None,
    variable_key: str,
    value_text: str,
    source_ref: dict[str, Any],
    snippet: str,
    confidence: float,
    extractor_name: str = DOMINIO_VIGENTE_EXTRACTOR_NAME,
) -> VariableProposalInput:
    normalized_source_ref = {
        **source_ref,
        "legal_document_id": legal_document_id,
        "legal_document_page_id": legal_document_page_id,
    }
    return VariableProposalInput(
        organization_id=organization_id,
        project_id=project_id,
        variable_key=variable_key,
        value_text=value_text,
        source_ref=normalized_source_ref,
        confidence=confidence,
        extractor_name=extractor_name,
        evidence=(
            VariableEvidenceInput(
                legal_document_id=legal_document_id,
                legal_document_page_id=legal_document_page_id,
                chunk_index=0,
                snippet=snippet,
                confidence=confidence,
            ),
        ),
    )


def _snippet_for_match(text: str, match: re.Match[str], *, radius: int = 90) -> str:
    start = max(match.start() - radius, 0)
    end = min(match.end() + radius, len(text))
    return clean_legal_value(text[start:end])


def normalize_role_number(value: str | None) -> str:
    return re.sub(r"\s+", "", clean_legal_value(value))


def sentence_case(value: str) -> str:
    if not value:
        return value
    return value[:1].upper() + value[1:].lower()


def normalized_conflict_value(proposal: VariableProposalInput) -> Any:
    if proposal.value_json is not None:
        return proposal.value_json
    return normalize_whitespace(str(proposal.value_text or "")).lower()


def _get_supabase_client() -> Any:
    from core.database import get_supabase_client

    return get_supabase_client()


def _first_row(result: Any) -> dict[str, Any] | None:
    data = getattr(result, "data", None)
    if isinstance(data, list):
        return data[0] if data else None
    if isinstance(data, dict):
        return data
    return None


def _rows(result: Any) -> list[dict[str, Any]]:
    data = getattr(result, "data", None)
    if isinstance(data, list):
        return [row for row in data if isinstance(row, dict)]
    if isinstance(data, dict):
        return [data]
    return []
