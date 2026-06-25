from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


SkillValidationStatus = Literal["draft", "valid", "blocked"]
SkillVersionStatus = Literal["draft", "valid", "blocked", "published", "superseded"]


class SkillValidationError(BaseModel):
    code: str
    message: str
    field: str | None = None


class SkillValidationRequest(BaseModel):
    organization_id: str
    skill_id: str | None = None
    slug: str = Field(..., min_length=2, max_length=80)
    definition_markdown: str = Field(..., max_length=20_000)
    requires_role: list[str] = Field(default_factory=list)
    approved_tool_slugs: list[str] = Field(default_factory=list)
    requires_mcp: bool = False
    mcp_provider: str | None = None


class SkillValidationResponse(BaseModel):
    status: Literal["valid", "blocked"]
    normalized_slug: str
    approved_tool_slugs: list[str]
    errors: list[SkillValidationError] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class CustomSkillSaveRequest(BaseModel):
    organization_id: str
    slug: str = Field(..., min_length=2, max_length=80)
    name: str = Field(..., min_length=2, max_length=120)
    description: str = Field(..., min_length=2, max_length=500)
    definition_markdown: str = Field(..., max_length=20_000)
    requires_role: list[str] = Field(default_factory=list)
    approved_tool_slugs: list[str] = Field(default_factory=list)
    requires_mcp: bool = False
    mcp_provider: str | None = None
    change_summary: str | None = Field(default=None, max_length=500)


class CustomSkillPublishRequest(BaseModel):
    organization_id: str
    skill_id: str
    change_summary: str | None = Field(default=None, max_length=500)


class SkillVersionResponse(BaseModel):
    id: str
    skill_id: str
    organization_id: str | None = None
    version: int
    definition_markdown: str
    tool_definition: dict
    approved_tool_slugs: list[str]
    requires_role: list[str]
    validation_status: SkillVersionStatus
    validation_errors: list[SkillValidationError] = Field(default_factory=list)
    created_by: str | None = None
    change_summary: str | None = None
    created_at: str


class CustomSkillResponse(BaseModel):
    id: str
    organization_id: str
    slug: str
    name: str
    description: str
    definition_markdown: str
    approved_tool_slugs: list[str]
    requires_role: list[str]
    current_version: int
    validation_status: SkillValidationStatus
    validation_errors: list[SkillValidationError] = Field(default_factory=list)
    requires_mcp: bool = False
    mcp_provider: str | None = None
    updated_at: str | None = None
