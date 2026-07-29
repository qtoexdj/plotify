"""Shared release-control contract for API and worker runtimes (SDD019)."""

from dataclasses import dataclass
from typing import Literal, Mapping

API_SECURITY_FOUNDATION_NOT_IMPLEMENTED = "API_SECURITY_FOUNDATION_NOT_IMPLEMENTED"

FeatureKey = Literal[
    "automatic_escritura",
    "canonical_geometry_import",
    "document_capabilities",
]
RolloutMode = Literal["off", "projects", "on"]

HARD_OFF_ENV_BY_FEATURE: dict[FeatureKey, str] = {
    "automatic_escritura": "PLOTIFY_HARD_OFF_AUTOMATIC_ESCRITURA",
    "canonical_geometry_import": "PLOTIFY_HARD_OFF_CANONICAL_GEOMETRY_IMPORT",
    "document_capabilities": "PLOTIFY_HARD_OFF_DOCUMENT_CAPABILITIES",
}


@dataclass(frozen=True)
class RolloutControl:
    organization_id: str
    mode: RolloutMode
    version: int
    project_ids: tuple[str, ...] = ()


@dataclass(frozen=True)
class EffectiveRollout:
    enabled: bool
    mode: RolloutMode
    version: int | None
    reason: str


def parse_hard_off(value: str | None) -> bool:
    """Return the fail-closed hard-off value for an environment string."""
    return value != "false"


def parse_hard_off_environment(
    environment: Mapping[str, str | None],
) -> dict[FeatureKey, bool]:
    return {
        feature: parse_hard_off(environment.get(variable))
        for feature, variable in HARD_OFF_ENV_BY_FEATURE.items()
    }


def resolve_feature_rollout(
    *,
    feature_key: FeatureKey,
    organization_id: str,
    project_id: str | None,
    control: RolloutControl | None,
    control_read_error: bool = False,
    hard_off: bool = True,
) -> EffectiveRollout:
    del feature_key
    version = control.version if control else None
    if hard_off:
        return EffectiveRollout(False, "off", version, "hard_off")
    if control_read_error:
        return EffectiveRollout(False, "off", version, "read_error")
    if not control:
        return EffectiveRollout(False, "off", None, "missing")
    if control.organization_id != organization_id or control.mode == "off":
        return EffectiveRollout(False, "off", version, "off")
    if control.mode == "on":
        return EffectiveRollout(True, "on", version, "on")
    if project_id and project_id in control.project_ids:
        return EffectiveRollout(True, "projects", version, "project")
    return EffectiveRollout(False, "off", version, "off")
