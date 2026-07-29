"""Public request/response contract scaffold for external escritura signatures."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class EscrituraSignatureRequest(BaseModel):
    """Accepted private evidence for a signature completed outside Plotify."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    generation_id: UUID = Field(alias="generationId")
    evidence_file_id: UUID = Field(alias="evidenceFileId")
    signed_at: datetime = Field(alias="signedAt")
    reason: str = Field(min_length=1, max_length=2000)
    operation_key: str = Field(alias="operationKey", min_length=1, max_length=255)


class EscrituraSignatureResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    event_id: UUID = Field(alias="eventId")
    escritura_case_id: UUID = Field(alias="caseId")
    generation_id: UUID = Field(alias="generationId")
    evidence_file_id: UUID = Field(alias="evidenceFileId")
    signature_status: Literal["recorded"] = Field(alias="signatureStatus")
    signed_at: datetime = Field(alias="signedAt")
