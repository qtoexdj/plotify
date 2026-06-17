"""SDD 008 escritura template library endpoints (T017).

Versioned clause library per organization: list/create/clone, draft clause
upsert with catalog validation (FR-015/FR-022) and publish with
immutability (published templates are frozen; editing means cloning to a
new draft version). Internal-secret + tenant pattern from SDD 007/009.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from api.deps import verify_internal_secret
from core.database import get_supabase_client
from core.logger import get_logger
from schemas.escritura_matrices import (
    ClauseUpsertRequest,
    EscrituraTemplateDetail,
    TemplateCreateRequest,
    TemplateListResponse,
    TemplatePublishRequest,
)
from schemas.legal_titles import TITLE_ALERT_TIPOS
from services.matriz_template_validation import (
    validate_clause_condition,
    validate_clause_content,
)

logger = get_logger(__name__)

router = APIRouter(
    tags=["escritura-templates"],
    dependencies=[Depends(verify_internal_secret)],
)

TEMPLATE_COLUMNS = (
    "id, organization_id, name, document_type, version, status, "
    "published_at, published_by, created_at, updated_at"
)
CLAUSE_COLUMNS = (
    "id, organization_id, template_id, clause_key, title, position, "
    "fixed_position, content_json, condition_key, condition_mode, alert_tipo"
)


def _first_row(data: Any) -> dict[str, Any] | None:
    if isinstance(data, list):
        return data[0] if data else None
    return data if isinstance(data, dict) else None


def _rows(data: Any) -> list[dict[str, Any]]:
    return data if isinstance(data, list) else []


async def _fetch_template(
    client: Any, template_id: str, organization_id: str
) -> dict[str, Any]:
    result = await asyncio.to_thread(
        lambda: (
            client.table("escritura_templates")
            .select(TEMPLATE_COLUMNS)
            .eq("id", template_id)
            .eq("organization_id", organization_id)
            .maybe_single()
            .execute()
        )
    )
    row = _first_row(result.data)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found for this organization.",
        )
    return row


async def _fetch_clauses(client: Any, template_id: str) -> list[dict[str, Any]]:
    result = await asyncio.to_thread(
        lambda: (
            client.table("escritura_template_clauses")
            .select(CLAUSE_COLUMNS)
            .eq("template_id", template_id)
            .order("position")
            .execute()
        )
    )
    return _rows(result.data)


def _detail(template: dict[str, Any], clauses: list[dict[str, Any]]) -> EscrituraTemplateDetail:
    return EscrituraTemplateDetail.model_validate(
        {**template, "clause_count": len(clauses), "clauses": clauses}
    )


@router.get("/escritura-templates", response_model=TemplateListResponse)
async def list_escritura_templates(
    organization_id: UUID = Query(...),
    document_type: str = Query(default="compraventa"),
) -> TemplateListResponse:
    client = get_supabase_client()
    templates_result = await asyncio.to_thread(
        lambda: (
            client.table("escritura_templates")
            .select(TEMPLATE_COLUMNS)
            .eq("organization_id", str(organization_id))
            .eq("document_type", document_type)
            .order("name")
            .order("version", desc=True)
            .execute()
        )
    )
    templates = _rows(templates_result.data)
    clause_counts: dict[str, int] = {}
    if templates:
        clauses_result = await asyncio.to_thread(
            lambda: (
                client.table("escritura_template_clauses")
                .select("template_id")
                .in_("template_id", [str(row["id"]) for row in templates])
                .execute()
            )
        )
        for clause in _rows(clauses_result.data):
            template_id = str(clause.get("template_id"))
            clause_counts[template_id] = clause_counts.get(template_id, 0) + 1
    return TemplateListResponse(
        templates=[
            {**template, "clause_count": clause_counts.get(str(template["id"]), 0)}
            for template in templates
        ]
    )


@router.post(
    "/escritura-templates",
    response_model=EscrituraTemplateDetail,
    status_code=status.HTTP_201_CREATED,
)
async def create_escritura_template(
    request: TemplateCreateRequest,
    organization_id: UUID = Query(...),
) -> EscrituraTemplateDetail:
    client = get_supabase_client()
    org_id = str(organization_id)

    source_clauses: list[dict[str, Any]] = []
    if request.clone_from_template_id:
        source = await _fetch_template(
            client, str(request.clone_from_template_id), org_id
        )
        source_clauses = await _fetch_clauses(client, str(source["id"]))

    versions_result = await asyncio.to_thread(
        lambda: (
            client.table("escritura_templates")
            .select("version")
            .eq("organization_id", org_id)
            .eq("name", request.name)
            .order("version", desc=True)
            .limit(1)
            .execute()
        )
    )
    latest = _first_row(versions_result.data)
    next_version = int(latest["version"]) + 1 if latest else 1

    insert_result = await asyncio.to_thread(
        lambda: (
            client.table("escritura_templates")
            .insert(
                {
                    "organization_id": org_id,
                    "name": request.name,
                    "document_type": request.document_type,
                    "version": next_version,
                    "status": "draft",
                }
            )
            .execute()
        )
    )
    template = _first_row(insert_result.data)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Template creation returned no row.",
        )

    clauses: list[dict[str, Any]] = []
    if source_clauses:
        payloads = [
            {
                "organization_id": org_id,
                "template_id": template["id"],
                "clause_key": clause["clause_key"],
                "title": clause["title"],
                "position": clause["position"],
                "fixed_position": clause["fixed_position"],
                "content_json": clause["content_json"],
                "condition_key": clause["condition_key"],
                "condition_mode": clause["condition_mode"],
                "alert_tipo": clause["alert_tipo"],
            }
            for clause in source_clauses
        ]
        clone_result = await asyncio.to_thread(
            lambda: (
                client.table("escritura_template_clauses").insert(payloads).execute()
            )
        )
        clauses = _rows(clone_result.data)

    logger.info(
        "escritura_template_created",
        organization_id=org_id,
        template_id=template["id"],
        version=next_version,
        cloned_from=str(request.clone_from_template_id or ""),
        clause_count=len(clauses),
    )
    return _detail(template, clauses)


@router.get(
    "/escritura-templates/{template_id}",
    response_model=EscrituraTemplateDetail,
)
async def get_escritura_template(
    template_id: UUID,
    organization_id: UUID = Query(...),
) -> EscrituraTemplateDetail:
    client = get_supabase_client()
    template = await _fetch_template(client, str(template_id), str(organization_id))
    clauses = await _fetch_clauses(client, str(template_id))
    return _detail(template, clauses)


def _clause_validation_issues(
    clause_key: str, request: ClauseUpsertRequest
) -> list[dict[str, Any]]:
    issues = validate_clause_content(request.content_json)
    issues += validate_clause_condition(request.condition_key, request.condition_mode)
    payload = [issue.to_dict() for issue in issues]
    if request.alert_tipo and request.alert_tipo not in TITLE_ALERT_TIPOS:
        payload.append(
            {
                "key": request.alert_tipo,
                "reason": "unknown_key",
                "suggested_migration": (
                    "alert_tipo must be one of the SDD 009 alert taxonomy values"
                ),
            }
        )
    return payload


@router.put(
    "/escritura-templates/{template_id}/clauses/{clause_key}",
    response_model=EscrituraTemplateDetail,
)
async def upsert_escritura_template_clause(
    template_id: UUID,
    clause_key: str,
    request: ClauseUpsertRequest,
    organization_id: UUID = Query(...),
) -> EscrituraTemplateDetail:
    client = get_supabase_client()
    org_id = str(organization_id)
    template = await _fetch_template(client, str(template_id), org_id)
    if template["status"] != "draft":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Published templates are immutable; clone to a new draft version.",
        )

    invalid_keys = _clause_validation_issues(clause_key, request)
    if invalid_keys:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "invalid_keys",
                "message": "Clause references keys outside the canonical catalog.",
                "invalid_keys": invalid_keys,
            },
        )

    payload = {
        "organization_id": org_id,
        "template_id": str(template_id),
        "clause_key": clause_key,
        "title": request.title,
        "position": request.position,
        "fixed_position": request.fixed_position,
        "content_json": request.content_json,
        "condition_key": request.condition_key,
        "condition_mode": request.condition_mode,
        "alert_tipo": request.alert_tipo,
    }
    existing_result = await asyncio.to_thread(
        lambda: (
            client.table("escritura_template_clauses")
            .select("id")
            .eq("template_id", str(template_id))
            .eq("clause_key", clause_key)
            .maybe_single()
            .execute()
        )
    )
    existing = _first_row(existing_result.data)
    if existing:
        await asyncio.to_thread(
            lambda: (
                client.table("escritura_template_clauses")
                .update(payload)
                .eq("id", existing["id"])
                .execute()
            )
        )
    else:
        await asyncio.to_thread(
            lambda: (
                client.table("escritura_template_clauses").insert(payload).execute()
            )
        )

    clauses = await _fetch_clauses(client, str(template_id))
    return _detail(template, clauses)


@router.post(
    "/escritura-templates/{template_id}/publish",
    response_model=EscrituraTemplateDetail,
)
async def publish_escritura_template(
    template_id: UUID,
    request: TemplatePublishRequest,
    organization_id: UUID = Query(...),
) -> EscrituraTemplateDetail:
    client = get_supabase_client()
    org_id = str(organization_id)
    template = await _fetch_template(client, str(template_id), org_id)
    if template["status"] != "draft":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Only draft templates can be published (status: {template['status']}).",
        )

    clauses = await _fetch_clauses(client, str(template_id))
    if not clauses:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot publish a template without clauses.",
        )
    publish_blockers: list[dict[str, Any]] = []
    for clause in clauses:
        content = clause.get("content_json") or {}
        if not content.get("content"):
            publish_blockers.append(
                {"key": clause["clause_key"], "reason": "empty_clause"}
            )
            continue
        for issue in validate_clause_content(content):
            publish_blockers.append(
                {"key": clause["clause_key"], **issue.to_dict()}
            )
    if publish_blockers:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "publish_blocked",
                "message": "Template has invalid or empty clauses.",
                "blockers": publish_blockers,
            },
        )

    # Un solo published por (org, name): retira la version publicada anterior.
    await asyncio.to_thread(
        lambda: (
            client.table("escritura_templates")
            .update({"status": "retired"})
            .eq("organization_id", org_id)
            .eq("name", template["name"])
            .eq("status", "published")
            .execute()
        )
    )
    update_result = await asyncio.to_thread(
        lambda: (
            client.table("escritura_templates")
            .update(
                {
                    "status": "published",
                    "published_at": datetime.now(timezone.utc).isoformat(),
                    "published_by": str(request.published_by),
                }
            )
            .eq("id", str(template_id))
            .execute()
        )
    )
    published = _first_row(update_result.data) or {
        **template,
        "status": "published",
        "published_by": str(request.published_by),
    }
    logger.info(
        "escritura_template_published",
        organization_id=org_id,
        template_id=str(template_id),
        name=template["name"],
        version=template["version"],
        published_by=str(request.published_by),
    )
    return _detail(published, clauses)
