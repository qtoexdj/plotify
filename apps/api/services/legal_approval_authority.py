"""Legal approval grant and four-eyes policy checks for escritura matrices."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Mapping


class LegalApprovalAuthorityError(PermissionError):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


def require_active_legal_grant(
    grant: Mapping[str, Any] | None,
    *,
    actor_id: str,
    organization_id: str,
    project_id: str | None,
    at: datetime | None = None,
) -> Mapping[str, Any]:
    now = at or datetime.now(timezone.utc)
    if not grant or not grant.get("active"):
        raise LegalApprovalAuthorityError("LEGAL_APPROVAL_REQUIRED")
    if str(grant.get("grantee_user_id")) != str(actor_id):
        raise LegalApprovalAuthorityError("LEGAL_APPROVAL_REQUIRED")
    if str(grant.get("organization_id")) != str(organization_id):
        raise LegalApprovalAuthorityError("LEGAL_APPROVAL_SCOPE_MISMATCH")
    scoped_project = grant.get("project_id")
    if scoped_project is not None and str(scoped_project) != str(project_id):
        raise LegalApprovalAuthorityError("LEGAL_APPROVAL_SCOPE_MISMATCH")
    expires_at = grant.get("expires_at")
    if expires_at:
        expiry = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
        if expiry <= now:
            raise LegalApprovalAuthorityError("LEGAL_APPROVAL_GRANT_EXPIRED")
    return grant


def validate_delegation(*, grantor_user_id: str, grantee_user_id: str, reason: str) -> None:
    if str(grantor_user_id) == str(grantee_user_id):
        raise LegalApprovalAuthorityError("LEGAL_APPROVAL_SELF_GRANT_FORBIDDEN")
    if not reason.strip():
        raise LegalApprovalAuthorityError("LEGAL_APPROVAL_REASON_REQUIRED")


def validate_four_eyes(*, submitter_id: str | None, reviewer_id: str, required: bool) -> None:
    if required and submitter_id and str(submitter_id) == str(reviewer_id):
        raise LegalApprovalAuthorityError("LEGAL_APPROVAL_DISTINCT_REVIEWER_REQUIRED")


def evaluate_review_policy(
    *,
    policy: str,
    four_eyes: bool,
    blocking_exceptions: list[str],
    approved_project_matriz_unchanged: bool,
    submitter_id: str | None,
    reviewer_id: str,
    active_grant: Mapping[str, Any] | None,
    prior_decision: Mapping[str, Any] | None,
    resumed_from_rejection: bool = False,
) -> dict[str, Any]:
    """Single policy authority used before approving or generating a minuta."""
    validate_four_eyes(
        submitter_id=submitter_id, reviewer_id=reviewer_id, required=four_eyes
    )
    require_active_legal_grant(
        active_grant,
        actor_id=reviewer_id,
        organization_id=str((active_grant or {}).get("organization_id") or ""),
        project_id=(active_grant or {}).get("project_id"),
    )
    rejected = (prior_decision or {}).get("status") == "rejected"
    approved = (prior_decision or {}).get("status") == "approved"
    may_inherit = (
        policy == "exceptions_only"
        and not four_eyes
        and not blocking_exceptions
        and approved_project_matriz_unchanged
        and not rejected
    )
    requires_human_review = policy == "every_sale" or four_eyes or not may_inherit
    may_generate = (approved and resumed_from_rejection) or may_inherit
    if policy == "every_sale" and not (approved and resumed_from_rejection):
        may_generate = False
    status = "rejected" if rejected else ("approved" if approved else "pending")
    return {
        "status": status,
        "reviewer_id": reviewer_id,
        "requires_human_review": requires_human_review,
        "may_inherit": may_inherit,
        "may_generate": may_generate,
        "may_deliver": may_generate,
        "durable_obligation_actionable": True,
    }
