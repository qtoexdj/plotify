import hashlib

from services.matriz_historical_revalidation import revalidate_historical_generation


def test_byte_only_history_stays_unverified_without_mutation() -> None:
    artifact = b"legacy"
    result = revalidate_historical_generation(generation={"id": "generation", "artifact_sha256": hashlib.sha256(artifact).hexdigest()}, artifact_bytes=artifact, reconstructed=None)
    assert result["readinessStatus"] == "unverified"
    assert result["mutatedGeneration"] is False
    assert any(issue["code"] == "SEM_PROVENANCE_INCOMPLETE" for issue in result["issues"])


def test_missing_or_changed_bytes_stay_unverified() -> None:
    missing = revalidate_historical_generation(generation={"id": "generation"}, artifact_bytes=None, reconstructed=None)
    assert missing["readinessStatus"] == "unverified"
    changed = revalidate_historical_generation(generation={"id": "generation", "artifact_sha256": "a" * 64}, artifact_bytes=b"changed", reconstructed={"resolved_ast": {"type": "doc"}, "resolved_text": "Texto", "approval_id": "a", "evidence_manifest_hash": "e", "provenance_manifest_hash": "p", "snapshot_hash": "s", "template_version": 1, "renderer_version": "matriz-docx/2", "ruleset_version": "semantic/1"})
    assert changed["readinessStatus"] == "unverified"
    assert any(issue["code"] == "SEM_ARTIFACT_HASH_MISMATCH" for issue in changed["issues"])
