"""Contract tests for SDD 007 US2 legal variable inventory responses."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from schemas.legal_variables import (
    DocumentEvidenceResponse,
    VariableInventoryResponse,
    VariableResolutionResponse,
)
from services.legal_variable_catalog import VARIABLE_STATES


ORG_ID = "00000000-0000-4000-8000-000000000001"
PROJECT_ID = "00000000-0000-4000-8000-000000000002"
VARIABLE_ID = "00000000-0000-4000-8000-000000000003"
DOCUMENT_ID = "00000000-0000-4000-8000-000000000004"
PAGE_ID = "00000000-0000-4000-8000-000000000005"
EVIDENCE_ID = "00000000-0000-4000-8000-000000000006"


def test_variable_inventory_response_matches_grouped_contract_shape():
    evidence = DocumentEvidenceResponse.model_validate(
        {
            "id": EVIDENCE_ID,
            "organization_id": ORG_ID,
            "project_id": PROJECT_ID,
            "variable_resolution_id": VARIABLE_ID,
            "legal_document_id": DOCUMENT_ID,
            "legal_document_page_id": PAGE_ID,
            "chunk_index": 0,
            "snippet": "inscrita a fojas 4699 numero 3784",
            "snippet_hash": "a" * 64,
            "confidence": 0.92,
        }
    )
    variable = VariableResolutionResponse.model_validate(
        {
            "id": VARIABLE_ID,
            "organization_id": ORG_ID,
            "project_id": PROJECT_ID,
            "variable_key": "matriz.rol_avaluo",
            "variable_group": "matriz",
            "value_text": "4699",
            "value_json": None,
            "state": "proposed",
            "source_type": "document",
            "source_ref": {"document_type": "dominio_vigente"},
            "confidence": 0.92,
            "extractor_name": "dominio_vigente_rules_v1",
            "approval_required": True,
            "evidence": [evidence],
        }
    )

    inventory = VariableInventoryResponse.model_validate(
        {
            "project_id": PROJECT_ID,
            "lot_id": None,
            "groups": {"matriz": [variable]},
            "summary": {
                "total": 1,
                "approved": 0,
                "proposed": 1,
                "missing": 0,
                "conflict": 0,
                "manual_review": 0,
            },
        }
    )

    payload = inventory.model_dump(mode="json")

    assert set(payload) == {"project_id", "lot_id", "groups", "summary"}
    assert payload["project_id"] == PROJECT_ID
    assert payload["lot_id"] is None
    assert payload["summary"] == {"total": 1, **{state: 0 for state in VARIABLE_STATES}, "proposed": 1}
    assert payload["groups"]["matriz"][0]["variable_key"] == "matriz.rol_avaluo"
    assert payload["groups"]["matriz"][0]["state"] == "proposed"
    assert payload["groups"]["matriz"][0]["source_type"] == "document"
    assert payload["groups"]["matriz"][0]["confidence"] == 0.92
    assert payload["groups"]["matriz"][0]["evidence"] == [
        {
            "id": EVIDENCE_ID,
            "organization_id": ORG_ID,
            "project_id": PROJECT_ID,
            "variable_resolution_id": VARIABLE_ID,
            "legal_document_id": DOCUMENT_ID,
            "legal_document_page_id": PAGE_ID,
            "chunk_index": 0,
            "snippet": "inscrita a fojas 4699 numero 3784",
            "snippet_hash": "a" * 64,
            "bbox": None,
            "confidence": 0.92,
            "created_at": None,
        }
    ]


@pytest.mark.parametrize(
    ("model", "payload"),
    (
        (
            DocumentEvidenceResponse,
            {
                "id": EVIDENCE_ID,
                "organization_id": ORG_ID,
                "project_id": PROJECT_ID,
                "variable_resolution_id": VARIABLE_ID,
                "legal_document_id": DOCUMENT_ID,
                "snippet_hash": "a" * 64,
                "confidence": 1.5,
            },
        ),
        (
            VariableResolutionResponse,
            {
                "id": VARIABLE_ID,
                "organization_id": ORG_ID,
                "project_id": PROJECT_ID,
                "variable_key": "matriz.rol_avaluo",
                "variable_group": "matriz",
                "state": "proposed",
                "source_type": "document",
                "confidence": -0.1,
            },
        ),
    ),
)
def test_variable_inventory_contract_rejects_confidence_outside_zero_to_one(
    model,
    payload: dict[str, object],
):
    with pytest.raises(ValidationError):
        model.model_validate(payload)
