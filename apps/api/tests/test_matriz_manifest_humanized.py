"""SDD 010 T004: manifiesto humanizado y pendientes redactados server-side.

Cubre, con el snapshot Teno y los builders puros del endpoint:
- labels/categorias en tokens y bloques del manifiesto (contracts §1);
- source_label solo cuando no hay evidencia documental;
- blockers con title/description/action_label/action_href humanos;
- omitted_reason en clausulas condicionales que no aplican;
- catalogo insertable para el picker;
- guard de vocabulario vetado sobre todos los textos humanos producidos.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from api.v1.endpoints.escritura_matrices import (
    INSERTABLE_VARIABLES,
    _approval_blockers,
    _effective_clauses,
)
from services import matriz_token_resolution as resolution
from services.legal_variable_catalog import VARIABLE_KEYS

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "matriz"

FORBIDDEN_WORDS = re.compile(
    r"\b(token|blocker|snapshot|gate|resolved|missing|blocked)\b",
    re.IGNORECASE,
)


def _snapshot() -> dict:
    return json.loads(
        (FIXTURE_DIR / "teno_case_snapshot.json").read_text(encoding="utf-8")
    )


def _clauses() -> list[dict]:
    return json.loads(
        (FIXTURE_DIR / "golden_template_clauses.json").read_text(encoding="utf-8")
    )["clauses"]


def _resolve(snapshot: dict | None = None) -> resolution.MatrizResolution:
    return resolution.resolve_matriz_clauses(
        clauses=_clauses(),
        variable_snapshot=snapshot or _snapshot(),
        evidence_snapshot={},
        context={"proyecto_nombre": "Parcelación El Cóndor de Teno"},
    )


def _assert_human(text: str) -> None:
    assert text and text.strip()
    assert not FORBIDDEN_WORDS.search(text), f"Jerga visible: {text!r}"
    assert "_" not in text, f"Codigo crudo visible: {text!r}"


# ─── Manifiesto: labels, categorias y source_label ───────────────────────────


def test_manifest_tokens_carry_labels_and_categories() -> None:
    manifest = _resolve().manifest_dict()
    assert manifest["tokens"], "El manifiesto Teno no puede venir vacio"
    for token in manifest["tokens"]:
        assert token["label"], f"Token sin label: {token['variableKey']}"
        assert token["label"] != token["variableKey"]
        _assert_human(token["label"])
        assert token["category"], f"Token sin categoria: {token['variableKey']}"
        _assert_human(token["category_label"])


def test_manifest_blocks_carry_labels() -> None:
    manifest = _resolve().manifest_dict()
    assert manifest["blocks"], "El golden Teno usa bloques de titulo"
    by_key = {block["blockKey"]: block for block in manifest["blocks"]}
    assert (
        by_key["titulo.clausula_primero_texto"]["label"]
        == "Cláusula PRIMERO (texto aprobado)"
    )


def test_source_label_only_without_documentary_evidence() -> None:
    manifest = _resolve().manifest_dict()
    by_key = {token["variableKey"]: token for token in manifest["tokens"]}
    operational = [
        token
        for token in manifest["tokens"]
        if token["source_type"] in ("system", "geometry", "derived")
        and not token["evidence_refs"]
    ]
    assert operational, "Teno trae datos operacionales sin evidencia documental"
    for token in operational:
        assert token["source_label"], f"Sin origen humano: {token['variableKey']}"
        _assert_human(token["source_label"])
    documental = [
        token for token in manifest["tokens"] if token["evidence_refs"]
    ]
    for token in documental:
        assert token["source_label"] is None
    assert "comprador.nombre" in by_key


def test_dynamic_and_derived_keys_get_labels_never_raw() -> None:
    assert resolution.token_label("proyecto.nombre") == "Nombre del proyecto"
    assert resolution.token_label(
        "titulo.inscripciones[0].fojas"
    ) == "Inscripciones del título (fila 1): fojas"
    assert resolution.token_label("matriz.deslindes.norte") == (
        "Deslinde norte del predio matriz"
    )
    label = resolution.token_label("grupo_inexistente.dato_raro")
    assert "_" not in label


def test_template_node_label_overrides_catalog() -> None:
    assert (
        resolution.token_label("comprador.nombre", "Nombre de la compradora")
        == "Nombre de la compradora"
    )
    assert resolution.token_label("comprador.nombre") == "Nombre del comprador"


# ─── Blockers humanizados (builders puros del endpoint) ─────────────────────


def _case_row(snapshot: dict, readiness_gates: dict | None = None) -> dict:
    return {
        "project_id": "11111111-1111-1111-1111-111111111111",
        "variable_snapshot": snapshot,
        "readiness_gates": readiness_gates or {},
    }


def test_token_missing_blocker_is_humanized_with_deep_link() -> None:
    snapshot = _snapshot()
    snapshot.pop("comprador.estado_civil", None)
    manifest = _resolve(snapshot).manifest_dict()
    blockers = _approval_blockers(
        manifest=manifest,
        case_row=_case_row(snapshot),
        active_clauses=[],
        snapshot_stale=False,
    )
    blocker = next(
        item
        for item in blockers
        if item["kind"] == "token_missing"
        and item["key"] == "comprador.estado_civil"
    )
    # El titulo usa el label del manifiesto (override de plantilla si existe,
    # catalogo si no — research D4); nunca la clave cruda.
    assert blocker["title"].startswith("Falta ")
    assert "estado civil" in blocker["title"].lower()
    assert "comprador.estado_civil" not in blocker["title"]
    assert blocker["action_label"] == "Completar dato"
    assert blocker["action_href"] == (
        "/projects/11111111-1111-1111-1111-111111111111"
        "?tab=legal&variable=comprador.estado_civil"
    )
    for text in (blocker["title"], blocker["description"], blocker["action_label"]):
        _assert_human(text)


def test_readiness_gate_blocker_translates_cause() -> None:
    snapshot = _snapshot()
    gates = {
        "party_verified": {
            "status": "blocked",
            "blocking_variables": ["comprador.estado_civil"],
        }
    }
    blockers = _approval_blockers(
        manifest={"tokens": [], "blocks": []},
        case_row=_case_row(snapshot, gates),
        active_clauses=[],
        snapshot_stale=False,
    )
    blocker = next(item for item in blockers if item["kind"] == "readiness_gate")
    assert blocker["title"].startswith("Verificación pendiente")
    assert blocker["description"].startswith(
        "Falta estado civil del comprador."
    )
    for text in (blocker["title"], blocker["description"], blocker["action_label"]):
        _assert_human(text)


def test_snapshot_stale_blocker_speaks_expediente() -> None:
    blockers = _approval_blockers(
        manifest={"tokens": [], "blocks": []},
        case_row=_case_row(_snapshot()),
        active_clauses=[],
        snapshot_stale=True,
    )
    blocker = next(item for item in blockers if item["kind"] == "snapshot_stale")
    assert blocker["title"] == "El expediente cambió"
    assert blocker["action_label"] == "Recargar"
    _assert_human(blocker["description"])


def test_every_blocker_kind_carries_human_fields() -> None:
    snapshot = _snapshot()
    snapshot.pop("comprador.estado_civil", None)
    titulo = snapshot.setdefault("titulo", {})
    titulo.setdefault("alertas_resueltas", []).append(
        {"tipo": "derechos_aguas", "resolution": "clause_added"}
    )
    gates = {"party_verified": {"status": "blocked", "blocking_variables": []}}
    manifest = _resolve(snapshot).manifest_dict()
    blockers = _approval_blockers(
        manifest=manifest,
        case_row=_case_row(snapshot, gates),
        active_clauses=[],
        snapshot_stale=True,
    )
    kinds = {blocker["kind"] for blocker in blockers}
    assert kinds == {
        "snapshot_stale",
        "token_missing",
        "readiness_gate",
        "alert_clause_missing",
    }
    for blocker in blockers:
        for field_name in ("title", "description", "action_label"):
            _assert_human(blocker[field_name])


# ─── Clausulas omitidas y catalogo insertable ────────────────────────────────


def test_omitted_clause_explains_reason_in_spanish() -> None:
    snapshot = _snapshot()
    snapshot["servidumbre.aplica"] = {
        "state": "approved",
        "value_json": False,
        "value_text": "no",
    }
    clauses = [
        {
            "clause_key": "servidumbre",
            "title": "Servidumbre",
            "position": 0,
            "fixed_position": False,
            "content_json": {"type": "doc", "content": []},
            "condition_key": "servidumbre.aplica",
            "condition_mode": "omit",
            "alert_tipo": None,
        }
    ]
    view_clauses, _ = _effective_clauses(clauses, {"clause_overrides": {}, "clause_order": []}, snapshot)
    view = view_clauses[0]
    assert view["omitted_reason"] == (
        "No aplica en este caso: aplica servidumbre no se cumple."
    )
    _assert_human(view["omitted_reason"])


def test_active_conditional_clause_has_no_omitted_reason() -> None:
    snapshot = _snapshot()
    snapshot["servidumbre.aplica"] = {
        "state": "approved",
        "value_json": True,
        "value_text": "si",
    }
    clauses = [
        {
            "clause_key": "servidumbre",
            "title": "Servidumbre",
            "position": 0,
            "fixed_position": False,
            "content_json": {"type": "doc", "content": []},
            "condition_key": "servidumbre.aplica",
            "condition_mode": "omit",
            "alert_tipo": None,
        }
    ]
    view_clauses, _ = _effective_clauses(clauses, {"clause_overrides": {}, "clause_order": []}, snapshot)
    assert view_clauses[0]["omitted_reason"] is None


def test_insertable_variables_cover_catalog_with_human_labels() -> None:
    assert {item["key"] for item in INSERTABLE_VARIABLES} == set(VARIABLE_KEYS)
    for item in INSERTABLE_VARIABLES:
        _assert_human(item["label"])
        _assert_human(item["category_label"])
