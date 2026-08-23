#!/usr/bin/env python3
"""Read-only linked production-data inventory for the SDD019 release gate."""

from __future__ import annotations

import argparse
import hashlib
import ipaddress
import json
import os
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import psycopg
from dotenv import dotenv_values
from psycopg import sql
from psycopg.rows import dict_row


def _database_url() -> tuple[str, str]:
    database_url = os.environ.get("SUPABASE_DB_URL")
    if not database_url:
        try:
            for parent_dir in Path(__file__).resolve().parents:
                env_api = parent_dir / "apps" / "api" / ".env"
                if env_api.is_file():
                    database_url = dotenv_values(env_api).get("SUPABASE_DB_URL")
                    break
        except Exception:
            database_url = None
    if not database_url:
        raise RuntimeError("SUPABASE_DB_URL is required")
    project_ref_path = (
        WORKSPACE / "packages" / "database" / "supabase" / ".temp" / "project-ref"
    )
    linked_path = (
        WORKSPACE
        / "packages"
        / "database"
        / "supabase"
        / ".temp"
        / "linked-project.json"
    )
    if not project_ref_path.exists() or not linked_path.exists():
        raise RuntimeError("linked project markers are required")
    project_ref = project_ref_path.read_text().strip()
    linked = json.loads(linked_path.read_text())
    host = (urlparse(database_url).hostname or "").lower()
    try:
        local_ip = ipaddress.ip_address(host).is_private or ipaddress.ip_address(
            host
        ).is_loopback
    except ValueError:
        local_ip = False
    if (
        linked.get("ref") != project_ref
        or project_ref not in database_url
        or local_ip
        or host in {"localhost", "supabase-db", "supabase-pooler"}
    ):
        raise RuntimeError("SUPABASE_DB_URL does not match a confirmed linked cloud project")
    return str(database_url), project_ref


def _columns(cursor: Any) -> dict[str, set[str]]:
    cursor.execute(
        """
        select table_name, column_name
        from information_schema.columns
        where table_schema = 'public'
        """
    )
    result: dict[str, set[str]] = {}
    for row in cursor.fetchall():
        result.setdefault(str(row["table_name"]), set()).add(str(row["column_name"]))
    return result


def _count(cursor: Any, query: sql.Composed) -> int:
    cursor.execute(query)
    row = cursor.fetchone()
    return int(row["count"]) if row else 0


def _duplicate_count(cursor: Any, table: str, keys: list[str]) -> int:
    identifiers = sql.SQL(", ").join(sql.Identifier(key) for key in keys)
    query = sql.SQL(
        "select count(*) from (select {keys} from {table} "
        "group by {keys} having count(*) > 1) duplicates"
    ).format(keys=identifiers, table=sql.Identifier("public", table))
    return _count(cursor, query)


def _finding(code: str, count: int, *, constraint_blocker: bool = True) -> dict[str, Any]:
    return {
        "code": code,
        "count": count,
        "blocking": count > 0,
        "constraintBlocker": constraint_blocker,
        "fingerprint": _digest(f"{code}:{count}"),
    }


def inspect_linked() -> dict[str, Any]:
    database_url, project_ref = _database_url()
    findings: list[dict[str, Any]] = []
    with psycopg.connect(
        database_url, row_factory=dict_row, connect_timeout=10, autocommit=True
    ) as connection:
        with connection.cursor() as cursor:
            cursor.execute("begin read only")
            columns = _columns(cursor)
            if {"geometries", "geometry_imports"} <= columns.keys() and {
                "project_id",
                "canonical_state",
            } <= columns["geometries"]:
                findings.append(
                    _finding(
                        "DUPLICATE_GEOMETRY",
                        _duplicate_count(
                            cursor,
                            "geometries",
                            ["project_id", "source_feature_hash"],
                        ),
                    )
                )
            else:
                findings.append(_finding("GEOMETRY_CUTOVER_STATE_MISSING", 1))
            if "escritura_minuta_generations" in columns and {
                "escritura_case_id",
                "artifact_fingerprint",
            } <= columns["escritura_minuta_generations"]:
                findings.append(
                    _finding(
                        "DUPLICATE_GENERATION",
                        _duplicate_count(
                            cursor,
                            "escritura_minuta_generations",
                            ["escritura_case_id", "artifact_fingerprint"],
                        ),
                    )
                )
            else:
                findings.append(_finding("GENERATION_IDENTITY_MISSING", 1))
            if "escritura_deliveries" in columns:
                delivery_columns = columns["escritura_deliveries"]
                if {"generation_id", "recipient_user_id", "channel"} <= delivery_columns:
                    findings.append(
                        _finding(
                            "DUPLICATE_DELIVERY",
                            _duplicate_count(
                                cursor,
                                "escritura_deliveries",
                                ["generation_id", "recipient_user_id", "channel"],
                            ),
                        )
                    )
                if "link_token" in delivery_columns:
                    findings.append(
                        _finding(
                            "PLAINTEXT_CAPABILITY",
                            _count(
                                cursor,
                                sql.SQL(
                                    "select count(*) from public.escritura_deliveries "
                                    "where link_token is not null and btrim(link_token) <> ''"
                                ),
                            ),
                        )
                    )
            else:
                findings.append(_finding("DELIVERY_CUTOVER_STATE_MISSING", 1))
            if "lot_records" in columns and "escritura_signature_events" in columns:
                findings.append(
                    _finding(
                        "FALSE_SIGNED_STAGE",
                        _count(
                            cursor,
                            sql.SQL(
                                """
                                select count(*)
                                from public.lot_records l
                                where l.etapa_proceso = 'escritura_firmada'
                                  and not exists (
                                    select 1 from public.escritura_signature_events e
                                    where e.lot_id = l.lot_id
                                  )
                                """
                            ),
                        ),
                    )
                )
            else:
                findings.append(_finding("SIGNATURE_EVIDENCE_STATE_MISSING", 1))
            if "runtime_release_attestations" not in columns:
                findings.append(
                    _finding(
                        "RUNTIME_ATTESTATION_STATE_MISSING",
                        1,
                        constraint_blocker=False,
                    )
                )
            else:
                findings.append(
                    _finding(
                        "RUNTIME_ATTESTATION_INCONSISTENT",
                        _count(
                            cursor,
                            sql.SQL(
                                """
                                select count(*)
                                from (
                                  select environment_fingerprint
                                  from public.runtime_release_attestations
                                  where lifecycle = 'active'
                                    and heartbeat_at > now() - interval '120 seconds'
                                  group by environment_fingerprint
                                  having count(distinct release_sha) <> 1
                                     or count(distinct config_version) <> 1
                                ) inconsistent
                                """
                            ),
                        ),
                        constraint_blocker=False,
                    )
                )
            if "idempotency_operations" in columns:
                findings.append(
                    _finding(
                        "NULL_OR_BLANK_IDEMPOTENCY_KEY",
                        _count(
                            cursor,
                            sql.SQL(
                                """
                                select count(*) from public.idempotency_operations
                                where idempotency_key is null or btrim(idempotency_key) = ''
                                """
                            ),
                        ),
                    )
                )
                findings.append(
                    _finding(
                        "STALE_IDEMPOTENCY_OPERATION",
                        _count(
                            cursor,
                            sql.SQL(
                                """
                                select count(*) from public.idempotency_operations
                                where status = 'processing'
                                  and updated_at < now() - interval '15 minutes'
                                """
                            ),
                        ),
                        constraint_blocker=False,
                    )
                )
            else:
                findings.append(_finding("IDEMPOTENCY_STATE_MISSING", 1))
            if (
                "escritura_signature_events" in columns
                and "project_file_objects" in columns
            ):
                findings.append(
                    _finding(
                        "INVALID_SIGNATURE_EVIDENCE_SCOPE",
                        _count(
                            cursor,
                            sql.SQL(
                                """
                                select count(*)
                                from public.escritura_signature_events e
                                join public.project_file_objects f on f.id = e.evidence_file_id
                                where f.category <> 'escritura_signature_evidence'
                                   or f.status <> 'ready'
                                   or f.organization_id <> e.organization_id
                                   or f.project_id <> e.project_id
                                   or f.bound_escritura_case_id <> e.escritura_case_id
                                   or f.bound_generation_id <> e.generation_id
                                   or f.source_sha256 <> e.evidence_sha256
                                """
                            ),
                        ),
                    )
                )
                findings.append(
                    _finding(
                        "REUSED_SIGNATURE_EVIDENCE",
                        _duplicate_count(
                            cursor, "escritura_signature_events", ["evidence_file_id"]
                        ),
                    )
                )
                findings.append(
                    _finding(
                        "STORAGE_METADATA_OBJECT_MISMATCH",
                        _count(
                            cursor,
                            sql.SQL(
                                """
                                select count(*)
                                from public.project_file_objects f
                                left join storage.objects o
                                  on o.bucket_id = f.bucket and o.name = f.object_path
                                where f.status = 'ready' and o.id is null
                                """
                            ),
                        ),
                    )
                )
            if "escritura_deliveries" in columns and {
                "created_at",
                "updated_at",
                "sent_at",
            } <= columns["escritura_deliveries"]:
                findings.append(
                    _finding(
                        "STALE_DELIVERY_TIMESTAMP",
                        _count(
                            cursor,
                            sql.SQL(
                                """
                                select count(*) from public.escritura_deliveries
                                where updated_at < created_at
                                   or (sent_at is not null and sent_at < created_at)
                                """
                            ),
                        ),
                    )
                )
            cursor.execute("rollback")
    return {
        "targetFingerprint": _digest(project_ref),
        "findings": findings,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", choices=("linked",), required=True)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    del args
    try:
        result = inspect_linked()
    except Exception as error:  # noqa: BLE001 - concise CLI failure
        print(json.dumps({"status": "error", "code": "READ_ONLY_PREFLIGHT_FAILED", "error": str(error)}))
        return 1
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
