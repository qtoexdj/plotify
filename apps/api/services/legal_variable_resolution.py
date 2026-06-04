"""Legal variable proposal, classification, and persistence skeleton for SDD 007.

This module has no import-time side effects. Supabase is resolved lazily only
when persistence is requested, and callers may inject a mock client in tests.
"""

from __future__ import annotations

import asyncio
import hashlib
from dataclasses import dataclass, field
from typing import Any

from services.legal_variable_catalog import (
    VARIABLE_BLOCKING_STATES,
    is_source_type,
    is_variable_group,
    is_variable_key,
    is_variable_state,
    variable_group_for_key,
)


MANUAL_REVIEW_CONFIDENCE_THRESHOLD = 0.75
DEFAULT_PROPOSAL_STATE = "proposed"
DEFAULT_SOURCE_TYPE = "document"


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


class LegalVariableResolutionError(ValueError):
    """Raised when a variable proposal violates the canonical catalog."""


class LegalVariableResolutionService:
    """Service boundary for future extraction rules and variable review flows."""

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

            if proposal.variable_key in conflicts:
                classification = "conflict"
                reasons.append("multiple_values_for_same_scope")
            elif not has_value and proposal.state not in {"not_applicable", "superseded"}:
                classification = "missing"
                reasons.append("empty_value")
            elif self._needs_manual_review(proposal):
                classification = "manual_review"
                reasons.append("manual_review_required")

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
                    reasons=("required_variable_absent",),
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

    def _conflicting_keys(self, proposals: list[VariableProposalInput]) -> set[str]:
        seen: dict[tuple[str | None, str | None, str], Any] = {}
        conflicts: set[str] = set()
        for proposal in proposals:
            scope = (proposal.lot_id, proposal.escritura_case_id, proposal.variable_key)
            value = proposal.value_json if proposal.value_json is not None else proposal.value_text
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
