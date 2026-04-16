"""
Herramienta LangGraph: búsqueda y disponibilidad de lotes.

IMPORTANTE (M1.4): Todas las consultas están filtradas por organization_id
para garantizar aislamiento multi-tenant. Sin ese campo las queries no
retornan datos, evitando fugas de información entre organizaciones.
"""

from langchain_core.tools import tool
from core.database import get_supabase_client
from core.logger import get_logger
from agent.skill_registry import register_builtin
from typing import Optional
import asyncio

logger = get_logger(__name__)


@register_builtin("check_lot_availability")
@tool
async def check_lot_availability(
    organization_id: str,
    max_price: Optional[float] = None,
    min_m2: Optional[float] = None,
    numero_lote: Optional[str] = None,
) -> str:
    """Busca y filtra parcelas para responder a los clientes. Úsala para saber qué lotes o terrenos están disponibles.
    Argumentos:
    - organization_id (requerido): ID de la organización para aislar los datos.
    - max_price (opcional): si el cliente menciona un presupuesto máximo.
    - min_m2 (opcional): si el cliente quiere un terreno de al menos cierto metraje.
    - numero_lote (opcional): si el cliente pregunta por el estado de un lote exacto (ej. Lote 2).
    """
    if not organization_id:
        logger.error("check_lot_availability llamada sin organization_id")
        return "Error interno: se requiere organization_id para buscar lotes."

    try:

        def _fetch_lots():
            supabase = get_supabase_client()
            query = (
                supabase.table("lots")
                .select(
                    "id, numero_lote, precio, m2, estado, projects!inner(organization_id)"
                )
                .eq("projects.organization_id", organization_id)
                .eq("estado", "disponible")
            )
            if numero_lote:
                query = query.eq("numero_lote", str(numero_lote))
            if max_price is not None:
                query = query.lte("precio", max_price)
            if min_m2 is not None:
                query = query.gte("m2", min_m2)
            return query.limit(10).execute()

        # Ejecutamos la consulta sincrónica externa en un threadpool
        response = await asyncio.to_thread(_fetch_lots)

        lots = response.data
        if not lots:
            return "No encontré parcelas disponibles con esos criterios exactos en este momento."

        result = "Lotes disponibles encontrados que coinciden:\n"
        for lot in lots:
            precio = (
                f"${lot['precio']:,.0f}" if lot.get("precio") else "Precio No Fijado"
            )
            m2 = lot.get("m2", "N/A")
            result += f"- Lote {lot.get('numero_lote')}: {m2} m2, {precio}\n"

        logger.info(
            "check_lot_availability ejecutada",
            organization_id=organization_id,
            total_results=len(lots),
        )
        return result

    except Exception as e:
        logger.error(
            "Error en check_lot_availability",
            organization_id=organization_id,
            error=str(e),
        )
        return f"Ocurrió un error al buscar disponibilidad: {str(e)}"


@register_builtin("get_lot_stage")
@tool
async def get_lot_stage(
    organization_id: str,
    numero_lote: str,
) -> str:
    """Retorna la etapa actual de un lote en el pipeline de proceso.
    Argumentos:
    - organization_id (requerido): ID de la organización para aislamiento multi-tenant.
    - numero_lote (requerido): número exacto del lote a consultar.
    """
    if not organization_id:
        return "Error: organization_id es requerido"

    try:

        def _fetch():
            supabase = get_supabase_client()
            return (
                supabase.table("lots")
                .select(
                    "numero_lote, estado, "
                    "lot_records(etapa_proceso, cliente_nombre), "
                    "projects!inner(organization_id)"
                )
                .eq("projects.organization_id", organization_id)
                .eq("numero_lote", numero_lote)
                .limit(1)
                .execute()
            )

        response = await asyncio.to_thread(_fetch)
        if not response.data:
            return f"No se encontró el lote {numero_lote}."

        lot = response.data[0]
        record = lot.get("lot_records") or {}
        etapa = record.get("etapa_proceso", "N/A")
        cliente = record.get("cliente_nombre", "Sin asignar")
        logger.info(
            "get_lot_stage ejecutada",
            organization_id=organization_id,
            numero_lote=numero_lote,
        )
        return (
            f"Lote {lot['numero_lote']}: estado={lot['estado']}, "
            f"etapa={etapa}, cliente={cliente}"
        )

    except Exception as e:
        logger.error(
            "Error en get_lot_stage",
            organization_id=organization_id,
            numero_lote=numero_lote,
            error=str(e),
        )
        return f"Ocurrió un error consultando la etapa del lote: {str(e)}"
