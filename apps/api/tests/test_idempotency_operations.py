"""Python consumer for the shared JCS/idempotency contract vectors."""

import json
from pathlib import Path

from services.idempotency_operations import (
    OperationIdentity,
    canonical_request_hash,
    canonical_upload_metadata,
    canonicalize_jcs,
    decide_replay,
)

VECTORS = json.loads(
    (
        Path(__file__).resolve().parents[3]
        / "specs/019-hardening-produccion/contracts/idempotency-jcs-vectors.json"
    ).read_text()
)


def test_shared_canonicalization_vectors():
    for vector in VECTORS["canonicalization"]:
        assert canonicalize_jcs(vector["input"]) == vector["canonical"], vector["name"]


def test_null_is_distinct_from_omission():
    vector = VECTORS["nullAndOmission"]
    assert canonicalize_jcs(vector["withNull"]) == vector["canonicalWithNull"]
    assert canonicalize_jcs(vector["withoutOptional"]) == vector["canonicalWithoutOptional"]


def test_canonical_hash_is_independent_of_object_insertion_order():
    assert canonical_request_hash({"a": 2, "z": 1}) == canonical_request_hash(
        {"z": 1, "a": 2}
    )


def test_upload_metadata_hashes_raw_bytes():
    upload = VECTORS["upload"]
    metadata = canonical_upload_metadata(
        upload["utf8"].encode(), upload["filename"], upload["contentType"]
    )
    assert metadata.size == upload["size"]
    assert metadata.sha256 == upload["sha256"]


def test_replay_requires_same_hash_and_scope():
    identity = OperationIdentity("op-1", "sha256:abc", "org:org-a/project:project-a")
    assert decide_replay(None, identity) == "claim"
    assert decide_replay(identity, identity) == "replay"
    assert decide_replay(
        identity, OperationIdentity("op-1", "sha256:changed", identity.scope)
    ) == "conflict"
    assert decide_replay(
        identity, OperationIdentity("op-1", identity.request_hash, "org:org-b")
    ) == "conflict"
