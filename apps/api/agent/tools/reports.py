"""
Herramienta LangGraph: resumen del pipeline de ventas.

IMPORTANTE (M1.4): Todas las consultas están filtradas por organization_id
para garantizar aislamiento multi-tenant.

M-v2-3.4
"""

import asyncio
from typing import Optional

from langchain_core.tools import tool

from agent.skill_registry import register_builtin
from core.database import get_supabase_client
from core.logger import get_logger

logger = get_logger(__name__)


@register_builtin("get_pipeline_summary")
@tool
async def get_pipeline_summary(
    organization_id: str,
    project_name: Optional[str] = None,
) -> str:
    """Resumen de operaciones de un proyecto o toda la organización.
    Retorna conteo de lotes por estado (disponible, reservado, vendido, etc.).
    Argumentos:
    - organization_id (requerido): ID de la organización para aislamiento multi-tenant.
    - project_name (opcional): nombre parcial del proyecto a filtrar.
    """
    if not organization_id:
        return "Error: organization_id es requerido"

    try:

        def _fetch():
            supabase = get_supabase_client()
            query = (
                supabase.table("lots")
                .select("estado, projects!inner(organization_id, name)")
                .eq("projects.organization_id", organization_id)
            )
            if project_name:
                query = query.ilike("projects.name", f"%{project_name}%")
            return query.execute()

        response = await asyncio.to_thread(_fetch)

        if not response.data:
            return "No se encontraron lotes para esta organización."

        # Contar por estado
        counts: dict[str, int] = {}
        for lot in response.data:
            estado = lot.get("estado", "desconocido")
            counts[estado] = counts.get(estado, 0) + 1

        total = sum(counts.values())
        scope = f"proyecto '{project_name}'" if project_name else "toda la organización"
        summary = f"Resumen del pipeline ({scope}) — {total} lotes:\n"
        for estado, count in sorted(counts.items()):
            summary += f"  - {estado}: {count}\n"

        logger.info(
            "get_pipeline_summary ejecutada",
            organization_id=organization_id,
            project_name=project_name,
            total=total,
        )
        return summary

    except Exception as e:
        logger.error(
            "Error en get_pipeline_summary",
            organization_id=organization_id,
            error=str(e),
        )
        return f"Ocurrió un error al obtener el resumen del pipeline: {str(e)}"


@register_builtin("get_delinquent_lots")
@tool
async def get_delinquent_lots(organization_id: str) -> str:
    """Retorna lotes con pagos atrasados (reservados hace más de 30 días sin avance de etapa).
    Argumentos:
    - organization_id (requerido): ID de la organización para aislamiento multi-tenant.
    """
    if not organization_id:
        return "Error: organization_id es requerido"

    try:
        from datetime import datetime, timezone, timedelta

        def _fetch():
            supabase = get_supabase_client()
            return (
                supabase.table("lots")
                .select(
                    "numero_lote, estado, updated_at, "
                    "lot_records(cliente_nombre, etapa_proceso), "
                    "projects!inner(organization_id, name)"
                )
                .eq("projects.organization_id", organization_id)
                .eq("estado", "reservado")
                .execute()
            )

        response = await asyncio.to_thread(_fetch)

        if not response.data:
            return "No hay lotes reservados con posible mora."

        threshold = datetime.now(timezone.utc) - timedelta(days=30)
        delinquent = []
        for lot in response.data:
            updated = datetime.fromisoformat(lot["updated_at"].replace("Z", "+00:00"))
            if updated < threshold:
                record = lot.get("lot_records") or {}
                project = lot.get("projects") or {}
                delinquent.append(
                    f"- Lote {lot['numero_lote']} ({project.get('name', 'N/A')}): "
                    f"cliente={record.get('cliente_nombre', 'N/A')}, "
                    f"etapa={record.get('etapa_proceso', 'N/A')}, "
                    f"última actualización={lot['updated_at'][:10]}"
                )

        if not delinquent:
            return "No hay lotes en mora (todos actualizados en los últimos 30 días)."

        logger.info(
            "get_delinquent_lots ejecutada",
            organization_id=organization_id,
            total_mora=len(delinquent),
        )
        return f"Lotes en posible mora ({len(delinquent)}):\n" + "\n".join(delinquent)

    except Exception as e:
        logger.error(
            "Error en get_delinquent_lots",
            organization_id=organization_id,
            error=str(e),
        )
        return f"Ocurrió un error al obtener lotes en mora: {str(e)}"


@register_builtin("get_kpis")
@tool
async def get_kpis(organization_id: str) -> str:
    """KPIs de la organización: total lotes por estado, leads capturados, vendedores activos.
    Argumentos:
    - organization_id (requerido): ID de la organización para aislamiento multi-tenant.
    """
    if not organization_id:
        return "Error: organization_id es requerido"

    try:

        def _fetch():
            supabase = get_supabase_client()
            lots = (
                supabase.table("lots")
                .select("estado, projects!inner(organization_id)")
                .eq("projects.organization_id", organization_id)
                .execute()
            )
            leads = (
                supabase.table("leads")
                .select("id", count="exact")
                .eq("organization_id", organization_id)
                .execute()
            )
            vendors = (
                supabase.table("vendors")
                .select("id", count="exact")
                .eq("organization_id", organization_id)
                .execute()
            )
            return lots, leads, vendors

        lots_resp, leads_resp, vendors_resp = await asyncio.to_thread(_fetch)

        counts: dict[str, int] = {}
        for lot in lots_resp.data or []:
            estado = lot.get("estado", "desconocido")
            counts[estado] = counts.get(estado, 0) + 1

        total = sum(counts.values())
        kpi = "📊 KPIs de la organización:\n"
        kpi += f"  Total lotes: {total}\n"
        for estado, count in sorted(counts.items()):
            kpi += f"  - {estado}: {count}\n"
        kpi += f"  Leads capturados: {leads_resp.count or 0}\n"
        kpi += f"  Vendedores activos: {vendors_resp.count or 0}\n"

        logger.info(
            "get_kpis ejecutada",
            organization_id=organization_id,
            total_lotes=total,
        )
        return kpi

    except Exception as e:
        logger.error("Error en get_kpis", organization_id=organization_id, error=str(e))
        return f"Ocurrió un error al obtener KPIs: {str(e)}"
