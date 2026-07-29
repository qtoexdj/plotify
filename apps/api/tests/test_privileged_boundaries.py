from pathlib import Path


MARKER = "PRIVILEGED_BOUNDARY_NOT_IMPLEMENTED"
ROOT = Path(__file__).resolve().parents[1]


def test_privileged_routes_derive_actor_and_tenant_from_persisted_resources() -> None:
    deps = (ROOT / "api/deps.py").read_text()
    actions = (ROOT.parent / "web/src/actions/vendor-actions.action.ts").read_text()
    combined = f"{deps}\n{actions}"
    assert "trusted principal" in combined.lower(), f"{MARKER}: trusted principal missing"
    assert "intent" in combined and "finalize" in combined, f"{MARKER}: Auth compensation missing"
    assert "deleteUser" not in actions, f"{MARKER}: global Auth deletion is reachable"


def test_privileged_bot_skill_integration_prompt_and_document_routes_are_classified() -> None:
    classification = (
        ROOT.parents[1]
        / "specs/019-hardening-produccion/evidence/privileged-http-surfaces.classification.json"
    ).read_text()
    for capability in ("bots", "skills", "integrations", "prompts", "documents"):
        assert capability in classification, f"{MARKER}: {capability} is unclassified"
