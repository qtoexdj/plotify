from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from datetime import UTC, datetime
from typing import Any

from schemas.agent_skills import (
    CustomSkillPublishRequest,
    CustomSkillResponse,
    CustomSkillSaveRequest,
    SkillValidationError,
    SkillValidationRequest,
    SkillValidationResponse,
)


ALLOWED_ROLES = {"admin", "user", "lead", "vendor", "super_admin"}
SLUG_PATTERN = re.compile(r"[^a-z0-9_]+")

BLOCKED_INSTRUCTION_PATTERNS: tuple[tuple[str, str], ...] = (
    ("permission_bypass", r"\b(ignore|bypass|skip|evade)\b.{0,80}\b(permission|policy|rule|tenant)\b"),
    ("permission_bypass", r"\b(ignora|omite|salta|evade)\b.{0,80}\b(permisos?|reglas?|tenant|organizaciones?|organización)\b"),
    ("cross_tenant_access", r"\b(other|another|foreign)\b.{0,80}\b(tenant|organization|org)\b"),
    ("cross_tenant_access", r"\b(otra|otro|ajena|ajeno)\b.{0,80}\b(organizacion|organización|empresa|tenant)\b"),
    ("secret_exposure", r"\b(secret|api[_ -]?key|token|password|credential)\b"),
    ("secret_exposure", r"\b(secreto|contraseña|credencial|token)\b"),
    ("unapproved_action", r"\b(auto[- ]?approve|approve automatically|autoaprobar|aprobar automaticamente|aprobar automáticamente)\b"),
)

BLOCKED_MESSAGES = {
    "permission_bypass": "La skill intenta saltarse permisos o reglas de seguridad.",
    "cross_tenant_access": "La skill intenta acceder a datos de otra organizacion.",
    "secret_exposure": "La skill intenta exponer secretos, tokens o credenciales.",
    "unapproved_action": "La skill intenta ejecutar una accion sensible sin aprobacion.",
}


class CustomSkillNotFoundError(ValueError):
    pass


class CustomSkillValidationBlockedError(ValueError):
    def __init__(self, validation: SkillValidationResponse) -> None:
        super().__init__("Custom skill validation blocked publication")
        self.validation = validation


def normalize_skill_slug(value: str) -> str:
    normalized = SLUG_PATTERN.sub("_", value.strip().lower())
    normalized = re.sub(r"_+", "_", normalized).strip("_")
    return normalized


def role_is_compatible(tool_roles: Sequence[str] | None, required_roles: Sequence[str]) -> bool:
    if not tool_roles:
        return True
    if not required_roles:
        return True
    return bool(set(tool_roles).intersection(required_roles))


def _catalog_roles(
    approved_tool_catalog: Mapping[str, Sequence[str] | None],
    tool_slug: str,
) -> Sequence[str] | None:
    return approved_tool_catalog.get(tool_slug)


def _blocked_instruction_errors(markdown: str) -> list[SkillValidationError]:
    errors: list[SkillValidationError] = []
    lower_markdown = markdown.lower()
    seen_codes: set[str] = set()

    for code, pattern in BLOCKED_INSTRUCTION_PATTERNS:
        if code in seen_codes:
            continue
        if re.search(pattern, lower_markdown, flags=re.IGNORECASE | re.DOTALL):
            errors.append(
                SkillValidationError(
                    code=code,
                    field="definition_markdown",
                    message=BLOCKED_MESSAGES[code],
                )
            )
            seen_codes.add(code)

    return errors


def validate_skill_definition(
    request: SkillValidationRequest,
    *,
    approved_tool_catalog: Mapping[str, Sequence[str] | None] | None = None,
    has_active_mcp_connection: bool = False,
) -> SkillValidationResponse:
    catalog = approved_tool_catalog or {}
    normalized_slug = normalize_skill_slug(request.slug)
    errors: list[SkillValidationError] = []
    warnings: list[str] = []

    if not normalized_slug:
        errors.append(
            SkillValidationError(
                code="invalid_slug",
                field="slug",
                message="La skill necesita un slug valido.",
            )
        )

    markdown = request.definition_markdown.strip()
    if not markdown:
        errors.append(
            SkillValidationError(
                code="empty_markdown",
                field="definition_markdown",
                message="La definicion markdown no puede estar vacia.",
            )
        )

    invalid_roles = sorted(set(request.requires_role) - ALLOWED_ROLES)
    if invalid_roles:
        errors.append(
            SkillValidationError(
                code="invalid_role",
                field="requires_role",
                message=f"Roles no soportados: {', '.join(invalid_roles)}.",
            )
        )

    approved_slugs: list[str] = []
    for raw_slug in request.approved_tool_slugs:
        tool_slug = normalize_skill_slug(raw_slug)
        if not tool_slug:
            continue
        if tool_slug not in catalog:
            errors.append(
                SkillValidationError(
                    code="unapproved_tool",
                    field="approved_tool_slugs",
                    message=f"La herramienta '{raw_slug}' no esta aprobada.",
                )
            )
            continue

        tool_roles = _catalog_roles(catalog, tool_slug)
        if not role_is_compatible(tool_roles, request.requires_role):
            errors.append(
                SkillValidationError(
                    code="incompatible_role",
                    field="approved_tool_slugs",
                    message=f"La herramienta '{tool_slug}' no es compatible con los roles declarados.",
                )
            )
            continue
        if tool_slug not in approved_slugs:
            approved_slugs.append(tool_slug)

    errors.extend(_blocked_instruction_errors(markdown))

    if request.requires_mcp and not request.mcp_provider:
        errors.append(
            SkillValidationError(
                code="missing_mcp_provider",
                field="mcp_provider",
                message="La skill requiere MCP pero no declara proveedor.",
            )
        )

    if request.requires_mcp and request.mcp_provider and not has_active_mcp_connection:
        errors.append(
            SkillValidationError(
                code="mcp_connection_required",
                field="mcp_provider",
                message="La organizacion no tiene una conexion activa para este proveedor.",
            )
        )

    if markdown and not approved_slugs and not request.requires_mcp:
        warnings.append("La skill no declara herramientas aprobadas; solo agregara instrucciones.")

    status = "blocked" if errors else "valid"
    return SkillValidationResponse(
        status=status,
        normalized_slug=normalized_slug,
        approved_tool_slugs=approved_slugs,
        errors=errors,
        warnings=warnings,
    )


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _first_row(data: Any) -> dict[str, Any] | None:
    if isinstance(data, list):
        first = data[0] if data else None
        return first if isinstance(first, dict) else None
    return data if isinstance(data, dict) else None


def _error_payload(errors: Sequence[SkillValidationError]) -> list[dict[str, Any]]:
    return [error.model_dump() for error in errors]


def _response_from_row(row: dict[str, Any]) -> CustomSkillResponse:
    return CustomSkillResponse(
        id=str(row["id"]),
        organization_id=str(row["organization_id"]),
        slug=str(row["slug"]),
        name=str(row["name"]),
        description=str(row.get("description") or ""),
        definition_markdown=str(row.get("definition_markdown") or ""),
        approved_tool_slugs=list(row.get("approved_tool_slugs") or []),
        requires_role=list(row.get("requires_role") or []),
        current_version=int(row.get("current_version") or 1),
        validation_status=row.get("validation_status") or "draft",
        validation_errors=row.get("validation_errors") or [],
        requires_mcp=bool(row.get("requires_mcp")),
        mcp_provider=row.get("mcp_provider"),
        updated_at=row.get("updated_at"),
    )


def build_custom_skill_tool_definition(request: CustomSkillSaveRequest) -> dict[str, Any]:
    return {
        "name": normalize_skill_slug(request.slug),
        "description": request.description,
        "parameters": {
            "type": "object",
            "properties": {},
        },
    }


def build_approved_tool_catalog(
    supabase: Any,
    organization_id: str,
) -> dict[str, Sequence[str] | None]:
    result = (
        supabase.table("agent_skills")
        .select("slug, requires_role, category, organization_id, validation_status")
        .is_("organization_id", "null")
        .execute()
    )
    catalog: dict[str, Sequence[str] | None] = {}
    for row in result.data or []:
        if row.get("category") not in {"builtin", "mcp"}:
            continue
        if row.get("validation_status") == "blocked":
            continue
        slug = normalize_skill_slug(str(row.get("slug") or ""))
        if slug:
            catalog[slug] = row.get("requires_role")
    return catalog


def has_active_mcp_connection(
    supabase: Any,
    organization_id: str,
    provider: str | None,
) -> bool:
    if not provider:
        return False
    result = (
        supabase.table("mcp_connections")
        .select("id")
        .eq("organization_id", organization_id)
        .eq("provider", provider)
        .eq("status", "active")
        .limit(1)
        .execute()
    )
    return bool(result.data)


def _find_custom_skill_row(
    supabase: Any,
    *,
    organization_id: str,
    slug: str | None = None,
    skill_id: str | None = None,
) -> dict[str, Any] | None:
    query = (
        supabase.table("agent_skills")
        .select("*")
        .eq("organization_id", organization_id)
    )
    if skill_id:
        query = query.eq("id", skill_id)
    elif slug:
        query = query.eq("slug", slug)
    else:
        return None
    result = query.limit(1).execute()
    return _first_row(result.data)


def _insert_skill_version(
    supabase: Any,
    *,
    row: dict[str, Any],
    version: int,
    validation_status: str,
    validation_errors: list[dict[str, Any]],
    actor_id: str | None,
    change_summary: str | None,
) -> None:
    supabase.table("agent_skill_versions").insert(
        {
            "skill_id": row["id"],
            "organization_id": row["organization_id"],
            "version": version,
            "definition_markdown": row.get("definition_markdown") or "",
            "tool_definition": row.get("tool_definition") or {},
            "approved_tool_slugs": row.get("approved_tool_slugs") or [],
            "requires_role": row.get("requires_role") or [],
            "validation_status": validation_status,
            "validation_errors": validation_errors,
            "created_by": actor_id,
            "change_summary": change_summary,
        }
    ).execute()


def _record_skill_audit(
    supabase: Any,
    *,
    organization_id: str,
    actor_id: str | None,
    action: str,
    skill_id: str,
    payload: dict[str, Any] | None = None,
) -> None:
    try:
        supabase.table("audit_logs").insert(
            {
                "actor": actor_id or "system",
                "action": action,
                "entity": "agent_skills",
                "entity_id": skill_id,
                "organization_id": organization_id,
                "payload": payload or {},
            }
        ).execute()
    except Exception:
        return None


def _validation_request_from_save(request: CustomSkillSaveRequest) -> SkillValidationRequest:
    return SkillValidationRequest(
        organization_id=request.organization_id,
        skill_id=request.skill_id,
        slug=request.slug,
        definition_markdown=request.definition_markdown,
        requires_role=request.requires_role,
        approved_tool_slugs=request.approved_tool_slugs,
        requires_mcp=request.requires_mcp,
        mcp_provider=request.mcp_provider,
    )


def save_custom_skill_definition(
    supabase: Any,
    request: CustomSkillSaveRequest,
    *,
    actor_id: str | None,
    approved_tool_catalog: Mapping[str, Sequence[str] | None] | None = None,
    has_active_mcp_connection: bool = False,
) -> CustomSkillResponse:
    validation = validate_skill_definition(
        _validation_request_from_save(request),
        approved_tool_catalog=approved_tool_catalog,
        has_active_mcp_connection=has_active_mcp_connection,
    )
    normalized_slug = validation.normalized_slug
    existing = _find_custom_skill_row(
        supabase,
        organization_id=request.organization_id,
        slug=normalized_slug,
        skill_id=request.skill_id,
    )
    next_version = int((existing or {}).get("current_version") or 0) + 1
    row_status = "draft" if validation.status == "valid" else "blocked"
    validation_errors = _error_payload(validation.errors)
    payload = {
        "organization_id": request.organization_id,
        "slug": normalized_slug,
        "name": request.name,
        "description": request.description,
        "category": "custom",
        "tool_definition": build_custom_skill_tool_definition(request),
        "definition_markdown": request.definition_markdown,
        "approved_tool_slugs": validation.approved_tool_slugs,
        "requires_role": request.requires_role,
        "requires_mcp": request.requires_mcp,
        "mcp_provider": request.mcp_provider,
        "is_system": False,
        "enabled_by_default": False,
        "current_version": next_version,
        "validation_status": row_status,
        "validation_errors": validation_errors,
        "created_by": actor_id if not existing else existing.get("created_by"),
        "updated_by": actor_id,
        "updated_at": _now_iso(),
    }

    if existing:
        result = (
            supabase.table("agent_skills")
            .update(payload)
            .eq("id", existing["id"])
            .eq("organization_id", request.organization_id)
            .execute()
        )
        row = _first_row(result.data) or {**existing, **payload}
        action = "agent.skill.updated"
    else:
        result = supabase.table("agent_skills").insert(payload).execute()
        row = _first_row(result.data) or payload
        action = "agent.skill.created"

    _insert_skill_version(
        supabase,
        row=row,
        version=next_version,
        validation_status=row_status,
        validation_errors=validation_errors,
        actor_id=actor_id,
        change_summary=request.change_summary,
    )
    _record_skill_audit(
        supabase,
        organization_id=request.organization_id,
        actor_id=actor_id,
        action=action if row_status != "blocked" else "agent.skill.validation_blocked",
        skill_id=str(row["id"]),
        payload={
            "slug": normalized_slug,
            "version": next_version,
            "validation_status": row_status,
        },
    )
    return _response_from_row(row)


def publish_custom_skill_definition(
    supabase: Any,
    request: CustomSkillPublishRequest,
    *,
    actor_id: str | None,
    approved_tool_catalog: Mapping[str, Sequence[str] | None] | None = None,
    has_active_mcp_connection: bool = False,
) -> CustomSkillResponse:
    existing = _find_custom_skill_row(
        supabase,
        organization_id=request.organization_id,
        skill_id=request.skill_id,
    )
    if not existing:
        raise CustomSkillNotFoundError("Skill personalizada no encontrada")

    validation_request = SkillValidationRequest(
        organization_id=request.organization_id,
        skill_id=request.skill_id,
        slug=str(existing.get("slug") or ""),
        definition_markdown=str(existing.get("definition_markdown") or ""),
        requires_role=list(existing.get("requires_role") or []),
        approved_tool_slugs=list(existing.get("approved_tool_slugs") or []),
        requires_mcp=bool(existing.get("requires_mcp")),
        mcp_provider=existing.get("mcp_provider"),
    )
    validation = validate_skill_definition(
        validation_request,
        approved_tool_catalog=approved_tool_catalog,
        has_active_mcp_connection=has_active_mcp_connection,
    )
    if validation.status == "blocked":
        validation_errors = _error_payload(validation.errors)
        (
            supabase.table("agent_skills")
            .update(
                {
                    "validation_status": "blocked",
                    "validation_errors": validation_errors,
                    "updated_by": actor_id,
                    "updated_at": _now_iso(),
                }
            )
            .eq("id", request.skill_id)
            .eq("organization_id", request.organization_id)
            .execute()
        )
        _record_skill_audit(
            supabase,
            organization_id=request.organization_id,
            actor_id=actor_id,
            action="agent.skill.validation_blocked",
            skill_id=request.skill_id,
            payload={"errors": validation_errors},
        )
        raise CustomSkillValidationBlockedError(validation)

    next_version = int(existing.get("current_version") or 0) + 1
    update_payload = {
        "approved_tool_slugs": validation.approved_tool_slugs,
        "current_version": next_version,
        "validation_status": "valid",
        "validation_errors": [],
        "updated_by": actor_id,
        "updated_at": _now_iso(),
    }
    result = (
        supabase.table("agent_skills")
        .update(update_payload)
        .eq("id", request.skill_id)
        .eq("organization_id", request.organization_id)
        .execute()
    )
    row = _first_row(result.data) or {**existing, **update_payload}

    _insert_skill_version(
        supabase,
        row=row,
        version=next_version,
        validation_status="published",
        validation_errors=[],
        actor_id=actor_id,
        change_summary=request.change_summary,
    )
    _record_skill_audit(
        supabase,
        organization_id=request.organization_id,
        actor_id=actor_id,
        action="agent.skill.published",
        skill_id=request.skill_id,
        payload={"slug": row.get("slug"), "version": next_version},
    )
    return _response_from_row(row)
