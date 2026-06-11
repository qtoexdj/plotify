"""SDD 008: ProseMirror JSON -> DOCX renderer (research D5).

Receives clause content ALREADY resolved by ``matriz_token_resolution``
(no token lookups here) and renders the minuta with python-docx: clause
titles in bold running text, legal ordinal numbering, justified paragraphs,
no tables. Unknown node types raise :class:`UnknownDocxNodeError` listing
the offending nodes — silent omission is forbidden (spec edge case).

Skeleton (T011): node walker + explicit unknown-node error; full minuta
styling lands in T024.
"""

from __future__ import annotations

from typing import Any

from core.logger import get_logger

logger = get_logger(__name__)

KNOWN_BLOCK_NODE_TYPES = frozenset(
    ("paragraph", "block_token", "repeat_section", "conditional_section")
)
KNOWN_INLINE_NODE_TYPES = frozenset(("text", "variable_token"))
KNOWN_NODE_TYPES = KNOWN_BLOCK_NODE_TYPES | KNOWN_INLINE_NODE_TYPES | {"doc"}


class MatrizDocxError(Exception):
    """Base error for DOCX rendering failures."""


class UnknownDocxNodeError(MatrizDocxError):
    """Unknown node types in resolved content: export must fail explicitly."""

    def __init__(self, node_types: list[str]):
        self.node_types = sorted(set(node_types))
        super().__init__(
            "Cannot render unknown ProseMirror node types to DOCX: "
            + ", ".join(self.node_types)
        )


class UnresolvedTokenError(MatrizDocxError):
    """A variable_token survived resolution: generation must abort (SC-002)."""

    def __init__(self, variable_keys: list[str]):
        self.variable_keys = sorted(set(variable_keys))
        super().__init__(
            "Resolved matriz content still contains unresolved tokens: "
            + ", ".join(self.variable_keys)
        )


def collect_unknown_node_types(node: dict[str, Any]) -> list[str]:
    """Walk a (resolved) ProseMirror document collecting unknown node types."""
    unknown: list[str] = []
    node_type = node.get("type")
    if node_type not in KNOWN_NODE_TYPES:
        unknown.append(str(node_type))
    for child in node.get("content") or []:
        if isinstance(child, dict):
            unknown.extend(collect_unknown_node_types(child))
    return unknown


def collect_unresolved_token_keys(node: dict[str, Any]) -> list[str]:
    """Resolved content must carry zero variable_token nodes (SC-002)."""
    keys: list[str] = []
    if node.get("type") == "variable_token":
        keys.append(str((node.get("attrs") or {}).get("variableKey")))
    for child in node.get("content") or []:
        if isinstance(child, dict):
            keys.extend(collect_unresolved_token_keys(child))
    return keys


def render_minuta_docx(
    *,
    clauses: list[dict[str, Any]],
    metadata: dict[str, Any] | None = None,
) -> bytes:
    """Render resolved clauses to a DOCX binary.

    Implemented in T024 (styles, ordinal numbering, verbatim title blocks);
    the skeleton fixes the contract: input is the resolved clause list from
    ``matriz_token_resolution`` and output is the document bytes.
    """
    raise NotImplementedError("matriz DOCX rendering lands in SDD 008 T024")
