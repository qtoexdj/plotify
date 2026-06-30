"""SDD 008: single server-side token resolver for the matriz (research D6).

Input: clause ProseMirror JSON (schema_version 1) + the case
``variable_snapshot``/``evidence_snapshot``. Output: resolved ProseMirror
JSON plus the resolution manifest consumed by (a) the builder resolved view,
(b) the evidence view, (c) DOCX generation and (d) approval blocking.

No component may re-implement token substitution (agent-execution.md #4).

Resolution semantics:
- scalar tokens resolve from the snapshot; reviewed states render, ``proposed``
  surfaces as ``blocked`` (visible value, blocks approval), absent keys are
  ``missing`` and the token node survives in the resolved JSON so the DOCX
  renderer can refuse to render it (SC-002);
- ``not_applicable`` renders as empty text: an explicit human decision;
- block tokens insert the approved titulo narrative verbatim (FR-004);
- repeat sections expand their template once per array item with ``item.*``
  tokens; registral numbers render in words via the shared engine (FR-005);
- conditional sections omit or block per their declared mode (spec edge
  case for empty arrays / false conditions);
- derived presentation keys (research D11) compose deterministically at
  resolve time: ``vendedor.representantes_texto`` from the approved array,
  ``proyecto.nombre`` from the case context.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from core.logger import get_logger
from services.legal_microcopy import source_origin_label
from services.legal_title_words import (
    date_to_words_spanish,
    number_to_words_spanish,
    parse_int_or_none,
    rut_to_words_spanish,
)
from services.legal_variable_catalog import (
    VARIABLE_GROUP_LABELS,
    VARIABLE_KEYS,
    authored_variable_default,
    variable_producer,
    variable_group_for_key,
    variable_label_for_key,
)

logger = get_logger(__name__)

# SDD 010 (research D11/D4): claves de presentacion derivadas — se renderizan
# deterministicamente y no viven en el catalogo, pero igual necesitan
# etiqueta humana en el manifiesto.
DERIVED_KEY_LABELS = {
    "proyecto.nombre": "Nombre del proyecto",
    "vendedor.representantes_texto": "Representantes del vendedor",
}

_ARRAY_ITEM_RE = re.compile(r"^(?P<base>.+)\[(?P<index>\d+)\]\.(?P<field>.+)$")
_FALLBACK_CATEGORY = ("otros", "Otros datos")


def _humanize_fragment(fragment: str) -> str:
    return fragment.replace("_", " ").strip()


def token_label(variable_key: str, override: str | None = None) -> str:
    """Etiqueta humana de cualquier clave del manifiesto (SDD 010 FR-002).

    Orden: override de plantilla → catalogo → claves derivadas → claves de
    filas repetidas (``array[N].campo``) → humanizacion determinista. Nunca
    devuelve la clave cruda.
    """
    if override and override.strip() and override.strip() != variable_key:
        return override.strip()
    derived = DERIVED_KEY_LABELS.get(variable_key)
    if derived is not None:
        return derived
    try:
        return variable_label_for_key(variable_key)
    except KeyError:
        pass
    match = _ARRAY_ITEM_RE.match(variable_key)
    if match:
        base_label = token_label(f"{match.group('base')}[]")
        row = int(match.group("index")) + 1
        return (
            f"{base_label} (fila {row}): "
            f"{_humanize_fragment(match.group('field'))}"
        )
    fragment = _humanize_fragment(
        variable_key.removesuffix("[]").rsplit(".", 1)[-1]
    )
    return fragment[:1].upper() + fragment[1:] if fragment else "Dato"


def token_category(variable_key: str) -> tuple[str, str]:
    """(categoria, etiqueta de categoria) de una clave del manifiesto."""
    group = variable_group_for_key(variable_key)
    if group is None:
        prefix = variable_key.split(".", 1)[0]
        if prefix in VARIABLE_GROUP_LABELS:
            group = prefix
    if group is None:
        return _FALLBACK_CATEGORY
    return group, VARIABLE_GROUP_LABELS[group]


def insertable_variables_catalog() -> list[dict[str, str]]:
    """Catalogo humanizado para el picker "Insertar dato" (SDD 010 FR-014).

    Fuente unica: el catalogo canonico (``VARIABLE_KEYS``) etiquetado. Lo
    consumen la mesa (manifiesto del caso) y el editor de plantillas, para que
    ninguna copia hardcodeada derive del catalogo.
    """
    catalogo: list[dict[str, str]] = []
    for key in VARIABLE_KEYS:
        category, category_label = token_category(key)
        catalogo.append(
            {
                "key": key,
                "label": token_label(key),
                "category": category,
                "category_label": category_label,
            }
        )
    return catalogo

MATRIZ_SCHEMA_VERSION = 1

# Snapshot states the resolver treats as usable values (SDD 007 reviewed set).
RESOLVED_SNAPSHOT_STATES = frozenset(
    ("approved", "resolved", "derived", "not_applicable")
)
# Reviewable-but-unconfirmed states surface as blocked, not missing.
BLOCKED_SNAPSHOT_STATES = frozenset(("proposed", "manual_review", "conflict"))

TITULO_PREFIX = "titulo."
ITEM_PREFIX = "item."
TRUE_TEXT_VALUES = frozenset(("true", "si", "sí", "1", "aplica"))

# Severity order for manifest dedup: keep the worst status per key.
_STATUS_SEVERITY = {"resolved": 0, "blocked": 1, "missing": 2}


class MatrizResolutionError(Exception):
    """Base error for matriz token resolution failures."""


class UnknownNodeError(MatrizResolutionError):
    """Raised when the document contains node types outside the D2 schema."""

    def __init__(self, node_types: list[str]):
        self.node_types = sorted(set(node_types))
        super().__init__(
            "Unknown ProseMirror node types in matriz content: "
            + ", ".join(self.node_types)
        )


@dataclass(frozen=True)
class TokenResolutionEntry:
    variable_key: str
    status: str  # resolved | missing | blocked
    value_text: str | None = None
    state: str | None = None
    source_type: str | None = None
    evidence_refs: tuple[dict[str, Any], ...] = ()
    label_override: str | None = None

    def to_dict(self) -> dict[str, Any]:
        category, category_label = token_category(self.variable_key)
        return {
            "variableKey": self.variable_key,
            "status": self.status,
            "value_text": self.value_text,
            "state": self.state,
            "source_type": self.source_type,
            "evidence_refs": list(self.evidence_refs),
            # SDD 010: campos humanos (contracts/api-contracts.md §1). El
            # origen operacional solo se describe cuando no hay evidencia
            # documental que mostrar.
            "label": token_label(self.variable_key, self.label_override),
            "category": category,
            "category_label": category_label,
            "producer": variable_producer(self.variable_key),
            "source_label": (
                source_origin_label(self.source_type)
                if not self.evidence_refs
                else None
            ),
        }


@dataclass(frozen=True)
class BlockResolutionEntry:
    block_key: str
    status: str
    text: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "blockKey": self.block_key,
            "status": self.status,
            "text": self.text,
            "label": token_label(self.block_key),
        }


@dataclass(frozen=True)
class ClauseResolution:
    """Resolved content + manifest entries for one clause."""

    clause_key: str
    resolved_content: dict[str, Any] | None
    omitted: bool = False
    tokens: tuple[TokenResolutionEntry, ...] = ()
    blocks: tuple[BlockResolutionEntry, ...] = ()


@dataclass(frozen=True)
class MatrizResolution:
    """Full resolution manifest for a matriz (research D6)."""

    clauses: tuple[ClauseResolution, ...] = ()
    tokens: tuple[TokenResolutionEntry, ...] = ()
    blocks: tuple[BlockResolutionEntry, ...] = ()
    missing_count: int = 0
    blocked_count: int = 0

    def manifest_dict(self) -> dict[str, Any]:
        return {
            "tokens": [token.to_dict() for token in self.tokens],
            "blocks": [block.to_dict() for block in self.blocks],
            "missing_count": self.missing_count,
        }


def snapshot_entry(variable_snapshot: dict[str, Any], key: str) -> dict[str, Any] | None:
    """Scalar snapshot lookup; the ``titulo`` group is plain values (SDD 009)."""
    entry = variable_snapshot.get(key)
    return entry if isinstance(entry, dict) else None


def titulo_value(variable_snapshot: dict[str, Any], block_or_array_key: str) -> Any:
    """Resolve ``titulo.<field>`` keys against the approved titulo group."""
    titulo = variable_snapshot.get("titulo")
    if not isinstance(titulo, dict):
        return None
    field_name = block_or_array_key.removeprefix(TITULO_PREFIX).removesuffix("[]")
    return titulo.get(field_name)


def _entry_text(entry: dict[str, Any]) -> str | None:
    value_text = entry.get("value_text")
    if isinstance(value_text, str) and value_text.strip():
        return value_text
    value_json = entry.get("value_json")
    if isinstance(value_json, (str, int, float)) and not isinstance(value_json, bool):
        return str(value_json)
    return None


def _apply_format(text: str, token_format: str | None) -> str:
    if not token_format:
        return text
    if token_format == "words":
        number = parse_int_or_none(text)
        return number_to_words_spanish(number) if number is not None else text
    if token_format == "date_words":
        return date_to_words_spanish(text)
    if token_format == "rut_words":
        return rut_to_words_spanish(text)
    return text


def _text_node(text: str) -> dict[str, Any]:
    return {"type": "text", "text": text}


def _is_truthy_condition(entry: dict[str, Any] | None) -> bool | None:
    """True/False when decidable, None when the condition value is absent."""
    if entry is None:
        return None
    state = entry.get("state")
    if state == "not_applicable":
        return False
    value_json = entry.get("value_json")
    if isinstance(value_json, bool):
        return value_json
    value_text = entry.get("value_text")
    if isinstance(value_text, str) and value_text.strip():
        return value_text.strip().lower() in TRUE_TEXT_VALUES
    if value_json is not None:
        return bool(value_json)
    return None


def _representantes_texto(variable_snapshot: dict[str, Any]) -> str | None:
    """Compose vendedor.representantes_texto from the approved array (D11)."""
    entry = snapshot_entry(variable_snapshot, "vendedor.representantes[]")
    representantes = entry.get("value_json") if entry else None
    if not isinstance(representantes, list) or not representantes:
        return None
    parts = []
    for representante in representantes:
        if not isinstance(representante, dict):
            return None
        nombre = representante.get("nombre")
        rut = representante.get("rut")
        if not nombre:
            return None
        if rut:
            parts.append(
                f"don(ña) {nombre}, cédula nacional de identidad número "
                f"{rut_to_words_spanish(str(rut))}"
            )
        else:
            parts.append(f"don(ña) {nombre}")
    if len(parts) > 1:
        return ", ".join(parts[:-1]) + " y " + parts[-1]
    return parts[0]


class _ClauseResolver:
    def __init__(
        self,
        *,
        variable_snapshot: dict[str, Any],
        evidence_snapshot: dict[str, Any],
        context: dict[str, Any],
    ) -> None:
        self.snapshot = variable_snapshot
        self.evidence = evidence_snapshot
        self.context = context
        self.tokens: list[TokenResolutionEntry] = []
        self.blocks: list[BlockResolutionEntry] = []
        self.unknown_nodes: list[str] = []

    # ── manifest helpers ──

    def _record(self, entry: TokenResolutionEntry) -> TokenResolutionEntry:
        self.tokens.append(entry)
        return entry

    def _condition_truthiness(self, condition_key: str) -> bool | None:
        """Verdad de una condición: snapshot del proyecto y, si no hay valor,
        el default reutilizable de la variable (SDD 011). Permite que clausulas
        condicionales como personería/exención tomen su default."""
        entry = snapshot_entry(self.snapshot, condition_key)
        if entry is None:
            entry = authored_variable_default(condition_key)
        return _is_truthy_condition(entry)

    def _evidence_refs(self, key: str) -> tuple[dict[str, Any], ...]:
        refs = self.evidence.get(key)
        if isinstance(refs, list):
            return tuple(ref for ref in refs if isinstance(ref, dict))
        return ()

    # ── scalar tokens ──

    def _resolve_scalar(
        self,
        key: str,
        token_format: str | None,
        node_label: str | None = None,
    ) -> TokenResolutionEntry:
        if key == "proyecto.nombre":
            nombre = self.context.get("proyecto_nombre")
            if isinstance(nombre, str) and nombre.strip():
                return self._record(
                    TokenResolutionEntry(
                        variable_key=key,
                        status="resolved",
                        value_text=nombre,
                        state="derived",
                        source_type="system",
                        label_override=node_label,
                    )
                )
            return self._record(
                TokenResolutionEntry(
                    variable_key=key, status="missing", label_override=node_label
                )
            )

        if key == "vendedor.representantes_texto":
            texto = _representantes_texto(self.snapshot)
            if texto:
                return self._record(
                    TokenResolutionEntry(
                        variable_key=key,
                        status="resolved",
                        value_text=texto,
                        state="derived",
                        source_type="derived",
                        label_override=node_label,
                    )
                )
            return self._record(
                TokenResolutionEntry(
                    variable_key=key, status="missing", label_override=node_label
                )
            )

        entry = snapshot_entry(self.snapshot, key)
        if entry is None and key.startswith(TITULO_PREFIX):
            value = titulo_value(self.snapshot, key)
            if isinstance(value, str) and value.strip():
                return self._record(
                    TokenResolutionEntry(
                        variable_key=key,
                        status="resolved",
                        value_text=_apply_format(value, token_format),
                        state="approved",
                        source_type="document",
                        label_override=node_label,
                    )
                )
            return self._record(
                TokenResolutionEntry(
                    variable_key=key, status="missing", label_override=node_label
                )
            )
        if entry is None:
            default = authored_variable_default(key)
            if default is not None:
                if str(default.get("state") or "") == "not_applicable":
                    return self._record(
                        TokenResolutionEntry(
                            variable_key=key,
                            status="resolved",
                            value_text="",
                            state="not_applicable",
                            source_type="legal_review",
                            label_override=node_label,
                        )
                    )
                default_text = default.get("value_text")
                if isinstance(default_text, str) and default_text.strip():
                    return self._record(
                        TokenResolutionEntry(
                            variable_key=key,
                            status="resolved",
                            value_text=_apply_format(default_text, token_format),
                            state="derived",
                            source_type="derived",
                            label_override=node_label,
                        )
                    )
            return self._record(
                TokenResolutionEntry(
                    variable_key=key, status="missing", label_override=node_label
                )
            )

        state = str(entry.get("state") or "")
        if state == "not_applicable":
            return self._record(
                TokenResolutionEntry(
                    variable_key=key,
                    status="resolved",
                    value_text="",
                    state=state,
                    source_type=entry.get("source_type"),
                    label_override=node_label,
                )
            )
        text = _entry_text(entry)
        if text is None:
            return self._record(
                TokenResolutionEntry(
                    variable_key=key,
                    status="missing",
                    state=state or None,
                    source_type=entry.get("source_type"),
                    label_override=node_label,
                )
            )
        status = "blocked" if state in BLOCKED_SNAPSHOT_STATES else "resolved"
        return self._record(
            TokenResolutionEntry(
                variable_key=key,
                status=status,
                value_text=_apply_format(text, token_format),
                state=state or None,
                source_type=entry.get("source_type"),
                evidence_refs=self._evidence_refs(key),
                label_override=node_label,
            )
        )

    # ── arrays ──

    def _resolve_array(self, array_key: str) -> list[dict[str, Any]] | None:
        if array_key.startswith(TITULO_PREFIX):
            value = titulo_value(self.snapshot, array_key)
        else:
            entry = snapshot_entry(self.snapshot, array_key)
            value = entry.get("value_json") if entry else None
        if isinstance(value, list) and value:
            return [item for item in value if isinstance(item, dict)]
        return None

    # ── node walkers ──

    def _resolve_inline(
        self,
        nodes: list[Any],
        *,
        repeat_item: dict[str, Any] | None,
        repeat_context: tuple[str, int] | None,
    ) -> list[dict[str, Any]]:
        resolved: list[dict[str, Any]] = []
        for node in nodes:
            if not isinstance(node, dict):
                continue
            node_type = node.get("type")
            if node_type == "text":
                resolved.append(node)
                continue
            if node_type != "variable_token":
                self.unknown_nodes.append(str(node_type))
                resolved.append(node)
                continue

            attrs = node.get("attrs") or {}
            key = str(attrs.get("variableKey") or "")
            token_format = attrs.get("format")
            node_label = attrs.get("label")
            node_label = str(node_label) if node_label else None

            if key.startswith(ITEM_PREFIX):
                if repeat_item is None or repeat_context is None:
                    self._record(TokenResolutionEntry(variable_key=key, status="missing"))
                    resolved.append(node)
                    continue
                field_name = key.removeprefix(ITEM_PREFIX)
                value = repeat_item.get(field_name)
                if value is None or (isinstance(value, str) and not value.strip()):
                    array_key, index = repeat_context
                    self._record(
                        TokenResolutionEntry(
                            variable_key=f"{array_key}[{index}].{field_name}",
                            status="missing",
                        )
                    )
                    resolved.append(node)
                    continue
                resolved.append(_text_node(_apply_format(str(value), token_format)))
                continue

            entry = self._resolve_scalar(key, token_format, node_label)
            if entry.status == "missing":
                resolved.append(node)
            else:
                resolved.append(_text_node(entry.value_text or ""))
        return resolved

    def _resolve_blocks(
        self,
        nodes: list[Any],
        *,
        repeat_item: dict[str, Any] | None = None,
        repeat_context: tuple[str, int] | None = None,
    ) -> list[dict[str, Any]]:
        resolved: list[dict[str, Any]] = []
        for node in nodes:
            if not isinstance(node, dict):
                continue
            node_type = node.get("type")

            if node_type == "paragraph":
                resolved.append(
                    {
                        **node,
                        "content": self._resolve_inline(
                            node.get("content") or [],
                            repeat_item=repeat_item,
                            repeat_context=repeat_context,
                        ),
                    }
                )
            elif node_type == "block_token":
                attrs = node.get("attrs") or {}
                block_key = str(attrs.get("blockKey") or "")
                value = titulo_value(self.snapshot, block_key)
                if isinstance(value, str) and value.strip():
                    self.blocks.append(
                        BlockResolutionEntry(
                            block_key=block_key, status="resolved", text=value
                        )
                    )
                    resolved.append(
                        {"type": "paragraph", "content": [_text_node(value)]}
                    )
                else:
                    self.blocks.append(
                        BlockResolutionEntry(block_key=block_key, status="missing")
                    )
                    resolved.append(node)
            elif node_type == "repeat_section":
                attrs = node.get("attrs") or {}
                array_key = str(attrs.get("arrayKey") or "")
                items = self._resolve_array(array_key)
                if items is None:
                    self._record(
                        TokenResolutionEntry(variable_key=array_key, status="missing")
                    )
                    resolved.append(node)
                    continue
                self._record(
                    TokenResolutionEntry(
                        variable_key=array_key,
                        status="resolved",
                        value_text=None,
                        state="approved",
                    )
                )
                template_nodes = node.get("content") or []
                for index, item in enumerate(items):
                    resolved.extend(
                        self._resolve_blocks(
                            template_nodes,
                            repeat_item=item,
                            repeat_context=(array_key, index),
                        )
                    )
            elif node_type == "conditional_section":
                attrs = node.get("attrs") or {}
                condition_key = str(attrs.get("conditionKey") or "")
                mode = str(attrs.get("mode") or "omit")
                condition = self._condition_truthiness(condition_key)
                if condition is None:
                    self._record(
                        TokenResolutionEntry(
                            variable_key=condition_key, status="missing"
                        )
                    )
                    resolved.append(node)
                elif condition:
                    resolved.extend(
                        self._resolve_blocks(
                            node.get("content") or [],
                            repeat_item=repeat_item,
                            repeat_context=repeat_context,
                        )
                    )
                elif mode == "block":
                    self._record(
                        TokenResolutionEntry(
                            variable_key=condition_key, status="blocked",
                            value_text=None, state="approved",
                        )
                    )
                    resolved.append(node)
                # mode == "omit" y condición falsa: la sección se omite.
            else:
                self.unknown_nodes.append(str(node_type))
                resolved.append(node)
        return resolved

    def resolve_clause(self, clause: dict[str, Any]) -> ClauseResolution:
        clause_key = str(clause.get("clause_key") or "")
        content = clause.get("content_json") or {}

        condition_key = clause.get("condition_key")
        if condition_key:
            condition = self._condition_truthiness(str(condition_key))
            mode = str(clause.get("condition_mode") or "omit")
            if condition is None:
                self._record(
                    TokenResolutionEntry(
                        variable_key=str(condition_key), status="missing"
                    )
                )
            elif not condition:
                if mode == "block":
                    self._record(
                        TokenResolutionEntry(
                            variable_key=str(condition_key),
                            status="blocked",
                            state="approved",
                        )
                    )
                return ClauseResolution(
                    clause_key=clause_key, resolved_content=None, omitted=True
                )

        resolved_nodes = self._resolve_blocks(content.get("content") or [])
        resolved_content = {
            "schema_version": MATRIZ_SCHEMA_VERSION,
            "type": "doc",
            "content": resolved_nodes,
        }
        return ClauseResolution(
            clause_key=clause_key,
            resolved_content=resolved_content,
            omitted=False,
        )


def _dedupe_tokens(
    tokens: list[TokenResolutionEntry],
) -> tuple[TokenResolutionEntry, ...]:
    by_key: dict[str, TokenResolutionEntry] = {}
    for token in tokens:
        existing = by_key.get(token.variable_key)
        if existing is None or (
            _STATUS_SEVERITY[token.status] > _STATUS_SEVERITY[existing.status]
        ):
            by_key[token.variable_key] = token
    return tuple(by_key.values())


def resolve_matriz_clauses(
    *,
    clauses: list[dict[str, Any]],
    variable_snapshot: dict[str, Any],
    evidence_snapshot: dict[str, Any] | None = None,
    context: dict[str, Any] | None = None,
) -> MatrizResolution:
    """Resolve every active clause against the snapshot (research D6).

    ``clauses`` is the effective clause list (template + matriz overrides,
    already filtered to enabled clauses and sorted by effective order).
    """
    resolver = _ClauseResolver(
        variable_snapshot=variable_snapshot,
        evidence_snapshot=evidence_snapshot or {},
        context=context or {},
    )
    clause_resolutions = []
    for clause in clauses:
        token_start = len(resolver.tokens)
        block_start = len(resolver.blocks)
        resolution = resolver.resolve_clause(clause)
        clause_resolutions.append(
            ClauseResolution(
                clause_key=resolution.clause_key,
                resolved_content=resolution.resolved_content,
                omitted=resolution.omitted,
                tokens=tuple(resolver.tokens[token_start:]),
                blocks=tuple(resolver.blocks[block_start:]),
            )
        )

    if resolver.unknown_nodes:
        raise UnknownNodeError(resolver.unknown_nodes)

    tokens = _dedupe_tokens(resolver.tokens)
    blocks = tuple(
        {block.block_key: block for block in resolver.blocks}.values()
    )
    missing_count = sum(1 for token in tokens if token.status == "missing") + sum(
        1 for block in blocks if block.status == "missing"
    )
    blocked_count = sum(1 for token in tokens if token.status == "blocked")
    return MatrizResolution(
        clauses=tuple(clause_resolutions),
        tokens=tokens,
        blocks=blocks,
        missing_count=missing_count,
        blocked_count=blocked_count,
    )
