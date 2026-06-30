"""Verify SDD 011 sale -> escritura against real Supabase.

This is a smoke harness for T023. It uses the real Supabase client and the
production services, not the FakeStore test doubles:

1. Seed deterministic Teno fixture rows in Supabase.
2. Seed/publish the golden matriz template.
3. Generate and approve the project-scope matriz.
4. Trigger the sale-validated hook.
5. Open the lot draft through the same mesa endpoint code.

The script refuses remote Supabase hosts unless ``--allow-remote`` is passed.
It only writes fixture IDs from ``tests/fixtures/matriz``.

Run from ``apps/api``:

    ./.venv/bin/python scripts/verify_venta_escritura_supabase.py
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from uuid import NAMESPACE_URL, UUID, uuid5

API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

# Make ``core.config.Settings(env_file=".env")`` load apps/api/.env even when
# the command is launched from the repository root.
os.chdir(API_ROOT)

OPERATIONAL_FIXTURE = (
    API_ROOT / "tests" / "fixtures" / "matriz" / "teno_operational_rows.json"
)
CASE_SNAPSHOT_FIXTURE = (
    API_ROOT / "tests" / "fixtures" / "matriz" / "teno_case_snapshot.json"
)

ACTOR_ID = "00000000-0000-4000-8000-000000000009"
ACTOR_EMAIL = "sdd011-smoke@plotify.local"
SALE_PREFIXES = ("comprador.", "transaccion.", "lote.", "servidumbre.")
LOCAL_SUPABASE_HOSTS = {"127.0.0.1", "localhost", "::1", "supabase-kong"}


def _progress(message: str) -> None:
    print(f"[sdd011] {message}", file=sys.stderr, flush=True)


def _load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _first_row(data: Any) -> dict[str, Any] | None:
    if isinstance(data, list):
        return data[0] if data else None
    return data if isinstance(data, dict) else None


def _fixture_uuid(*parts: str) -> str:
    return str(uuid5(NAMESPACE_URL, "plotify:sdd011:" + ":".join(parts)))


def _require_safe_supabase_url(*, allow_remote: bool) -> dict[str, Any]:
    from core.config import get_settings

    url = get_settings().SUPABASE_URL
    parsed = urlparse(url)
    hostname = parsed.hostname or ""
    is_local = hostname in LOCAL_SUPABASE_HOSTS
    if not is_local and not allow_remote:
        raise RuntimeError(
            "Refusing to write fixture data to non-local Supabase host "
            f"{hostname!r}. Re-run with --allow-remote only after confirming "
            "that this is a disposable dev/staging project."
        )
    return {
        "scheme": parsed.scheme,
        "hostname": hostname,
        "port": parsed.port,
        "local": is_local,
    }


async def _execute(builder: Any) -> Any:
    return await asyncio.to_thread(lambda: builder.execute())


async def _delete_where(client: Any, table: str, **filters: str) -> None:
    _progress(f"delete {table} {filters}")
    query = client.table(table).delete()
    for column, value in filters.items():
        query = query.eq(column, value)
    await _execute(query)


async def _upsert(client: Any, table: str, payload: dict[str, Any]) -> dict[str, Any]:
    _progress(f"upsert {table} {payload.get('id', '<no-id>')}")
    result = await _execute(client.table(table).upsert(payload, on_conflict="id"))
    row = _first_row(result.data)
    return row or payload


async def _upsert_lot_record(client: Any, payload: dict[str, Any]) -> dict[str, Any]:
    """Update the trigger-created record for the lot, or insert if absent."""
    lot_id = str(payload["lot_id"])
    _progress(f"upsert lot_records for lot {lot_id}")
    existing_result = await _execute(
        client.table("lot_records").select("id").eq("lot_id", lot_id).maybe_single()
    )
    existing = _first_row(existing_result.data)
    if existing:
        update_payload = {key: value for key, value in payload.items() if key != "id"}
        result = await _execute(
            client.table("lot_records").update(update_payload).eq("lot_id", lot_id)
        )
        return _first_row(result.data) or {**existing, **update_payload}
    return await _upsert(client, "lot_records", payload)


async def _ensure_fixture_actor(client: Any) -> str:
    """Ensure the FK target used by fixture rows exists in auth.users."""
    _progress(f"ensure fixture actor {ACTOR_ID}")
    try:
        await asyncio.to_thread(lambda: client.auth.admin.get_user_by_id(ACTOR_ID))
        return ACTOR_ID
    except Exception:
        await asyncio.to_thread(
            lambda: client.auth.admin.create_user(
                {
                    "id": ACTOR_ID,
                    "email": ACTOR_EMAIL,
                    "password": "sdd011-smoke-password",
                    "email_confirm": True,
                    "user_metadata": {"fixture": "sdd011-venta-escritura"},
                }
            )
        )
        return ACTOR_ID


async def _reset_fixture_scope(
    client: Any, *, organization_id: str, project_id: str, lot_id: str
) -> None:
    """Clear only the deterministic SDD 011 fixture scope."""
    await _delete_where(client, "escritura_deliveries", organization_id=organization_id)
    await _delete_where(client, "escritura_minuta_generations", organization_id=organization_id)
    await _delete_where(client, "legal_review_decisions", organization_id=organization_id)
    await _delete_where(client, "document_evidence", organization_id=organization_id)
    await _delete_where(client, "escritura_matrices", organization_id=organization_id)
    await _delete_where(client, "escritura_cases", organization_id=organization_id)
    await _delete_where(client, "variable_resolutions", organization_id=organization_id)
    await _delete_where(client, "title_analyses", organization_id=organization_id)
    await _delete_where(client, "lot_legal_data", organization_id=organization_id)
    await _delete_where(client, "project_legal_data", organization_id=organization_id)
    await _delete_where(client, "lot_records", lot_id=lot_id)
    await _delete_where(client, "lots", id=lot_id)
    await _delete_where(client, "organization_payment_info", organization_id=organization_id)
    await _delete_where(client, "projects", id=project_id)


def _lot_payload(fixture: dict[str, Any]) -> dict[str, Any]:
    lot = dict(fixture["lot"])
    lot["verified_status"] = "verified_exact"
    return {
        key: lot[key]
        for key in (
            "id",
            "project_id",
            "numero_lote",
            "estado",
            "m2",
            "area_official_m2",
            "superficie_neta_m2",
            "perimeter_official_m",
            "precio",
            "verified_status",
            "boundaries_official",
            "servidumbre_m2",
            "servidumbre_ancho_m",
        )
        if key in lot
    }


def _lot_record_payload(fixture: dict[str, Any]) -> dict[str, Any]:
    record = dict(fixture["lot_record"])
    record["etapa_proceso"] = "espera_firma_escritura"
    return {
        key: record[key]
        for key in (
            "id",
            "lot_id",
            "etapa_proceso",
            "cliente_nombre",
            "cliente_run",
            "cliente_direccion",
            "cliente_estado_civil",
            "cliente_ocupacion",
            "cliente_email",
            "cliente_telefono",
            "valor",
            "abono",
        )
        if key in record
    }


def _title_analysis_payload(
    snapshot: dict[str, Any], *, organization_id: str, project_id: str
) -> dict[str, Any]:
    title = snapshot["variable_snapshot"]["titulo"]

    def inscription_payload(item: dict[str, Any]) -> dict[str, Any]:
        return {
            "orden": item.get("orden"),
            "tipo_adquisicion": item.get("tipo_adquisicion"),
            "inscripcion": {
                "fojas": {"value": item.get("fojas")},
                "numero": {"value": item.get("numero")},
                "anio": {"value": item.get("anio")},
                "cbr": {"value": item.get("cbr")},
            },
            "escritura": {
                "fecha": {"value": item.get("escritura_fecha")},
                "notario": {"value": item.get("notario")},
                "repertorio": {"value": item.get("repertorio")},
            },
            "adquirentes": [
                {"nombre": {"value": owner.get("nombre")}, "cuota": owner.get("cuota")}
                for owner in item.get("adquirentes") or []
                if isinstance(owner, dict)
            ],
            "antecesor": {"nombre": {"value": item.get("antecesor")}},
        }

    return {
        "id": _fixture_uuid(organization_id, project_id, "title-analysis"),
        "organization_id": organization_id,
        "project_id": project_id,
        "status": "approved",
        "structure_type": title.get("estructura"),
        "analysis_json": {
            "structure_type": title.get("estructura"),
            "inscripciones": [
                inscription_payload(item)
                for item in title.get("inscripciones") or []
                if isinstance(item, dict)
            ],
            "propietarios_actuales": title.get("propietarios") or [],
        },
        "narrative_comparecencia_generated": title.get("comparecencia_vendedor_texto"),
        "narrative_comparecencia_edited": title.get("comparecencia_vendedor_texto"),
        "narrative_primero_generated": title.get("clausula_primero_texto"),
        "narrative_primero_edited": title.get("clausula_primero_texto"),
        "alerts": title.get("alertas_resueltas") or [],
        "verification_stats": {"fixture": "teno_case_snapshot"},
        "source_document_ids": [],
        "source_content_hash": "sdd011-teno-fixture",
        "extractor_name": "sdd011_supabase_verify",
        "model_name": "fixture",
        "prompt_version": "sdd011-t023",
    }


def _project_variable_payloads(
    snapshot: dict[str, Any], *, organization_id: str, project_id: str
) -> list[dict[str, Any]]:
    from services.legal_variable_catalog import variable_group_for_key

    payloads: list[dict[str, Any]] = []
    for key, entry in snapshot["variable_snapshot"].items():
        if key == "titulo" or key.startswith(SALE_PREFIXES):
            continue
        if not isinstance(entry, dict):
            continue
        group = variable_group_for_key(key)
        if group is None:
            continue
        state = entry.get("state") or "resolved"
        if state == "approved":
            state = "resolved"
        payloads.append(
            {
                "id": _fixture_uuid(organization_id, project_id, "var", key),
                "organization_id": organization_id,
                "project_id": project_id,
                "lot_id": None,
                "escritura_case_id": None,
                "variable_key": key,
                "variable_group": group,
                "value_text": entry.get("value_text"),
                "value_json": entry.get("value_json"),
                "state": state,
                "source_type": entry.get("source_type") or "manual",
                "source_ref": entry.get("source_ref") or {"source": "sdd011_fixture"},
                "confidence": entry.get("confidence") or 1.0,
                "extractor_name": "sdd011_supabase_verify",
                "approval_required": False,
            }
        )
    return payloads


async def _seed_fixture(client: Any) -> dict[str, str]:
    _progress("seed fixture start")
    fixture = _load_json(OPERATIONAL_FIXTURE)
    snapshot = _load_json(CASE_SNAPSHOT_FIXTURE)
    organization_id = fixture["organization_id"]
    project_id = fixture["project"]["id"]
    lot_id = fixture["lot"]["id"]

    await _reset_fixture_scope(
        client,
        organization_id=organization_id,
        project_id=project_id,
        lot_id=lot_id,
    )
    actor_id = await _ensure_fixture_actor(client)

    await _upsert(
        client,
        "organizations",
        {
            "id": organization_id,
            "name": "Plotify SDD 011 Teno Smoke",
            "slug": "plotify-sdd011-teno-smoke",
            "created_by": actor_id,
            "is_personal": False,
        },
    )
    await _upsert(
        client,
        "projects",
        {
            "id": project_id,
            "organization_id": organization_id,
            "name": fixture["project"].get("nombre") or "Parcelacion Teno",
            "region": "Región del Maule",
            "comuna": "Teno",
            "total_lotes": 24,
            "estado": "activo",
        },
    )
    await _upsert(client, "organization_payment_info", fixture["organization_payment_info"])
    await _upsert(client, "lots", _lot_payload(fixture))
    await _upsert_lot_record(client, _lot_record_payload(fixture))
    await _upsert(
        client,
        "project_legal_data",
        {
            "id": _fixture_uuid(organization_id, project_id, "project-legal-data"),
            "organization_id": organization_id,
            "project_id": project_id,
            "review_status": "approved",
            "sii_comuna": "Teno",
            "sii_role_matrix": "67-23",
        },
    )
    await _upsert(
        client,
        "lot_legal_data",
        {
            "id": _fixture_uuid(organization_id, project_id, lot_id, "lot-legal-data"),
            "organization_id": organization_id,
            "project_id": project_id,
            "lot_id": lot_id,
            "sii_unit_name": "Lote 3",
            "sii_pre_role": "67-103",
            "sii_role_in_process_text": (
                "rol de avalúo en trámite de asignación número 67-103 "
                "de la comuna de Teno"
            ),
            "role_status": "rol_en_tramite",
            "matching_status": "manual_override",
            "matching_score": 1.0,
            "reviewed_at": datetime.now(UTC).isoformat(),
        },
    )
    await _upsert(
        client,
        "title_analyses",
        _title_analysis_payload(
            snapshot,
            organization_id=organization_id,
            project_id=project_id,
        ),
    )
    for payload in _project_variable_payloads(
        snapshot,
        organization_id=organization_id,
        project_id=project_id,
    ):
        await _upsert(client, "variable_resolutions", payload)

    from scripts.seed_matriz_template import seed_template

    await seed_template(
        organization_id=organization_id,
        published_by=None,
        supabase=client,
    )
    _progress("seed fixture done")
    return {
        "organization_id": organization_id,
        "project_id": project_id,
        "lot_id": lot_id,
    }


async def _generate_and_approve_project_matriz(
    client: Any, *, organization_id: str, project_id: str
) -> tuple[dict[str, Any], int]:
    _progress("generate and approve project matriz start")
    from api.v1.endpoints.escritura_matrices import (
        _fetch_active_project_matrix,
        _lazy_create_project_matrix,
        _project_matriz_response,
    )
    from services.escritura_readiness import fetch_project_matriz_snapshot

    variable_snapshot, evidence_snapshot = await fetch_project_matriz_snapshot(
        organization_id=organization_id,
        project_id=project_id,
        supabase=client,
    )
    matrix = await _fetch_active_project_matrix(client, project_id, organization_id)
    if matrix is None:
        matrix = await _lazy_create_project_matrix(
            client,
            project_id,
            organization_id,
            variable_snapshot,
        )
    response = await _project_matriz_response(
        client,
        matrix,
        project_id=project_id,
        organization_id=organization_id,
        variable_snapshot=variable_snapshot,
        evidence_snapshot=evidence_snapshot,
    )
    blockers = len(response.matriz.approval_blockers)
    result = await _execute(
        client.table("escritura_matrices")
        .update(
            {
                "status": "approved",
                "approved_at": datetime.now(UTC).isoformat(),
            }
        )
        .eq("id", str(matrix["id"]))
        .eq("organization_id", organization_id)
    )
    approved = _first_row(result.data)
    if not approved:
        raise RuntimeError("Project matriz approval update returned no row.")
    _progress("generate and approve project matriz done")
    return approved, blockers


async def _verify_sale_hook(
    client: Any, *, organization_id: str, project_id: str, lot_id: str
) -> dict[str, Any]:
    _progress("verify sale hook start")
    from api.v1.endpoints.escritura_matrices import get_case_matriz
    from services.escritura_sale_hook import handle_sale_validated_for_escritura

    hook_result = await handle_sale_validated_for_escritura(
        organization_id=organization_id,
        lot_id=lot_id,
        validated_by=None,
        supabase=client,
    )
    if not hook_result.escritura_case_id:
        raise RuntimeError("Sale hook did not create or reuse an escritura case.")
    if not hook_result.borrador_matriz_id:
        raise RuntimeError("Sale hook did not create or reuse a lot draft matrix.")
    if not hook_result.project_matriz_id:
        raise RuntimeError("Sale hook did not link to an approved project matrix.")

    mesa = await get_case_matriz(
        UUID(hook_result.escritura_case_id),
        organization_id=UUID(organization_id),
    )
    sale_keys = (
        "comprador.nombre",
        "comprador.rut",
        "transaccion.precio_numeros",
        "lote.deslindes",
    )
    case_result = await _execute(
        client.table("escritura_cases")
        .select("id, case_status, readiness_status, variable_snapshot")
        .eq("id", hook_result.escritura_case_id)
        .eq("organization_id", organization_id)
        .maybe_single()
    )
    case_row = _first_row(case_result.data)
    snapshot = case_row.get("variable_snapshot") if case_row else {}
    missing_snapshot_keys = [
        key for key in sale_keys if not isinstance(snapshot, dict) or key not in snapshot
    ]
    if missing_snapshot_keys:
        raise RuntimeError(
            "Case snapshot is missing sale/lot keys from operational bridge: "
            + ", ".join(missing_snapshot_keys)
        )
    _progress("verify sale hook done")

    return {
        "hook": hook_result.to_dict(),
        "case_status": case_row.get("case_status") if case_row else None,
        "readiness_status": case_row.get("readiness_status") if case_row else None,
        "mesa_scope": mesa.matriz.scope,
        "mesa_status": mesa.matriz.status,
        "mesa_source_project_matriz_id": (
            str(mesa.matriz.source_project_matriz_id)
            if mesa.matriz.source_project_matriz_id
            else None
        ),
        "mesa_url": f"/documentos/matriz/{hook_result.escritura_case_id}",
        "project_mesa_url": f"/documentos/matriz/proyecto/{project_id}",
        "verified_snapshot_keys": list(sale_keys),
    }


async def run(*, allow_remote: bool) -> dict[str, Any]:
    url_info = _require_safe_supabase_url(allow_remote=allow_remote)
    _progress(f"supabase host {url_info['hostname']} local={url_info['local']}")

    from core.database import get_supabase_client

    client = get_supabase_client()
    ids = await _seed_fixture(client)
    project_matrix, blocker_count = await _generate_and_approve_project_matriz(
        client,
        organization_id=ids["organization_id"],
        project_id=ids["project_id"],
    )
    sale_summary = await _verify_sale_hook(client, **ids)
    return {
        "status": "ok",
        "supabase": url_info,
        "organization_id": ids["organization_id"],
        "project_id": ids["project_id"],
        "lot_id": ids["lot_id"],
        "project_matriz_id": str(project_matrix["id"]),
        "project_matriz_status": project_matrix["status"],
        "project_matriz_approval_blocker_count_before_force_approve": blocker_count,
        **sale_summary,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--allow-remote",
        action="store_true",
        help="Allow writes when SUPABASE_URL is not localhost/supabase-kong.",
    )
    args = parser.parse_args()

    try:
        summary = asyncio.run(run(allow_remote=args.allow_remote))
    except Exception as exc:  # noqa: BLE001 - CLI should report concise failure
        print(json.dumps({"status": "error", "error": str(exc)}, indent=2))
        return 1

    print(json.dumps(summary, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
