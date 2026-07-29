"""Shared API/worker rollout contract (RED in T011, green in T017)."""

import pytest

from core.release_flags import (
    RolloutControl,
    parse_hard_off,
    parse_hard_off_environment,
    resolve_feature_rollout,
)


@pytest.mark.parametrize("value", [None, "", "TRUE", "false ", "1", "yes", "garbage"])
def test_missing_or_noncanonical_hard_off_is_enabled(value):
    assert parse_hard_off(value) is True


def test_only_canonical_false_disables_hard_off():
    assert parse_hard_off("false") is False
    assert parse_hard_off("true") is True


def test_hard_off_environment_uses_exact_three_keys():
    state = parse_hard_off_environment(
        {
            "PLOTIFY_HARD_OFF_AUTOMATIC_ESCRITURA": "false",
            "PLOTIFY_HARD_OFF_CANONICAL_GEOMETRY_IMPORT": "true",
            "PLOTIFY_HARD_OFF_DOCUMENT_CAPABILITIES": "false",
        }
    )
    assert state == {
        "automatic_escritura": False,
        "canonical_geometry_import": True,
        "document_capabilities": False,
    }


def test_rollout_fails_closed_and_requires_matching_scope():
    control = RolloutControl("org-a", "projects", 4, ("project-a",))
    enabled = resolve_feature_rollout(
        feature_key="document_capabilities",
        organization_id="org-a",
        project_id="project-a",
        control=control,
        hard_off=False,
    )
    assert enabled.enabled is True
    assert enabled.reason == "project"

    for kwargs in (
        {"control": None},
        {"control": control, "control_read_error": True},
        {"control": control, "hard_off": True},
        {"control": control, "organization_id": "org-b"},
        {"control": control, "project_id": "project-b"},
    ):
        base = {
            "feature_key": "document_capabilities",
            "organization_id": "org-a",
            "project_id": "project-a",
            "control": control,
            "hard_off": False,
        }
        result = resolve_feature_rollout(**(base | kwargs))
        assert result.enabled is False
