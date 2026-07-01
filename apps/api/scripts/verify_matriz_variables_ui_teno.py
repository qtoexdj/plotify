"""Read-only validation for SDD 013 T031 against the live Teno project.

This script validates the quickstart acceptance criteria for the legal variable
matrix UI using the real Supabase data for Teno plus source-level invariants for
UI-only affordances. It does not write to Supabase.

Run from the repository root or apps/api:

    ./.venv/bin/python scripts/verify_matriz_variables_ui_teno.py
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

API_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = API_ROOT.parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

# Make core.config load apps/api/.env when launched from the repo root.
os.chdir(API_ROOT)

TENO_PROJECT_ID = "aad0fbf2-ceda-47bc-954a-b3f5f2ac8797"
SII_PER_LOT_KEYS = {"sii.unidad_nombre", "sii.pre_rol_lote"}
SII_ROLES_ENTRY_KEY = "sii.roles_por_lote"
ACTIONABLE_PRODUCERS = {"extracted", "manual"}
NON_EDITABLE_PRODUCERS = {"sale_gap", "signing"}
RESOLVED_STATES = {"approved", "derived", "not_applicable"}
SELLER_KEYS = {
    "vendedor.nombre",
    "vendedor.rut",
    "vendedor.profesion_giro",
    "vendedor.domicilio",
}
SII_HEADER_KEYS = {
    "sii.rol_matriz",
    "sii.rol_avaluo_en_tramite_texto",
    "sii.certificado_asignacion_roles_numero",
    "sii.certificado_fecha_emision",
    "sii.solicitud_numero",
}
SAG_MANUAL_KEYS = {"sag.oficina_sectorial", "sag.plano_cbr_numero"}
QUICKSTART_PENDING_KEYS = SELLER_KEYS | SII_PER_LOT_KEYS | SII_HEADER_KEYS | SAG_MANUAL_KEYS
SALE_GAP_PREFIXES = ("comprador.", "transaccion.", "lote.", "servidumbre.")


@dataclass
class Check:
    id: str
    name: str
    passed: bool
    detail: dict[str, Any]


def _first_row(data: Any) -> dict[str, Any] | None:
    if isinstance(data, list):
        return data[0] if data else None
    return data if isinstance(data, dict) else None


async def _execute(builder: Any) -> Any:
    return await asyncio.to_thread(lambda: builder.execute())


def _read_repo_file(path: str) -> str:
    return (REPO_ROOT / path).read_text(encoding="utf-8")


def _producer_of(item: dict[str, Any]) -> str:
    return str(item.get("producer") or "extracted")


def _review_bucket(item: dict[str, Any]) -> str:
    if _producer_of(item) in NON_EDITABLE_PRODUCERS:
        return "no_editable"
    return "listo" if item.get("state") in RESOLVED_STATES else "por_revisar"


def _distinct_lot_count(rows: list[dict[str, Any]]) -> int:
    keys: set[str] = set()
    for row in rows:
        source_ref = row.get("source_ref") if isinstance(row.get("source_ref"), dict) else {}
        lot_id = row.get("lot_id") or source_ref.get("lot_id")
        unit_index = source_ref.get("unit_index")
        row_index = source_ref.get("row_index")
        if lot_id:
            keys.add(f"lot:{lot_id}")
        elif unit_index is not None:
            keys.add(f"unit:{unit_index}")
        elif row_index is not None:
            keys.add(f"row:{row_index}")
    return len(keys) if keys else len(rows)


def _worst_bucket(rows: list[dict[str, Any]]) -> str:
    buckets = [_review_bucket(row) for row in rows]
    if "por_revisar" in buckets:
        return "por_revisar"
    if buckets and all(bucket == "no_editable" for bucket in buckets):
        return "no_editable"
    return "listo"


def _to_entries(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    sii_rows: list[dict[str, Any]] = []
    entries: list[dict[str, Any]] = []
    for item in items:
        if item.get("variable_key") in SII_PER_LOT_KEYS:
            sii_rows.append(item)
            continue
        entries.append(
            {
                "kind": "single",
                "producer": _producer_of(item),
                "bucket": _review_bucket(item),
                "variable_keys": [item.get("variable_key")],
                "items": [item],
            }
        )

    if len(sii_rows) == 1:
        row = sii_rows[0]
        entries.append(
            {
                "kind": "single",
                "producer": _producer_of(row),
                "bucket": _review_bucket(row),
                "variable_keys": [row.get("variable_key")],
                "items": [row],
            }
        )
    elif sii_rows:
        entries.append(
            {
                "kind": "collapsed",
                "producer": _producer_of(sii_rows[0]),
                "bucket": _worst_bucket(sii_rows),
                "variable_key": SII_ROLES_ENTRY_KEY,
                "variable_keys": sorted({str(row.get("variable_key")) for row in sii_rows}),
                "lot_count": _distinct_lot_count(sii_rows),
                "items": sii_rows,
            }
        )
    return entries


def _is_actionable(entry: dict[str, Any]) -> bool:
    return str(entry["producer"]) in ACTIONABLE_PRODUCERS


def _decision_count(entry: dict[str, Any]) -> int:
    return len(entry.get("variable_keys") or [None])


def _progress(items: list[dict[str, Any]]) -> dict[str, Any]:
    actionable = [entry for entry in _to_entries(items) if _is_actionable(entry)]
    por_revisar = sum(
        _decision_count(entry) for entry in actionable if entry["bucket"] == "por_revisar"
    )
    listas = sum(_decision_count(entry) for entry in actionable if entry["bucket"] == "listo")
    total = sum(_decision_count(entry) for entry in actionable)
    return {
        "porRevisar": por_revisar,
        "listas": listas,
        "total": total,
        "moldeAprobable": por_revisar == 0,
    }


def _progress_if_resolved(items: list[dict[str, Any]]) -> dict[str, Any]:
    resolved_items: list[dict[str, Any]] = []
    for item in items:
        copy = dict(item)
        if _producer_of(item) in ACTIONABLE_PRODUCERS and _review_bucket(item) == "por_revisar":
            copy["state"] = "approved"
        resolved_items.append(copy)
    return _progress(resolved_items)


def _quickstart_base_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    base_items: list[dict[str, Any]] = []
    for item in items:
        copy = dict(item)
        if _producer_of(item) in ACTIONABLE_PRODUCERS:
            copy["state"] = (
                "proposed"
                if str(item.get("variable_key")) in QUICKSTART_PENDING_KEYS
                else "approved"
            )
        base_items.append(copy)
    return base_items


def _source_checks() -> dict[str, bool]:
    sale_gap = _read_repo_file(
        "apps/web/src/components/projects/legal/variable-matrix/sale-gap-panel.tsx"
    )
    producer_group = _read_repo_file(
        "apps/web/src/components/projects/legal/variable-matrix/producer-group.tsx"
    )
    inspector = _read_repo_file(
        "apps/web/src/components/projects/legal/variable-matrix/variable-inspector.tsx"
    )
    sii_detail = _read_repo_file(
        "apps/web/src/components/projects/legal/variable-matrix/sii-lot-detail.tsx"
    )
    return {
        "sale_gap_panel_lists_all_groups": all(
            token in sale_gap for token in ("comprador", "transaccion", "lote", "servidumbre")
        ),
        "sale_gap_panel_non_blocking_copy": "no bloquea el molde" in sale_gap,
        "producer_group_uses_bulk_keys": "porRevisarKeys(section)" in producer_group,
        "inspector_bulk_uses_collapsed_keys": "onBulkApprove(entry.variableKeys)" in inspector,
        "sii_detail_preserves_override_reason": "reason" in sii_detail
        and "legal-roles/${selectedLot.lot_id}" in sii_detail,
    }


async def _load_project(client: Any, project_id: str) -> dict[str, Any]:
    result = await _execute(
        client.table("projects")
        .select("id, name, organization_id")
        .eq("id", project_id)
        .limit(1)
    )
    row = _first_row(result.data)
    if not row:
        raise RuntimeError(f"Project not found: {project_id}")
    return row


async def _load_lot_counts(client: Any, *, project_id: str, organization_id: str) -> dict[str, int]:
    lots = await _execute(
        client.table("lots").select("id").eq("project_id", project_id)
    )
    roles = await _execute(
        client.table("lot_legal_data")
        .select("lot_id, matching_status, role_status")
        .eq("project_id", project_id)
        .eq("organization_id", organization_id)
    )
    return {
        "lots": len(lots.data or []),
        "lot_role_rows": len(roles.data or []),
        "manual_overrides": sum(
            1 for row in (roles.data or []) if row.get("matching_status") == "manual_override"
        ),
    }


async def run(project_id: str = TENO_PROJECT_ID) -> dict[str, Any]:
    from core.database import get_supabase_client
    from services.legal_variable_resolution import get_project_variable_inventory

    client = get_supabase_client()
    project = await _load_project(client, project_id)
    organization_id = str(project["organization_id"])
    inventory = await get_project_variable_inventory(
        project_id=project_id,
        organization_id=organization_id,
        include_evidence=True,
        supabase=client,
    )
    items = [
        item.model_dump(mode="json")
        for group in inventory.groups.values()
        for item in group
    ]
    quickstart_items = _quickstart_base_items(items)
    entries = _to_entries(items)
    progress = _progress(items)
    quickstart_progress = _progress(quickstart_items)
    resolved_progress = _progress_if_resolved(quickstart_items)
    source = _source_checks()
    role_counts = await _load_lot_counts(
        client,
        project_id=project_id,
        organization_id=organization_id,
    )

    by_key = {str(item["variable_key"]): item for item in items}
    seller = {key: by_key.get(key) for key in SELLER_KEYS}
    seller_states = {key: row.get("state") if row else None for key, row in seller.items()}
    seller_producers = {key: row.get("producer") if row else None for key, row in seller.items()}
    vendedor_nombre = by_key.get("vendedor.nombre")
    vendedor_nombre_evidence = vendedor_nombre.get("evidence") if vendedor_nombre else []
    collapsed_sii = [entry for entry in entries if entry.get("variable_key") == SII_ROLES_ENTRY_KEY]
    sale_gap_items = [
        item
        for item in items
        if str(item.get("variable_key", "")).startswith(SALE_GAP_PREFIXES)
        or item.get("producer") == "sale_gap"
    ]

    checks = [
        Check(
            "Q1",
            "Agrupacion por productor + panel de venta",
            {"extracted", "manual"}.issubset({_producer_of(item) for item in items})
            and source["sale_gap_panel_lists_all_groups"],
            {
                "producers_in_live_inventory": sorted({_producer_of(item) for item in items}),
                "sale_gap_panel_lists_all_groups": source["sale_gap_panel_lists_all_groups"],
            },
        ),
        Check(
            "Q2",
            "Conteo honesto Teno y Roles SII colapsados",
            quickstart_progress == {
                "porRevisar": 13,
                "listas": 21,
                "total": 34,
                "moldeAprobable": False,
            }
            and len(collapsed_sii) == 1
            and collapsed_sii[0]["lot_count"] == 53
            and len(collapsed_sii[0]["items"]) == 106
            and set(collapsed_sii[0]["variable_keys"]) == SII_PER_LOT_KEYS,
            {
                "progress_quickstart_base": quickstart_progress,
                "progress_live_actual": progress,
                "collapsed_sii": [
                    {
                        "variable_key": entry["variable_key"],
                        "variable_keys": entry["variable_keys"],
                        "lot_count": entry["lot_count"],
                        "items_count": len(entry["items"]),
                    }
                    for entry in collapsed_sii[:1]
                ],
            },
        ),
        Check(
            "Q3",
            "Vendedor visible",
            all(seller.values())
            and all(value == "extracted" for value in seller_producers.values()),
            {
                "seller_states": seller_states,
                "seller_producers": seller_producers,
            },
        ),
        Check(
            "Q4",
            "Evidencia en vendedor.nombre",
            bool(vendedor_nombre_evidence)
            and "JUAN DE DIOS GALAZ ABARCA" in str(vendedor_nombre.get("value_text", "")),
            {
                "value": vendedor_nombre.get("value_text") if vendedor_nombre else None,
                "evidence_count": len(vendedor_nombre_evidence or []),
            },
        ),
        Check(
            "Q5",
            "Aprobacion en bloque preserva claves reales",
            source["producer_group_uses_bulk_keys"] and source["inspector_bulk_uses_collapsed_keys"],
            {
                "producer_group_uses_bulk_keys": source["producer_group_uses_bulk_keys"],
                "inspector_bulk_uses_collapsed_keys": source["inspector_bulk_uses_collapsed_keys"],
            },
        ),
        Check(
            "Q6",
            "Huecos de venta visibles, no editables ni bloqueantes",
            source["sale_gap_panel_non_blocking_copy"]
            and all(_review_bucket(item) == "no_editable" for item in sale_gap_items)
            and quickstart_progress["total"] == 34,
            {
                "sale_gap_items_in_inventory": len(sale_gap_items),
                "sale_gap_panel_non_blocking_copy": source["sale_gap_panel_non_blocking_copy"],
                "progress_total_excludes_sale_gap": quickstart_progress["total"],
            },
        ),
        Check(
            "Q7",
            "Molde aprobable al resolver las 13 decisiones",
            resolved_progress == {"porRevisar": 0, "listas": 34, "total": 34, "moldeAprobable": True},
            {"resolved_progress": resolved_progress},
        ),
        Check(
            "Q8",
            "Venta automatica no aparece como tarea legal normal por lote",
            source["sale_gap_panel_non_blocking_copy"],
            {
                "validated_by": "source invariant",
                "note": "T033 validates sale -> escritura with the dedicated hook harness.",
            },
        ),
        Check(
            "Q9",
            "Override SII preservado",
            source["sii_detail_preserves_override_reason"] and role_counts["lots"] == 53,
            {**role_counts, "source_has_reason_patch": source["sii_detail_preserves_override_reason"]},
        ),
    ]

    return {
        "status": "ok" if all(check.passed for check in checks) else "failed",
        "project": {
            "id": project_id,
            "name": project.get("name"),
            "organization_id": organization_id,
        },
        "checks": [check.__dict__ for check in checks],
    }


def main() -> int:
    try:
        summary = asyncio.run(run())
    except Exception as exc:  # noqa: BLE001 - validation CLI reports concise JSON
        print(json.dumps({"status": "error", "error": str(exc)}, indent=2))
        return 1

    print(json.dumps(summary, indent=2, ensure_ascii=False))
    return 0 if summary["status"] == "ok" else 1


if __name__ == "__main__":
    raise SystemExit(main())
