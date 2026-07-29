import json
from pathlib import Path


FIXTURE = Path(__file__).parent / "fixtures/sdd019/semantic_cases.json"
SEM_CODES = {
    "SEM_UNRESOLVED_TOKEN",
    "SEM_MISSING_REQUIRED",
    "SEM_PLACEHOLDER_LITERAL",
    "SEM_FILLER_LINE",
    "SEM_EMPTY_GRAMMAR_UNIT",
    "SEM_ORPHAN_CONNECTOR",
    "SEM_ORPHAN_PUNCTUATION",
    "SEM_DUPLICATE_CLAUSE",
    "SEM_FACT_MISMATCH",
    "SEM_MISSING_EVIDENCE",
    "SEM_PROVENANCE_INCOMPLETE",
    "SEM_ARTIFACT_HASH_MISMATCH",
}


def test_fixture_covers_every_stable_semantic_code_without_pii() -> None:
    payload = json.loads(FIXTURE.read_text())
    cases = payload["cases"]
    codes = {case.get("expectedIssueCode") for case in cases} - {None}
    assert codes == SEM_CODES
    assert payload["schemaVersion"] == "semantic/1"
    assert all("containsPII" not in case or case["containsPII"] is False for case in cases)


def test_only_intentionally_defective_input_contains_nationality_placeholder() -> None:
    payload = json.loads(FIXTURE.read_text())
    encoded = [json.dumps(case, ensure_ascii=False) for case in payload["cases"]]
    containing = [case for case, raw in zip(payload["cases"], encoded) if "[NACIONALIDAD]" in raw]
    assert [case["id"] for case in containing] == ["literal-placeholder"]
    assert containing[0]["expectedIssueCode"] == "SEM_PLACEHOLDER_LITERAL"


def test_structured_seller_cases_bind_stable_identity_and_manual_authority() -> None:
    payload = json.loads(FIXTURE.read_text())
    assert payload["identityCases"][0]["expected"] == "stable"
    assert payload["identityCases"][1]["expected"] == "SELLER_PERSON_MATCH_AMBIGUOUS"
    manual = {case["id"]: case for case in payload["manualResolutionCases"]}
    assert manual["approved-nationality"]["grantActive"] is True
    assert manual["missing-grant"]["expected"] == "LEGAL_APPROVAL_REQUIRED"
    assert manual["missing-attestation"]["expected"] == "SELLER_FACT_ATTESTATION_REQUIRED"
