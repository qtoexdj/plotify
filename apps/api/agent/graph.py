from langgraph.graph import StateGraph, START, END
from langgraph.prebuilt import ToolNode
from langgraph.checkpoint.memory import MemorySaver
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic

from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

from core.checkpointer import get_checkpointer_pool
from core.config import get_settings
from core.database import get_supabase_client
from core.logger import get_logger
from agent.state import AgentState
from agent.prompt_cache import get_active_prompt
from agent.skill_registry import get_tools_for_org
from agent.tools.lot_search import check_lot_availability
from agent.tools.projects import search_projects
from agent.tools.reservations import get_reservation_requirements
import agent.tools.clients  # noqa: F401 — registra @register_builtin en BUILTIN_HANDLERS
import agent.tools.reports  # noqa: F401 — registra @register_builtin en BUILTIN_HANDLERS

logger = get_logger(__name__)
settings = get_settings()

# 1. Herramientas estáticas (para sandbox/testing via get_llm_with_tools)
tools = [search_projects, check_lot_availability, get_reservation_requirements]


# 2. Inicializar el Modelo de Lenguaje Evaluador (LLM) Automáticamente
def get_llm():
    """Selecciona el LLM basado en qué llave de API existe en el entorno."""
    if settings.OPENAI_API_KEY:
        logger.info("Usando OpenAI GPT-4o-mini como cerebro del agente")
        return ChatOpenAI(
            model="gpt-4o-mini", temperature=0.3, api_key=settings.OPENAI_API_KEY
        )
    elif settings.ANTHROPIC_API_KEY:
        logger.info("Usando Anthropic Claude 3 Haiku como cerebro del agente")
        return ChatAnthropic(
            model="claude-3-haiku-20240307",
            temperature=0.3,
            api_key=settings.ANTHROPIC_API_KEY,
        )
    else:
        logger.warning(
            "No hay llaves de OpenAI o Anthropic configuradas. Fallará la invocación."
        )
        return ChatOpenAI(model="gpt-3.5-turbo", temperature=0.3)


# 3. Vincular herramientas al LLM
llm = get_llm()
llm_with_tools = llm.bind_tools(tools)


# 4. Router
def should_continue(state: AgentState):
    """Router: Decide si ir al END o ir a ejecutar una Tool."""
    last_message = state["messages"][-1]
    if hasattr(last_message, "tool_calls") and getattr(last_message, "tool_calls"):
        return "tools"
    return END


def get_llm_with_tools():
    """Retorna el LLM con tools bindeados. Para uso en sandbox y testing."""
    return llm_with_tools


async def _get_checkpointer():
    """Retorna el checkpointer disponible. Prioriza AsyncPostgresSaver."""
    postgres_pool = get_checkpointer_pool()
    if postgres_pool:
        return AsyncPostgresSaver(postgres_pool)
    logger.warning(
        "checkpointer_fallback_to_memory",
        impact="Las conversaciones NO persistirán entre reinicios del servicio. "
        "Configura SUPABASE_DB_URL para persistencia.",
    )
    return MemorySaver()


async def _get_custom_instructions(org_id: str, user_id: str | None) -> str:
    """Obtiene instrucciones personalizadas del admin desde agent_custom_instructions (M-v2-6.2)."""
    if not user_id:
        return ""
    try:
        import asyncio

        def _fetch():
            supabase = get_supabase_client()
            return (
                supabase.table("agent_custom_instructions")
                .select("instructions")
                .eq("organization_id", org_id)
                .eq("user_id", user_id)
                .eq("is_active", True)
                .limit(1)
                .execute()
            )

        result = await asyncio.to_thread(_fetch)
        return result.data[0]["instructions"] if result.data else ""
    except Exception as e:
        logger.warning(
            "custom_instructions_fetch_failed",
            org_id=org_id,
            user_id=user_id,
            error=str(e),
        )
        return ""


async def get_graph_for_org(org_id: str, role: str):
    """
    Compila el grafo dinámicamente con las tools activas de esta org + rol.

    IMPORTANTE (M-v2-3.2): Las tools se obtienen desde la BD con cache Redis 5 min
    a través del skill_registry. Cada org puede tener un conjunto distinto de skills.
    IMPORTANTE (M-v2-6.2): El prompt se elige según el rol:
      - admin  → 'admin_intelligence' + custom instructions personalizadas
      - otros  → 'sales_agent'
    """
    org_tools = await get_tools_for_org(org_id, role)

    # Elegir slug de prompt según rol (M-v2-6.2)
    prompt_slug = "admin_intelligence" if role == "admin" else "sales_agent"

    async def agent_node(state: AgentState):
        """
        Nodo principal: evalúa el estado y decide si responde o llama a una herramienta.

        IMPORTANTE (M1.4): organization_id se inyecta en el contexto para llamadas multi-tenant.
        IMPORTANTE (M-v2-2.2): el prompt se obtiene dinámicamente desde la DB (cache Redis 5 min).
        IMPORTANTE (M-v2-3.2): las tools son específicas a esta org y rol.
        IMPORTANTE (M-v2-6.2): admin usa prompt admin_intelligence con custom instructions.
        """
        organization_id = state.get("organization_id") or org_id
        prompt_content = await get_active_prompt(prompt_slug)

        # Inyectar custom instructions para admin (M-v2-6.2)
        custom_instructions = ""
        if role == "admin":
            custom_instructions = await _get_custom_instructions(
                org_id, state.get("user_id")
            )

        dynamic_prompt = ChatPromptTemplate.from_messages(
            [
                ("system", prompt_content),
                MessagesPlaceholder(variable_name="messages"),
            ]
        )
        _llm_with_tools = llm.bind_tools(org_tools)
        prompt_value = await dynamic_prompt.ainvoke(
            {
                "messages": state["messages"],
                "lead_info": state.get("lead_info", {}),
                "context": state.get("context", "Etapa de pre-calificación"),
                "organization_id": organization_id,
                "custom_instructions": custom_instructions,
            }
        )
        response = await _llm_with_tools.ainvoke(prompt_value)
        return {"messages": [response]}

    workflow = StateGraph(AgentState)
    workflow.add_node("agent", agent_node)
    workflow.add_node("tools", ToolNode(org_tools))
    workflow.add_edge(START, "agent")
    workflow.add_conditional_edges(
        "agent", should_continue, {"tools": "tools", END: END}
    )
    workflow.add_edge("tools", "agent")

    checkpointer = await _get_checkpointer()
    return workflow.compile(checkpointer=checkpointer)
