"""Orchestrator service for SDD 009 title analysis."""

from __future__ import annotations

import hashlib
import asyncio
import json
from uuid import uuid4
from datetime import datetime, timedelta, timezone
from typing import Any, Sequence
from dataclasses import dataclass

from core.config import get_settings
from core.logger import get_logger
from schemas.legal_titles import (
    TitleAnalysis,
    TitleAnalysisResponseData,
    TitleAlert,
    TitleAnalysisRunDetails,
    TitleAnalysisNarrative,
    TitleAnalysisNarrativeBlock,
    TitleAnalysisPendingReview,
    TitleAnalysisSourceDocument,
    TitleAnalysisVerification,
    TitleAnalysisVerificationFailure,
    TitleBlockCheck,
)

logger = get_logger(__name__)

# v2: agent migration (LangGraph loop + agent-drafted blocks). The version
# bump invalidates v1 idempotency on purpose so existing projects re-analyze
# with the agent on their next run.
EXTRACTOR_NAME = "titulo_agent_v2"
PROMPT_VERSION = "v2"
TITLE_DOCUMENT_TYPES = frozenset(
    {"dominio_vigente", "personeria", "hipoteca_gravamen"}
)
ACTIVE_TITLE_DOCUMENT_STATUSES = (
    "pending",
    "queued",
    "processing",
    "text_extracted",
    "variables_proposed",
    "needs_review",
    "failed",
)
# Matriz identity keys staged by stage_title_analysis_proposals; together with
# titulo.* they gate title-case approval.
MATRIZ_IDENTITY_VARIABLE_KEYS = frozenset(
    {
        "matriz.nombre_predio",
        "matriz.ubicacion",
        "matriz.comuna",
        "matriz.provincia",
        "matriz.region",
        "matriz.superficie_total",
        "matriz.rol_avaluo",
        "matriz.deslindes.norte",
        "matriz.deslindes.sur",
        "matriz.deslindes.oriente",
        "matriz.deslindes.poniente",
    }
)
APPROVABLE_ANALYSIS_STATUSES = frozenset({"proposed", "needs_review"})
NARRATIVE_EDITABLE_FORBIDDEN_STATUSES = frozenset({"superseded", "approved"})


class LegalTitleAnalysisError(Exception):
    """Base exception for legal title analysis service."""
    pass


class LegalTitleAnalysisNotFoundError(LegalTitleAnalysisError, LookupError):
    """Raised when a project title analysis is not found."""
    pass


class LegalTitleAnalysisScopeError(LegalTitleAnalysisError, PermissionError):
    """Raised when tenant scoping fails validation."""
    pass


class LegalTitleAnalysisValidationError(LegalTitleAnalysisError, ValueError):
    """Raised when validation preconditions fail."""
    pass


class LegalTitleAnalysisConflictError(LegalTitleAnalysisError):
    """Raised when the analysis state forbids the requested transition."""
    pass


class LegalTitleApprovalBlockedError(LegalTitleAnalysisError):
    """Raised when approval preconditions fail; carries the blocking list."""

    def __init__(self, blocking: list[dict[str, Any]]):
        super().__init__("Title case approval is blocked.")
        self.blocking = blocking


@dataclass(frozen=True, slots=True)
class TitleAnalysisInput:
    organization_id: str
    project_id: str


def _get_supabase_client() -> Any:
    from core.database import get_supabase_client
    return get_supabase_client()


async def _run_supabase(operation: Any) -> Any:
    return await asyncio.to_thread(operation)


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


async def gather_title_source_documents(
    organization_id: str,
    project_id: str,
    supabase: Any
) -> list[dict[str, Any]]:
    """Gather active title-type documents (dominio_vigente, hipoteca_gravamen, etc.) for the project."""
    logger.info("gather_title_source_documents", project_id=project_id)

    seeded_documents = getattr(supabase, "seed_documents", None)
    if seeded_documents is not None:
        return _normalize_title_source_documents(
            seeded_documents,
            organization_id=organization_id,
            project_id=project_id,
        )

    documents_result = await _run_supabase(
        lambda: (
            supabase.table("legal_documents")
            .select(
                "id, organization_id, project_id, document_type, original_filename, "
                "version_number, extraction_status, sha256_hash, created_at"
            )
            .eq("organization_id", organization_id)
            .eq("project_id", project_id)
            .in_("document_type", sorted(TITLE_DOCUMENT_TYPES))
            .in_("extraction_status", list(ACTIVE_TITLE_DOCUMENT_STATUSES))
            .order("document_type")
            .order("version_number", desc=True)
            .order("created_at", desc=True)
            .execute()
        )
    )
    documents = _rows(documents_result)
    if not documents:
        return []

    document_ids = [str(document["id"]) for document in documents if document.get("id")]
    if not document_ids:
        return []

    pages_result = await _run_supabase(
        lambda: (
            supabase.table("legal_document_pages")
            .select(
                "id, legal_document_id, page_number, text_content, "
                "markdown_content, checksum, created_at"
            )
            .eq("organization_id", organization_id)
            .eq("project_id", project_id)
            .in_("legal_document_id", document_ids)
            .order("legal_document_id")
            .order("page_number")
            .order("created_at", desc=True)
            .execute()
        )
    )
    pages_by_document = _group_latest_pages_by_document(_rows(pages_result))
    return _normalize_title_source_documents(
        [
            {
                **document,
                "legal_document_id": document.get("id"),
                "filename": document.get("original_filename"),
                "version": document.get("version_number"),
                "pages": pages_by_document.get(str(document.get("id")), []),
            }
            for document in documents
        ],
        organization_id=organization_id,
        project_id=project_id,
    )


def _group_latest_pages_by_document(
    rows: Sequence[dict[str, Any]]
) -> dict[str, list[dict[str, Any]]]:
    pages_by_document: dict[str, dict[int, dict[str, Any]]] = {}
    for row in rows:
        document_id = str(row.get("legal_document_id") or "")
        page_number = row.get("page_number")
        if not document_id or page_number is None:
            continue
        try:
            normalized_page_number = int(page_number)
        except (TypeError, ValueError):
            continue
        pages_by_document.setdefault(document_id, {}).setdefault(
            normalized_page_number,
            {
                "id": row.get("id"),
                "legal_document_id": document_id,
                "page_number": normalized_page_number,
                "text_content": str(row.get("text_content") or ""),
                "markdown_content": row.get("markdown_content"),
                "checksum": row.get("checksum"),
            },
        )
    return {
        document_id: [
            pages[page_number]
            for page_number in sorted(pages)
        ]
        for document_id, pages in pages_by_document.items()
    }


def _normalize_title_source_documents(
    documents: Sequence[dict[str, Any]],
    *,
    organization_id: str,
    project_id: str,
) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for document in documents:
        document_type = str(document.get("document_type") or "")
        if document_type not in TITLE_DOCUMENT_TYPES:
            continue
        if document.get("organization_id") not in {None, organization_id}:
            continue
        if document.get("project_id") not in {None, project_id}:
            continue
        extraction_status = str(document.get("extraction_status") or "text_extracted")
        if extraction_status not in ACTIVE_TITLE_DOCUMENT_STATUSES:
            continue

        pages = [
            {
                "id": page.get("id"),
                "legal_document_id": str(
                    page.get("legal_document_id")
                    or document.get("legal_document_id")
                    or document.get("id")
                    or ""
                ),
                "page_number": int(page.get("page_number") or 0),
                "text_content": str(page.get("text_content") or ""),
                "markdown_content": page.get("markdown_content"),
                "checksum": page.get("checksum"),
            }
            for page in document.get("pages", [])
            if isinstance(page, dict) and int(page.get("page_number") or 0) > 0
        ]
        pages.sort(key=lambda page: page["page_number"])
        document_id = str(document.get("id") or document.get("legal_document_id") or "")
        normalized.append(
            {
                "id": document_id,
                "legal_document_id": document_id,
                "document_type": document_type,
                "filename": document.get("filename") or document.get("original_filename"),
                "version": int(document.get("version") or document.get("version_number") or 1),
                "extraction_status": extraction_status,
                "sha256_hash": document.get("sha256_hash"),
                "pages": pages,
            }
        )
    normalized.sort(key=lambda doc: (doc["document_type"], doc["id"]))
    return normalized


def compute_source_content_hash(documents: Sequence[dict[str, Any]]) -> str:
    """Compute SHA-256 hash of sorted active document IDs and contents to determine idempotency."""
    logger.info("compute_source_content_hash")
    canonical_documents: list[dict[str, Any]] = []
    for document in sorted(
        documents,
        key=lambda item: (str(item.get("document_type") or ""), str(item.get("id") or "")),
    ):
        canonical_documents.append(
            {
                "id": str(document.get("id") or document.get("legal_document_id") or ""),
                "document_type": document.get("document_type"),
                "version": document.get("version") or document.get("version_number"),
                "sha256_hash": document.get("sha256_hash"),
                "pages": [
                    {
                        "page_number": page.get("page_number"),
                        "checksum": page.get("checksum"),
                        "text_content": page.get("text_content") or "",
                    }
                    for page in sorted(
                        document.get("pages", []),
                        key=lambda item: int(item.get("page_number") or 0),
                    )
                    if isinstance(page, dict)
                ],
            }
        )
    payload = json.dumps(
        canonical_documents,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


async def check_idempotency(
    project_id: str,
    source_content_hash: str,
    extractor_name: str,
    prompt_version: str,
    supabase: Any
) -> dict[str, Any] | None:
    """Check if a re-usable analysis run with the same hash exists.

    Idempotency only applies to current runs. `failed` and `llm_disabled`
    must be re-runnable (retry, flag rollout), and `superseded` rows can carry
    the same hash as a new run (supersede without source change: rollout,
    document archive, interrupted runs) — matching the partial unique index
    `title_analyses_idempotency_idx`.
    """
    logger.info("check_idempotency", hash=source_content_hash)
    if not hasattr(supabase, "table"):
        return None
    result = await _run_supabase(
        lambda: (
            supabase.table("title_analyses")
            .select("*")
            .eq("project_id", project_id)
            .eq("source_content_hash", source_content_hash)
            .eq("extractor_name", extractor_name)
            .eq("prompt_version", prompt_version)
            .neq("status", "failed")
            .neq("status", "llm_disabled")
            .neq("status", "superseded")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
    )
    return _first_row(result)


def _source_document_ids(documents: Sequence[dict[str, Any]]) -> list[str]:
    return [
        str(document.get("id") or document.get("legal_document_id"))
        for document in documents
        if document.get("id") or document.get("legal_document_id")
    ]


def _source_document_responses(
    documents: Sequence[dict[str, Any]]
) -> list[TitleAnalysisSourceDocument]:
    return [
        TitleAnalysisSourceDocument(
            legal_document_id=str(document.get("id") or document.get("legal_document_id")),
            document_type=str(document.get("document_type") or ""),
            filename=document.get("filename") or document.get("original_filename"),
            version=int(document.get("version") or document.get("version_number") or 1),
        )
        for document in documents
        if document.get("id") or document.get("legal_document_id")
    ]


def _duration_ms(started_at: datetime) -> int:
    elapsed = datetime.now(timezone.utc) - started_at
    return max(0, int(elapsed.total_seconds() * 1000))


def _empty_analysis() -> TitleAnalysis:
    return TitleAnalysis(
        structure_type=None,
        property_identity=None,
        inscripciones=[],
        propietarios_actuales=[],
        alertas=[],
    )


def _serialize_analysis(analysis: TitleAnalysis | None) -> dict[str, Any]:
    return (analysis or _empty_analysis()).model_dump(mode="json")


def _verification_from_row(row: dict[str, Any]) -> TitleAnalysisVerification | None:
    stats = row.get("verification_stats")
    if not isinstance(stats, dict) or not stats:
        return None
    failures = [
        TitleAnalysisVerificationFailure.model_validate(failure)
        for failure in stats.get("failures", [])
        if isinstance(failure, dict)
    ]
    raw_block_checks = stats.get("block_checks")
    block_checks = None
    if isinstance(raw_block_checks, dict):
        block_checks = {
            str(name): TitleBlockCheck.model_validate(check)
            for name, check in raw_block_checks.items()
            if isinstance(check, dict)
        }
    raw_notes = stats.get("agent_notes")
    agent_notes = [str(note) for note in raw_notes] if isinstance(raw_notes, list) else []
    return TitleAnalysisVerification(
        verified_count=int(stats.get("verified_count") or 0),
        unverified_count=int(stats.get("unverified_count") or 0),
        failures=failures,
        block_checks=block_checks,
        agent_notes=agent_notes,
    )


def _narrative_from_row(row: dict[str, Any]) -> TitleAnalysisNarrative | None:
    comparecencia_generated = row.get("narrative_comparecencia_generated")
    comparecencia_edited = row.get("narrative_comparecencia_edited")
    primero_generated = row.get("narrative_primero_generated")
    primero_edited = row.get("narrative_primero_edited")
    if not any(
        [comparecencia_generated, comparecencia_edited, primero_generated, primero_edited]
    ):
        return None
    return TitleAnalysisNarrative(
        comparecencia=TitleAnalysisNarrativeBlock(
            generated=comparecencia_generated,
            edited=comparecencia_edited,
            effective=comparecencia_edited or comparecencia_generated,
        ),
        primero=TitleAnalysisNarrativeBlock(
            generated=primero_generated,
            edited=primero_edited,
            effective=primero_edited or primero_generated,
        ),
    )


def _hydrate_title_analysis_row(
    row: dict[str, Any],
    *,
    source_documents: Sequence[dict[str, Any]] | None = None,
) -> TitleAnalysisResponseData:
    analysis_payload = row.get("analysis_json") if isinstance(row, dict) else {}
    analysis = TitleAnalysis.model_validate(analysis_payload or {})
    created_at = row.get("created_at")
    if isinstance(created_at, str):
        try:
            created_at = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
        except ValueError:
            created_at = None
    alerts_payload = row.get("alerts") if isinstance(row.get("alerts"), list) else []
    verification = _verification_from_row(row)
    pending_review = [
        TitleAnalysisPendingReview(
            path=failure.path,
            state="conflict" if failure.reason == "sii_mismatch" else "manual_review",
        )
        for failure in (verification.failures if verification else [])
    ]
    return TitleAnalysisResponseData(
        id=row.get("id") or uuid4(),
        status=str(row.get("status") or "failed"),
        structure_type=row.get("structure_type"),
        analysis=analysis,
        narrative=_narrative_from_row(row),
        alerts=[
            TitleAlert.model_validate(alert)
            for alert in alerts_payload
            if isinstance(alert, dict)
        ],
        verification=verification,
        pending_review=pending_review,
        source_documents=_source_document_responses(source_documents or []),
        run=TitleAnalysisRunDetails(
            extractor_name=str(row.get("extractor_name") or EXTRACTOR_NAME),
            model_name=str(row.get("model_name") or ""),
            prompt_version=str(row.get("prompt_version") or PROMPT_VERSION),
            duration_ms=row.get("duration_ms"),
            created_at=created_at,
        ),
        approved_by=row.get("approved_by"),
        approved_at=row.get("approved_at"),
    )


async def _supersede_current_title_analyses(
    *,
    supabase: Any,
    organization_id: str,
    project_id: str,
) -> None:
    if not hasattr(supabase, "table"):
        return
    await _run_supabase(
        lambda: (
            supabase.table("title_analyses")
            .update({"status": "superseded"})
            .eq("organization_id", organization_id)
            .eq("project_id", project_id)
            .neq("status", "superseded")
            .neq("status", "failed")
            .execute()
        )
    )


async def _fail_stale_processing_analysis(
    *,
    supabase: Any,
    row: dict[str, Any],
) -> dict[str, Any]:
    """Si la fila está `processing` pero más vieja que el presupuesto del job, es
    un zombie (worker caído/reiniciado a mitad de corrida). Se marca `failed`
    (abandoned) de forma perezosa al leer, para que el panel deje de hacer
    polling infinito y ofrezca "Reanalizar". El `.lt(updated_at)` garantiza que
    NUNCA se toca una corrida real en vuelo (su updated_at es reciente)."""
    if not hasattr(supabase, "table") or str(row.get("status")) != "processing":
        return row
    settings = get_settings()
    cutoff = (
        datetime.now(timezone.utc)
        - timedelta(seconds=settings.LEGAL_TITLE_AGENT_TIMEOUT_SECONDS + 120)
    ).isoformat()
    result = await _run_supabase(
        lambda: (
            supabase.table("title_analyses")
            .update({"status": "failed", "failure_code": "abandoned"})
            .eq("id", str(row["id"]))
            .eq("status", "processing")
            .lt("updated_at", cutoff)
            .execute()
        )
    )
    if _first_row(result):
        logger.info(
            "title_analysis_stale_processing_marked_failed",
            analysis_id=str(row.get("id")),
        )
        return {**row, "status": "failed", "failure_code": "abandoned"}
    return row


async def _insert_title_analysis(
    *,
    supabase: Any,
    payload: dict[str, Any],
) -> dict[str, Any]:
    if not hasattr(supabase, "table"):
        now = datetime.now(timezone.utc)
        return {
            "id": str(uuid4()),
            "created_at": now,
            "updated_at": now,
            **payload,
        }
    result = await _run_supabase(
        lambda: supabase.table("title_analyses").insert(payload).execute()
    )
    row = _first_row(result)
    if not row:
        raise LegalTitleAnalysisError("Failed to insert title analysis row.")
    return row


async def _update_title_analysis(
    *,
    supabase: Any,
    analysis_id: str,
    payload: dict[str, Any],
    existing_row: dict[str, Any],
) -> dict[str, Any]:
    if not hasattr(supabase, "table"):
        return {**existing_row, **payload, "updated_at": datetime.now(timezone.utc)}
    result = await _run_supabase(
        lambda: (
            supabase.table("title_analyses")
            .update(payload)
            .eq("id", analysis_id)
            .execute()
        )
    )
    row = _first_row(result)
    return row or {**existing_row, **payload}


def _failure_code_for_exception(exc: Exception) -> str:
    if isinstance(exc, TimeoutError):
        return "timeout"
    try:
        from agent_titulo.runner import TitleAgentError, TitleAgentTimeoutError

        if isinstance(exc, TitleAgentTimeoutError):
            return "timeout"
        if isinstance(exc, TitleAgentError):
            return "llm_error"
    except Exception:
        pass
    if isinstance(exc, (TypeError, ValueError)):
        return "schema_invalid"
    return "llm_error"


async def stage_title_analysis_proposals(
    organization_id: str,
    project_id: str,
    analysis: TitleAnalysis,
    source_documents: list[dict[str, Any]],
    failures: list[dict[str, Any]],
    supabase: Any,
    *,
    narrative_comparecencia: str | None = None,
    narrative_primero: str | None = None,
    block_checks: dict[str, dict[str, Any]] | None = None,
) -> None:
    """
    Stages variable proposals and evidence for title analysis.
    Maps through TitleAnalysis and generates VariableProposalInput items.
    Narrative blocks come drafted by the agent; their state depends on the
    deterministic block fact-check result (FR-006).
    """
    from services.legal_variable_resolution import (
        LegalVariableResolutionService,
        VariableProposalInput,
        VariableEvidenceInput,
    )
    from schemas.legal_titles import EvidencedValue

    logger.info("stage_title_analysis_proposals", project_id=project_id)

    # 1. Build page_id_map: (legal_document_id, page_number) -> page_uuid
    page_id_map = {}
    for doc in source_documents:
        doc_id = doc["legal_document_id"]
        for page in doc.get("pages", []):
            page_id = page.get("id")
            page_num = page.get("page_number")
            if page_id and page_num is not None:
                page_id_map[(doc_id, int(page_num))] = page_id

    # 2. Build failures index by path
    failures_by_path = {f["path"]: f["reason"] for f in failures if "path" in f}

    proposals: list[VariableProposalInput] = []

    def get_evidence_inputs(ev_val: EvidencedValue | None) -> tuple[VariableEvidenceInput, ...]:
        if not ev_val or not ev_val.evidence or not ev_val.evidence.legal_document_id:
            return ()
        doc_id = ev_val.evidence.legal_document_id
        page_num = ev_val.evidence.page_number
        page_id = page_id_map.get((doc_id, int(page_num))) if page_num is not None else None
        return (
            VariableEvidenceInput(
                legal_document_id=doc_id,
                legal_document_page_id=page_id,
                snippet=ev_val.evidence.snippet,
                confidence=ev_val.confidence,
            ),
        )

    def determine_state(path: str, ev_val: EvidencedValue | None) -> str:
        if path in failures_by_path:
            reason = failures_by_path[path]
            if reason == "sii_mismatch":
                return "conflict"
            return "manual_review"
        if not ev_val or ev_val.value is None:
            return "manual_review"
        if ev_val.verified is True:
            return "proposed"
        return "manual_review"

    # A. Structure Type
    if analysis.structure_type:
        proposals.append(
            VariableProposalInput(
                organization_id=organization_id,
                project_id=project_id,
                variable_key="titulo.estructura",
                value_text=analysis.structure_type,
                state="proposed",
                confidence=1.0,
                extractor_name=EXTRACTOR_NAME,
            )
        )

    # B. Inscriptions (repeatable)
    for idx, insc in enumerate(analysis.inscripciones):
        insc_evidences = []
        insc_prefix = f"inscripciones[{idx}]"
        has_failure = any(p.startswith(insc_prefix) for p in failures_by_path)

        from services.legal_title_verification import _collect_evidenced_values
        ev_vals_in_insc = _collect_evidenced_values(insc)
        for _, ev_val in ev_vals_in_insc:
            insc_evidences.extend(get_evidence_inputs(ev_val))

        proposals.append(
            VariableProposalInput(
                organization_id=organization_id,
                project_id=project_id,
                variable_key="titulo.inscripciones[]",
                value_json=insc.model_dump(mode="json"),
                state="manual_review" if has_failure else "proposed",
                source_ref={"inscription_index": insc.orden},
                confidence=1.0,
                extractor_name=EXTRACTOR_NAME,
                evidence=tuple(insc_evidences),
            )
        )

    # C. Owners (repeatable)
    for idx, prop_act in enumerate(analysis.propietarios_actuales):
        prop_evidences = []
        prop_prefix = f"propietarios_actuales[{idx}]"
        has_failure = any(p.startswith(prop_prefix) for p in failures_by_path)

        from services.legal_title_verification import _collect_evidenced_values
        ev_vals_in_prop = _collect_evidenced_values(prop_act)
        for _, ev_val in ev_vals_in_prop:
            prop_evidences.extend(get_evidence_inputs(ev_val))

        proposals.append(
            VariableProposalInput(
                organization_id=organization_id,
                project_id=project_id,
                variable_key="titulo.propietarios[]",
                value_json=prop_act.model_dump(mode="json"),
                state="manual_review" if has_failure else "proposed",
                source_ref={"owner_index": idx + 1},
                confidence=1.0,
                extractor_name=EXTRACTOR_NAME,
                evidence=tuple(prop_evidences),
            )
        )

    # D. Narrative Comparecencia (agent-drafted, fact-checked)
    checks = block_checks or {}
    comparecencia_check = checks.get("comparecencia") or {}
    has_owner_failure = any(p.startswith("propietarios_actuales") for p in failures_by_path)
    comp_state = (
        "proposed"
        if narrative_comparecencia
        and bool(comparecencia_check.get("ok"))
        and not has_owner_failure
        else "manual_review"
    )

    proposals.append(
        VariableProposalInput(
            organization_id=organization_id,
            project_id=project_id,
            variable_key="titulo.comparecencia_vendedor_texto",
            value_text=narrative_comparecencia,
            state=comp_state,
            confidence=1.0,
            extractor_name=EXTRACTOR_NAME,
        )
    )

    # E. Narrative Primero (agent-drafted, fact-checked)
    primero_check = checks.get("primero") or {}
    has_property_or_insc_failure = any(
        p.startswith("property_identity") or p.startswith("inscripciones")
        for p in failures_by_path
    )
    prim_state = (
        "proposed"
        if narrative_primero
        and bool(primero_check.get("ok"))
        and not has_property_or_insc_failure
        else "manual_review"
    )

    proposals.append(
        VariableProposalInput(
            organization_id=organization_id,
            project_id=project_id,
            variable_key="titulo.clausula_primero_texto",
            value_text=narrative_primero,
            state=prim_state,
            confidence=1.0,
            extractor_name=EXTRACTOR_NAME,
        )
    )

    # F. Alerts (repeatable)
    for idx, alert in enumerate(analysis.alertas):
        alert_evidences = []
        if alert.evidence and alert.evidence.legal_document_id:
            doc_id = alert.evidence.legal_document_id
            page_num = alert.evidence.page_number
            page_id = page_id_map.get((doc_id, int(page_num))) if page_num is not None else None
            alert_evidences.append(
                VariableEvidenceInput(
                    legal_document_id=doc_id,
                    legal_document_page_id=page_id,
                    snippet=alert.evidence.snippet,
                )
            )

        proposals.append(
            VariableProposalInput(
                organization_id=organization_id,
                project_id=project_id,
                variable_key="titulo.alertas[]",
                value_json=alert.model_dump(mode="json"),
                state="proposed",
                source_ref={"alert_index": idx},
                confidence=1.0,
                extractor_name=EXTRACTOR_NAME,
                evidence=tuple(alert_evidences),
            )
        )

    # G. Matriz Identity Keys (matriz.*)
    pi = analysis.property_identity
    if pi:
        matriz_fields = [
            ("nombre_predio", "matriz.nombre_predio", "property_identity.nombre_predio"),
            ("ubicacion", "matriz.ubicacion", "property_identity.ubicacion"),
            ("comuna", "matriz.comuna", "property_identity.comuna"),
            ("provincia", "matriz.provincia", "property_identity.provincia"),
            ("region", "matriz.region", "property_identity.region"),
            ("superficie_texto", "matriz.superficie_total", "property_identity.superficie_texto"),
            ("rol_avaluo", "matriz.rol_avaluo", "property_identity.rol_avaluo"),
        ]

        for field_name, var_key, path in matriz_fields:
            ev_val = getattr(pi, field_name, None)
            if ev_val and ev_val.value is not None:
                proposals.append(
                    VariableProposalInput(
                        organization_id=organization_id,
                        project_id=project_id,
                        variable_key=var_key,
                        value_text=ev_val.value,
                        state=determine_state(path, ev_val),
                        confidence=ev_val.confidence or 1.0,
                        extractor_name=EXTRACTOR_NAME,
                        evidence=get_evidence_inputs(ev_val),
                    )
                )

        if pi.deslindes:
            deslinde_fields = [
                ("norte", "matriz.deslindes.norte", "property_identity.deslindes.norte"),
                ("sur", "matriz.deslindes.sur", "property_identity.deslindes.sur"),
                ("oriente", "matriz.deslindes.oriente", "property_identity.deslindes.oriente"),
                ("poniente", "matriz.deslindes.poniente", "property_identity.deslindes.poniente"),
            ]
            for field_name, var_key, path in deslinde_fields:
                ev_val = getattr(pi.deslindes, field_name, None)
                if ev_val and ev_val.value is not None:
                    proposals.append(
                        VariableProposalInput(
                            organization_id=organization_id,
                            project_id=project_id,
                            variable_key=var_key,
                            value_text=ev_val.value,
                            state=determine_state(path, ev_val),
                            confidence=ev_val.confidence or 1.0,
                            extractor_name=EXTRACTOR_NAME,
                            evidence=get_evidence_inputs(ev_val),
                        )
                    )

    # H. Vendedor Keys (vendedor.*)
    if analysis.propietarios_actuales:
        owner = analysis.propietarios_actuales[0]
        vendedor_fields = [
            ("nombre", "vendedor.nombre", "propietarios_actuales[0].nombre"),
            ("rut", "vendedor.rut", "propietarios_actuales[0].rut"),
            ("domicilio", "vendedor.domicilio", "propietarios_actuales[0].domicilio"),
            ("profesion", "vendedor.profesion_giro", "propietarios_actuales[0].profesion"),
        ]
        for owner_field, var_key, path in vendedor_fields:
            ev_val = getattr(owner, owner_field, None)
            if ev_val and ev_val.value is not None:
                proposals.append(
                    VariableProposalInput(
                        organization_id=organization_id,
                        project_id=project_id,
                        variable_key=var_key,
                        value_text=ev_val.value,
                        state=determine_state(path, ev_val),
                        confidence=ev_val.confidence or 1.0,
                        extractor_name=EXTRACTOR_NAME,
                        evidence=get_evidence_inputs(ev_val),
                    )
                )

    if proposals and hasattr(supabase, "table"):
        variable_service = LegalVariableResolutionService()
        validated_proposals = []
        for prop in proposals:
            try:
                validated_prop = variable_service.validate_proposal(prop)
                validated_proposals.append(validated_prop)
            except Exception as e:
                logger.error("proposal_validation_failed", error=str(e), variable_key=prop.variable_key)

        if validated_proposals:
            classified = variable_service.classify_proposals(validated_proposals)
            await variable_service.persist_proposals(classified, supabase=supabase)


async def run_title_analysis(
    organization_id: str,
    project_id: str,
    supabase: Any | None = None
) -> TitleAnalysisResponseData:
    """Orchestrates the entire title analysis pipeline (gathering, LLM run, verification, persisting)."""
    client = supabase or _get_supabase_client()
    settings = get_settings()
    logger.info(
        "run_title_analysis",
        project_id=project_id,
        organization_id=organization_id,
    )
    started_at = datetime.now(timezone.utc)
    source_documents = await gather_title_source_documents(
        organization_id=organization_id,
        project_id=project_id,
        supabase=client,
    )
    source_content_hash = compute_source_content_hash(source_documents)
    existing = await check_idempotency(
        project_id=project_id,
        source_content_hash=source_content_hash,
        extractor_name=EXTRACTOR_NAME,
        prompt_version=PROMPT_VERSION,
        supabase=client,
    )
    if existing is not None and str(existing.get("status")) != "processing":
        return _hydrate_title_analysis_row(existing, source_documents=source_documents)

    initial_status = "processing" if settings.LEGAL_TITLE_AGENT_ENABLED else "llm_disabled"
    if existing is not None:
        # A same-hash 'processing' row is a placeholder (manual reanalyze or a
        # previously interrupted run): reuse it as this run's lifecycle row.
        row = existing
        if not settings.LEGAL_TITLE_AGENT_ENABLED:
            row = await _update_title_analysis(
                supabase=client,
                analysis_id=str(row["id"]),
                existing_row=row,
                payload={"status": initial_status},
            )
    else:
        await _supersede_current_title_analyses(
            supabase=client,
            organization_id=organization_id,
            project_id=project_id,
        )
        base_payload = {
            "organization_id": organization_id,
            "project_id": project_id,
            "status": initial_status,
            "structure_type": None,
            "analysis_json": _serialize_analysis(None),
            "alerts": [],
            "verification_stats": {},
            "source_document_ids": _source_document_ids(source_documents),
            "source_content_hash": source_content_hash,
            "extractor_name": EXTRACTOR_NAME,
            "model_name": settings.LEGAL_TITLE_AGENT_MODEL,
            "prompt_version": PROMPT_VERSION,
            "token_usage": None,
            "duration_ms": None,
            "failure_code": None,
        }
        row = await _insert_title_analysis(supabase=client, payload=base_payload)

    if not settings.LEGAL_TITLE_AGENT_ENABLED:
        completed_row = await _update_title_analysis(
            supabase=client,
            analysis_id=str(row["id"]),
            existing_row=row,
            payload={"duration_ms": _duration_ms(started_at)},
        )
        return _hydrate_title_analysis_row(
            completed_row,
            source_documents=source_documents,
        )

    # OCR guard (spec US1 scenario 3): without any extracted text the agent
    # has nothing to read — never invent chain data, surface the cause.
    total_text_chars = sum(
        len(str(page.get("text_content") or "").strip())
        for doc in source_documents
        for page in doc.get("pages", [])
        if isinstance(page, dict)
    )
    if total_text_chars == 0:
        completed_row = await _update_title_analysis(
            supabase=client,
            analysis_id=str(row["id"]),
            existing_row=row,
            payload={
                "status": "needs_review",
                "failure_code": "ocr_required",
                "duration_ms": _duration_ms(started_at),
            },
        )
        return _hydrate_title_analysis_row(
            completed_row,
            source_documents=source_documents,
        )

    try:
        from agent_titulo.runner import run_title_agent

        # 1. Expediente data already extracted deterministically by SDD 007
        #    (read-only here): used by the agent for cross-checks and by the
        #    verifier for the SII rol conflict rule. There is no deterministic
        #    matriz-level surface source yet (the plano stores per-lot
        #    surfaces), so plano_superficie stays None until one exists.
        sii_rol_matriz = None
        if hasattr(client, "table"):
            project_legal_result = await _run_supabase(
                lambda: (
                    client.table("project_legal_data")
                    .select("sii_role_matrix")
                    .eq("project_id", project_id)
                    .eq("organization_id", organization_id)
                    .maybe_single()
                    .execute()
                )
            )
            row_data = _first_row(project_legal_result)
            if row_data:
                sii_rol_matriz = row_data.get("sii_role_matrix")

        # 2. Agent run: single reasoning loop over the whole corpus (FR-035).
        outcome = await run_title_agent(
            source_documents,
            expediente={"sii_rol_matriz": sii_rol_matriz, "plano_superficie": None},
            provider=settings.LEGAL_TITLE_AGENT_PROVIDER,
            model=settings.LEGAL_TITLE_AGENT_MODEL,
            timeout=settings.LEGAL_TITLE_AGENT_TIMEOUT_SECONDS,
            max_iterations=getattr(settings, "LEGAL_TITLE_AGENT_MAX_ITERATIONS", 24),
        )
        if not outcome.available:
            # Flag enabled but provider key missing: manual mode (FR-016).
            completed_row = await _update_title_analysis(
                supabase=client,
                analysis_id=str(row["id"]),
                existing_row=row,
                payload={
                    "status": "llm_disabled",
                    "duration_ms": _duration_ms(started_at),
                },
            )
            return _hydrate_title_analysis_row(
                completed_row,
                source_documents=source_documents,
            )
        analysis = outcome.result.analysis

        # 3. Build pages_by_doc
        pages_by_doc = {}
        for doc in source_documents:
            doc_id = doc["legal_document_id"]
            pages_by_doc[doc_id] = {
                page["page_number"]: page["text_content"]
                for page in doc.get("pages", [])
            }

        # 4. Deterministic verifier — final gate, runs regardless of the
        #    agent's self-checks (agent-execution rule: verifier is sacred).
        from services.legal_title_verification import verify_title_analysis
        stats = await verify_title_analysis(
            analysis,
            pages_by_doc,
            sii_rol_matriz=sii_rol_matriz,
            plano_superficie=None,
        )

        # 5. Deterministic fact-check of the agent-drafted blocks (FR-006):
        #    failed matches degrade the block with visible reasons, never a
        #    silent absence.
        from services.legal_title_block_check import check_title_blocks
        comparecencia_generated = outcome.result.narrativa_comparecencia
        primero_generated = outcome.result.narrativa_primero
        block_checks = check_title_blocks(
            comparecencia=comparecencia_generated,
            primero=primero_generated,
            analysis=analysis,
        )
        stats["block_checks"] = block_checks
        stats["agent_notes"] = outcome.result.notas_razonamiento
        stats["llm_calls"] = outcome.llm_calls

        # 6. Stage variable proposals
        await stage_title_analysis_proposals(
            organization_id=organization_id,
            project_id=project_id,
            analysis=analysis,
            source_documents=source_documents,
            failures=stats.get("failures", []),
            supabase=client,
            narrative_comparecencia=comparecencia_generated,
            narrative_primero=primero_generated,
            block_checks=block_checks,
        )

        # Status reflects verification (not just "the model said something"):
        # proposed only with a chain present and zero failed matches.
        has_chain = bool(analysis.inscripciones)
        clean_verification = int(stats.get("unverified_count") or 0) == 0
        final_status = "proposed" if (has_chain and clean_verification) else "needs_review"
        completed_row = await _update_title_analysis(
            supabase=client,
            analysis_id=str(row["id"]),
            existing_row=row,
            payload={
                "status": final_status,
                "structure_type": analysis.structure_type,
                "analysis_json": _serialize_analysis(analysis),
                # Resolution is lawyer-owned state: a fresh run always starts
                # pending regardless of what the model emitted.
                "alerts": [
                    {**alert.model_dump(mode="json"), "resolution": "pending", "reason": None}
                    for alert in analysis.alertas
                ],
                "narrative_comparecencia_generated": comparecencia_generated,
                "narrative_primero_generated": primero_generated,
                "verification_stats": stats,
                "token_usage": outcome.token_usage,
                "duration_ms": _duration_ms(started_at),
                "failure_code": None,
            },
        )
        return _hydrate_title_analysis_row(
            completed_row,
            source_documents=source_documents,
        )
    except Exception as exc:
        logger.exception("title_analysis_failed_detailed", project_id=project_id)
        failure_code = _failure_code_for_exception(exc)
        logger.warning(
            "title_analysis_failed",
            project_id=project_id,
            failure_code=failure_code,
            error=str(exc),
        )
        failed_row = await _update_title_analysis(
            supabase=client,
            analysis_id=str(row["id"]),
            existing_row=row,
            payload={
                "status": "failed",
                "duration_ms": _duration_ms(started_at),
                "failure_code": failure_code,
            },
        )
        return _hydrate_title_analysis_row(
            failed_row,
            source_documents=source_documents,
        )


async def _fetch_title_analysis_scoped(
    *,
    analysis_id: str,
    organization_id: str,
    project_id: str,
    supabase: Any,
) -> dict[str, Any]:
    """Fetch an analysis row by id and enforce tenant scope."""
    if not hasattr(supabase, "table"):
        raise LegalTitleAnalysisNotFoundError("Title analysis not found.")
    result = await _run_supabase(
        lambda: (
            supabase.table("title_analyses")
            .select("*")
            .eq("id", analysis_id)
            .limit(1)
            .execute()
        )
    )
    row = _first_row(result)
    if not row:
        raise LegalTitleAnalysisNotFoundError("Title analysis not found.")
    if (
        str(row.get("organization_id")) != str(organization_id)
        or str(row.get("project_id")) != str(project_id)
    ):
        raise LegalTitleAnalysisScopeError(
            "Title analysis does not belong to the requested organization/project."
        )
    return row


async def _insert_review_decision(
    *,
    supabase: Any,
    decision_payload: dict[str, Any],
) -> None:
    if not hasattr(supabase, "table"):
        return
    await _run_supabase(
        lambda: (
            supabase.table("legal_review_decisions")
            .insert(decision_payload)
            .execute()
        )
    )


async def get_project_title_case(
    organization_id: str,
    project_id: str,
    supabase: Any | None = None,
) -> TitleAnalysisResponseData | None:
    """Return the current title case for the project, or None when the
    project has no title documents (-> 404)."""
    client = supabase or _get_supabase_client()
    source_documents = await gather_title_source_documents(
        organization_id=organization_id,
        project_id=project_id,
        supabase=client,
    )

    row: dict[str, Any] | None = None
    if hasattr(client, "table"):
        result = await _run_supabase(
            lambda: (
                client.table("title_analyses")
                .select("*")
                .eq("organization_id", organization_id)
                .eq("project_id", project_id)
                .neq("status", "superseded")
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
        )
        row = _first_row(result)

    if row is not None:
        row = await _fail_stale_processing_analysis(supabase=client, row=row)
        return _hydrate_title_analysis_row(row, source_documents=source_documents)
    if not source_documents:
        return None

    # Title documents exist but no current analysis row (never analyzed, or
    # every run was superseded without a replacement). Surface an explicit
    # state instead of a silent 404 so the panel can offer the analyze action.
    settings = get_settings()
    if not settings.LEGAL_TITLE_AGENT_ENABLED:
        return TitleAnalysisResponseData(
            id=uuid4(),
            status="llm_disabled",
            source_documents=_source_document_responses(source_documents),
        )
    return TitleAnalysisResponseData(
        id=uuid4(),
        status="not_started",
        source_documents=_source_document_responses(source_documents),
    )


async def request_title_reanalysis(
    organization_id: str,
    project_id: str,
    supabase: Any | None = None,
    redis: Any | None = None,
) -> tuple[str, str, bool]:
    """Queue a new analysis run. Returns (analysis_id, status, queued).

    Idempotent: an existing non-failed analysis with the same source hash and
    prompt/extractor version is returned instead of queueing. Raises
    LegalTitleAnalysisConflictError when a run is already processing and
    LegalTitleAnalysisValidationError when no active title documents exist.
    """
    client = supabase or _get_supabase_client()
    source_documents = await gather_title_source_documents(
        organization_id=organization_id,
        project_id=project_id,
        supabase=client,
    )
    if not source_documents:
        raise LegalTitleAnalysisValidationError(
            "Project has no active title documents to analyze."
        )

    source_content_hash = compute_source_content_hash(source_documents)
    settings = get_settings()
    # "Reanalizar" explícito SIEMPRE re-corre: el usuario lo pidió y pudo haber
    # cambiado el modelo o el nivel de razonamiento, que NO entran en el hash de
    # contenido. La idempotencia por contenido sigue protegiendo el camino
    # automático (run_title_analysis en el worker). Aquí solo bloqueamos si ya
    # hay una corrida RECIENTE en proceso, para no encolar dos a la vez. Una fila
    # `processing` más vieja que el presupuesto del job es un zombie (worker
    # caído/reiniciado a mitad de corrida): se considera abandonada y se la
    # supersede para poder re-correr — si no, el estudio queda pegado para siempre.
    if hasattr(client, "table"):
        recent_cutoff = (
            datetime.now(timezone.utc)
            - timedelta(seconds=settings.LEGAL_TITLE_AGENT_TIMEOUT_SECONDS + 120)
        ).isoformat()
        processing_result = await _run_supabase(
            lambda: (
                client.table("title_analyses")
                .select("id, status")
                .eq("organization_id", organization_id)
                .eq("project_id", project_id)
                .eq("status", "processing")
                .gte("updated_at", recent_cutoff)
                .limit(1)
                .execute()
            )
        )
        if _first_row(processing_result):
            raise LegalTitleAnalysisConflictError(
                "A title analysis is already processing for this project."
            )

    await _supersede_current_title_analyses(
        supabase=client,
        organization_id=organization_id,
        project_id=project_id,
    )
    placeholder = await _insert_title_analysis(
        supabase=client,
        payload={
            "organization_id": organization_id,
            "project_id": project_id,
            "status": "processing",
            "structure_type": None,
            "analysis_json": _serialize_analysis(None),
            "alerts": [],
            "verification_stats": {},
            "source_document_ids": _source_document_ids(source_documents),
            "source_content_hash": source_content_hash,
            "extractor_name": EXTRACTOR_NAME,
            "model_name": settings.LEGAL_TITLE_AGENT_MODEL,
            "prompt_version": PROMPT_VERSION,
            "token_usage": None,
            "duration_ms": None,
            "failure_code": None,
        },
    )

    queued = False
    if redis is not None:
        await redis.enqueue_job(
            "analyze_project_title",
            {
                "organization_id": organization_id,
                "project_id": project_id,
                "trigger": "manual_reanalyze",
            },
        )
        queued = True
        logger.info(
            "title_reanalysis_queued",
            organization_id=organization_id,
            project_id=project_id,
            analysis_id=placeholder["id"],
        )
    else:
        logger.warning(
            "title_reanalysis_not_queued_missing_redis",
            organization_id=organization_id,
            project_id=project_id,
        )
    return str(placeholder["id"]), "processing", queued


async def update_title_narrative(
    analysis_id: str,
    organization_id: str,
    project_id: str,
    block: str,
    edited_text: str,
    reason: str,
    edited_by: str,
    supabase: Any | None = None,
) -> TitleAnalysisNarrative:
    """Update Comparecencia or Primero narrative block with audit logging."""
    client = supabase or _get_supabase_client()
    if block not in {"comparecencia", "primero"}:
        raise LegalTitleAnalysisValidationError(
            "block must be 'comparecencia' or 'primero'."
        )
    if not reason.strip():
        raise LegalTitleAnalysisValidationError("reason must not be empty.")

    row = await _fetch_title_analysis_scoped(
        analysis_id=analysis_id,
        organization_id=organization_id,
        project_id=project_id,
        supabase=client,
    )
    if str(row.get("status")) in NARRATIVE_EDITABLE_FORBIDDEN_STATUSES:
        raise LegalTitleAnalysisConflictError(
            f"Narrative blocks cannot be edited while the analysis is "
            f"'{row.get('status')}'."
        )

    edited_column = f"narrative_{block}_edited"
    updated_row = await _update_title_analysis(
        supabase=client,
        analysis_id=str(row["id"]),
        existing_row=row,
        payload={edited_column: edited_text},
    )
    await _insert_review_decision(
        supabase=client,
        decision_payload={
            "organization_id": str(row["organization_id"]),
            "project_id": str(row["project_id"]),
            "title_analysis_id": str(row["id"]),
            "decision_type": "title_block_edited",
            "decision_status": "approved",
            "reason": reason,
            "decision_payload": {
                "block": block,
                "generated": row.get(f"narrative_{block}_generated"),
                "edited": edited_text,
            },
            "decided_by": edited_by,
            "decided_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    logger.info(
        "title_narrative_edited",
        analysis_id=analysis_id,
        block=block,
        edited_by=edited_by,
    )
    narrative = _narrative_from_row(updated_row)
    return narrative or TitleAnalysisNarrative()


async def resolve_title_alert(
    analysis_id: str,
    alert_index: int,
    resolution: str,
    reason: str,
    resolved_by: str,
    organization_id: str,
    project_id: str,
    supabase: Any | None = None,
) -> TitleAlert:
    """Resolve an extracted title alert (acknowledged, clause_added, dismissed) with auditing."""
    from schemas.legal_titles import ALERT_RESOLUTION_REQUEST_STATES

    client = supabase or _get_supabase_client()
    if resolution not in ALERT_RESOLUTION_REQUEST_STATES:
        options = ", ".join(sorted(ALERT_RESOLUTION_REQUEST_STATES))
        raise LegalTitleAnalysisValidationError(
            f"resolution must be one of: {options}"
        )
    if not reason.strip():
        raise LegalTitleAnalysisValidationError("reason must not be empty.")

    row = await _fetch_title_analysis_scoped(
        analysis_id=analysis_id,
        organization_id=organization_id,
        project_id=project_id,
        supabase=client,
    )
    if str(row.get("status")) in NARRATIVE_EDITABLE_FORBIDDEN_STATUSES:
        raise LegalTitleAnalysisConflictError(
            f"Alerts cannot be resolved while the analysis is '{row.get('status')}'."
        )

    alerts = row.get("alerts") if isinstance(row.get("alerts"), list) else []
    if alert_index < 0 or alert_index >= len(alerts):
        raise LegalTitleAnalysisNotFoundError(
            f"Alert index {alert_index} does not exist on this analysis."
        )

    updated_alerts = [dict(alert) for alert in alerts]
    updated_alerts[alert_index] = {
        **updated_alerts[alert_index],
        "resolution": resolution,
        "reason": reason.strip(),
    }
    await _update_title_analysis(
        supabase=client,
        analysis_id=str(row["id"]),
        existing_row=row,
        payload={"alerts": updated_alerts},
    )
    await _insert_review_decision(
        supabase=client,
        decision_payload={
            "organization_id": str(row["organization_id"]),
            "project_id": str(row["project_id"]),
            "title_analysis_id": str(row["id"]),
            "decision_type": "title_alert_resolved",
            "decision_status": "approved",
            "reason": reason.strip(),
            "decision_payload": {
                "alert_index": alert_index,
                "tipo": updated_alerts[alert_index].get("tipo"),
                "resolution": resolution,
            },
            "decided_by": resolved_by,
            "decided_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    logger.info(
        "title_alert_resolved",
        analysis_id=analysis_id,
        alert_index=alert_index,
        resolution=resolution,
        resolved_by=resolved_by,
    )
    return TitleAlert.model_validate(updated_alerts[alert_index])


async def _fetch_title_variable_rows(
    *,
    supabase: Any,
    organization_id: str,
    project_id: str,
) -> list[dict[str, Any]]:
    """Fetch active titulo.* and matriz-identity variable resolutions."""
    if not hasattr(supabase, "table"):
        return []
    titulo_result = await _run_supabase(
        lambda: (
            supabase.table("variable_resolutions")
            .select("id, variable_key, state")
            .eq("organization_id", organization_id)
            .eq("project_id", project_id)
            .like("variable_key", "titulo.%")
            .neq("state", "superseded")
            .execute()
        )
    )
    matriz_result = await _run_supabase(
        lambda: (
            supabase.table("variable_resolutions")
            .select("id, variable_key, state")
            .eq("organization_id", organization_id)
            .eq("project_id", project_id)
            .in_("variable_key", sorted(MATRIZ_IDENTITY_VARIABLE_KEYS))
            .neq("state", "superseded")
            .execute()
        )
    )
    return _rows(titulo_result) + _rows(matriz_result)


async def approve_title_case(
    analysis_id: str,
    organization_id: str,
    project_id: str,
    approved_by: str,
    supabase: Any | None = None,
) -> TitleAnalysisResponseData:
    """Run approval checks and transition analysis status to approved."""
    client = supabase or _get_supabase_client()
    row = await _fetch_title_analysis_scoped(
        analysis_id=analysis_id,
        organization_id=organization_id,
        project_id=project_id,
        supabase=client,
    )
    status = str(row.get("status"))
    if status not in APPROVABLE_ANALYSIS_STATUSES:
        raise LegalTitleAnalysisConflictError(
            f"Title analysis in status '{status}' cannot be approved."
        )

    blocking: list[dict[str, Any]] = []
    variable_rows = await _fetch_title_variable_rows(
        supabase=client,
        organization_id=organization_id,
        project_id=project_id,
    )
    for variable in variable_rows:
        state = str(variable.get("state"))
        if state in {"manual_review", "conflict"}:
            blocking.append(
                {
                    "kind": "variable",
                    "key": variable.get("variable_key"),
                    "state": state,
                }
            )
    alerts_payload = row.get("alerts") if isinstance(row.get("alerts"), list) else []
    for alert in alerts_payload:
        if isinstance(alert, dict) and alert.get("resolution", "pending") == "pending":
            blocking.append({"kind": "alert", "tipo": alert.get("tipo")})

    if blocking:
        raise LegalTitleApprovalBlockedError(blocking)

    now = datetime.now(timezone.utc)
    proposed_ids = [
        str(variable["id"])
        for variable in variable_rows
        if str(variable.get("state")) == "proposed" and variable.get("id")
    ]
    if proposed_ids and hasattr(client, "table"):
        await _run_supabase(
            lambda: (
                client.table("variable_resolutions")
                .update(
                    {
                        "state": "approved",
                        "reviewed_by": approved_by,
                        "reviewed_at": now.isoformat(),
                    }
                )
                .in_("id", proposed_ids)
                .execute()
            )
        )

    approved_row = await _update_title_analysis(
        supabase=client,
        analysis_id=str(row["id"]),
        existing_row=row,
        payload={
            "status": "approved",
            "approved_by": approved_by,
            "approved_at": now.isoformat(),
        },
    )
    await _insert_review_decision(
        supabase=client,
        decision_payload={
            "organization_id": str(row["organization_id"]),
            "project_id": str(row["project_id"]),
            "title_analysis_id": str(row["id"]),
            "decision_type": "title_case_approved",
            "decision_status": "approved",
            "reason": None,
            "decision_payload": {"approved_variable_ids": proposed_ids},
            "decided_by": approved_by,
            "decided_at": now.isoformat(),
        },
    )
    logger.info(
        "title_case_approved",
        analysis_id=analysis_id,
        approved_by=approved_by,
        approved_variables=len(proposed_ids),
    )
    return _hydrate_title_analysis_row(approved_row)
