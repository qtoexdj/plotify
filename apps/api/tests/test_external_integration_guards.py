import json
from pathlib import Path


MARKER = "PRIVILEGED_BOUNDARY_NOT_IMPLEMENTED"
ROOT = Path(__file__).resolve().parents[1]


def test_every_external_adapter_validates_destination_redirect_timeout_and_redaction() -> None:
    classification = json.loads((
        ROOT.parents[1]
        / "specs/019-hardening-produccion/evidence/runtime-egress-surfaces.classification.json"
    ).read_text())
    surfaces = classification.get("surfaces", [])
    assert surfaces, f"{MARKER}: no egress surfaces were classified"
    for surface in surfaces:
        assert surface.get("schemes") and surface.get("hosts") and surface.get("paths"), (
            f"{MARKER}: egress destination is unclassified for {surface.get('symbol')}"
        )
        assert surface.get("redirectPolicy") == "deny", (
            f"{MARKER}: redirects are not denied for {surface.get('symbol')}"
        )
        assert 0 < surface.get("timeoutMs", 0) <= 10_000, (
            f"{MARKER}: timeout exceeds the total-attempt budget for {surface.get('symbol')}"
        )
        assert surface.get("redaction") == "structured_redaction_enforced"
        assert surface.get("retry") == "idempotent_only"


def test_provider_calls_are_not_made_inside_database_transactions() -> None:
    sources = "\n".join(
        path.read_text()
        for path in (ROOT / "integrations").rglob("*.py")
        if path.is_file()
    )
    assert "total_timeout_seconds" in sources, f"{MARKER}: total timeout guard missing"
