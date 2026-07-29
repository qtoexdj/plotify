"""Strict runtime security and attestation contracts for SDD019."""

from dataclasses import dataclass
from datetime import datetime
from typing import Literal, Mapping, Sequence
from urllib.parse import urlparse

API_SECURITY_FOUNDATION_NOT_IMPLEMENTED = "API_SECURITY_FOUNDATION_NOT_IMPLEMENTED"


@dataclass(frozen=True)
class RuntimeSecurityValidation:
    valid: bool
    issues: tuple[str, ...]


@dataclass(frozen=True)
class RuntimeAttestation:
    environment_fingerprint: str
    deployment_id: str
    runtime_role: Literal["api", "worker"]
    slot_id: str
    instance_id: str
    release_sha: str
    artifact_digest: str
    config_version: str
    hard_off_fingerprint: str
    lifecycle: Literal["active", "retired"]
    heartbeat_at: datetime
    retired_at: datetime | None = None


def validate_runtime_security(
    *,
    environment: str,
    secrets: Mapping[str, str | None],
    remote_base_urls: Mapping[str, str | None],
    allowed_remote_hosts: Sequence[str],
) -> RuntimeSecurityValidation:
    if environment != "production":
        return RuntimeSecurityValidation(True, ())
    issues: list[str] = []
    placeholders = ("default", "change-me", "changeme", "placeholder", "test-secret")
    for key, value in secrets.items():
        normalized = (value or "").strip().lower()
        if not normalized or any(marker in normalized for marker in placeholders):
            issues.append(f"{key}: unsafe production secret")
    for key, value in remote_base_urls.items():
        parsed = urlparse(value or "")
        if parsed.scheme != "https" or not parsed.hostname or parsed.hostname not in allowed_remote_hosts:
            issues.append(f"{key}: unsafe or unallowlisted remote URL")
    return RuntimeSecurityValidation(not issues, tuple(issues))


def build_runtime_attestation(
    *,
    environment_fingerprint: str,
    deployment_id: str,
    runtime_role: Literal["api", "worker"],
    slot_id: str,
    instance_id: str,
    release_sha: str,
    artifact_digest: str,
    config_version: str,
    hard_off_fingerprint: str,
    heartbeat_at: datetime | None = None,
) -> RuntimeAttestation:
    return RuntimeAttestation(
        environment_fingerprint=environment_fingerprint,
        deployment_id=deployment_id,
        runtime_role=runtime_role,
        slot_id=slot_id,
        instance_id=instance_id,
        release_sha=release_sha,
        artifact_digest=artifact_digest,
        config_version=config_version,
        hard_off_fingerprint=hard_off_fingerprint,
        lifecycle="active",
        heartbeat_at=heartbeat_at or datetime.now().astimezone(),
    )


def validate_attestation_transition(
    previous: RuntimeAttestation, next_attestation: RuntimeAttestation
) -> RuntimeSecurityValidation:
    issues: list[str] = []
    for field in (
        "environment_fingerprint",
        "deployment_id",
        "runtime_role",
        "slot_id",
        "instance_id",
        "release_sha",
        "artifact_digest",
    ):
        if getattr(previous, field) != getattr(next_attestation, field):
            issues.append(f"{field} is immutable")
    if previous.lifecycle == "retired":
        if next_attestation.lifecycle != "retired":
            issues.append("retirement is terminal")
        if next_attestation.heartbeat_at != previous.heartbeat_at:
            issues.append("retired instance cannot heartbeat")
    elif next_attestation.lifecycle == "retired" and next_attestation.retired_at is None:
        issues.append("retirement requires retired_at")
    if next_attestation.heartbeat_at < previous.heartbeat_at:
        issues.append("heartbeat cannot move backwards")
    return RuntimeSecurityValidation(not issues, tuple(issues))
