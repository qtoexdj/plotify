"""LangGraph runner for the title agent.

Graph shape (mirrors the proven pattern in ``apps/api/agent/graph.py``, no
checkpointer — each analysis run is a stateless batch job):

    START -> agente <-> tools
                 \\-> sintesis -> END

``agente`` is the bounded ReAct loop; ``sintesis`` forces the final
structured ``TitleAgentResult`` over the full investigation transcript.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Annotated, Any, TypedDict

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode

from core.config import get_settings
from core.logger import get_logger
from schemas.legal_titles import TitleAgentResult
from agent_titulo.prompts import TITULO_AGENT_SYSTEM_PROMPT
from agent_titulo.tools import TitleAgentContext, build_title_agent_tools

logger = get_logger(__name__)


class TitleAgentError(Exception):
    """Base error for title agent runs."""


class TitleAgentTimeoutError(TitleAgentError):
    """The whole agent run exceeded its time budget."""


class TitleAgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    result: TitleAgentResult | None


@dataclass(slots=True)
class TitleAgentRunOutcome:
    """Result of one agent run plus observability data (FR-007/FR-017)."""

    result: TitleAgentResult
    token_usage: dict[str, int] = field(
        default_factory=lambda: {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}
    )
    llm_calls: int = 0
    available: bool = True


def _get_llm_client(provider: str, model: str, timeout: int) -> Any:
    """ChatOpenAI or ChatAnthropic per provider settings; None when the key
    is missing so the orchestrator can represent llm_disabled."""
    settings = get_settings()

    if provider == "openai":
        from langchain_openai import ChatOpenAI

        api_key = settings.OPENAI_API_KEY
        if not api_key:
            logger.warning("openai_api_key_missing_for_title_agent")
            return None
        client_kwargs: dict[str, Any] = {
            "model": model,
            "api_key": api_key,
            "timeout": timeout,
        }
        # GPT-5 family (reasoning models) rejects explicit temperature; older
        # models keep 0.0 for deterministic extraction.
        if not model.startswith("gpt-5"):
            client_kwargs["temperature"] = 0.0
        return ChatOpenAI(**client_kwargs)
    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic

        api_key = settings.ANTHROPIC_API_KEY
        if not api_key:
            logger.warning("anthropic_api_key_missing_for_title_agent")
            return None
        return ChatAnthropic(
            model=model,
            temperature=0.0,
            api_key=api_key,
            timeout=timeout,
        )
    logger.error("unsupported_title_agent_provider", provider=provider)
    return None


def _initial_task_message(context: TitleAgentContext) -> HumanMessage:
    lines = [
        "Analiza el caso de título de este proyecto. Documentos activos:",
    ]
    for document in context.documents:
        doc_id = str(document.get("legal_document_id") or document.get("id") or "")
        doc_type = str(document.get("document_type") or "")
        filename = str(document.get("filename") or document.get("original_filename") or "")
        pages = len(document.get("pages", []) or [])
        lines.append(f"- {doc_type} | id={doc_id} | {filename} | {pages} página(s)")
    lines.append(
        "Lee todo el corpus, reconstruye la cadena consolidada, verifica tus "
        "hechos críticos con `verificar_hechos`, redacta los bloques y "
        "entrega el resultado final."
    )
    return HumanMessage(content="\n".join(lines))


def _count_ai_turns(messages: list[BaseMessage]) -> int:
    return sum(1 for message in messages if isinstance(message, AIMessage))


def _accumulate_usage(usage: dict[str, int], message: Any) -> None:
    metadata = getattr(message, "usage_metadata", None)
    if not metadata:
        return
    usage["input_tokens"] += int(metadata.get("input_tokens") or 0)
    usage["output_tokens"] += int(metadata.get("output_tokens") or 0)
    usage["total_tokens"] += int(metadata.get("total_tokens") or 0)


SYNTHESIS_INSTRUCTION = (
    "Entrega AHORA el resultado final estructurado (TitleAgentResult) con la "
    "cadena consolidada, propietarios actuales, identidad del inmueble, "
    "alertas, bloques narrativos y notas de razonamiento. Incluye solo hechos "
    "con evidencia literal; deja null lo que no tenga respaldo."
)


def build_title_agent_graph(
    *,
    llm: Any,
    tools: list[Any],
    max_iterations: int,
    token_usage: dict[str, int],
    call_counter: dict[str, int],
) -> Any:
    """Compile the bounded investigation + synthesis graph."""
    llm_with_tools = llm.bind_tools(tools)
    structured_llm = llm.with_structured_output(
        TitleAgentResult, method="json_schema", include_raw=True
    )
    system_message = SystemMessage(content=TITULO_AGENT_SYSTEM_PROMPT)

    async def agente(state: TitleAgentState) -> dict[str, Any]:
        response = await llm_with_tools.ainvoke([system_message, *state["messages"]])
        _accumulate_usage(token_usage, response)
        call_counter["llm_calls"] += 1
        return {"messages": [response]}

    def router(state: TitleAgentState) -> str:
        last = state["messages"][-1]
        has_tool_calls = bool(getattr(last, "tool_calls", None))
        if has_tool_calls and _count_ai_turns(state["messages"]) < max_iterations:
            return "tools"
        if has_tool_calls:
            logger.warning(
                "title_agent_iteration_budget_reached", max_iterations=max_iterations
            )
        return "sintesis"

    async def sintesis(state: TitleAgentState) -> dict[str, Any]:
        # Tool-call messages left unanswered break some providers; synthesize
        # from the transcript minus a trailing unanswered tool request.
        messages = list(state["messages"])
        if messages and getattr(messages[-1], "tool_calls", None):
            messages = messages[:-1]
        response = await structured_llm.ainvoke(
            [
                system_message,
                *messages,
                HumanMessage(content=SYNTHESIS_INSTRUCTION),
            ]
        )
        call_counter["llm_calls"] += 1
        if isinstance(response, dict):
            _accumulate_usage(token_usage, response.get("raw"))
            parsed = response.get("parsed")
        else:
            parsed = response
        if isinstance(parsed, TitleAgentResult):
            result = parsed
        elif isinstance(parsed, dict):
            result = TitleAgentResult.model_validate(parsed)
        else:
            raise TitleAgentError(
                f"Synthesis returned no parsable result: {type(parsed)!r}"
            )
        return {"result": result}

    workflow = StateGraph(TitleAgentState)
    workflow.add_node("agente", agente)
    workflow.add_node("tools", ToolNode(tools))
    workflow.add_node("sintesis", sintesis)
    workflow.add_edge(START, "agente")
    workflow.add_conditional_edges(
        "agente", router, {"tools": "tools", "sintesis": "sintesis"}
    )
    workflow.add_edge("tools", "agente")
    workflow.add_edge("sintesis", END)
    return workflow.compile()


async def run_title_agent(
    source_documents: list[dict[str, Any]],
    *,
    expediente: dict[str, Any] | None = None,
    provider: str | None = None,
    model: str | None = None,
    timeout: int | None = None,
    max_iterations: int | None = None,
    llm: Any | None = None,
) -> TitleAgentRunOutcome:
    """Run the title agent over the gathered source documents.

    ``llm`` is injectable for tests (scripted fake); production resolves the
    client from settings. Returns ``available=False`` (empty result) when the
    agent is disabled or the provider key is missing, so the orchestrator can
    persist ``llm_disabled`` — same contract the pipeline had.
    """
    settings = get_settings()
    prov = provider or settings.LEGAL_TITLE_AGENT_PROVIDER
    mdl = model or settings.LEGAL_TITLE_AGENT_MODEL
    tout = timeout or settings.LEGAL_TITLE_AGENT_TIMEOUT_SECONDS
    iterations = max_iterations or settings.LEGAL_TITLE_AGENT_MAX_ITERATIONS

    if not settings.LEGAL_TITLE_AGENT_ENABLED and llm is None:
        logger.info("run_title_agent_disabled_by_config")
        return TitleAgentRunOutcome(result=TitleAgentResult(), available=False)

    client = llm if llm is not None else _get_llm_client(prov, mdl, tout)
    if client is None:
        logger.info("run_title_agent_client_unavailable")
        return TitleAgentRunOutcome(result=TitleAgentResult(), available=False)

    context = TitleAgentContext(
        documents=source_documents,
        expediente=expediente or {},
        max_tool_chars=settings.LEGAL_TITLE_AGENT_MAX_TOOL_CHARS,
    )
    tools = build_title_agent_tools(context)
    token_usage = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}
    call_counter = {"llm_calls": 0}
    graph = build_title_agent_graph(
        llm=client,
        tools=tools,
        max_iterations=iterations,
        token_usage=token_usage,
        call_counter=call_counter,
    )

    initial_state: TitleAgentState = {
        "messages": [_initial_task_message(context)],
        "result": None,
    }
    logger.info(
        "run_title_agent_started",
        provider=prov,
        model=mdl,
        documents=len(source_documents),
        max_iterations=iterations,
        timeout_seconds=tout,
    )
    try:
        final_state = await asyncio.wait_for(
            graph.ainvoke(
                initial_state,
                # Generous graph-level cap: each iteration spans 2 nodes
                # (agente + tools) plus START/sintesis overhead.
                config={"recursion_limit": iterations * 2 + 8},
            ),
            timeout=tout,
        )
    except asyncio.TimeoutError as exc:
        raise TitleAgentTimeoutError(
            f"Title agent run exceeded {tout}s budget."
        ) from exc

    result = final_state.get("result")
    if not isinstance(result, TitleAgentResult):
        raise TitleAgentError("Title agent finished without a structured result.")

    logger.info(
        "run_title_agent_completed",
        llm_calls=call_counter["llm_calls"],
        total_tokens=token_usage["total_tokens"],
        inscripciones=len(result.analysis.inscripciones),
        propietarios=len(result.analysis.propietarios_actuales),
        alertas=len(result.analysis.alertas),
    )
    return TitleAgentRunOutcome(
        result=result,
        token_usage=token_usage,
        llm_calls=call_counter["llm_calls"],
        available=True,
    )
