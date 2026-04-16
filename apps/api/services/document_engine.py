"""
Motor de plantillas Jinja2 para generación de documentos legales.

Responsabilidades:
    - resolve_variables: carga datos de lot, lot_record, project, organization
      para inyectar en plantillas.
    - render_template: obtiene bloques ordenados de un template y los renderiza
      concatenados como HTML usando Jinja2.

Ref: plotify_memori/Generacion de Documentos.md
"""

import asyncio
from jinja2 import Environment, BaseLoader
from core.database import get_supabase_client
from core.logger import get_logger

logger = get_logger(__name__)

# Entorno Jinja2 con autoescape habilitado para prevenir XSS en salida HTML
jinja_env = Environment(loader=BaseLoader(), autoescape=True)


async def resolve_variables(lot_id: str, organization_id: str) -> dict:
    """
    Carga datos de lot, lot_record, project y organization para inyectar en plantillas.

    Returns:
        Diccionario con todas las variables disponibles para los bloques Jinja2.

    Raises:
        ValueError: Si el lote no existe.
    """
    supabase = get_supabase_client()

    lot_result = await asyncio.to_thread(
        lambda: (
            supabase.table("lots")
            .select("*, lot_records(*), projects(*, organizations(*))")
            .eq("id", lot_id)
            .single()
            .execute()
        )
    )

    if not lot_result.data:
        raise ValueError(f"Lot {lot_id} not found")

    lot = lot_result.data
    record = lot.get("lot_records") or {}
    project = lot.get("projects") or {}
    org = project.get("organizations") or {}

    payment_result = await asyncio.to_thread(
        lambda: (
            supabase.table("organization_payment_info")
            .select("*")
            .eq("organization_id", organization_id)
            .maybe_single()
            .execute()
        )
    )
    payment_data = payment_result.data or {}

    return {
        # Lote
        "numero_lote": lot.get("numero_lote", ""),
        "precio": lot.get("precio", 0),
        "m2": lot.get("m2", 0),
        "area_official_m2": lot.get("area_official_m2", 0),
        "superficie_neta_m2": lot.get("superficie_neta_m2", 0),
        "servidumbre_m2": lot.get("servidumbre_m2", 0),
        "servidumbre_ancho_m": lot.get("servidumbre_ancho_m", 0),
        "valor_reserva": lot.get("valor_reserva", 0),
        "estado": lot.get("estado", ""),
        # Cliente
        "cliente_nombre": record.get("cliente_nombre", ""),
        "cliente_run": record.get("cliente_run", ""),
        "cliente_run_normalizado": record.get("cliente_run_normalizado", ""),
        "cliente_direccion": record.get("cliente_direccion", ""),
        "cliente_estado_civil": record.get("cliente_estado_civil", ""),
        "cliente_ocupacion": record.get("cliente_ocupacion", ""),
        "cliente_email": record.get("cliente_email", ""),
        "cliente_telefono": record.get("cliente_telefono", ""),
        # Financiero
        "valor": record.get("valor", 0),
        "abono": record.get("abono", 0),
        "saldo": record.get("saldo", 0),
        # Firma / proceso
        "firma_fecha": str(record.get("firma_fecha", "") or ""),
        "firma_lugar": record.get("firma_lugar", ""),
        "firma_estado": record.get("firma_estado", ""),
        "etapa_proceso": record.get("etapa_proceso", ""),
        # CBR
        "cbr_estado": record.get("cbr_estado", ""),
        "cbr_numero_petitorio": record.get("cbr_numero_petitorio", ""),
        "cbr_fecha_salida_estimada": str(
            record.get("cbr_fecha_salida_estimada", "") or ""
        ),
        # Proyecto
        "proyecto_nombre": project.get("name", ""),
        "proyecto_comuna": project.get("comuna", ""),
        "proyecto_region": project.get("region", ""),
        # Organización
        "org_nombre": org.get("name", ""),
        "org_rut": payment_data.get("rut", ""),
        "org_banco": payment_data.get("banco", ""),
        "org_cuenta": payment_data.get("numero_cuenta", ""),
        "org_tipo_cuenta": payment_data.get("tipo_cuenta", ""),
        "org_email": payment_data.get("email_transferencia", ""),
    }


async def render_template(template_id: str, lot_id: str, organization_id: str) -> str:
    """
    Renderiza un template completo como HTML concatenando sus bloques ordenados.

    Los bloques con condition_field se incluyen solo si la variable correspondiente
    tiene un valor truthy en el contexto del lote.

    Returns:
        HTML resultante con todos los bloques renderizados y variables sustituidas.

    Raises:
        ValueError: Si el template no tiene bloques o el lote no existe.
    """
    supabase = get_supabase_client()

    items_result = await asyncio.to_thread(
        lambda: (
            supabase.table("template_block_items")
            .select(
                "position, is_optional, condition_field, overrides, document_blocks(*)"
            )
            .eq("template_id", template_id)
            .order("position")
            .execute()
        )
    )

    if not items_result.data:
        raise ValueError(f"Template {template_id} has no blocks")

    variables = await resolve_variables(lot_id, organization_id)
    html_parts: list[str] = []

    for item in items_result.data:
        block = item.get("document_blocks")
        if not block:
            continue

        # Evaluar condición: si condition_field definido y la variable es falsy, omitir
        condition_field = item.get("condition_field")
        if condition_field:
            val = variables.get(condition_field)
            if not val or val == 0:
                continue

        # Renderizar bloque con Jinja2
        overrides = item.get("overrides") or {}
        ctx = {**variables, **overrides}
        try:
            tmpl = jinja_env.from_string(block["content"])
            rendered = tmpl.render(**ctx)
            html_parts.append(rendered)
        except Exception as e:
            logger.warning(
                "Error renderizando bloque",
                block_id=block.get("id"),
                block_name=block.get("name"),
                error=str(e),
            )
            # Incluir bloque sin renderizar para no perder contenido
            html_parts.append(block["content"])

    return "\n".join(html_parts)
