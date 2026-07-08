"""SDD 008 case-bound matriz endpoints.

Rutas HTTP para la matriz de escritura (caso y proyecto). La lógica de
workflow (fetchers, resolución de blockers, submit/approve/reject/generate)
vive en ``services/escritura_case_workflow.py`` desde SDD 017 (T005) — este
módulo reexporta ese servicio completo para que los tests existentes y el
resto del archivo sigan viendo los mismos símbolos que antes del refactor.
"""

from __future__ import annotations

import asyncio
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from api.deps import verify_internal_secret
from core.logger import get_logger
from schemas.escritura_matrices import (
    BulkVerifyLotsRequest,
    BulkVerifyLotsResponse,
    CascadeRunResponse,
    EscrituraTraceResponse,
    GenerateMinutaRequest,
    LegalReviewDecisionRequest,
    MatrizApproveRequest,
    MatrizCaseResponse,
    MatrizRejectRequest,
    MatrizSaveRequest,
    MatrizSubmitRequest,
    MinutaGeneration,
    MinutaGenerationListResponse,
    StageOperationalResult,
)
from services.escritura_readiness import fetch_project_matriz_snapshot
from services.escritura_case_workflow import *  # noqa: F401,F403

logger = get_logger(__name__)

router = APIRouter(
    tags=["escritura-matrices"],
    dependencies=[Depends(verify_internal_secret)],
)

_NOT_IMPLEMENTED = HTTPException(
    status_code=status.HTTP_501_NOT_IMPLEMENTED,
    detail="escritura-matrices endpoint not implemented yet (SDD 008).",
)

@router.get(
    "/escritura-matrices/project/{project_id}",
    response_model=MatrizCaseResponse,
)
async def get_project_matriz(
    project_id: UUID,
    organization_id: UUID = Query(...),
) -> MatrizCaseResponse:
    from api.v1.endpoints.legal_variables import (
        ensure_legal_documents_feature_enabled,
    )
    from core.database import get_supabase_client

    client = get_supabase_client()
    org_id = str(organization_id)
    project_id_str = str(project_id)
    await _fetch_project(client, project_id_str, org_id)
    ensure_legal_documents_feature_enabled(
        organization_id=org_id,
        project_id=project_id_str,
    )
    variable_snapshot, evidence_snapshot = await fetch_project_matriz_snapshot(
        organization_id=org_id,
        project_id=project_id_str,
        supabase=client,
    )
    matrix_row = await _fetch_active_project_matrix(client, project_id_str, org_id)
    if matrix_row is None:
        matrix_row = await _lazy_create_project_matrix(
            client, project_id_str, org_id, variable_snapshot
        )
    return await _project_matriz_response(
        client,
        matrix_row,
        project_id=project_id_str,
        organization_id=org_id,
        variable_snapshot=variable_snapshot,
        evidence_snapshot=evidence_snapshot,
    )


@router.get(
    "/escritura-matrices/case/{escritura_case_id}",
    response_model=MatrizCaseResponse,
)
async def get_case_matriz(
    escritura_case_id: UUID,
    organization_id: UUID = Query(...),
) -> MatrizCaseResponse:
    from api.v1.endpoints.legal_variables import (
        ensure_legal_documents_feature_enabled,
    )
    from core.database import get_supabase_client

    client = get_supabase_client()
    org_id = str(organization_id)
    case_row = await _fetch_case(client, str(escritura_case_id), org_id)
    ensure_legal_documents_feature_enabled(
        organization_id=org_id,
        project_id=str(case_row["project_id"]),
    )
    matrix_row = await _fetch_active_matrix(
        client, str(escritura_case_id), org_id, str(case_row["project_id"])
    )
    if matrix_row is None:
        matrix_row = await _lazy_create_matrix(client, case_row, org_id)
    return await _case_response(client, matrix_row, case_row)


@router.post(
    "/escritura-matrices/case/{escritura_case_id}/legal-review",
    response_model=MatrizCaseResponse,
)
async def submit_legal_review(
    escritura_case_id: UUID,
    request: LegalReviewDecisionRequest,
    organization_id: UUID = Query(...),
) -> MatrizCaseResponse:
    """FR-007/FR-008: acción explícita del admin/abogado sobre el caso.
    Aprobada exige que documento.abogado_redactor.nombre/rut ya existan
    project-scoped (T015); escribe revision_juridica.* scope lote y audita
    en legal_review_decisions. Rechazada exige comentario y no avanza el caso.
    """
    from api.deps import require_admin_role
    from api.v1.endpoints.legal_variables import (
        ensure_legal_documents_feature_enabled,
    )
    from core.database import get_supabase_client
    from services.escritura_readiness import create_escritura_case_snapshot

    client = get_supabase_client()
    org_id = str(organization_id)
    decided_by = str(request.decided_by)
    await require_admin_role(decided_by, org_id, supabase=client)

    case_row = await _fetch_case(client, str(escritura_case_id), org_id)
    project_id = str(case_row["project_id"])
    lot_id = str(case_row["lot_id"])
    ensure_legal_documents_feature_enabled(
        organization_id=org_id, project_id=project_id
    )

    comentario = (request.comentario or "").strip()
    if request.decision == "rechazada" and not comentario:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "comentario_required",
                "message": "Indica un comentario para rechazar la revisión jurídica.",
            },
        )

    if request.decision == "aprobada":
        missing = await _missing_abogado_redactor_keys(client, org_id, project_id)
        if missing:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={
                    "code": "abogado_redactor_incompleto",
                    "message": "Completa los datos del abogado redactor antes de aprobar la revisión jurídica.",
                    "missing": missing,
                },
            )

    now = _utc_now_iso()
    estado = "aprobada" if request.decision == "aprobada" else "rechazada"
    estado_row = await _upsert_lot_variable(
        client,
        organization_id=org_id,
        project_id=project_id,
        lot_id=lot_id,
        variable_key="revision_juridica.estado",
        value_text=estado,
        reviewed_by=decided_by,
        reviewed_at=now,
    )
    if request.decision == "aprobada":
        await _upsert_lot_variable(
            client,
            organization_id=org_id,
            project_id=project_id,
            lot_id=lot_id,
            variable_key="revision_juridica.aprobada_por",
            value_text=decided_by,
            reviewed_by=decided_by,
            reviewed_at=now,
        )
        await _upsert_lot_variable(
            client,
            organization_id=org_id,
            project_id=project_id,
            lot_id=lot_id,
            variable_key="revision_juridica.aprobada_at",
            value_text=now,
            reviewed_by=decided_by,
            reviewed_at=now,
        )

    await asyncio.to_thread(
        lambda: (
            client.table("legal_review_decisions")
            .insert(
                {
                    "organization_id": org_id,
                    "project_id": project_id,
                    "lot_id": lot_id,
                    "escritura_case_id": str(escritura_case_id),
                    "variable_resolution_id": estado_row.get("id"),
                    "decision_type": "approve_case"
                    if request.decision == "aprobada"
                    else "reject_case",
                    "decision_status": "approved"
                    if request.decision == "aprobada"
                    else "rejected",
                    "reason": comentario or None,
                    "decided_by": decided_by,
                    "decided_at": now,
                }
            )
            .execute()
        )
    )

    await create_escritura_case_snapshot(
        organization_id=org_id,
        project_id=project_id,
        lot_id=lot_id,
        stage_operational=False,
        supabase=client,
    )

    # SDD 017 (T019/FR-004): retomar la cascada tras CUALQUIER decisión de
    # revisión jurídica — aprobada, avanza sola (único acto humano de
    # every_sale, SC-002); rechazada, la cascada la reconoce por el valor de
    # revision_juridica.estado (no solo su presencia) y registra una corrida
    # exception con el comentario, para que la mesa dependa de la ÚLTIMA
    # corrida real y no de un run_approved viejo. "review_approved" es el
    # único trigger de este endpoint en el enum de escritura_cascade_runs —
    # no implica que la decisión haya sido positiva. Best-effort: una falla
    # de la cascada nunca revierte la revisión jurídica ya decidida.
    from services.escritura_auto_pipeline import run_case_cascade

    try:
        await run_case_cascade(
            organization_id=org_id,
            escritura_case_id=str(escritura_case_id),
            trigger="review_approved",
            supabase=client,
        )
    except Exception as exc:  # noqa: BLE001 - cascada best-effort
        logger.error(
            "escritura_cascade_trigger_failed",
            organization_id=org_id,
            escritura_case_id=str(escritura_case_id),
            error=str(exc),
        )

    refreshed_case = await _fetch_case(client, str(escritura_case_id), org_id)
    matrix_row = await _fetch_active_matrix(client, str(escritura_case_id), org_id, project_id)
    if matrix_row is None:
        matrix_row = await _lazy_create_matrix(client, refreshed_case, org_id)
    return await _case_response(client, matrix_row, refreshed_case)


@router.put(
    "/escritura-matrices/{matriz_id}",
    response_model=MatrizCaseResponse,
)
async def save_matriz(
    matriz_id: UUID,
    request: MatrizSaveRequest,
    organization_id: UUID = Query(...),
) -> MatrizCaseResponse:
    from api.v1.endpoints.legal_variables import (
        ensure_legal_documents_feature_enabled,
    )
    from core.database import get_supabase_client

    client = get_supabase_client()
    org_id = str(organization_id)
    matrix_row = await _fetch_matrix_by_id(client, str(matriz_id), org_id)
    case_row = await _fetch_case(client, str(matrix_row["escritura_case_id"]), org_id)
    if str(matrix_row.get("project_id")) != str(case_row["project_id"]):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Matriz not found for this project.",
        )
    ensure_legal_documents_feature_enabled(
        organization_id=org_id,
        project_id=str(case_row["project_id"]),
    )

    current_hash = _json_hash(case_row.get("variable_snapshot"))
    if str(matrix_row.get("snapshot_hash")) != current_hash:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "snapshot_stale",
                "message": "The escritura case snapshot changed; reload the matriz before saving.",
            },
        )
    if int(matrix_row["version"]) != request.version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "version_conflict",
                "message": "The matriz was updated by another writer.",
                "current_version": matrix_row["version"],
            },
        )
    if matrix_row.get("status") == "approved":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "matriz_approved_locked",
                "message": "Approved matrices are locked; a new snapshot must return them to draft.",
            },
        )

    payload = {
        "clause_order": request.clause_order,
        "clause_overrides": {
            key: override.model_dump(exclude_none=True)
            for key, override in request.clause_overrides.items()
        },
        "version": request.version + 1,
    }
    result = await asyncio.to_thread(
        lambda: (
            client.table("escritura_matrices")
            .update(payload)
            .eq("id", str(matriz_id))
            .eq("organization_id", org_id)
            .eq("version", request.version)
            .execute()
        )
    )
    updated = _first_row(result.data)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "version_conflict",
                "message": "The matriz was updated by another writer.",
            },
        )
    return await _case_response(client, updated, case_row)




@router.post(
    "/escritura-matrices/{matriz_id}/submit",
    response_model=MatrizCaseResponse,
)
async def submit_matriz(
    matriz_id: UUID,
    request: MatrizSubmitRequest,
    organization_id: UUID = Query(...),
) -> MatrizCaseResponse:
    return await submit_case_matriz(matriz_id, request, organization_id)


@router.post(
    "/escritura-matrices/{matriz_id}/approve",
    response_model=MatrizCaseResponse,
)
async def approve_matriz(
    matriz_id: UUID,
    request: MatrizApproveRequest,
    organization_id: UUID = Query(...),
) -> MatrizCaseResponse:
    return await approve_case_matriz(matriz_id, request, organization_id)


@router.post(
    "/escritura-matrices/{matriz_id}/reject",
    response_model=MatrizCaseResponse,
)
async def reject_matriz(
    matriz_id: UUID,
    request: MatrizRejectRequest,
    organization_id: UUID = Query(...),
) -> MatrizCaseResponse:
    return await reject_case_matriz(matriz_id, request, organization_id)


@router.post(
    "/escritura-matrices/{matriz_id}/generate",
    response_model=MinutaGeneration,
    status_code=status.HTTP_201_CREATED,
)
async def generate_minuta(
    matriz_id: UUID,
    request: GenerateMinutaRequest,
    organization_id: UUID = Query(...),
) -> MinutaGeneration:
    return await generate_case_minuta(matriz_id, request, organization_id)

@router.get(
    "/escritura-matrices/case/{escritura_case_id}/generations",
    response_model=MinutaGenerationListResponse,
)
async def list_case_generations(
    escritura_case_id: UUID,
    organization_id: UUID = Query(...),
) -> MinutaGenerationListResponse:
    from api.v1.endpoints.legal_variables import (
        ensure_legal_documents_feature_enabled,
    )
    from core.database import get_supabase_client

    client = get_supabase_client()
    org_id = str(organization_id)
    case_row = await _fetch_case(client, str(escritura_case_id), org_id)
    ensure_legal_documents_feature_enabled(
        organization_id=org_id,
        project_id=str(case_row["project_id"]),
    )
    result = await asyncio.to_thread(
        lambda: (
            client.table("escritura_minuta_generations")
            .select(GENERATION_COLUMNS)
            .eq("escritura_case_id", str(escritura_case_id))
            .eq("organization_id", org_id)
            .eq("project_id", str(case_row["project_id"]))
            .order("generated_at", desc=True)
            .execute()
        )
    )
    generations = [
        await _generation_response(client, row) for row in _rows(result.data)
    ]
    return MinutaGenerationListResponse(generations=generations)


@router.get(
    "/escritura-matrices/case/{escritura_case_id}/trace",
    response_model=EscrituraTraceResponse,
)
async def get_escritura_trace(
    escritura_case_id: UUID,
    organization_id: UUID = Query(...),
) -> EscrituraTraceResponse:
    """Trazabilidad completa de la escritura (FR-012), consultable desde la
    mesa y el historial."""
    from api.v1.endpoints.legal_variables import (
        ensure_legal_documents_feature_enabled,
    )
    from core.database import get_supabase_client

    client = get_supabase_client()
    org_id = str(organization_id)
    case_row = await _fetch_case(client, str(escritura_case_id), org_id)
    ensure_legal_documents_feature_enabled(
        organization_id=org_id,
        project_id=str(case_row["project_id"]),
    )
    trace = await _build_escritura_trace(client, case_row)
    return EscrituraTraceResponse.model_validate(trace)


@router.post(
    "/escritura-cases/{escritura_case_id}/retry-cascade",
    response_model=CascadeRunResponse,
)
async def retry_cascade(
    escritura_case_id: UUID,
    organization_id: UUID = Query(...),
) -> CascadeRunResponse:
    """SDD 017 (T013): reintenta la cascada de aprobación por excepción de un
    caso (contracts §1). Idempotente — sobre un caso ya `completed` responde
    el estado final sin efectos (D6). Sobre un caso con minuta entregada y
    datos corregidos después responde 409 (FR-011: regenerar es explícito)."""
    from api.v1.endpoints.legal_variables import ensure_legal_documents_feature_enabled
    from core.database import get_supabase_client
    from services.escritura_auto_pipeline import CaseOutdatedError, run_case_cascade

    client = get_supabase_client()
    org_id = str(organization_id)
    case_row = await _fetch_case(client, str(escritura_case_id), org_id)
    ensure_legal_documents_feature_enabled(
        organization_id=org_id, project_id=str(case_row["project_id"])
    )
    try:
        result = await run_case_cascade(
            organization_id=org_id,
            escritura_case_id=str(escritura_case_id),
            trigger="manual_retry",
            supabase=client,
        )
    except CaseOutdatedError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "case_outdated",
                "message": (
                    "El caso tiene una minuta entregada con datos anteriores; "
                    "regenerar es una acción explícita."
                ),
            },
        )
    return CascadeRunResponse.model_validate(result.to_dict())


@router.post(
    "/escritura-cases/{escritura_case_id}/stage-operational",
    response_model=StageOperationalResult,
)
async def stage_operational_variables(
    escritura_case_id: UUID,
    organization_id: UUID = Query(...),
) -> StageOperationalResult:
    """Re-run the operational bridge for a case and refresh its snapshot.

    US6/FR-021: changed sale or geometry rows supersede + re-propose; the
    refreshed snapshot makes the matriz detect supersession (FR-014).
    """
    import asyncio

    from api.v1.endpoints.legal_variables import (
        ensure_legal_documents_feature_enabled,
    )
    from core.database import get_supabase_client
    from services.escritura_operational_bridge import (
        OperationalBridgeScopeError,
        stage_operational_variables as stage_operational_variables_service,
    )
    from services.escritura_readiness import create_escritura_case_snapshot

    supabase = get_supabase_client()
    case_result = await asyncio.to_thread(
        lambda: (
            supabase.table("escritura_cases")
            .select("id, organization_id, project_id, lot_id")
            .eq("id", str(escritura_case_id))
            .eq("organization_id", str(organization_id))
            .maybe_single()
            .execute()
        )
    )
    case_row = _single_row(case_result)
    if not case_row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Escritura case not found for this organization.",
        )
    ensure_legal_documents_feature_enabled(
        organization_id=str(organization_id),
        project_id=str(case_row["project_id"]),
    )
    try:
        outcome = await stage_operational_variables_service(
            organization_id=str(organization_id),
            project_id=str(case_row["project_id"]),
            lot_id=str(case_row["lot_id"]),
            supabase=supabase,
        )
        # Refresh the case snapshot so gates and the matriz see the staging.
        await create_escritura_case_snapshot(
            organization_id=str(organization_id),
            project_id=str(case_row["project_id"]),
            lot_id=str(case_row["lot_id"]),
            stage_operational=False,
            supabase=supabase,
        )
    except OperationalBridgeScopeError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)
        ) from exc
    return StageOperationalResult.model_validate(outcome.to_dict())


@router.post(
    "/projects/{project_id}/lots/bulk-verify",
    response_model=BulkVerifyLotsResponse,
)
async def bulk_verify_lots(
    project_id: UUID,
    request: BulkVerifyLotsRequest,
    organization_id: UUID = Query(...),
) -> BulkVerifyLotsResponse:
    """US5: Acción para verificar masivamente todos los lotes de un proyecto que se encuentren
    dentro del porcentaje de tolerancia (tolerance_pct) comparando su cabida calculada vs oficial.
    """
    import math
    from api.deps import require_admin_role
    from core.database import get_supabase_client
    from schemas.escritura_matrices import BulkVerifyLotsResponse

    client = get_supabase_client()
    org_id = str(organization_id)
    admin_id = str(request.admin_id)
    proj_id = str(project_id)
    
    # 1. Validar rol de administrador
    await require_admin_role(admin_id, org_id, supabase=client)

    # Helper UTM y Shoelace definidos localmente
    def get_utm_zone(lon: float) -> int:
        return math.floor((lon + 180) / 6) + 1

    def latlon_to_utm(lat: float, lon: float, zone: int) -> tuple[float, float]:
        a = 6378137.0
        f = 1 / 298.257223563
        b = a * (1 - f)
        e2 = (a**2 - b**2) / a**2
        ep2 = (a**2 - b**2) / b**2
        k0 = 0.9996
        lon_origin = (zone - 1) * 6 - 180 + 3
        lat_rad = math.radians(lat)
        lon_rad = math.radians(lon)
        lon_origin_rad = math.radians(lon_origin)
        N = a / math.sqrt(1 - e2 * math.sin(lat_rad)**2)
        T = math.tan(lat_rad)**2
        C = ep2 * math.cos(lat_rad)**2
        A = (lon_rad - lon_origin_rad) * math.cos(lat_rad)
        n = f / (2 - f)
        alpha = (a + b) / 2.0 * (1 + (n**2)/4.0 + (n**4)/64.0)
        beta = 3.0 * n / 2.0 - 27.0 * n**3 / 32.0
        gamma = 21.0 * n**2 / 16.0 - 55.0 * n**4 / 32.0
        delta = 151.0 * n**3 / 96.0
        M = alpha * (lat_rad - beta * math.sin(2*lat_rad) + gamma * math.sin(4*lat_rad) - delta * math.sin(6*lat_rad))
        x = k0 * N * (A + (1 - T + C) * A**3 / 6.0 + (5 - 18 * T + T**2 + 72 * C - 58 * ep2) * A**5 / 120.0) + 500000.0
        y = k0 * (M + N * math.tan(lat_rad) * (A**2 / 2.0 + (5 - T + 9 * C + 4 * C**2) * A**4 / 24.0 + (61 - 58 * T + T**2 + 600 * C - 330 * ep2) * A**6 / 720.0))
        y += 10000000.0
        return x, y

    def clean_coordinates(coords: list[list[float]]) -> list[list[float]]:
        if len(coords) < 3:
            return coords
        cleaned = []
        for c in coords:
            if not cleaned or abs(c[0] - cleaned[-1][0]) > 1e-9 or abs(c[1] - cleaned[-1][1]) > 1e-9:
                cleaned.append(c)
        if len(cleaned) > 3:
            if abs(cleaned[0][0] - cleaned[-1][0]) < 1e-9 and abs(cleaned[0][1] - cleaned[-1][1]) < 1e-9:
                cleaned.pop()
        return cleaned

    def calculate_shoelace_area(points: list[tuple[float, float]]) -> float:
        area = 0.0
        n = len(points)
        for i in range(n):
            j = (i + 1) % n
            area += points[i][0] * points[j][1]
            area -= points[j][0] * points[i][1]
        return abs(area) / 2.0

    def calculate_planar_perimeter(points: list[tuple[float, float]]) -> float:
        perim = 0.0
        n = len(points)
        for i in range(n):
            j = (i + 1) % n
            dx = points[j][0] - points[i][0]
            dy = points[j][1] - points[i][1]
            perim += math.sqrt(dx * dx + dy * dy)
        return perim

    def calculate_lot_legal_metrics(geometry: dict) -> dict | None:
        geom_type = geometry.get("type")
        coords = geometry.get("coordinates", [])
        if geom_type == "Polygon":
            coords_outer = coords[0]
        elif geom_type == "MultiPolygon":
            coords_outer = coords[0][0]
        elif geom_type == "LineString":
            coords_outer = coords
        elif geom_type == "MultiLineString":
            coords_outer = coords[0]
        else:
            return None
        
        if not coords_outer or len(coords_outer) < 3:
            return None
        cleaned = clean_coordinates(coords_outer)
        if len(cleaned) < 3:
            return None
        
        zone = get_utm_zone(cleaned[0][0])
        utm_points = []
        for point in cleaned:
            lon, lat = point[0], point[1]
            x, y = latlon_to_utm(lat, lon, zone)
            utm_points.append((x, y))
            
        area = calculate_shoelace_area(utm_points)
        perimeter = calculate_planar_perimeter(utm_points)
        return {
            "area_legal_m2": area,
            "perimeter_legal_m": perimeter,
        }

    # 2. Consultar lotes del proyecto
    lots_res = await asyncio.to_thread(
        lambda: client.table("lots")
        .select("id, numero_lote, m2, area_official_m2, perimeter_official_m, verified_status, geometry_id")
        .eq("project_id", proj_id)
        .execute()
    )
    lots = lots_res.data or []

    # 3. Consultar geometrías asignadas a lotes de este proyecto
    geom_res = await asyncio.to_thread(
        lambda: client.table("geometries")
        .select("id, geometry")
        .eq("project_id", proj_id)
        .eq("geometry_type", "lot")
        .execute()
    )
    geoms = {row["id"]: row["geometry"] for row in (geom_res.data or [])}

    verified_count = 0
    deviated: list[UUID] = []
    skipped_no_geometry: list[UUID] = []
    
    # Tolerancia como fracción (ej: 0.5% -> 0.005)
    tol = request.tolerance_pct / 100.0

    # Colección de tareas asíncronas para actualización y auditoría
    update_tasks = []

    for lot in lots:
        lot_id = UUID(lot["id"])
        geom_id = lot["geometry_id"]
        
        if not geom_id or geom_id not in geoms:
            skipped_no_geometry.append(lot_id)
            continue
            
        geom = geoms[geom_id]
        metrics = calculate_lot_legal_metrics(geom)
        if not metrics:
            skipped_no_geometry.append(lot_id)
            continue
            
        area_calc = metrics["area_legal_m2"]
        perim_calc = metrics["perimeter_legal_m"]
        
        area_off = lot["area_official_m2"]
        perim_off = lot["perimeter_official_m"]
        
        # Si no tiene definidos los valores oficiales, se considera desviado o incompleto para auto-verificación
        if area_off is None or perim_off is None:
            deviated.append(lot_id)
            continue
            
        diff_area = abs(area_off - area_calc) / area_calc
        diff_perim = abs(perim_off - perim_calc) / perim_calc
        
        if diff_area <= tol and diff_perim <= tol:
            # Dentro de tolerancia -> verified_exact
            verified_count += 1

            # Escritura vía RPC (no client.table("lots").update() directo):
            # lots tiene el trigger trg_guard_legal_fields, que revierte en
            # silencio verified_status/verified_at/verified_by/etc. a su
            # valor anterior si auth.uid() no resuelve a un admin del
            # proyecto. Con la service role key auth.uid() es NULL (no hay
            # sesión de usuario), así que un UPDATE directo aquí nunca
            # persiste aunque no lance error. El RPC re-verifica el rol
            # admin server-side e impersona a admin_id solo para su propia
            # transacción (ver 20260707020000_verify_lot_as_admin_rpc.sql).
            def update_and_audit(l_id=lot["id"], calc_area=area_calc, calc_perim=perim_calc):
                client.rpc(
                    "verify_lot_as_admin",
                    {
                        "p_lot_id": l_id,
                        "p_admin_id": admin_id,
                        "p_area_calc_m2": calc_area,
                        "p_perimeter_calc_m": calc_perim,
                    },
                ).execute()

            update_tasks.append(asyncio.to_thread(update_and_audit))
        else:
            # Fuera de tolerancia -> deviated
            deviated.append(lot_id)

    # 4. Ejecutar todas las actualizaciones en lote de forma paralela
    if update_tasks:
        await asyncio.gather(*update_tasks)

    return BulkVerifyLotsResponse(
        verified=verified_count,
        deviated=deviated,
        skipped_no_geometry=skipped_no_geometry,
    )

