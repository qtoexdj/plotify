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
import re
from typing import Any

from jinja2 import Environment, BaseLoader, meta
from core.database import get_supabase_client
from core.logger import get_logger

logger = get_logger(__name__)

# Entorno Jinja2 con autoescape habilitado para prevenir XSS en salida HTML
jinja_env = Environment(loader=BaseLoader(), autoescape=True)


def _canonical_group_for_flat_key(key: str) -> str:
    if key.startswith("cliente_") or key.startswith("comprador_"):
        return "comprador"
    if key.startswith("vendedor_"):
        return "vendedor"
    if key.startswith("matriz_") or key.startswith("cbr_") or key.startswith("dominio_"):
        return "matriz"
    if key.startswith("sag_"):
        return "sag"
    if key.startswith("servidumbre_"):
        return "servidumbre"
    if key.startswith("transaccion_") or key in {"valor", "abono", "saldo"}:
        return "transaccion"
    if key.startswith("mandato_"):
        return "mandato"
    if key.startswith("personeria_"):
        return "personeria"
    return "lote"


def _source_for_flat_key(key: str) -> str:
    if key.startswith("cliente_") or key in {
        "valor",
        "abono",
        "saldo",
        "firma_fecha",
        "firma_lugar",
        "firma_estado",
        "etapa_proceso",
    }:
        return "lot_record"
    if key.startswith("proyecto_"):
        return "project"
    if key.startswith("org_"):
        return "organization"
    if key.startswith("cbr_"):
        return "project_legal_data"
    if key.startswith("dominio_") or key.startswith("sag_") or key.startswith("matriz_") or key.startswith("personeria_") or key.startswith("plano_"):
        return "project_legal_data"
    if key.startswith("servidumbre_"):
        return "geometry"
    return "lot"


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

    # Consultar project_legal_data para el proyecto del lote
    project_id = project.get("id")
    legal_data = {}
    if project_id:
        legal_result = await asyncio.to_thread(
            lambda: (
                supabase.table("project_legal_data")
                .select("*")
                .eq("project_id", project_id)
                .maybe_single()
                .execute()
            )
        )
        legal_data = legal_result.data or {}

    lot_legal_result = await asyncio.to_thread(
        lambda: (
            supabase.table("lot_legal_data")
            .select("*")
            .eq("lot_id", lot_id)
            .eq("organization_id", organization_id)
            .maybe_single()
            .execute()
        )
    )
    lot_legal_data = lot_legal_result.data or {}

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

    flat_vars = {
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
        # CBR / Dominio desde project_legal_data
        "dominio_cbr_fojas": legal_data.get("dominio_cbr_fojas", "") or record.get("cbr_numero_petitorio", ""),
        "dominio_cbr_numero": legal_data.get("dominio_cbr_numero", ""),
        "dominio_cbr_ano": legal_data.get("dominio_cbr_ano", ""),
        "dominio_fojas_vigente": legal_data.get("dominio_fojas_vigente", ""),
        "sag_resolucion_numero": legal_data.get("sag_resolucion_numero", ""),
        "sag_resolucion_ano": legal_data.get("sag_resolucion_ano", ""),
        "plano_archivo_numero": legal_data.get("plano_archivo_numero", ""),
        "matriz_cbr_fojas": legal_data.get("matriz_cbr_fojas", ""),
        "matriz_cbr_numero": legal_data.get("matriz_cbr_numero", ""),
        "matriz_cbr_ano": legal_data.get("matriz_cbr_ano", ""),
        "personeria_notario": legal_data.get("personeria_notario", ""),
        "personeria_repre_nombre": legal_data.get("personeria_repre_nombre", ""),
        "personeria_repre_rut": legal_data.get("personeria_repre_rut", ""),
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

    has_usable_role_match = lot_legal_data.get("matching_status") in {
        "matched",
        "manual_override",
    } and lot_legal_data.get("role_status") in {"definitive", "rol_en_tramite"}
    role_value = ""
    if has_usable_role_match:
        role_value = (
            lot_legal_data.get("sii_definitive_role")
            or lot_legal_data.get("sii_pre_role")
            or lot_legal_data.get("sii_role_in_process_text")
            or ""
        )
    flat_vars.update(
        {
            "sii_unidad_nombre": lot_legal_data.get("sii_unit_name", "")
            if has_usable_role_match
            else "",
            "sii_rol_matriz": lot_legal_data.get("sii_role_matrix", "")
            if has_usable_role_match
            else "",
            "sii_pre_rol_lote": lot_legal_data.get("sii_pre_role", "")
            if has_usable_role_match
            else "",
            "sii_rol_definitivo": lot_legal_data.get("sii_definitive_role", "")
            if has_usable_role_match
            else "",
            "sii_rol_avaluo_en_tramite_texto": lot_legal_data.get(
                "sii_role_in_process_text",
                "",
            )
            if has_usable_role_match
            else "",
            "sii_estado_rol": lot_legal_data.get("role_status", ""),
            "sii_estado_matching": lot_legal_data.get("matching_status", ""),
            "sii_score_matching": lot_legal_data.get("matching_score", ""),
            "lote_rol_tramite": role_value
            if lot_legal_data.get("role_status") == "rol_en_tramite"
            else "",
            "lote_rol_avaluo": role_value,
        }
    )

    boundaries = lot.get("boundaries_official") or lot.get("boundary_groups") or []
    if boundaries:
        flat_vars["deslindes"] = boundaries
        flat_vars["lote_deslindes"] = lot.get("legal_deslinde_text") or lot.get(
            "deslindes_text"
        ) or boundaries

    area = (
        lot.get("area_official_m2")
        or lot.get("superficie_neta_m2")
        or lot.get("m2")
        or 0
    )
    flat_vars["superficie_total"] = area
    flat_vars["lote_superficie_total"] = area

    if lot.get("perimeter_m") is not None:
        flat_vars["perimetro_m"] = lot.get("perimeter_m")
    if lot.get("area_ha") is not None:
        flat_vars["superficie_hectareas"] = lot.get("area_ha")
    if lot.get("servidumbre_analysis") is not None:
        flat_vars["servidumbre_analysis"] = lot.get("servidumbre_analysis")

    # Adaptador anidado para DocumentVariables v1 sin romper plantillas planas existentes.
    nested_groups = {
        "comprador": {},
        "vendedor": {},
        "matriz": {},
        "sag": {},
        "lote": {},
        "servidumbre": {},
        "transaccion": {},
        "mandato": {},
        "personeria": {},
    }

    for key, value in flat_vars.items():
        nested_groups[_canonical_group_for_flat_key(key)][key] = value

    nested_groups["sii"] = {
        **nested_groups.get("sii", {}),
        "unidad_nombre": flat_vars["sii_unidad_nombre"],
        "rol_matriz": flat_vars["sii_rol_matriz"],
        "pre_rol_lote": flat_vars["sii_pre_rol_lote"],
        "rol_definitivo": flat_vars["sii_rol_definitivo"],
        "rol_avaluo_en_tramite_texto": lot_legal_data.get(
            "sii_role_in_process_text",
            "",
        )
        if has_usable_role_match
        else "",
        "estado_rol": lot_legal_data.get("role_status", ""),
        "estado_matching": lot_legal_data.get("matching_status", ""),
    }
    nested_groups["lote"] = {
        **nested_groups.get("lote", {}),
        "rol_tramite": flat_vars["lote_rol_tramite"],
        "rol_avaluo": flat_vars["lote_rol_avaluo"],
    }

    return {**flat_vars, **nested_groups}



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


def extract_variables_from_text(text: str) -> list[str]:
    """Extract variable references from Jinja2 text, including dotted paths."""
    found: set[str] = set()
    try:
        parsed = jinja_env.parse(text)
        found.update(meta.find_undeclared_variables(parsed))
    except Exception:
        logger.warning("jinja_variable_parse_failed")

    found.update(re.findall(r"\{\{\s*([\w][\w.]*)", text))
    return sorted(found)


def _lookup_variable_value(variables: dict[str, Any], variable_name: str) -> Any:
    if variable_name in variables:
        return variables.get(variable_name)

    cursor: Any = variables
    for part in variable_name.split("."):
        if isinstance(cursor, dict):
            cursor = cursor.get(part)
        else:
            return None
    return cursor


def _canonical_key_for_variable(variable_name: str) -> str:
    if "." in variable_name:
        return variable_name
    return f"{_canonical_group_for_flat_key(variable_name)}.{variable_name}"


async def resolve_variable_status(
    lot_id: str,
    organization_id: str,
    template_id: str | None = None,
) -> dict:
    """
    Resuelve todas las variables de un lote y calcula cuáles de las variables
    requeridas por el template están disponibles (available) o faltantes (missing).
    """
    variables = await resolve_variables(lot_id, organization_id)

    # 1. Obtener variables requeridas por el template
    required_variables: set[str] = set()

    if template_id:
        supabase = get_supabase_client()
        blocks_result = await asyncio.to_thread(
            lambda: (
                supabase.table("template_block_items")
                .select("document_blocks(content)")
                .eq("template_id", template_id)
                .execute()
            )
        )
        if blocks_result.data:
            for item in blocks_result.data:
                block = item.get("document_blocks")
                if block and block.get("content"):
                    vars_in_block = extract_variables_from_text(block["content"])
                    required_variables.update(vars_in_block)

    # Si no hay variables requeridas extraídas del template (o no se pasó template_id),
    # usamos un conjunto por defecto de variables requeridas esenciales para el MVP
    if not required_variables:
        required_variables = {
            "cliente_nombre",
            "cliente_run",
            "cliente_direccion",
            "numero_lote",
            "precio",
            "valor_reserva",
        }

    # 2. Construir adaptadores anidados y mapear
    nested_groups = {
        "comprador": {},
        "vendedor": {},
        "matriz": {},
        "sag": {},
        "lote": {},
        "servidumbre": {},
        "transaccion": {},
        "mandato": {},
        "personeria": {},
    }

    available: list[str] = []
    missing: list[str] = []
    sources: dict[str, str] = {}

    for key, val in variables.items():
        if key in nested_groups:
            continue

        group_name = _canonical_group_for_flat_key(key)
        nested_groups[group_name][key] = val

        canonical_key = f"{group_name}.{key}"

        sources[canonical_key] = _source_for_flat_key(key)

    for required_key in sorted(required_variables):
        canonical_key = _canonical_key_for_variable(required_key)
        value = _lookup_variable_value(variables, required_key)
        if value is None or value == "" or value == 0:
            missing.append(canonical_key)
        else:
            available.append(canonical_key)
        sources.setdefault(canonical_key, _source_for_flat_key(required_key.split(".")[-1]))

    return {
        "variables": nested_groups,
        "available": sorted(set(available)),
        "missing": sorted(set(missing)),
        "sources": sources,
    }


async def get_project_active_template(
    lot_id: str,
    document_type: str = "reserva",
) -> str:
    """
    Busca la plantilla activa asociada al proyecto del lote y al tipo de documento.
    Si no se encuentra, busca el primer template del mismo tipo y organización como fallback.
    """
    supabase = get_supabase_client()

    # 1. Obtener project_id y organization_id del lote
    lot_result = await asyncio.to_thread(
        lambda: (
            supabase.table("lots")
            .select("project_id, projects(organization_id)")
            .eq("id", lot_id)
            .single()
            .execute()
        )
    )
    if not lot_result.data:
        raise ValueError(f"Lot {lot_id} not found")

    lot = lot_result.data
    project_id = lot.get("project_id")
    project = lot.get("projects") or {}
    organization_id = project.get("organization_id")

    if not project_id:
        raise ValueError(f"Lot {lot_id} is not assigned to a project")

    # 2. Consultar project_active_templates
    active_result = await asyncio.to_thread(
        lambda: (
            supabase.table("project_active_templates")
            .select("template_id")
            .eq("project_id", project_id)
            .eq("document_type", document_type)
            .maybe_single()
            .execute()
        )
    )

    if active_result.data and active_result.data.get("template_id"):
        return active_result.data["template_id"]

    # 3. Fallback: buscar el primer template de la organización y tipo de documento
    fallback_result = await asyncio.to_thread(
        lambda: (
            supabase.table("document_templates")
            .select("id")
            .eq("organization_id", organization_id)
            .eq("document_type", document_type)
            .order("created_at")
            .limit(1)
            .execute()
        )
    )

    if fallback_result.data:
        return fallback_result.data[0]["id"]

    raise ValueError(
        f"No active template or fallback found for project {project_id} and type '{document_type}'"
    )
