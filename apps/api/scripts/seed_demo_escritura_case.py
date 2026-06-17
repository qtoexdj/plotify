"""Seed a DEMO escritura case so the mesa de escritura (SDD 010) can be opened
with real data, without completing the upstream legal pipeline.

Carga el snapshot Teno (`tests/fixtures/matriz/teno_case_snapshot.json`) como
``variable_snapshot`` de un caso nuevo para el lote indicado. La matriz se
auto-crea (`_lazy_create_matrix`) al abrir la mesa, desde la plantilla
publicada de la organización. Es un caso de DEMOSTRACIÓN: muestra los datos de
Teno, no los del proyecto real — sirve para ver/validar la mesa.

Idempotente por lote y reversible:

    # crear / reusar
    ./.venv/bin/python scripts/seed_demo_escritura_case.py \
        --organization-id <org> --project-id <proj> --lot-id <lot>

    # quitar (borra el caso demo + su matriz + generaciones)
    ./.venv/bin/python scripts/seed_demo_escritura_case.py \
        --organization-id <org> --project-id <proj> --lot-id <lot> --remove
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path
from typing import Any

API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

SNAPSHOT_FIXTURE = (
    API_ROOT / "tests" / "fixtures" / "matriz" / "teno_case_snapshot.json"
)
DEMO_MARKER = "__demo_seed__"


def _load_snapshot() -> dict[str, Any]:
    return json.loads(SNAPSHOT_FIXTURE.read_text(encoding="utf-8"))


def _existing_case(supabase: Any, org: str, project: str, lot: str) -> dict | None:
    rows = (
        supabase.table("escritura_cases")
        .select("id, variable_snapshot, case_status")
        .eq("organization_id", org)
        .eq("project_id", project)
        .eq("lot_id", lot)
        .execute()
        .data
    )
    return rows[0] if isinstance(rows, list) and rows else None


async def seed(*, org: str, project: str, lot: str, remove: bool) -> dict[str, Any]:
    from core.database import get_supabase_client

    supabase = get_supabase_client()
    existing = await asyncio.to_thread(_existing_case, supabase, org, project, lot)

    if remove:
        if not existing:
            return {"status": "nothing_to_remove"}
        case_id = existing["id"]
        for table in ("escritura_minuta_generations", "escritura_matrices"):
            await asyncio.to_thread(
                lambda t=table: supabase.table(t)
                .delete()
                .eq("escritura_case_id", case_id)
                .execute()
            )
        await asyncio.to_thread(
            lambda: supabase.table("escritura_cases").delete().eq("id", case_id).execute()
        )
        return {"status": "removed", "case_id": case_id}

    if existing:
        return {
            "status": "exists",
            "case_id": existing["id"],
            "case_status": existing.get("case_status"),
        }

    snapshot = _load_snapshot()
    payload = {
        "organization_id": org,
        "project_id": project,
        "lot_id": lot,
        "case_status": snapshot.get("case_status", "ready_for_minuta"),
        "readiness_status": snapshot.get("readiness_status", "ready"),
        "readiness_gates": {DEMO_MARKER: True},
        "variable_snapshot": snapshot["variable_snapshot"],
        "evidence_snapshot": snapshot.get("evidence_snapshot", {}),
    }
    result = await asyncio.to_thread(
        lambda: supabase.table("escritura_cases").insert(payload).execute()
    )
    rows = result.data if isinstance(result.data, list) else []
    if not rows:
        raise RuntimeError("Case insert returned no row.")
    return {"status": "seeded", "case_id": rows[0]["id"], "case_status": payload["case_status"]}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--organization-id", required=True)
    parser.add_argument("--project-id", required=True)
    parser.add_argument("--lot-id", required=True)
    parser.add_argument("--remove", action="store_true")
    args = parser.parse_args()

    summary = asyncio.run(
        seed(
            org=args.organization_id,
            project=args.project_id,
            lot=args.lot_id,
            remove=args.remove,
        )
    )
    print(json.dumps(summary, indent=2))
    case_id = summary.get("case_id")
    if case_id and summary["status"] in {"seeded", "exists"}:
        print(f"\nAbre la mesa en:\n  /documentos/matriz/{case_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
