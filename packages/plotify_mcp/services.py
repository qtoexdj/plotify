"""
Servicios de consulta y agregación de datos para el MCP de Plotify.
"""

from typing import Any, Dict, List, Optional
from .db import get_supabase
from .legal_text import (
    generate_deslinde_text,
    generate_servidumbre_text,
    number_to_words,
    number_to_words_lower,
    lot_number_to_words,
)


def list_projects(
    estado: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    """Lista los proyectos inmobiliarios con métricas de lotes agregadas."""
    supabase = get_supabase()
    query = supabase.table("projects").select("*")

    if estado:
        query = query.eq("estado", estado)

    if search:
        # Búsqueda por nombre, comuna o región
        query = query.or_(f"name.ilike.%{search}%,comuna.ilike.%{search}%,region.ilike.%{search}%")

    res = query.order("created_at", desc=True).limit(limit).execute()
    projects = res.data or []

    if not projects:
        return []

    project_ids = [p["id"] for p in projects]

    # Consultar lotes para calcular métricas de inventario por proyecto
    lots_res = (
        supabase.table("lots")
        .select("id, project_id, estado")
        .in_("project_id", project_ids)
        .execute()
    )
    lots_data = lots_res.data or []

    metrics_by_project: Dict[str, Dict[str, int]] = {}
    for p_id in project_ids:
        metrics_by_project[p_id] = {
            "total_lotes": 0,
            "disponibles": 0,
            "reservados": 0,
            "vendidos": 0,
        }

    for lot in lots_data:
        p_id = lot["project_id"]
        if p_id in metrics_by_project:
            metrics_by_project[p_id]["total_lotes"] += 1
            st = lot.get("estado")
            if st == "disponible":
                metrics_by_project[p_id]["disponibles"] += 1
            elif st == "reservado":
                metrics_by_project[p_id]["reservados"] += 1
            elif st == "vendido":
                metrics_by_project[p_id]["vendidos"] += 1

    results = []
    for p in projects:
        p_metrics = metrics_by_project.get(
            p["id"], {"total_lotes": p.get("total_lotes", 0), "disponibles": 0, "reservados": 0, "vendidos": 0}
        )
        results.append({
            "id": p["id"],
            "name": p["name"],
            "region": p.get("region"),
            "comuna": p.get("comuna"),
            "estado": p.get("estado"),
            "total_lotes": p.get("total_lotes") or p_metrics["total_lotes"],
            "lotes_disponibles": p_metrics["disponibles"],
            "lotes_reservados": p_metrics["reservados"],
            "lotes_vendidos": p_metrics["vendidos"],
            "descripcion": p.get("descripcion"),
            "created_at": p.get("created_at"),
            "updated_at": p.get("updated_at"),
        })

    return results


def get_project(
    project_id: Optional[str] = None,
    project_name: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Obtiene la ficha técnica y legal completa de un proyecto."""
    supabase = get_supabase()

    if not project_id and not project_name:
        raise ValueError("Debe proporcionar al menos 'project_id' o 'project_name'.")

    query = supabase.table("projects").select("*")
    if project_id:
        query = query.eq("id", project_id)
    elif project_name:
        query = query.ilike("name", f"%{project_name.strip()}%")

    res = query.limit(1).execute()
    if not res.data:
        return None

    project = res.data[0]
    p_id = project["id"]

    # Obtener desglose de lotes
    lots_res = (
        supabase.table("lots")
        .select("id, numero_lote, estado, precio, m2")
        .eq("project_id", p_id)
        .execute()
    )
    lots = lots_res.data or []

    disponibles = [l for l in lots if l.get("estado") == "disponible"]
    reservados = [l for l in lots if l.get("estado") == "reservado"]
    vendidos = [l for l in lots if l.get("estado") == "vendido"]

    # Obtener vendedores asignados
    vendedores_res = (
        supabase.table("vendor_projects")
        .select("vendor:vendor_id(id, nombre, user_id, active)")
        .eq("project_id", p_id)
        .execute()
    )
    vendedores = []
    if vendedores_res.data:
        for row in vendedores_res.data:
            v = row.get("vendor")
            if v and v.get("active", True):
                vendedores.append({"id": v["id"], "nombre": v["nombre"]})

    # Documentos legales adjuntos
    documentos_legales = {
        "dominio_vigente": project.get("doc_dominio_vigente"),
        "hipoteca_gravamen": project.get("doc_hipoteca_gravamen"),
        "plano_oficial": project.get("doc_plano_oficial"),
        "roles_sii": project.get("doc_roles"),
        "subdivision_sag": project.get("doc_subdivision"),
        "otros": project.get("doc_otros"),
    }

    return {
        "id": project["id"],
        "name": project["name"],
        "organization_id": project.get("organization_id"),
        "region": project.get("region"),
        "comuna": project.get("comuna"),
        "estado": project.get("estado"),
        "descripcion": project.get("descripcion"),
        "total_lotes": project.get("total_lotes") or len(lots),
        "metricas": {
            "total_lotes": len(lots),
            "disponibles": len(disponibles),
            "reservados": len(reservados),
            "vendidos": len(vendidos),
        },
        "ancho_caminos_m": project.get("road_width_m"),
        "documentos_legales": documentos_legales,
        "vendedores": vendedores,
        "created_at": project.get("created_at"),
        "updated_at": project.get("updated_at"),
    }


def list_lots(
    project_id: str,
    estado: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    min_m2: Optional[float] = None,
    max_m2: Optional[float] = None,
    limit: int = 100,
    offset: int = 0,
) -> Dict[str, Any]:
    """Lista lotes de un proyecto con filtros de estado, precio y superficie."""
    supabase = get_supabase()
    query = (
        supabase.table("lots")
        .select("id, project_id, numero_lote, estado, precio, valor_reserva, m2, area_official_m2, superficie_neta_m2, servidumbre_m2, servidumbre_ancho_label, verified_status, lot_records(cliente_nombre, cliente_run, etapa_proceso, saldo)")
        .eq("project_id", project_id)
    )

    if estado:
        query = query.eq("estado", estado)
    if min_price is not None:
        query = query.gte("precio", min_price)
    if max_price is not None:
        query = query.lte("precio", max_price)
    if min_m2 is not None:
        query = query.gte("m2", min_m2)
    if max_m2 is not None:
        query = query.lte("m2", max_m2)

    res = query.order("numero_lote").range(offset, offset + limit - 1).execute()
    lots = res.data or []

    # Ordenar numéricamente por numero_lote
    def parse_lot_key(num: str):
        try:
            return (0, int(num))
        except (ValueError, TypeError):
            return (1, str(num))

    sorted_lots = sorted(lots, key=lambda x: parse_lot_key(x.get("numero_lote", "")))

    formatted_lots = []
    for l in sorted_lots:
        record = None
        records = l.get("lot_records")
        if isinstance(records, list) and len(records) > 0:
            record = records[0]
        elif isinstance(records, dict):
            record = records

        formatted_lots.append({
            "id": l["id"],
            "numero_lote": l.get("numero_lote"),
            "estado": l.get("estado"),
            "precio": l.get("precio"),
            "valor_reserva": l.get("valor_reserva"),
            "m2": l.get("m2"),
            "area_official_m2": l.get("area_official_m2"),
            "superficie_neta_m2": l.get("superficie_neta_m2"),
            "servidumbre_m2": l.get("servidumbre_m2"),
            "servidumbre_ancho": l.get("servidumbre_ancho_label"),
            "cliente_nombre": record.get("cliente_nombre") if record else None,
            "cliente_run": record.get("cliente_run") if record else None,
            "etapa_proceso": record.get("etapa_proceso") if record else None,
            "saldo": record.get("saldo") if record else None,
        })

    return {
        "project_id": project_id,
        "total_returned": len(formatted_lots),
        "offset": offset,
        "lots": formatted_lots,
    }


def get_lot(
    lot_id: Optional[str] = None,
    project_id: Optional[str] = None,
    numero_lote: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Obtiene la información integral 360° de un lote."""
    supabase = get_supabase()

    if not lot_id and not (project_id and numero_lote):
        raise ValueError("Debe proporcionar 'lot_id' o la combinación de 'project_id' y 'numero_lote'.")

    query = supabase.table("lots").select("*, projects(id, name, comuna, region)")
    if lot_id:
        query = query.eq("id", lot_id)
    else:
        num_clean = str(numero_lote).strip()
        # Permitir buscar '1' o 'Lote 1'
        if num_clean.lower().startswith("lote "):
            num_clean = num_clean[5:].strip()
        query = query.eq("project_id", project_id).eq("numero_lote", num_clean)

    res = query.limit(1).execute()
    if not res.data:
        return None

    lot = res.data[0]
    actual_lot_id = lot["id"]
    p_id = lot["project_id"]

    # Consultar datos tributarios y registrales (SII)
    legal_res = (
        supabase.table("lot_legal_data")
        .select("*")
        .eq("lot_id", actual_lot_id)
        .limit(1)
        .execute()
    )
    legal_data = legal_res.data[0] if legal_res.data else None

    # Consultar ficha comercial/cliente
    record_res = (
        supabase.table("lot_records")
        .select("*")
        .eq("lot_id", actual_lot_id)
        .limit(1)
        .execute()
    )
    record_data = record_res.data[0] if record_res.data else None

    # Generar textos legales automáticos
    deslindes_texto = generate_deslinde_text(lot)
    servidumbre_texto = generate_servidumbre_text(lot)

    return {
        "id": lot["id"],
        "project_id": lot["project_id"],
        "proyecto": lot.get("projects"),
        "numero_lote": lot.get("numero_lote"),
        "estado": lot.get("estado"),
        "precio": lot.get("precio"),
        "valor_reserva": lot.get("valor_reserva"),
        "superficie": {
            "m2": lot.get("m2"),
            "area_official_m2": lot.get("area_official_m2"),
            "superficie_neta_m2": lot.get("superficie_neta_m2"),
            "perimetro_m": lot.get("perimeter_official_m"),
        },
        "deslindes_oficiales": lot.get("boundaries_official"),
        "servidumbre": {
            "m2": lot.get("servidumbre_m2"),
            "ancho_m": lot.get("servidumbre_ancho_m"),
            "ancho_label": lot.get("servidumbre_ancho_label"),
            "estado_calculo": lot.get("servidumbre_calculation_status"),
        },
        "textos_legales_generados": {
            "deslindes_texto": deslindes_texto,
            "servidumbre_texto": servidumbre_texto,
        },
        "datos_legales_sii": {
            "rol_definitivo": legal_data.get("sii_definitive_role") if legal_data else None,
            "pre_rol": legal_data.get("sii_pre_role") if legal_data else None,
            "rol_matriz": legal_data.get("sii_role_matrix") if legal_data else None,
            "rol_en_tramite_texto": legal_data.get("sii_role_in_process_text") if legal_data else None,
            "estado_rol": legal_data.get("role_status") if legal_data else None,
            "comuna_sii": legal_data.get("sii_comuna") if legal_data else None,
            "unidad_nombre": legal_data.get("sii_unit_name") if legal_data else None,
        } if legal_data else None,
        "ficha_cliente_operacion": {
            "cliente_nombre": record_data.get("cliente_nombre"),
            "cliente_run": record_data.get("cliente_run"),
            "cliente_nacionalidad": record_data.get("cliente_nacionalidad"),
            "cliente_estado_civil": record_data.get("cliente_estado_civil"),
            "cliente_ocupacion": record_data.get("cliente_ocupacion"),
            "cliente_direccion": record_data.get("cliente_direccion"),
            "cliente_comuna": record_data.get("cliente_comuna"),
            "cliente_region": record_data.get("cliente_region"),
            "cliente_telefono": record_data.get("cliente_telefono"),
            "cliente_email": record_data.get("cliente_email"),
            "etapa_proceso": record_data.get("etapa_proceso"),
            "valor": record_data.get("valor"),
            "abono": record_data.get("abono"),
            "saldo": record_data.get("saldo"),
            "firma_estado": record_data.get("firma_estado"),
            "firma_fecha": record_data.get("firma_fecha"),
            "firma_lugar": record_data.get("firma_lugar"),
            "cbr_estado": record_data.get("cbr_estado"),
            "cbr_numero_petitorio": record_data.get("cbr_numero_petitorio"),
            "cbr_reparo": record_data.get("cbr_reparo"),
        } if record_data else None,
        "observaciones": lot.get("observaciones"),
        "created_at": lot.get("created_at"),
        "updated_at": lot.get("updated_at"),
    }


def generate_lot_legal_texts(
    lot_id: Optional[str] = None,
    project_id: Optional[str] = None,
    numero_lote: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Ejecuta el Generador de Textos Legales de Plotify para un lote específico,
    retornando los textos oficiales de deslindes y servidumbre listos para escrituras.
    """
    lot_info = get_lot(lot_id=lot_id, project_id=project_id, numero_lote=numero_lote)
    if not lot_info:
        raise ValueError("No se encontró el lote especificado.")

    project_name = lot_info.get("proyecto", {}).get("name") if lot_info.get("proyecto") else "Proyecto"
    num_lote = lot_info.get("numero_lote")

    deslindes_texto = lot_info["textos_legales_generados"]["deslindes_texto"]
    servidumbre_texto = lot_info["textos_legales_generados"]["servidumbre_texto"]

    return {
        "lote_identificador": f"{project_name} - Lote {num_lote}",
        "lot_id": lot_info["id"],
        "numero_lote": num_lote,
        "numero_lote_palabras": lot_number_to_words(num_lote),
        "superficie_m2": lot_info["superficie"]["area_official_m2"] or lot_info["superficie"]["m2"],
        "superficie_palabras": number_to_words(lot_info["superficie"]["area_official_m2"] or lot_info["superficie"]["m2"]),
        "servidumbre_m2": lot_info["servidumbre"]["m2"],
        "servidumbre_palabras": number_to_words(lot_info["servidumbre"]["m2"]),
        "servidumbre_ancho": lot_info["servidumbre"]["ancho_label"],
        "texto_deslindes_oficial": deslindes_texto,
        "texto_servidumbre_oficial": servidumbre_texto,
        "deslindes_estructurados": lot_info.get("deslindes_oficiales") or [],
    }


def get_lot_legal_variables(
    lot_id: Optional[str] = None,
    project_id: Optional[str] = None,
    numero_lote: Optional[str] = None,
) -> Dict[str, Any]:
    """Obtiene las variables legales clave para la redacción de una escritura de compraventa."""
    lot_info = get_lot(lot_id=lot_id, project_id=project_id, numero_lote=numero_lote)
    if not lot_info:
        raise ValueError("No se encontró el lote especificado.")

    p_id = lot_info["project_id"]
    project_info = get_project(project_id=p_id)

    sii = lot_info.get("datos_legales_sii") or {}
    cliente = lot_info.get("ficha_cliente_operacion") or {}
    sup = lot_info.get("superficie") or {}
    serv = lot_info.get("servidumbre") or {}

    precio = lot_info.get("precio") or cliente.get("valor")

    return {
        "inmueble": {
            "lote_numero": lot_info.get("numero_lote"),
            "lote_numero_palabras": lot_number_to_words(lot_info.get("numero_lote")),
            "proyecto_nombre": project_info.get("name") if project_info else "",
            "comuna": project_info.get("comuna") if project_info else "",
            "region": project_info.get("region") if project_info else "",
            "superficie_m2": sup.get("area_official_m2") or sup.get("m2"),
            "superficie_m2_palabras": number_to_words(sup.get("area_official_m2") or sup.get("m2")),
            "servidumbre_m2": serv.get("m2"),
            "servidumbre_m2_palabras": number_to_words(serv.get("m2")),
            "clausula_deslindes": lot_info["textos_legales_generados"]["deslindes_texto"],
            "clausula_servidumbre": lot_info["textos_legales_generados"]["servidumbre_texto"],
        },
        "rol_sii": {
            "rol_definitivo": sii.get("rol_definitivo"),
            "pre_rol": sii.get("pre_rol"),
            "rol_matriz": sii.get("rol_matriz"),
            "texto_rol_en_tramite": sii.get("rol_en_tramite_texto"),
        },
        "comprador": {
            "nombre_completo": cliente.get("cliente_nombre"),
            "run": cliente.get("cliente_run"),
            "nacionalidad": cliente.get("cliente_nacionalidad") or "chilena",
            "estado_civil": cliente.get("cliente_estado_civil"),
            "profesion_oficio": cliente.get("cliente_ocupacion"),
            "domicilio": cliente.get("cliente_direccion"),
            "comuna": cliente.get("cliente_comuna"),
            "region": cliente.get("cliente_region"),
            "telefono": cliente.get("cliente_telefono"),
            "email": cliente.get("cliente_email"),
        },
        "precio_operacion": {
            "monto_pesos": precio,
            "monto_palabras": number_to_words(precio) if precio else None,
            "abono": cliente.get("abono"),
            "saldo": cliente.get("saldo"),
        },
        "documentos_matriz_proyecto": project_info.get("documentos_legales") if project_info else {},
    }


def search_lots(
    query: str,
    project_id: Optional[str] = None,
    limit: int = 25,
) -> List[Dict[str, Any]]:
    """Búsqueda de lotes por nombre de cliente, RUN/RUT, Rol SII o número de lote."""
    supabase = get_supabase()
    q = query.strip()

    # Buscar en lot_records
    records_query = supabase.table("lot_records").select("lot_id, cliente_nombre, cliente_run, etapa_proceso, saldo")
    records_query = records_query.or_(f"cliente_nombre.ilike.%{q}%,cliente_run.ilike.%{q}%,cliente_run_normalizado.ilike.%{q}%")
    records_res = records_query.limit(limit).execute()

    # Buscar en lot_legal_data
    legal_query = supabase.table("lot_legal_data").select("lot_id, sii_definitive_role, sii_pre_role, sii_unit_name")
    legal_query = legal_query.or_(f"sii_definitive_role.ilike.%{q}%,sii_pre_role.ilike.%{q}%,sii_unit_name.ilike.%{q}%")
    legal_res = legal_query.limit(limit).execute()

    matched_lot_ids = set()
    for r in records_res.data or []:
        matched_lot_ids.add(r["lot_id"])
    for l in legal_res.data or []:
        matched_lot_ids.add(l["lot_id"])

    # También buscar por número de lote
    lot_q = supabase.table("lots").select("id, project_id, numero_lote, estado, precio, m2, projects(name, comuna)")
    if project_id:
        lot_q = lot_q.eq("project_id", project_id)

    if matched_lot_ids:
        lot_q = lot_q.or_(f"id.in.({','.join(matched_lot_ids)}),numero_lote.eq.{q}")
    else:
        lot_q = lot_q.eq("numero_lote", q)

    res = lot_q.limit(limit).execute()
    lots = res.data or []

    results = []
    for l in lots:
        p_name = l.get("projects", {}).get("name") if l.get("projects") else "Proyecto"
        comuna = l.get("projects", {}).get("comuna") if l.get("projects") else ""
        results.append({
            "lot_id": l["id"],
            "project_id": l["project_id"],
            "proyecto_nombre": p_name,
            "comuna": comuna,
            "numero_lote": l.get("numero_lote"),
            "estado": l.get("estado"),
            "precio": l.get("precio"),
            "m2": l.get("m2"),
        })

    return results
