"""SDD 008: catalog validation for matriz clause content (FR-015, FR-022).

Walks the ProseMirror JSON of a clause (`schema_version: 1`, research D2)
and validates every key against the canonical catalog plus the derived
presentation keys (research D11). Removed catalog keys
(`matriz.inscripcion_*`, `matriz.adquisicion_*`) are flagged with their
suggested migration to the SDD 009 `titulo.*` contract.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from services import legal_variable_catalog as catalog

MATRIZ_SCHEMA_VERSION = 1

# Research D11: prose renderings of already-approved snapshot values; the
# resolver composes them at render time, they are never stored as variables.
DERIVED_PRESENTATION_KEYS = frozenset(
    {
        "vendedor.representantes_texto",
        "proyecto.nombre",
    }
)

# SDD 009 narrative blocks are the only block_token targets.
ALLOWED_BLOCK_KEYS = frozenset(
    {
        "titulo.comparecencia_vendedor_texto",
        "titulo.clausula_primero_texto",
    }
)

ITEM_KEY_PREFIX = "item."

# Removed keys (SDD 009 handoff) and their migration targets.
REMOVED_KEY_MIGRATIONS = (
    ("matriz.inscripcion_", "titulo.inscripciones[]"),
    ("matriz.adquisicion_", "titulo.clausula_primero_texto"),
)

KNOWN_BLOCK_NODE_TYPES = frozenset(
    ("paragraph", "block_token", "repeat_section", "conditional_section")
)
KNOWN_INLINE_NODE_TYPES = frozenset(("text", "variable_token"))
TOKEN_FORMATS = frozenset(("words", "date_words", "rut_words"))


@dataclass(frozen=True)
class InvalidKey:
    key: str
    reason: str  # unknown_key | removed_key | invalid_node
    suggested_migration: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "reason": self.reason,
            "suggested_migration": self.suggested_migration,
        }


def _removed_key_migration(key: str) -> str | None:
    for prefix, migration in REMOVED_KEY_MIGRATIONS:
        if key.startswith(prefix):
            return migration
    return None


def _validate_scalar_key(key: str, *, inside_repeat: bool) -> InvalidKey | None:
    if key.startswith(ITEM_KEY_PREFIX):
        if not inside_repeat:
            return InvalidKey(
                key=key,
                reason="unknown_key",
                suggested_migration="item.* keys are only valid inside a repeat_section",
            )
        return None
    migration = _removed_key_migration(key)
    if migration:
        return InvalidKey(key=key, reason="removed_key", suggested_migration=migration)
    if catalog.is_variable_key(key) or key in DERIVED_PRESENTATION_KEYS:
        return None
    return InvalidKey(key=key, reason="unknown_key")


def _validate_array_key(key: str) -> InvalidKey | None:
    migration = _removed_key_migration(key)
    if migration:
        return InvalidKey(key=key, reason="removed_key", suggested_migration=migration)
    if catalog.is_variable_key(key) and key.endswith("[]"):
        return None
    return InvalidKey(
        key=key,
        reason="unknown_key",
        suggested_migration=(
            f"{key}[]" if catalog.is_variable_key(f"{key}[]") else None
        ),
    )


def _validate_condition_key(key: str) -> InvalidKey | None:
    migration = _removed_key_migration(key)
    if migration:
        return InvalidKey(key=key, reason="removed_key", suggested_migration=migration)
    if catalog.is_variable_key(key):
        return None
    return InvalidKey(key=key, reason="unknown_key")


def _validate_block_key(key: str) -> InvalidKey | None:
    if key in ALLOWED_BLOCK_KEYS:
        return None
    return InvalidKey(
        key=key,
        reason="unknown_key",
        suggested_migration="block_token only supports approved titulo narrative blocks",
    )


def _walk(node: dict[str, Any], *, inside_repeat: bool, issues: list[InvalidKey]) -> None:
    node_type = node.get("type")
    attrs = node.get("attrs") or {}

    if node_type == "variable_token":
        key = str(attrs.get("variableKey") or "")
        issue = _validate_scalar_key(key, inside_repeat=inside_repeat)
        if issue:
            issues.append(issue)
        token_format = attrs.get("format")
        if token_format is not None and token_format not in TOKEN_FORMATS:
            issues.append(
                InvalidKey(
                    key=key,
                    reason="invalid_node",
                    suggested_migration=f"unsupported token format: {token_format}",
                )
            )
    elif node_type == "block_token":
        issue = _validate_block_key(str(attrs.get("blockKey") or ""))
        if issue:
            issues.append(issue)
    elif node_type == "repeat_section":
        issue = _validate_array_key(str(attrs.get("arrayKey") or ""))
        if issue:
            issues.append(issue)
        inside_repeat = True
    elif node_type == "conditional_section":
        issue = _validate_condition_key(str(attrs.get("conditionKey") or ""))
        if issue:
            issues.append(issue)
        if attrs.get("mode") not in ("omit", "block"):
            issues.append(
                InvalidKey(
                    key=str(attrs.get("conditionKey") or ""),
                    reason="invalid_node",
                    suggested_migration="conditional_section mode must be omit or block",
                )
            )
    elif node_type == "text":
        if not isinstance(node.get("text"), str):
            issues.append(InvalidKey(key="text", reason="invalid_node"))
    elif node_type not in KNOWN_BLOCK_NODE_TYPES:
        issues.append(InvalidKey(key=str(node_type), reason="invalid_node"))

    for child in node.get("content") or []:
        if isinstance(child, dict):
            _walk(child, inside_repeat=inside_repeat, issues=issues)


def validate_clause_content(content_json: dict[str, Any]) -> list[InvalidKey]:
    """Validate one clause `content_json` against catalog + schema rules."""
    issues: list[InvalidKey] = []
    if content_json.get("schema_version") != MATRIZ_SCHEMA_VERSION:
        issues.append(
            InvalidKey(
                key="schema_version",
                reason="invalid_node",
                suggested_migration=f"expected schema_version {MATRIZ_SCHEMA_VERSION}",
            )
        )
    if content_json.get("type") != "doc":
        issues.append(InvalidKey(key=str(content_json.get("type")), reason="invalid_node"))
        return issues
    for child in content_json.get("content") or []:
        if isinstance(child, dict):
            _walk(child, inside_repeat=False, issues=issues)
    return issues


def validate_clause_condition(
    condition_key: str | None,
    condition_mode: str | None,
) -> list[InvalidKey]:
    """Validate the clause-level condition pair (data-model §2)."""
    issues: list[InvalidKey] = []
    if (condition_key is None) != (condition_mode is None):
        issues.append(
            InvalidKey(
                key=condition_key or "condition_mode",
                reason="invalid_node",
                suggested_migration="condition_key and condition_mode must be set together",
            )
        )
        return issues
    if condition_key is not None:
        issue = _validate_condition_key(condition_key)
        if issue:
            issues.append(issue)
    return issues
