"""Production runtime configuration and attestation contracts."""

from dataclasses import replace
from datetime import UTC, datetime

import pytest

from core.runtime_security import (
    build_runtime_attestation,
    validate_attestation_transition,
    validate_runtime_security,
)


REQUIRED_SECRETS = {
    "INTERNAL_API_SECRET": "a-secure-internal-value",
    "MINIAPP_SESSION_SECRET": "a-secure-session-value",
    "TELEGRAM_WEBHOOK_SECRET": "a-secure-telegram-value",
    "META_APP_SECRET": "a-secure-meta-value",
    "DB_ENCRYPTION_KEY": "a-secure-encryption-value",
}


@pytest.mark.parametrize("bad_value", [None, "", "change-me", "placeholder", "test-secret"])
def test_production_rejects_blank_default_or_placeholder_secrets(bad_value):
    secrets = REQUIRED_SECRETS | {"MINIAPP_SESSION_SECRET": bad_value}
    result = validate_runtime_security(
        environment="production",
        secrets=secrets,
        remote_base_urls={"API_PUBLIC_URL": "https://api.plotify.example"},
        allowed_remote_hosts=("api.plotify.example",),
    )
    assert result.valid is False
    assert "MINIAPP_SESSION_SECRET" in " ".join(result.issues)


@pytest.mark.parametrize(
    "url", ["http://api.plotify.example", "https://evil.example", "javascript:alert(1)"]
)
def test_production_rejects_unsafe_or_unallowlisted_remote_urls(url):
    result = validate_runtime_security(
        environment="production",
        secrets=REQUIRED_SECRETS,
        remote_base_urls={"API_PUBLIC_URL": url},
        allowed_remote_hosts=("api.plotify.example",),
    )
    assert result.valid is False


def test_attestation_identity_is_immutable_and_retirement_is_terminal():
    now = datetime.now(UTC)
    active = build_runtime_attestation(
        environment_fingerprint="env-sha256",
        deployment_id="deploy-1",
        runtime_role="api",
        slot_id="api-1",
        instance_id="instance-1",
        release_sha="a" * 40,
        artifact_digest="sha256:" + "b" * 64,
        config_version="7",
        hard_off_fingerprint="sha256:" + "c" * 64,
        heartbeat_at=now,
    )
    assert active.lifecycle == "active"
    assert validate_attestation_transition(active, replace(active, heartbeat_at=now)).valid
    assert not validate_attestation_transition(
        active, replace(active, artifact_digest="sha256:" + "d" * 64)
    ).valid
    retired = replace(active, lifecycle="retired", retired_at=now)
    assert validate_attestation_transition(active, retired).valid
    assert not validate_attestation_transition(retired, active).valid
