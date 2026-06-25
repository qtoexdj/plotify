from __future__ import annotations

import re
from collections.abc import Mapping, Sequence

from schemas.agent_skills import (
    SkillValidationError,
    SkillValidationRequest,
    SkillValidationResponse,
)


ALLOWED_ROLES = {"admin", "user", "lead", "vendor", "super_admin"}
SLUG_PATTERN = re.compile(r"[^a-z0-9_]+")

BLOCKED_INSTRUCTION_PATTERNS: tuple[tuple[str, str], ...] = (
    ("permission_bypass", r"\b(ignore|bypass|skip|evade)\b.{0,80}\b(permission|policy|rule|tenant)\b"),
    ("permission_bypass", r"\b(ignora|omite|salta|evade)\b.{0,80}\b(permiso|regla|tenant|organizacion|organización)\b"),
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
