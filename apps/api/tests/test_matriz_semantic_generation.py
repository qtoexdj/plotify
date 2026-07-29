import pytest

from services.matriz_semantic_validation import generation_fingerprint


def envelope() -> dict:
    return {key: key for key in (
        "organization_id", "case_id", "snapshot_hash", "matriz_id", "matriz_version",
        "template_id", "template_version", "renderer_version", "ruleset_version", "schema_version",
        "normalization_version", "approval_id", "provenance_manifest_hash", "review_policy_fingerprint",
    )}


def test_full_generation_fingerprint_binds_every_provenance_axis() -> None:
    base = envelope()
    original = generation_fingerprint(base)
    for key in base:
        changed = {**base, key: f"changed-{key}"}
        assert generation_fingerprint(changed) != original


def test_missing_approval_or_provenance_creates_no_generation() -> None:
    with pytest.raises(ValueError, match="SEM_PROVENANCE_INCOMPLETE"):
        generation_fingerprint({**envelope(), "approval_id": None})
