"""SDD 009 US1 tests for the project-scoped title analysis orchestrator.

Post-migration: the extraction core is the title agent (mocked here via
``agent_titulo.runner.run_title_agent``); the orchestrator owns OCR guard,
verification, block fact-check, staging, status and persistence.
"""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from agent_titulo.runner import TitleAgentRunOutcome, TitleAgentTimeoutError
from schemas.legal_titles import TitleAgentResult, TitleAnalysis
from services import legal_title_analysis


ORG_ID = "00000000-0000-4000-8000-000000000001"
PROJECT_ID = "00000000-0000-4000-8000-000000000002"
DOC_1996_ID = "00000000-0000-4000-8000-000000000096"
DOC_2023_ID = "00000000-0000-4000-8000-000000002023"

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "titulo"


def _settings(*, enabled: bool = True, max_input_chars: int = 240_000):
    return SimpleNamespace(
        LEGAL_TITLE_AGENT_ENABLED=enabled,
        LEGAL_TITLE_AGENT_PROVIDER="openai",
        LEGAL_TITLE_AGENT_MODEL="gpt-4o",
        LEGAL_TITLE_AGENT_TIMEOUT_SECONDS=300,
        LEGAL_TITLE_AGENT_MAX_INPUT_CHARS=max_input_chars,
        LEGAL_TITLE_AGENT_MAX_ITERATIONS=24,
        LEGAL_TITLE_AGENT_MAX_TOOL_CHARS=60_000,
    )


def _agent_outcome(
    analysis: TitleAnalysis,
    *,
    comparecencia: str | None = None,
    primero: str | None = None,
) -> TitleAgentRunOutcome:
    return TitleAgentRunOutcome(
        result=TitleAgentResult(
            analysis=analysis,
            narrativa_comparecencia=comparecencia,
            narrativa_primero=primero,
            notas_razonamiento=["nota de prueba"],
        ),
        token_usage={"input_tokens": 100, "output_tokens": 40, "total_tokens": 140},
        llm_calls=4,
        available=True,
    )


def _load_fixture(name: str) -> dict:
    return json.loads((FIXTURE_DIR / name).read_text(encoding="utf-8"))


def _fixture_document(name: str, document_id: str) -> dict:
    payload = _load_fixture(name)
    payload["legal_document_id"] = document_id
    return {
        "id": document_id,
        "legal_document_id": document_id,
        "document_type": payload["document_type"],
        "filename": f"{name}.pdf",
        "version": 1,
        "pages": payload["pages"],
    }


@pytest.fixture
def teno_title_documents() -> list[dict]:
    return [
        _fixture_document("teno_dominio_1996_pages.json", DOC_1996_ID),
        _fixture_document("teno_dominio_2023_pages.json", DOC_2023_ID),
    ]


@pytest.fixture
def golden_title_analysis() -> TitleAnalysis:
    return TitleAnalysis.model_validate(_load_fixture("llm_response_golden.json"))


async def test_llm_disabled_returns_manual_title_case_without_calling_pipeline(
    monkeypatch: pytest.MonkeyPatch,
    teno_title_documents: list[dict],
):
    async def fake_gather_title_source_documents(**kwargs):
        assert kwargs["organization_id"] == ORG_ID
        assert kwargs["project_id"] == PROJECT_ID
        return teno_title_documents

    async def fake_check_idempotency(**kwargs):
        assert kwargs["source_content_hash"]
        return None

    monkeypatch.setattr(legal_title_analysis, "get_settings", lambda: _settings(enabled=False))
    monkeypatch.setattr(
        legal_title_analysis,
        "gather_title_source_documents",
        fake_gather_title_source_documents,
    )
    monkeypatch.setattr(legal_title_analysis, "check_idempotency", fake_check_idempotency)

    result = await legal_title_analysis.run_title_analysis(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        supabase=object(),
    )

    assert result.status == "llm_disabled"
    assert result.structure_type is None
    assert result.analysis is not None
    assert result.analysis.inscripciones == []
    assert result.analysis.propietarios_actuales == []
    assert result.alerts == []
    assert result.verification is None
    assert result.pending_review == []
    assert result.run is not None
    assert result.run.extractor_name == legal_title_analysis.EXTRACTOR_NAME
    assert result.run.model_name == "gpt-4o"
    assert result.run.prompt_version == legal_title_analysis.PROMPT_VERSION


async def test_gathers_only_active_title_documents_with_ordered_pages(teno_title_documents: list[dict]):
    gathered = await legal_title_analysis.gather_title_source_documents(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        supabase=SimpleNamespace(seed_documents=teno_title_documents),
    )

    assert [doc["document_type"] for doc in gathered] == [
        "dominio_vigente",
        "dominio_vigente",
    ]
    assert [doc["id"] for doc in gathered] == [DOC_1996_ID, DOC_2023_ID]
    assert all(doc["pages"] for doc in gathered)
    assert gathered[0]["pages"][0]["page_number"] == 1
    assert "text_content" in gathered[0]["pages"][0]


def test_source_content_hash_is_stable_by_order_and_changes_with_page_text(
    teno_title_documents: list[dict],
):
    first_hash = legal_title_analysis.compute_source_content_hash(teno_title_documents)
    reversed_hash = legal_title_analysis.compute_source_content_hash(list(reversed(teno_title_documents)))
    changed_documents = [
        dict(doc, pages=[dict(page) for page in doc["pages"]])
        for doc in teno_title_documents
    ]
    changed_documents[0]["pages"][0]["text_content"] += " CAMBIO MATERIAL"

    changed_hash = legal_title_analysis.compute_source_content_hash(changed_documents)

    assert first_hash == reversed_hash
    assert changed_hash != first_hash


async def test_ocr_missing_text_marks_needs_review_without_agent_run(
    monkeypatch: pytest.MonkeyPatch,
    teno_title_documents: list[dict],
):
    """Spec US1 scenario 3: no extracted text -> needs_review/ocr_required,
    never invented chain data and no agent call."""
    empty_documents = [
        dict(
            doc,
            pages=[dict(page, text_content="") for page in doc["pages"]],
        )
        for doc in teno_title_documents
    ]
    agent_calls: list[int] = []

    async def fake_gather_title_source_documents(**_kwargs):
        return empty_documents

    async def fake_check_idempotency(**_kwargs):
        return None

    async def fake_run_title_agent(*_args, **_kwargs):
        agent_calls.append(1)
        raise AssertionError("agent must not run without OCR text")

    monkeypatch.setattr(legal_title_analysis, "get_settings", lambda: _settings(enabled=True))
    monkeypatch.setattr(
        legal_title_analysis,
        "gather_title_source_documents",
        fake_gather_title_source_documents,
    )
    monkeypatch.setattr(legal_title_analysis, "check_idempotency", fake_check_idempotency)
    monkeypatch.setattr("agent_titulo.runner.run_title_agent", fake_run_title_agent)

    result = await legal_title_analysis.run_title_analysis(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        supabase=object(),
    )

    assert result.status == "needs_review"
    assert agent_calls == []


async def test_existing_same_hash_analysis_is_returned_without_reprocessing(
    monkeypatch: pytest.MonkeyPatch,
    teno_title_documents: list[dict],
):
    existing_row = {
        "id": "00000000-0000-4000-8000-000000000777",
        "status": "proposed",
        "structure_type": "compra_derechos",
        "analysis_json": _load_fixture("llm_response_golden.json"),
        "alerts": [],
        "verification_stats": {"verified_count": 1, "unverified_count": 0, "failures": []},
        "extractor_name": legal_title_analysis.EXTRACTOR_NAME,
        "model_name": "gpt-4o",
        "prompt_version": legal_title_analysis.PROMPT_VERSION,
    }

    async def fake_gather_title_source_documents(**_kwargs):
        return teno_title_documents

    async def fake_check_idempotency(**_kwargs):
        return existing_row

    monkeypatch.setattr(legal_title_analysis, "get_settings", lambda: _settings(enabled=True))
    monkeypatch.setattr(
        legal_title_analysis,
        "gather_title_source_documents",
        fake_gather_title_source_documents,
    )
    monkeypatch.setattr(legal_title_analysis, "check_idempotency", fake_check_idempotency)

    result = await legal_title_analysis.run_title_analysis(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        supabase=object(),
    )

    assert str(result.id) == existing_row["id"]
    assert result.status == "proposed"
    assert result.structure_type == "compra_derechos"


async def test_enabled_agent_runs_once_over_whole_corpus(
    monkeypatch: pytest.MonkeyPatch,
    teno_title_documents: list[dict],
    golden_title_analysis: TitleAnalysis,
):
    """FR-035: the agent receives all documents as a single case (one run),
    never one isolated extraction per document."""
    calls: list[list[dict]] = []

    async def fake_gather_title_source_documents(**_kwargs):
        # Align document ids with the golden fixture evidence so the
        # verifier sees the documents the recorded analysis cites.
        for doc, fixture_id in zip(teno_title_documents, ("doc_1996_id", "doc_2023_id")):
            doc["id"] = fixture_id
            doc["legal_document_id"] = fixture_id
        return teno_title_documents

    async def fake_check_idempotency(**_kwargs):
        return None

    async def fake_run_title_agent(documents: list[dict], **_kwargs):
        calls.append(documents)
        return _agent_outcome(golden_title_analysis)

    monkeypatch.setattr(
        legal_title_analysis,
        "get_settings",
        lambda: _settings(enabled=True, max_input_chars=2_500),
    )
    monkeypatch.setattr(
        legal_title_analysis,
        "gather_title_source_documents",
        fake_gather_title_source_documents,
    )
    monkeypatch.setattr(legal_title_analysis, "check_idempotency", fake_check_idempotency)
    monkeypatch.setattr("agent_titulo.runner.run_title_agent", fake_run_title_agent)

    result = await legal_title_analysis.run_title_analysis(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        supabase=object(),
    )

    assert result.status == "proposed"
    assert result.structure_type == "compra_derechos"
    assert len(calls) == 1
    assert calls[0] == teno_title_documents


async def test_agent_unavailable_persists_llm_disabled(
    monkeypatch: pytest.MonkeyPatch,
    teno_title_documents: list[dict],
):
    """FR-016: flag enabled but provider key missing -> manual mode, not a
    silent empty proposal."""

    async def fake_gather_title_source_documents(**_kwargs):
        return teno_title_documents

    async def fake_check_idempotency(**_kwargs):
        return None

    async def fake_run_title_agent(*_args, **_kwargs):
        return TitleAgentRunOutcome(result=TitleAgentResult(), available=False)

    monkeypatch.setattr(legal_title_analysis, "get_settings", lambda: _settings(enabled=True))
    monkeypatch.setattr(
        legal_title_analysis,
        "gather_title_source_documents",
        fake_gather_title_source_documents,
    )
    monkeypatch.setattr(legal_title_analysis, "check_idempotency", fake_check_idempotency)
    monkeypatch.setattr("agent_titulo.runner.run_title_agent", fake_run_title_agent)

    result = await legal_title_analysis.run_title_analysis(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        supabase=object(),
    )

    assert result.status == "llm_disabled"


async def test_agent_timeout_persists_failed_state_with_failure_code(
    monkeypatch: pytest.MonkeyPatch,
    teno_title_documents: list[dict],
):
    async def fake_gather_title_source_documents(**_kwargs):
        return teno_title_documents

    async def fake_run_title_agent(*_args, **_kwargs):
        raise TitleAgentTimeoutError("agent run exceeded budget")

    async def fake_check_idempotency(**_kwargs):
        return None

    monkeypatch.setattr(legal_title_analysis, "get_settings", lambda: _settings(enabled=True))
    monkeypatch.setattr(
        legal_title_analysis,
        "gather_title_source_documents",
        fake_gather_title_source_documents,
    )
    monkeypatch.setattr(legal_title_analysis, "check_idempotency", fake_check_idempotency)
    monkeypatch.setattr("agent_titulo.runner.run_title_agent", fake_run_title_agent)

    result = await legal_title_analysis.run_title_analysis(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        supabase=object(),
    )

    assert result.status == "failed"
    assert result.run is not None


async def test_run_title_analysis_stages_proposals_in_db(
    monkeypatch: pytest.MonkeyPatch,
    teno_title_documents: list[dict],
    golden_title_analysis: TitleAnalysis,
):
    persisted_proposals = []

    class FakeVariableResolutionService:
        def validate_proposal(self, prop):
            return prop
        def classify_proposals(self, props):
            from services.legal_variable_resolution import ClassifiedVariableProposal
            return [ClassifiedVariableProposal(proposal=p, classification="proposed") for p in props]
        async def persist_proposals(self, classified_props, supabase=None):
            for cp in classified_props:
                persisted_proposals.append(cp.proposal)

    async def fake_gather_title_source_documents(**_kwargs):
        teno_title_documents[0]["id"] = "doc_1996_id"
        teno_title_documents[0]["legal_document_id"] = "doc_1996_id"
        teno_title_documents[1]["id"] = "doc_2023_id"
        teno_title_documents[1]["legal_document_id"] = "doc_2023_id"
        for doc in teno_title_documents:
            doc_id = doc["legal_document_id"]
            for p_idx, page in enumerate(doc.get("pages", [])):
                page["id"] = f"page-uuid-{doc_id}-{page.get('page_number')}"
        return teno_title_documents

    async def fake_check_idempotency(**_kwargs):
        return None

    async def fake_run_title_agent(documents: list[dict], **_kwargs):
        return _agent_outcome(golden_title_analysis)

    class FakeSupabaseClient:
        def table(self, table_name):
            class Query:
                def __init__(self):
                    self.payload = {}
                def select(self, *args, **kwargs): return self
                def eq(self, *args, **kwargs): return self
                def neq(self, *args, **kwargs): return self
                def update(self, payload, *args, **kwargs):
                    self.payload = payload
                    return self
                def insert(self, payload, *args, **kwargs):
                    self.payload = payload
                    return self
                def maybe_single(self, *args, **kwargs): return self
                def execute(self):
                    class Result:
                        def __init__(self, p):
                            row = {"id": "00000000-0000-4000-8000-000000000003", "sii_role_matrix": "67-23"}
                            if isinstance(p, dict):
                                row.update(p)
                            elif isinstance(p, list) and p:
                                row.update(p[0])
                            self.data = [row]
                    return Result(self.payload)
            return Query()

    monkeypatch.setattr(legal_title_analysis, "get_settings", lambda: _settings(enabled=True))
    monkeypatch.setattr(
        legal_title_analysis,
        "gather_title_source_documents",
        fake_gather_title_source_documents,
    )
    monkeypatch.setattr(legal_title_analysis, "check_idempotency", fake_check_idempotency)
    monkeypatch.setattr("agent_titulo.runner.run_title_agent", fake_run_title_agent)
    monkeypatch.setattr(
        "services.legal_variable_resolution.LegalVariableResolutionService",
        FakeVariableResolutionService,
    )

    result = await legal_title_analysis.run_title_analysis(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        supabase=FakeSupabaseClient(),
    )

    assert result.status == "proposed"
    assert len(persisted_proposals) > 0

    keys = {p.variable_key for p in persisted_proposals}
    assert "titulo.estructura" in keys
    assert "titulo.inscripciones[]" in keys
    assert "titulo.propietarios[]" in keys
    assert "titulo.comparecencia_vendedor_texto" in keys
    assert "titulo.clausula_primero_texto" in keys
    assert "titulo.alertas[]" in keys

    insc_props = [p for p in persisted_proposals if p.variable_key == "titulo.inscripciones[]"]
    assert len(insc_props) == 2
    assert {p.source_ref.get("inscription_index") for p in insc_props} == {1, 2}

    owner_props = [p for p in persisted_proposals if p.variable_key == "titulo.propietarios[]"]
    assert len(owner_props) == 1
    assert owner_props[0].source_ref.get("owner_index") == 1

    props_with_evidence = [p for p in persisted_proposals if p.evidence]
    assert len(props_with_evidence) > 0
    for prop in props_with_evidence:
        for ev in prop.evidence:
            assert ev.legal_document_id is not None
            assert ev.legal_document_page_id is not None
            assert ev.legal_document_page_id.startswith("page-uuid-")

    assert "matriz.nombre_predio" in keys
    assert "matriz.superficie_total" in keys
    assert "matriz.deslindes.norte" in keys
    assert "vendedor.nombre" in keys
    assert "vendedor.rut" in keys


# ── SDD 009 US4 (T036): alerts taxonomy, persistence and SII cross-check ──


def _make_fake_supabase_client(sii_rol_matriz: str | None):
    class FakeSupabaseClient:
        def table(self, table_name):
            class Query:
                def __init__(self):
                    self.payload = {}
                def select(self, *args, **kwargs): return self
                def eq(self, *args, **kwargs): return self
                def neq(self, *args, **kwargs): return self
                def update(self, payload, *args, **kwargs):
                    self.payload = payload
                    return self
                def insert(self, payload, *args, **kwargs):
                    self.payload = payload
                    return self
                def maybe_single(self, *args, **kwargs): return self
                def execute(self):
                    class Result:
                        def __init__(self, p):
                            row = {
                                "id": "00000000-0000-4000-8000-000000000003",
                                "sii_role_matrix": sii_rol_matriz,
                            }
                            if isinstance(p, dict):
                                row.update(p)
                            elif isinstance(p, list) and p:
                                row.update(p[0])
                            self.data = [row]
                    return Result(self.payload)
            return Query()

    return FakeSupabaseClient()


async def _run_pipeline_for_alert_tests(
    monkeypatch: pytest.MonkeyPatch,
    teno_title_documents: list[dict],
    analysis: TitleAnalysis,
    *,
    sii_rol_matriz: str | None,
    comparecencia: str | None = None,
    primero: str | None = None,
):
    """Run the orchestrator with a mocked agent, capturing staged proposals."""
    persisted_proposals = []

    class FakeVariableResolutionService:
        def validate_proposal(self, prop):
            return prop
        def classify_proposals(self, props):
            from services.legal_variable_resolution import ClassifiedVariableProposal
            return [ClassifiedVariableProposal(proposal=p, classification="proposed") for p in props]
        async def persist_proposals(self, classified_props, supabase=None):
            for cp in classified_props:
                persisted_proposals.append(cp.proposal)

    async def fake_gather_title_source_documents(**_kwargs):
        teno_title_documents[0]["id"] = "doc_1996_id"
        teno_title_documents[0]["legal_document_id"] = "doc_1996_id"
        teno_title_documents[1]["id"] = "doc_2023_id"
        teno_title_documents[1]["legal_document_id"] = "doc_2023_id"
        for doc in teno_title_documents:
            doc_id = doc["legal_document_id"]
            for page in doc.get("pages", []):
                page["id"] = f"page-uuid-{doc_id}-{page.get('page_number')}"
        return teno_title_documents

    async def fake_check_idempotency(**_kwargs):
        return None

    async def fake_run_title_agent(documents: list[dict], **_kwargs):
        return _agent_outcome(
            analysis, comparecencia=comparecencia, primero=primero
        )

    monkeypatch.setattr(legal_title_analysis, "get_settings", lambda: _settings(enabled=True))
    monkeypatch.setattr(
        legal_title_analysis,
        "gather_title_source_documents",
        fake_gather_title_source_documents,
    )
    monkeypatch.setattr(legal_title_analysis, "check_idempotency", fake_check_idempotency)
    monkeypatch.setattr("agent_titulo.runner.run_title_agent", fake_run_title_agent)
    monkeypatch.setattr(
        "services.legal_variable_resolution.LegalVariableResolutionService",
        FakeVariableResolutionService,
    )

    result = await legal_title_analysis.run_title_analysis(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        supabase=_make_fake_supabase_client(sii_rol_matriz),
    )
    return result, persisted_proposals


async def test_alerts_persist_with_taxonomy_evidence_and_pending_resolution(
    monkeypatch: pytest.MonkeyPatch,
    teno_title_documents: list[dict],
    golden_title_analysis: TitleAnalysis,
):
    from schemas.legal_titles import TITLE_ALERT_TIPOS

    analysis = golden_title_analysis.model_copy(deep=True)
    # The model must not be able to pre-resolve an alert: a fresh run always
    # restarts the lawyer-owned resolution state.
    analysis.alertas[0].resolution = "acknowledged"

    result, proposals = await _run_pipeline_for_alert_tests(
        monkeypatch, teno_title_documents, analysis, sii_rol_matriz="67-23"
    )

    assert result.status == "proposed"
    assert {alert.tipo for alert in result.alerts} <= TITLE_ALERT_TIPOS
    assert {alert.tipo for alert in result.alerts} >= {"dl_3516", "derechos_aguas"}
    assert all(alert.resolution == "pending" for alert in result.alerts)
    for alert in result.alerts:
        assert alert.evidence is not None
        assert alert.evidence.snippet
        assert alert.evidence.legal_document_id

    alert_props = [p for p in proposals if p.variable_key == "titulo.alertas[]"]
    assert len(alert_props) == len(result.alerts)
    assert all(p.evidence for p in alert_props)


async def test_sii_rol_cross_check_ok_stages_rol_as_proposed(
    monkeypatch: pytest.MonkeyPatch,
    teno_title_documents: list[dict],
    golden_title_analysis: TitleAnalysis,
):
    _result, proposals = await _run_pipeline_for_alert_tests(
        monkeypatch,
        teno_title_documents,
        golden_title_analysis.model_copy(deep=True),
        sii_rol_matriz="67-23",
    )
    rol_props = [p for p in proposals if p.variable_key == "matriz.rol_avaluo"]
    assert len(rol_props) == 1
    assert rol_props[0].state == "proposed"


async def test_sii_rol_cross_check_mismatch_stages_rol_as_conflict(
    monkeypatch: pytest.MonkeyPatch,
    teno_title_documents: list[dict],
    golden_title_analysis: TitleAnalysis,
):
    result, proposals = await _run_pipeline_for_alert_tests(
        monkeypatch,
        teno_title_documents,
        golden_title_analysis.model_copy(deep=True),
        sii_rol_matriz="999-1",
    )
    rol_props = [p for p in proposals if p.variable_key == "matriz.rol_avaluo"]
    assert len(rol_props) == 1
    assert rol_props[0].state == "conflict"
    assert result.verification is not None
    assert any(
        failure.reason == "sii_mismatch" for failure in result.verification.failures
    )


# ── T062/T063: LLM-noise hardening of the structured-output contract ────


def test_invalid_structure_type_from_llm_coerces_to_none():
    """Models occasionally leak step names into structure_type; the DB check
    constraint must never see them (regression: 'identity_alerts')."""
    analysis = TitleAnalysis.model_validate({"structure_type": "identity_alerts"})
    assert analysis.structure_type is None

    valid = TitleAnalysis.model_validate({"structure_type": "compra_derechos"})
    assert valid.structure_type == "compra_derechos"


def test_invalid_alert_resolution_from_llm_coerces_to_pending():
    """Regression: a hallucinated resolution value must not abort the run."""
    analysis = TitleAnalysis.model_validate(
        {
            "alertas": [
                {"tipo": "vigente_en_el_resto", "resolution": "compra_derechos"}
            ]
        }
    )
    assert analysis.alertas[0].resolution == "pending"


# ── F2 migration: verification-driven status and block staging ──────────


async def test_verification_failures_force_needs_review_status(
    monkeypatch: pytest.MonkeyPatch,
    teno_title_documents: list[dict],
    golden_title_analysis: TitleAnalysis,
):
    """Status must reflect verification: a chain with failed evidence can
    never surface as 'proposed' (the pre-migration bug)."""
    tainted = golden_title_analysis.model_copy(deep=True)
    # Altered surname with the true snippet: value_mismatch on verification.
    tainted.inscripciones[0].antecesor.nombre.value = "LUIS ARMANDO MINCHELLI BALLADARES"

    result, _proposals = await _run_pipeline_for_alert_tests(
        monkeypatch, teno_title_documents, tainted, sii_rol_matriz="67-23"
    )

    assert result.status == "needs_review"
    assert result.verification is not None
    assert result.verification.unverified_count >= 1


async def test_agent_blocks_stage_proposed_when_fact_check_passes(
    monkeypatch: pytest.MonkeyPatch,
    teno_title_documents: list[dict],
    golden_title_analysis: TitleAnalysis,
):
    golden_blocks = (FIXTURE_DIR / "teno_golden_blocks.md").read_text(encoding="utf-8")
    comparecencia = " ".join(
        golden_blocks.split("## comparecencia")[1].split("## primero")[0].split()
    )
    primero = " ".join(golden_blocks.split("## primero")[1].split())

    result, proposals = await _run_pipeline_for_alert_tests(
        monkeypatch,
        teno_title_documents,
        golden_title_analysis.model_copy(deep=True),
        sii_rol_matriz="67-23",
        comparecencia=comparecencia,
        primero=primero,
    )

    states = {
        p.variable_key: p.state
        for p in proposals
        if p.variable_key
        in {"titulo.comparecencia_vendedor_texto", "titulo.clausula_primero_texto"}
    }
    assert states["titulo.comparecencia_vendedor_texto"] == "proposed"
    assert states["titulo.clausula_primero_texto"] == "proposed"
    assert result.narrative is not None
    assert result.narrative.comparecencia is not None
    assert result.narrative.comparecencia.generated == comparecencia


async def test_missing_agent_blocks_stage_manual_review_with_visible_reason(
    monkeypatch: pytest.MonkeyPatch,
    teno_title_documents: list[dict],
    golden_title_analysis: TitleAnalysis,
):
    """FR-006: an absent draft degrades with a visible reason in
    verification_stats.block_checks — never a silent None."""
    result, proposals = await _run_pipeline_for_alert_tests(
        monkeypatch,
        teno_title_documents,
        golden_title_analysis.model_copy(deep=True),
        sii_rol_matriz="67-23",
        comparecencia=None,
        primero=None,
    )

    states = {
        p.variable_key: p.state
        for p in proposals
        if p.variable_key
        in {"titulo.comparecencia_vendedor_texto", "titulo.clausula_primero_texto"}
    }
    assert states["titulo.comparecencia_vendedor_texto"] == "manual_review"
    assert states["titulo.clausula_primero_texto"] == "manual_review"
