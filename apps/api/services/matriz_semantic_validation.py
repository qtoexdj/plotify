"""Deterministic semantic gate for approved/deliverable escritura minutas.

The validator is deliberately side-effect free. Callers persist its redacted
envelope only after binding it to an approval attempt; Storage upload and
generation happen after an authoritative PASS is finalized by the database.
"""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from dataclasses import dataclass
from io import BytesIO
from typing import Any, Iterable, Mapping
from uuid import UUID, NAMESPACE_URL, uuid5


RULESET_VERSION = "semantic/1"
NORMALIZATION_VERSION = "semantic-normalization/1"
RENDERER_VERSION = "matriz-docx/2"

REQUIRED_SELLER_FIELDS = ("tratamiento", "nombre", "rut", "nacionalidad", "estadoCivil")
MANUAL_SELLER_FIELDS = frozenset(
    {"tratamiento", "nombre", "rut", "nacionalidad", "estadoCivil", "profesionGiro", "domicilio"}
)

PLACEHOLDER_RE = re.compile(
    r"\[(?:NACIONALIDAD|ESTADO[_ ]?CIVIL|TRATAMIENTO|[^\]]{2,40})\]|_{5,}|\.{5,}",
    re.IGNORECASE,
)
FILLER_LINE_RE = re.compile(r"(?m)^\s*(?:_{4,}|\.{5,}|-{5,})\s*$")
EMPTY_GRAMMAR_RE = re.compile(
    r"\b(?:de nacionalidad|de profesión|domiciliad[oa] en|estado civil)\s*[,;.]",
    re.IGNORECASE,
)
ORPHAN_CONNECTOR_RE = re.compile(r"\b(?:salvo|será|y|o|con|sin)\s*[,;.]", re.IGNORECASE)
ORPHAN_PUNCTUATION_RE = re.compile(r"([,;:.])\s*\1|[,;]\s*[.]|[.]\s*[,;]")


class SemanticValidationError(ValueError):
    code = "DOCUMENT_SEMANTIC_INVALID"

    def __init__(self, issues: Iterable["SemanticIssue"]):
        self.issues = tuple(issues)
        super().__init__(self.code)


class SellerPersonMatchAmbiguousError(ValueError):
    code = "SELLER_PERSON_MATCH_AMBIGUOUS"


class LegalApprovalRequiredError(PermissionError):
    code = "LEGAL_APPROVAL_REQUIRED"


class SellerFactResolutionError(ValueError):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


@dataclass(frozen=True, slots=True)
class SemanticIssue:
    code: str
    path: str | None = None
    clause_key: str | None = None
    evidence_ref: str | None = None
    severity: str = "blocking"

    def to_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "severity": self.severity,
            "clause_key": self.clause_key,
            "path": self.path,
            "evidence_ref": self.evidence_ref,
            "message_key": f"semantic.{self.code.removeprefix('SEM_').lower()}",
        }


@dataclass(frozen=True, slots=True)
class SemanticValidationResult:
    status: str
    resolved_content_hash: str
    artifact_sha256: str
    issues: tuple[SemanticIssue, ...]
    ruleset_version: str = RULESET_VERSION
    normalization_version: str = NORMALIZATION_VERSION
    renderer_version: str = RENDERER_VERSION

    @property
    def promotable(self) -> bool:
        return self.status == "passed" and not self.issues

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "resolvedContentHash": self.resolved_content_hash,
            "artifactSha256": self.artifact_sha256,
            "issues": [issue.to_dict() for issue in self.issues],
            "rulesetVersion": self.ruleset_version,
            "normalizationVersion": self.normalization_version,
            "rendererVersion": self.renderer_version,
        }


def canonical_json_hash(value: Any) -> str:
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode()).hexdigest()


def normalize_legal_text(text: str) -> str:
    normalized = unicodedata.normalize("NFC", text).replace("\r\n", "\n")
    return re.sub(r"[ \t]+", " ", normalized).strip()


def extract_docx_text(artifact_bytes: bytes) -> str:
    from docx import Document

    document = Document(BytesIO(artifact_bytes))
    return "\n".join(paragraph.text for paragraph in document.paragraphs)


def _walk_nodes(value: Any) -> Iterable[dict[str, Any]]:
    if isinstance(value, dict):
        yield value
        for child in value.get("content") or []:
            yield from _walk_nodes(child)
    elif isinstance(value, list):
        for child in value:
            yield from _walk_nodes(child)


def _seller_issues(comparecientes: Iterable[Mapping[str, Any]]) -> list[SemanticIssue]:
    issues: list[SemanticIssue] = []
    seen: set[str] = set()
    for person in comparecientes:
        person_id = str(person.get("personId") or "")
        if not person_id:
            issues.append(SemanticIssue("SEM_MISSING_REQUIRED", "vendedor.comparecientes[].personId"))
            continue
        if person_id in seen:
            issues.append(SemanticIssue("SEM_FACT_MISMATCH", f"vendedor.comparecientes[personId={person_id}]"))
        seen.add(person_id)
        for field in REQUIRED_SELLER_FIELDS:
            fact = person.get(field)
            path = f"vendedor.comparecientes[personId={person_id}].{field}"
            if not isinstance(fact, Mapping) or fact.get("state") == "missing" or fact.get("value") in (None, ""):
                issues.append(SemanticIssue("SEM_MISSING_REQUIRED", path))
                continue
            if fact.get("state") in {"approved", "resolved", "evidenced", "manual_approved"} and not fact.get("evidenceRef") and not fact.get("attestationRef"):
                issues.append(SemanticIssue("SEM_MISSING_EVIDENCE", path))
    return issues


def validate_semantics(
    *,
    resolved_ast: Mapping[str, Any] | list[Any] | None,
    artifact_bytes: bytes,
    resolved_text: str | None = None,
    clauses: Iterable[str] = (),
    comparecientes: Iterable[Mapping[str, Any]] = (),
    rendered_facts: Mapping[str, Any] | None = None,
    approved_facts: Mapping[str, Any] | None = None,
    provenance_complete: bool = True,
    historical: bool = False,
    expected_artifact_sha256: str | None = None,
) -> SemanticValidationResult:
    artifact_sha = hashlib.sha256(artifact_bytes).hexdigest()
    extraction_failed = False
    try:
        raw_text = resolved_text if resolved_text is not None else extract_docx_text(artifact_bytes)
    except Exception:
        raw_text = ""
        extraction_failed = True
    text = normalize_legal_text(raw_text)
    ast = resolved_ast or {"type": "doc", "content": []}
    issues: list[SemanticIssue] = []

    if extraction_failed:
        issues.append(SemanticIssue("SEM_ARTIFACT_HASH_MISMATCH"))

    for node in _walk_nodes(ast):
        node_type = node.get("type")
        if node_type == "variable_token" or node_type not in {
            "doc", "paragraph", "text", "block_token", "repeat_section", "conditional_section", "optional_phrase"
        }:
            variable_key = (node.get("attrs") or {}).get("variableKey")
            issues.append(SemanticIssue("SEM_UNRESOLVED_TOKEN", str(variable_key or node_type)))

    if PLACEHOLDER_RE.search(text):
        issues.append(SemanticIssue("SEM_PLACEHOLDER_LITERAL"))
    if FILLER_LINE_RE.search(text):
        issues.append(SemanticIssue("SEM_FILLER_LINE"))
    if EMPTY_GRAMMAR_RE.search(text):
        issues.append(SemanticIssue("SEM_EMPTY_GRAMMAR_UNIT"))
    if ORPHAN_CONNECTOR_RE.search(text):
        issues.append(SemanticIssue("SEM_ORPHAN_CONNECTOR"))
    if ORPHAN_PUNCTUATION_RE.search(text):
        issues.append(SemanticIssue("SEM_ORPHAN_PUNCTUATION"))

    normalized_clauses = [normalize_legal_text(clause).casefold() for clause in clauses if clause.strip()]
    if len(normalized_clauses) != len(set(normalized_clauses)):
        issues.append(SemanticIssue("SEM_DUPLICATE_CLAUSE"))

    issues.extend(_seller_issues(comparecientes))
    if rendered_facts is not None and approved_facts is not None:
        for key, expected in approved_facts.items():
            if rendered_facts.get(key) != expected:
                issues.append(SemanticIssue("SEM_FACT_MISMATCH", key))

    if historical and not provenance_complete:
        issues.append(SemanticIssue("SEM_PROVENANCE_INCOMPLETE"))
    if expected_artifact_sha256 and expected_artifact_sha256 != artifact_sha:
        issues.append(SemanticIssue("SEM_ARTIFACT_HASH_MISMATCH"))

    deduplicated: dict[tuple[str, str | None], SemanticIssue] = {}
    for issue in issues:
        deduplicated.setdefault((issue.code, issue.path), issue)
    final_issues = tuple(deduplicated.values())
    content_hash = canonical_json_hash({"ast": ast, "text": text})
    return SemanticValidationResult(
        status="failed" if final_issues else "passed",
        resolved_content_hash=content_hash,
        artifact_sha256=artifact_sha,
        issues=final_issues,
    )


def require_promotable(result: SemanticValidationResult, *, approval_finalized: bool) -> None:
    if not result.promotable or not approval_finalized:
        raise SemanticValidationError(result.issues or (SemanticIssue("SEM_PROVENANCE_INCOMPLETE"),))


def stable_person_id(*, upstream_subject_id: str | None, normalized_rut: str | None) -> str:
    identity = (upstream_subject_id or normalized_rut or "").strip().casefold()
    if not identity:
        raise SellerPersonMatchAmbiguousError(SellerPersonMatchAmbiguousError.code)
    return str(uuid5(NAMESPACE_URL, f"plotify:seller-person:{identity}"))


def reconcile_compareciente_ids(
    incoming: Iterable[Mapping[str, Any]], existing: Iterable[Mapping[str, Any]]
) -> list[dict[str, Any]]:
    existing_by_subject: dict[str, str] = {}
    existing_by_rut: dict[str, list[str]] = {}
    for person in existing:
        person_id = str(person.get("personId") or "")
        subject = str(person.get("upstreamSubjectId") or "").strip().casefold()
        rut = str(person.get("normalizedRut") or "").strip().casefold()
        if subject and person_id:
            existing_by_subject[subject] = person_id
        if rut and person_id:
            existing_by_rut.setdefault(rut, []).append(person_id)

    reconciled: list[dict[str, Any]] = []
    used: set[str] = set()
    for raw in incoming:
        person = dict(raw)
        subject = str(person.get("upstreamSubjectId") or "").strip().casefold()
        rut = str(person.get("normalizedRut") or "").strip().casefold()
        person_id = existing_by_subject.get(subject) if subject else None
        if not person_id and rut:
            candidates = list(dict.fromkeys(existing_by_rut.get(rut, [])))
            if len(candidates) > 1:
                raise SellerPersonMatchAmbiguousError(SellerPersonMatchAmbiguousError.code)
            person_id = candidates[0] if candidates else None
        person_id = person_id or stable_person_id(
            upstream_subject_id=subject or None, normalized_rut=rut or None
        )
        if person_id in used:
            raise SellerPersonMatchAmbiguousError(SellerPersonMatchAmbiguousError.code)
        used.add(person_id)
        person["personId"] = person_id
        reconciled.append(person)
    return reconciled


def resolve_compareciente_field(
    *,
    person: Mapping[str, Any],
    field: str,
    value: Any,
    expected_version: int,
    grant: Mapping[str, Any] | None,
    reason: str,
    attestation_ref: str,
    reviewed_by: str,
) -> dict[str, Any]:
    if field not in MANUAL_SELLER_FIELDS:
        raise SellerFactResolutionError("SELLER_FACT_FIELD_FORBIDDEN")
    if not grant or not grant.get("active"):
        raise LegalApprovalRequiredError(LegalApprovalRequiredError.code)
    if not reason.strip():
        raise SellerFactResolutionError("SELLER_FACT_REASON_REQUIRED")
    if not attestation_ref.strip():
        raise SellerFactResolutionError("SELLER_FACT_ATTESTATION_REQUIRED")
    current = person.get(field) if isinstance(person.get(field), Mapping) else {}
    current_version = int(current.get("version") or 0)
    if current_version != expected_version:
        raise SellerFactResolutionError("APPROVAL_CANDIDATE_STALE")
    if isinstance(value, (dict, list)):
        raise SellerFactResolutionError("SELLER_FACT_VALUE_INVALID")
    return {
        "value": value,
        "state": "manual_approved",
        "version": current_version + 1,
        "legalApprovalGrantId": str(grant.get("id")),
        "attestationRef": attestation_ref.strip(),
        "reason": reason.strip(),
        "reviewedBy": reviewed_by,
    }


def generation_fingerprint(envelope: Mapping[str, Any]) -> str:
    required = (
        "organization_id", "case_id", "snapshot_hash", "matriz_id", "matriz_version",
        "template_id", "template_version", "renderer_version", "ruleset_version",
        "schema_version", "normalization_version", "approval_id",
        "provenance_manifest_hash", "review_policy_fingerprint",
    )
    missing = [key for key in required if envelope.get(key) in (None, "")]
    if missing:
        raise ValueError(f"SEM_PROVENANCE_INCOMPLETE:{','.join(missing)}")
    return hashlib.sha256(
        "|".join(["minuta-generation-v2", *(str(envelope[key]) for key in required)]).encode()
    ).hexdigest()
