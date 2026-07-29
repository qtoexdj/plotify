#!/usr/bin/env python3
"""Rollback-only SDD019 geometry load probe for the linked Supabase cloud project."""

from __future__ import annotations

import argparse
import hashlib
import ipaddress
import json
import os
import statistics
import time
import uuid
from pathlib import Path
from urllib.parse import urlparse

import psycopg
from dotenv import dotenv_values
from psycopg.types.json import Jsonb


def require_linked_cloud(workspace: Path) -> str:
    environment = dotenv_values(workspace / "apps" / "api" / ".env")
    database_url = os.environ.get("SUPABASE_DB_URL") or environment.get("SUPABASE_DB_URL")
    if not database_url:
        raise RuntimeError("SUPABASE_DB_URL is required for the linked cloud load probe")
    host = (urlparse(database_url).hostname or "").lower()
    try:
        private_host = ipaddress.ip_address(host).is_private or ipaddress.ip_address(host).is_loopback
    except ValueError:
        private_host = False
    if private_host or host in {"localhost", "host.docker.internal", "supabase-db", "supabase-pooler"}:
        raise RuntimeError("cloud-only load probe refuses local or Docker database targets")
    database_root = workspace / "packages" / "database" / "supabase" / ".temp"
    project_ref = (database_root / "project-ref").read_text().strip()
    linked_project = json.loads((database_root / "linked-project.json").read_text())
    if linked_project.get("ref") != project_ref or project_ref not in database_url:
        raise RuntimeError("SUPABASE_DB_URL does not match the linked Supabase cloud project")
    return database_url


def claim(cursor: psycopg.Cursor, organization_id: str, actor_id: str, kind: str, scope: str) -> str:
    key = str(uuid.uuid4())
    request_hash = hashlib.sha256(f"{kind}:{scope}:{key}".encode()).hexdigest()
    cursor.execute(
        """select id from public.claim_idempotency_operation(
        %s,'user',%s,%s,%s,%s,%s,'web',null)""",
        (organization_id, actor_id, kind, scope, key, request_hash),
    )
    return str(cursor.fetchone()[0])


def polygon_feature(index: int) -> dict[str, object]:
    x = -70.75 + index * 0.00001
    y = -33.75 + index * 0.00001
    return {
        "featureKey": f"lot-{index + 1}",
        "geometryType": "lot",
        "name": f"Lote {index + 1}",
        "properties": {"loadProbe": True},
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[x, y], [x + 0.000005, y], [x + 0.000005, y + 0.000005], [x, y],]],
        },
    }


def run_probe(database_url: str, minimum_iterations: int) -> dict[str, object]:
    samples: list[float] = []
    assignment_winners = 0
    assignment_conflicts = 0
    observations = 0
    with psycopg.connect(database_url, connect_timeout=15) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """select organization_id::text,user_id::text
                from public.organization_members where role='admin'
                order by created_at limit 1"""
            )
            authority = cursor.fetchone()
            if authority is None:
                raise RuntimeError("linked cloud project has no admin workspace for rollback-only probing")
            organization_id, actor_id = authority
            for lot_count in (50, 100):
                features = [polygon_feature(index) for index in range(lot_count)]
                for iteration in range(minimum_iterations):
                    project_operation = claim(cursor, organization_id, actor_id, "project.create", organization_id)
                    started = time.perf_counter()
                    cursor.execute(
                        """select public.create_project_with_lots(
                        %s,%s,%s,%s,'Región Metropolitana','Paine','rollback-only load probe',
                        %s,'Lote ',null,null)""",
                        (organization_id, actor_id, project_operation, f"SDD019 probe {lot_count}-{iteration}", lot_count),
                    )
                    project_result = cursor.fetchone()[0]
                    project_id = str(project_result["project"]["id"])
                    import_operation = claim(cursor, organization_id, actor_id, "geometry.import", project_id)
                    source_sha = hashlib.sha256(f"{project_id}:{lot_count}".encode()).hexdigest()
                    cursor.execute(
                        """insert into public.project_file_objects(
                        organization_id,project_id,category,bucket,object_path,source_sha256,size_bytes,
                        content_type,original_filename,visibility,status,retention_class,operation_id,created_by)
                        values(%s,%s,'geometry_source','project-files',%s,%s,1024,'application/vnd.google-earth.kml+xml',
                        'load-probe.kml','admin_only','ready','geometry_source',%s,%s) returning id::text""",
                        (organization_id, project_id, f"geometry-load/{project_id}.kml", source_sha, import_operation, actor_id),
                    )
                    source_file_id = cursor.fetchone()[0]
                    cursor.execute(
                        "select public.commit_geometry_import(%s,%s,%s,%s,'kml',%s,%s,%s)",
                        (organization_id, project_id, source_file_id, source_sha, Jsonb(features), import_operation, actor_id),
                    )
                    import_result = cursor.fetchone()[0]
                    samples.append((time.perf_counter() - started) * 1000)
                    observations += 1
                    if lot_count == 100 and iteration == 0:
                        lot_id = str(project_result["lots"][0]["id"])
                        geometry_ids = [str(item["geometryId"]) for item in import_result["features"][:20]]
                        for contender, geometry_id in enumerate(geometry_ids):
                            try:
                                with connection.transaction():
                                    operation_id = claim(cursor, organization_id, actor_id, "geometry.assign", lot_id)
                                    cursor.execute(
                                        "select public.assign_project_geometry(%s,%s,%s,%s,null,%s,%s)",
                                        (organization_id, project_id, lot_id, geometry_id, operation_id, actor_id),
                                    )
                                    cursor.fetchone()
                                assignment_winners += 1
                            except psycopg.errors.SerializationFailure:
                                assignment_conflicts += 1
                            if contender == 0 and assignment_winners != 1:
                                raise RuntimeError("first assignment contender did not commit")
            cursor.execute("select count(*) from public.projects where name like 'SDD019 probe %'")
            rows_inside_transaction = cursor.fetchone()[0]
            connection.rollback()
            cursor.execute("select count(*) from public.projects where name like 'SDD019 probe %'")
            rows_after_rollback = cursor.fetchone()[0]
    sorted_samples = sorted(samples)
    p95_index = max(0, int(len(sorted_samples) * 0.95) - 1)
    return {
        "target": "linked-supabase-cloud-rollback-transaction",
        "workloads": [50, 100],
        "iterationsPerWorkload": minimum_iterations,
        "observations": observations,
        "p50Ms": statistics.median(samples),
        "p95Ms": sorted_samples[p95_index],
        "maximumMs": max(samples),
        "featuresMaximum": 100,
        "coordinatePositionsMaximum": 400,
        "assignmentRaceContenders": 20,
        "activeAssignments": assignment_winners,
        "assignmentConflicts": assignment_conflicts,
        "rowsInsideTransaction": rows_inside_transaction,
        "rowsAfterRollback": rows_after_rollback,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--minimum-iterations", type=int, required=True)
    arguments = parser.parse_args()
    workspace = Path(__file__).resolve().parents[4]
    details = run_probe(require_linked_cloud(workspace), arguments.minimum_iterations)
    if details["activeAssignments"] != 1 or details["assignmentConflicts"] != 19:
        raise RuntimeError("20-contender assignment invariant failed")
    if details["rowsAfterRollback"] != 0:
        raise RuntimeError("rollback-only load probe persisted rows")
    print(json.dumps(details, separators=(",", ":")))


if __name__ == "__main__":
    main()
