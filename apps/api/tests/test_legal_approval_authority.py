from datetime import datetime, timedelta, timezone

import pytest

from services.legal_approval_authority import (
    LegalApprovalAuthorityError,
    require_active_legal_grant,
    validate_delegation,
    validate_four_eyes,
)
from services import legal_approval_authority


def grant(**overrides):
    value = {"active": True, "grantee_user_id": "reviewer", "organization_id": "org", "project_id": "project", "expires_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()}
    value.update(overrides)
    return value


def test_legal_grant_is_current_actor_and_scope_bound() -> None:
    assert require_active_legal_grant(grant(), actor_id="reviewer", organization_id="org", project_id="project")
    with pytest.raises(LegalApprovalAuthorityError, match="LEGAL_APPROVAL_REQUIRED"):
        require_active_legal_grant(grant(active=False), actor_id="reviewer", organization_id="org", project_id="project")
    with pytest.raises(LegalApprovalAuthorityError, match="LEGAL_APPROVAL_SCOPE_MISMATCH"):
        require_active_legal_grant(grant(), actor_id="reviewer", organization_id="foreign", project_id="project")


def test_self_grant_and_same_reviewer_are_forbidden() -> None:
    with pytest.raises(LegalApprovalAuthorityError, match="LEGAL_APPROVAL_SELF_GRANT_FORBIDDEN"):
        validate_delegation(grantor_user_id="same", grantee_user_id="same", reason="bootstrap")
    with pytest.raises(LegalApprovalAuthorityError, match="LEGAL_APPROVAL_DISTINCT_REVIEWER_REQUIRED"):
        validate_four_eyes(submitter_id="same", reviewer_id="same", required=True)


def _review_policy(**overrides):
    evaluate = getattr(legal_approval_authority, "evaluate_review_policy", None)
    assert callable(evaluate), (
        "SIGNATURE_SCOPE_MISMATCH: falta la autoridad compartida de política jurídica"
    )
    value = {
        "policy": "every_sale",
        "four_eyes": False,
        "blocking_exceptions": [],
        "approved_project_matriz_unchanged": True,
        "submitter_id": "submitter",
        "reviewer_id": "reviewer",
        "active_grant": grant(),
        "prior_decision": None,
    }
    value.update(overrides)
    return evaluate(**value)


def test_every_sale_requires_a_current_human_approval() -> None:
    result = _review_policy(policy="every_sale")

    assert result["requires_human_review"] is True
    assert result["may_generate"] is False


def test_exceptions_only_inherits_only_without_blockers_or_provenance_change() -> None:
    inherited = _review_policy(policy="exceptions_only")
    blocked = _review_policy(
        policy="exceptions_only",
        blocking_exceptions=["title_gap"],
    )
    stale = _review_policy(
        policy="exceptions_only",
        approved_project_matriz_unchanged=False,
    )

    assert inherited["may_inherit"] is True
    assert blocked["may_inherit"] is False
    assert stale["may_inherit"] is False


def test_four_eyes_requires_a_distinct_active_reviewer() -> None:
    with pytest.raises(
        LegalApprovalAuthorityError,
        match="LEGAL_APPROVAL_DISTINCT_REVIEWER_REQUIRED",
    ):
        _review_policy(
            four_eyes=True,
            submitter_id="same",
            reviewer_id="same",
        )


def test_exceptions_only_with_four_eyes_still_requires_distinct_review() -> None:
    result = _review_policy(
        policy="exceptions_only",
        four_eyes=True,
    )

    assert result["may_inherit"] is False
    assert result["requires_human_review"] is True
    assert result["reviewer_id"] == "reviewer"


def test_rejection_remains_actionable_and_later_valid_approval_resumes() -> None:
    rejected = _review_policy(
        prior_decision={"status": "rejected", "reason": "Corregir cláusula"},
    )
    resumed = _review_policy(
        prior_decision={"status": "approved", "reason": "Corrección verificada"},
        resumed_from_rejection=True,
    )

    assert rejected["status"] == "rejected"
    assert rejected["durable_obligation_actionable"] is True
    assert rejected["may_generate"] is False
    assert rejected["may_deliver"] is False
    assert resumed["status"] == "approved"
    assert resumed["durable_obligation_actionable"] is True
    assert resumed["may_generate"] is True
