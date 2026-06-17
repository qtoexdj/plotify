"""Tests for the SDD 009 title agent (LangGraph loop, tools, bounded run).

No live LLM (agent-execution rule): the loop is exercised with a scripted
fake chat model that replays a recorded tool-call sequence over the Teno
fixture pages.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage

from agent_titulo.runner import (
    TitleAgentTimeoutError,
    run_title_agent,
)
from agent_titulo.tools import (
    HechoAVerificar,
    TitleAgentContext,
    build_title_agent_tools,
)
from schemas.legal_titles import TitleAgentResult

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "titulo"
DOC_1996_ID = "doc_1996_id"
DOC_2023_ID = "doc_2023_id"


def _load_documents() -> list[dict]:
    documents = []
    for filename in ("teno_dominio_1996_pages.json", "teno_dominio_2023_pages.json"):
        payload = json.loads((FIXTURE_DIR / filename).read_text(encoding="utf-8"))
        doc_id = str(payload["legal_document_id"])
        documents.append(
            {
                "legal_document_id": doc_id,
                "document_type": str(payload["document_type"]),
                "filename": filename,
                "version": 1,
                "pages": [
                    {
                        "id": f"{doc_id}-p{page['page_number']}",
                        "page_number": int(page["page_number"]),
                        "text_content": str(page["text_content"]),
                    }
                    for page in payload["pages"]
                ],
            }
        )
    return documents


def _golden_result() -> TitleAgentResult:
    golden = json.loads(
        (FIXTURE_DIR / "llm_response_golden.json").read_text(encoding="utf-8")
    )
    return TitleAgentResult(analysis=golden, notas_razonamiento=["caso teno"])


def _tools_by_name(context: TitleAgentContext) -> dict:
    return {tool.name: tool for tool in build_title_agent_tools(context)}


class FakeAgentLLM(GenericFakeChatModel):
    """Scripted chat model: replays AIMessages and serves structured output."""

    structured_result: TitleAgentResult | None = None

    def bind_tools(self, tools, **kwargs):  # noqa: ANN001 - test double
        return self

    def with_structured_output(self, schema, **kwargs):  # noqa: ANN001
        outer = self

        class _Structured:
            async def ainvoke(self, _messages):
                raw = AIMessage(
                    content="",
                    usage_metadata={
                        "input_tokens": 700,
                        "output_tokens": 300,
                        "total_tokens": 1000,
                    },
                )
                return {"raw": raw, "parsed": outer.structured_result, "parsing_error": None}

        return _Structured()


def _scripted_llm(script: list[AIMessage], result: TitleAgentResult) -> FakeAgentLLM:
    llm = FakeAgentLLM(messages=iter(script))
    llm.structured_result = result
    return llm


def _tool_call_message(call_id: str, name: str, args: dict) -> AIMessage:
    return AIMessage(
        content="",
        tool_calls=[{"id": call_id, "name": name, "args": args}],
        usage_metadata={"input_tokens": 100, "output_tokens": 20, "total_tokens": 120},
    )


# ── Tools ──────────────────────────────────────────────────────────────


class TestTitleAgentTools:
    def setup_method(self):
        self.context = TitleAgentContext(
            documents=_load_documents(),
            expediente={"sii_rol_matriz": "67-23", "plano_superficie": None},
            max_tool_chars=60_000,
        )
        self.tools = _tools_by_name(self.context)

    def test_listar_documentos_inventories_both_titles(self):
        inventory = json.loads(self.tools["listar_documentos"].invoke({}))
        ids = {item["legal_document_id"] for item in inventory}
        assert ids == {DOC_1996_ID, DOC_2023_ID}
        assert all(item["paginas"] >= 1 for item in inventory)

    def test_leer_paginas_returns_page_headers(self):
        output = self.tools["leer_paginas"].invoke(
            {"legal_document_id": DOC_1996_ID, "pagina_desde": 1}
        )
        assert "[pagina=1]" in output
        assert "ERROR" not in output

    def test_leer_paginas_unknown_document_errors(self):
        output = self.tools["leer_paginas"].invoke(
            {"legal_document_id": "no-existe"}
        )
        assert output.startswith("ERROR")

    def test_leer_paginas_respects_budget_without_silent_truncation(self):
        small_context = TitleAgentContext(
            documents=_load_documents(),
            max_tool_chars=600,
        )
        tools = _tools_by_name(small_context)
        output = tools["leer_paginas"].invoke({"legal_document_id": DOC_1996_ID})
        # Either a whole page fits plus the continuation notice, or the page
        # itself exceeds the budget and the tool says so explicitly.
        assert "[SALIDA ACOTADA]" in output or output.startswith("ERROR")

    def test_buscar_texto_is_accent_and_case_insensitive(self):
        output = json.loads(self.tools["buscar_texto"].invoke({"consulta": "CURICO"}))
        assert output, "expected matches for Curicó with accent-insensitive query"
        assert {match["legal_document_id"] for match in output} <= {
            DOC_1996_ID,
            DOC_2023_ID,
        }
        assert all(match["fragmento_literal"] for match in output)

    def test_buscar_texto_returns_literal_fragment(self):
        matches = json.loads(self.tools["buscar_texto"].invoke({"consulta": "Minghel"}))
        assert matches
        page_text = next(
            page["text_content"]
            for doc in self.context.documents
            if doc["legal_document_id"] == matches[0]["legal_document_id"]
            for page in doc["pages"]
            if page["page_number"] == matches[0]["pagina"]
        )
        assert matches[0]["fragmento_literal"] in page_text

    def test_verificar_hechos_accepts_literal_and_rejects_altered(self):
        matches = json.loads(self.tools["buscar_texto"].invoke({"consulta": "Minghel"}))
        snippet = matches[0]["fragmento_literal"]
        results = json.loads(
            self.tools["verificar_hechos"].invoke(
                {
                    "hechos": [
                        {
                            "valor": "Minghel",
                            "legal_document_id": matches[0]["legal_document_id"],
                            "pagina": matches[0]["pagina"],
                            "snippet": snippet,
                        },
                        {
                            "valor": "Minchelli",
                            "legal_document_id": matches[0]["legal_document_id"],
                            "pagina": matches[0]["pagina"],
                            "snippet": snippet,
                        },
                        {
                            "valor": "lo que sea",
                            "legal_document_id": matches[0]["legal_document_id"],
                            "pagina": 99,
                            "snippet": snippet,
                        },
                    ]
                }
            )
        )
        assert results[0]["ok"] is True
        assert results[1]["ok"] is False
        assert results[1]["motivo"] == "valor_inconsistente_con_snippet"
        assert results[2]["ok"] is False
        assert results[2]["motivo"] == "pagina_no_encontrada"

    def test_word_tools_render_legal_spanish(self):
        assert (
            self.tools["numero_a_palabras"].invoke({"numero": 4699})
            == "cuatro mil seiscientos noventa y nueve"
        )
        assert (
            self.tools["fecha_a_palabras"].invoke({"fecha": "2022-02-02"})
            == "dos de febrero de dos mil veintidós"
        )
        assert (
            self.tools["rut_a_palabras"].invoke({"rut": "4.606.955-2"})
            == "cuatro millones seiscientos seis mil novecientos cincuenta y cinco guion dos"
        )

    def test_datos_expediente_exposes_deterministic_data(self):
        payload = json.loads(self.tools["datos_expediente"].invoke({}))
        assert payload["sii_rol_matriz"] == "67-23"


# ── Runner / graph ─────────────────────────────────────────────────────


class TestTitleAgentRunner:
    @pytest.mark.asyncio
    async def test_scripted_run_consolidates_and_reports_usage(self):
        documents = _load_documents()
        golden = _golden_result()
        script = [
            _tool_call_message("c1", "listar_documentos", {}),
            _tool_call_message(
                "c2", "leer_paginas", {"legal_document_id": DOC_1996_ID}
            ),
            _tool_call_message(
                "c3", "leer_paginas", {"legal_document_id": DOC_2023_ID}
            ),
            AIMessage(
                content="Cadena consolidada; entrego resultado.",
                usage_metadata={
                    "input_tokens": 200,
                    "output_tokens": 50,
                    "total_tokens": 250,
                },
            ),
        ]
        outcome = await run_title_agent(
            documents,
            expediente={"sii_rol_matriz": "67-23"},
            llm=_scripted_llm(script, golden),
            timeout=30,
            max_iterations=10,
        )
        assert outcome.available is True
        assert outcome.result.analysis.structure_type == "compra_derechos"
        assert len(outcome.result.analysis.inscripciones) == 2
        # 4 scripted turns + 1 synthesis call
        assert outcome.llm_calls == 5
        assert outcome.token_usage["total_tokens"] == 120 * 3 + 250 + 1000

    @pytest.mark.asyncio
    async def test_iteration_budget_forces_synthesis(self):
        documents = _load_documents()
        golden = _golden_result()
        # The script always asks for another tool call; the budget must cut
        # the loop and still produce a structured result.
        script = [
            _tool_call_message(f"c{i}", "listar_documentos", {}) for i in range(20)
        ]
        outcome = await run_title_agent(
            documents,
            llm=_scripted_llm(script, golden),
            timeout=30,
            max_iterations=3,
        )
        assert outcome.available is True
        assert outcome.result.analysis.structure_type == "compra_derechos"
        # 3 loop turns + synthesis
        assert outcome.llm_calls == 4

    @pytest.mark.asyncio
    async def test_timeout_raises_dedicated_error(self):
        documents = _load_documents()
        golden = _golden_result()

        class SlowLLM(FakeAgentLLM):
            async def _agenerate(self, *args, **kwargs):  # noqa: ANN002, ANN003
                import asyncio

                await asyncio.sleep(5)
                return await super()._agenerate(*args, **kwargs)

        llm = SlowLLM(messages=iter([AIMessage(content="x")]))
        llm.structured_result = golden
        with pytest.raises(TitleAgentTimeoutError):
            await run_title_agent(documents, llm=llm, timeout=1, max_iterations=2)

    @pytest.mark.asyncio
    async def test_disabled_returns_unavailable(self, monkeypatch):
        from types import SimpleNamespace

        import agent_titulo.runner as runner_module

        monkeypatch.setattr(
            runner_module,
            "get_settings",
            lambda: SimpleNamespace(
                LEGAL_TITLE_AGENT_ENABLED=False,
                LEGAL_TITLE_AGENT_PROVIDER="openai",
                LEGAL_TITLE_AGENT_MODEL="gpt-4o",
                LEGAL_TITLE_AGENT_TIMEOUT_SECONDS=300,
                LEGAL_TITLE_AGENT_MAX_ITERATIONS=24,
                LEGAL_TITLE_AGENT_MAX_TOOL_CHARS=60_000,
            ),
        )
        outcome = await run_title_agent(_load_documents())
        assert outcome.available is False
        assert outcome.result.analysis.inscripciones == []


class TestHechoSchema:
    def test_hecho_model_round_trip(self):
        hecho = HechoAVerificar(
            valor="1996",
            legal_document_id=DOC_1996_ID,
            pagina=1,
            snippet="año mil novecientos noventa y seis",
        )
        assert hecho.pagina == 1


class TestLlmClientReasoningEffort:
    """SDD 011: el nivel de razonamiento configurable se aplica a los modelos
    gpt-5/o-series y los modelos sin razonamiento conservan temperature=0."""

    def _patch_settings(self, monkeypatch, effort: str) -> None:
        from types import SimpleNamespace

        import agent_titulo.runner as runner_module

        monkeypatch.setattr(
            runner_module,
            "get_settings",
            lambda: SimpleNamespace(
                OPENAI_API_KEY="sk-test",
                LEGAL_TITLE_AGENT_REASONING_EFFORT=effort,
            ),
        )

    def test_gpt5_uses_reasoning_effort_and_no_temperature(self, monkeypatch):
        import agent_titulo.runner as runner_module

        self._patch_settings(monkeypatch, "high")
        client = runner_module._get_llm_client("openai", "gpt-5.5", 300)
        assert getattr(client, "reasoning_effort", None) == "high"
        assert getattr(client, "temperature", None) is None

    def test_gpt5_without_effort_omits_reasoning_effort(self, monkeypatch):
        import agent_titulo.runner as runner_module

        self._patch_settings(monkeypatch, "")
        client = runner_module._get_llm_client("openai", "gpt-5.5", 300)
        assert not getattr(client, "reasoning_effort", None)

    def test_non_reasoning_model_keeps_temperature(self, monkeypatch):
        import agent_titulo.runner as runner_module

        self._patch_settings(monkeypatch, "high")
        client = runner_module._get_llm_client("openai", "gpt-4o", 300)
        assert getattr(client, "temperature", None) == 0.0
        assert not getattr(client, "reasoning_effort", None)
