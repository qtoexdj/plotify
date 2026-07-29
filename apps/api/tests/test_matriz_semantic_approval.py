import pytest

from services.matriz_semantic_validation import SemanticIssue, SemanticValidationError, SemanticValidationResult, require_promotable


def result(status: str) -> SemanticValidationResult:
    issues = () if status == "passed" else (SemanticIssue("SEM_PLACEHOLDER_LITERAL"),)
    return SemanticValidationResult(status=status, resolved_content_hash="a" * 64, artifact_sha256="b" * 64, issues=issues)


def test_pass_is_not_promotable_before_atomic_approval_binding() -> None:
    with pytest.raises(SemanticValidationError, match="DOCUMENT_SEMANTIC_INVALID"):
        require_promotable(result("passed"), approval_finalized=False)
    require_promotable(result("passed"), approval_finalized=True)


def test_invalid_candidate_never_promotes() -> None:
    with pytest.raises(SemanticValidationError):
        require_promotable(result("failed"), approval_finalized=True)
