from typing import TypedDict, Annotated, Sequence, Dict, Any, Optional
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    """
    Estado del Agente LangGraph para una conversación de ventas.

    Attributes:
        messages: Historial de la conversación. `add_messages` indica a LangGraph
                 que anexe nuevos mensajes en lugar de sobrescribirlos.
        lead_info: Información útil extraída durante la conversación (nombre, etc).
        context: Banderas o estado actual del proceso de venta (ej. 'reservando', 'calificando').
    """

    messages: Annotated[Sequence[BaseMessage], add_messages]
    lead_info: Dict[str, Any]
    context: str
    role: str  # "lead", "vendor", o "admin"
    organization_id: Optional[str]  # UUID para aislar consultas RAG
    user_id: Optional[
        str
    ]  # UUID del admin (para resolver custom instructions — M-v2-6.4)
