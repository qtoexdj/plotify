"""Seed the "Compraventa predio rustico" v1 template for an organization.

SDD 008 T018: loads the lawyer's golden template (fixture
`tests/fixtures/matriz/golden_template_clauses.json`, derived from
labs/labs_escrituras/docs/template-draft.md with clause 2 replaced by the
`titulo.clausula_primero_texto` block) into `escritura_templates` +
`escritura_template_clauses`, validates every clause against the canonical
catalog, and publishes it.

Idempotent per organization: if the organization already has a published
version of the template name, the script exits without writing, unless
``--force`` (or ``force=True``) is passed, in which case it publishes a new
version from the current golden fixture and retires the previous published
version (single-published-per-name invariant, same as the publish endpoint).

Run from `apps/api/`:

    ./.venv/bin/python scripts/seed_matriz_template.py --organization-id <uuid> \
        [--published-by <uuid>] [--dry-run] [--force]
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

GOLDEN_FIXTURE = (
    API_ROOT / "tests" / "fixtures" / "matriz" / "golden_template_clauses.json"
)


def load_golden_template() -> dict[str, Any]:
    return json.loads(GOLDEN_FIXTURE.read_text(encoding="utf-8"))


def validate_golden_template(template: dict[str, Any]) -> list[str]:
    """Return a list of human-readable validation errors (empty == valid)."""
    from services.matriz_template_validation import (
        validate_clause_condition,
        validate_clause_content,
    )

    errors: list[str] = []
    for clause in template["clauses"]:
        issues = validate_clause_content(clause["content_json"])
        issues += validate_clause_condition(
            clause.get("condition_key"), clause.get("condition_mode")
        )
        for issue in issues:
            errors.append(f"{clause['clause_key']}: {issue.reason} {issue.key}")
    return errors


async def seed_template(
    *,
    organization_id: str,
    published_by: str | None,
    supabase: Any | None = None,
    publish: bool = True,
    force: bool = False,
) -> dict[str, Any]:
    """Create + publish the golden template; returns a summary dict."""
    if supabase is None:
        from core.database import get_supabase_client

        supabase = get_supabase_client()

    template_data = load_golden_template()
    errors = validate_golden_template(template_data)
    if errors:
        raise ValueError(
            "Golden template fails catalog validation: " + "; ".join(errors)
        )

    name = template_data["name"]
    existing_result = await asyncio.to_thread(
        lambda: (
            supabase.table("escritura_templates")
            .select("id, version, status")
            .eq("organization_id", organization_id)
            .eq("name", name)
            .eq("status", "published")
            .execute()
        )
    )
    existing = existing_result.data if isinstance(existing_result.data, list) else []
    if existing and not force:
        return {
            "status": "skipped",
            "reason": "already_published",
            "template_id": existing[0]["id"],
            "version": existing[0]["version"],
        }

    versions_result = await asyncio.to_thread(
        lambda: (
            supabase.table("escritura_templates")
            .select("version")
            .eq("organization_id", organization_id)
            .eq("name", name)
            .order("version", desc=True)
            .limit(1)
            .execute()
        )
    )
    rows = versions_result.data if isinstance(versions_result.data, list) else []
    next_version = int(rows[0]["version"]) + 1 if rows else 1

    insert_result = await asyncio.to_thread(
        lambda: (
            supabase.table("escritura_templates")
            .insert(
                {
                    "organization_id": organization_id,
                    "name": name,
                    "document_type": template_data["document_type"],
                    "version": next_version,
                    "status": "draft",
                }
            )
            .execute()
        )
    )
    template_rows = insert_result.data if isinstance(insert_result.data, list) else []
    template_id = template_rows[0]["id"]

    clause_payloads = [
        {
            "organization_id": organization_id,
            "template_id": template_id,
            "clause_key": clause["clause_key"],
            "title": clause["title"],
            "position": clause["position"],
            "fixed_position": clause["fixed_position"],
            "content_json": clause["content_json"],
            "condition_key": clause.get("condition_key"),
            "condition_mode": clause.get("condition_mode"),
            "alert_tipo": clause.get("alert_tipo"),
        }
        for clause in template_data["clauses"]
    ]
    await asyncio.to_thread(
        lambda: (
            supabase.table("escritura_template_clauses")
            .insert(clause_payloads)
            .execute()
        )
    )

    if publish:
        await asyncio.to_thread(
            lambda: (
                supabase.table("escritura_templates")
                .update(
                    {
                        "status": "published",
                        "published_at": datetime.now(timezone.utc).isoformat(),
                        "published_by": published_by,
                    }
                )
                .eq("id", template_id)
                .execute()
            )
        )
        if existing:
            # Un solo published por (org, name): retira la version anterior,
            # igual que el endpoint de publicacion (escritura_templates.py).
            await asyncio.to_thread(
                lambda: (
                    supabase.table("escritura_templates")
                    .update({"status": "retired"})
                    .eq("organization_id", organization_id)
                    .eq("name", name)
                    .eq("status", "published")
                    .neq("id", template_id)
                    .execute()
                )
            )

    return {
        "status": "seeded",
        "template_id": template_id,
        "version": next_version,
        "clause_count": len(clause_payloads),
        "published": publish,
        "retired_previous": bool(existing) and publish,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--organization-id", required=True)
    parser.add_argument("--published-by", default=None)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate the golden fixture without writing to the database.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Publish a new version even if one is already published (retires it).",
    )
    args = parser.parse_args()

    template_data = load_golden_template()
    errors = validate_golden_template(template_data)
    if errors:
        print("Golden template INVALID:")
        for error in errors:
            print(f"  - {error}")
        return 1
    if args.dry_run:
        print(
            f"Golden template OK: {template_data['name']} "
            f"({len(template_data['clauses'])} clausulas)."
        )
        return 0

    summary = asyncio.run(
        seed_template(
            organization_id=args.organization_id,
            published_by=args.published_by,
            force=args.force,
        )
    )
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
