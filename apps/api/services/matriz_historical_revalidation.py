"""Read-only revalidation of immutable historical minuta generations."""

from __future__ import annotations

from typing import Any, Mapping

from services.matriz_semantic_validation import validate_semantics


def revalidate_historical_generation(
    *,
    generation: Mapping[str, Any],
    artifact_bytes: bytes | None,
    reconstructed: Mapping[str, Any] | None,
) -> dict[str, Any]:
    if artifact_bytes is None:
        return {
            "generationId": str(generation["id"]),
            "readinessStatus": "unverified",
            "issues": [{"code": "SEM_ARTIFACT_HASH_MISMATCH", "severity": "blocking"}],
            "mutatedGeneration": False,
        }
    complete = bool(reconstructed) and all(
        reconstructed.get(key)
        for key in (
            "resolved_ast", "resolved_text", "approval_id", "evidence_manifest_hash",
            "provenance_manifest_hash", "snapshot_hash", "template_version",
            "renderer_version", "ruleset_version",
        )
    )
    result = validate_semantics(
        resolved_ast=(reconstructed or {}).get("resolved_ast"),
        resolved_text=(reconstructed or {}).get("resolved_text"),
        artifact_bytes=artifact_bytes,
        comparecientes=(reconstructed or {}).get("comparecientes", []),
        historical=True,
        provenance_complete=complete,
        expected_artifact_sha256=generation.get("artifact_sha256"),
    )
    return {
        "generationId": str(generation["id"]),
        "readinessStatus": "ready" if result.promotable and complete else "unverified",
        "validation": result.to_dict(),
        "issues": [issue.to_dict() for issue in result.issues],
        "mutatedGeneration": False,
    }
