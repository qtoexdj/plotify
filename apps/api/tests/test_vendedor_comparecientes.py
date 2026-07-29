from uuid import UUID

import pytest

from services.matriz_semantic_validation import (
    LegalApprovalRequiredError,
    SellerFactResolutionError,
    SellerPersonMatchAmbiguousError,
    reconcile_compareciente_ids,
    resolve_compareciente_field,
)


def test_person_identity_survives_reorder_and_reanalysis() -> None:
    existing = [
        {"personId": "aaaaaaaa-aaaa-5aaa-8aaa-aaaaaaaaaaaa", "upstreamSubjectId": "owner-a", "normalizedRut": "11111111-1"},
        {"personId": "bbbbbbbb-bbbb-5bbb-8bbb-bbbbbbbbbbbb", "upstreamSubjectId": "owner-b", "normalizedRut": "22222222-2"},
    ]
    incoming = [
        {"upstreamSubjectId": "owner-b", "normalizedRut": "22222222-2"},
        {"upstreamSubjectId": "owner-a", "normalizedRut": "11111111-1"},
    ]
    result = reconcile_compareciente_ids(incoming, existing)
    assert [row["personId"] for row in result] == [existing[1]["personId"], existing[0]["personId"]]


def test_new_identity_is_uuid_and_ambiguous_match_fails_closed() -> None:
    [person] = reconcile_compareciente_ids([{"upstreamSubjectId": "owner-c"}], [])
    assert UUID(person["personId"])
    with pytest.raises(SellerPersonMatchAmbiguousError, match="SELLER_PERSON_MATCH_AMBIGUOUS"):
        reconcile_compareciente_ids([{"normalizedRut": "11111111-1"}], [
            {"personId": "aaaaaaaa-aaaa-5aaa-8aaa-aaaaaaaaaaaa", "normalizedRut": "11111111-1"},
            {"personId": "bbbbbbbb-bbbb-5bbb-8bbb-bbbbbbbbbbbb", "normalizedRut": "11111111-1"},
        ])


def test_manual_resolution_requires_grant_reason_attestation_and_version() -> None:
    person = {"personId": "a", "nacionalidad": {"value": None, "state": "missing", "version": 2}}
    grant = {"id": "grant-1", "active": True}
    resolved = resolve_compareciente_field(
        person=person, field="nacionalidad", value="chilena", expected_version=2,
        grant=grant, reason="Certificado revisado", attestation_ref="legal_document:1#page=2",
        reviewed_by="reviewer-1",
    )
    assert resolved["state"] == "manual_approved"
    assert resolved["version"] == 3
    with pytest.raises(LegalApprovalRequiredError, match="LEGAL_APPROVAL_REQUIRED"):
        resolve_compareciente_field(person=person, field="nacionalidad", value="chilena", expected_version=2, grant=None, reason="x", attestation_ref="x", reviewed_by="r")
    with pytest.raises(SellerFactResolutionError, match="SELLER_FACT_ATTESTATION_REQUIRED"):
        resolve_compareciente_field(person=person, field="nacionalidad", value="chilena", expected_version=2, grant=grant, reason="x", attestation_ref="", reviewed_by="r")
