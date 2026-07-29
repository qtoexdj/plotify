"""Cross-runtime RFC 8785 operation identity contract."""

from dataclasses import dataclass
from typing import Any, Literal
import hashlib
import json
import math
from datetime import date, datetime, timezone

IDEMPOTENCY_CONFLICT_NOT_IMPLEMENTED = "IDEMPOTENCY_CONFLICT_NOT_IMPLEMENTED"


@dataclass(frozen=True)
class UploadMetadata:
    filename: str
    content_type: str
    size: int
    sha256: str


@dataclass(frozen=True)
class OperationIdentity:
    operation_key: str
    request_hash: str
    scope: str


def canonicalize_jcs(value: Any) -> str:
    def serialize(item: Any) -> str:
        if item is None:
            return "null"
        if item is True:
            return "true"
        if item is False:
            return "false"
        if isinstance(item, str):
            return json.dumps(item, ensure_ascii=False, separators=(",", ":"))
        if isinstance(item, int):
            return str(item)
        if isinstance(item, float):
            if not math.isfinite(item):
                raise ValueError("JCS_NON_FINITE_NUMBER")
            if item == 0:
                return "0"
            if item.is_integer():
                return str(int(item))
            return json.dumps(item, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
        if isinstance(item, datetime):
            normalized = item.astimezone(timezone.utc).isoformat(timespec="milliseconds")
            return json.dumps(normalized.replace("+00:00", "Z"))
        if isinstance(item, date):
            return json.dumps(item.isoformat())
        if isinstance(item, (list, tuple)):
            return "[" + ",".join(serialize(entry) for entry in item) + "]"
        if isinstance(item, dict):
            if not all(isinstance(key, str) for key in item):
                raise TypeError("JCS_OBJECT_KEYS_MUST_BE_STRINGS")
            entries = (
                f"{json.dumps(key, ensure_ascii=False)}:{serialize(item[key])}"
                for key in sorted(item)
            )
            return "{" + ",".join(entries) + "}"
        raise TypeError("JCS_UNSUPPORTED_VALUE")

    return serialize(value)


def canonical_request_hash(value: Any) -> str:
    digest = hashlib.sha256(canonicalize_jcs(value).encode()).hexdigest()
    return f"sha256:{digest}"


def canonical_upload_metadata(
    raw_bytes: bytes, filename: str, content_type: str
) -> UploadMetadata:
    return UploadMetadata(
        filename=filename,
        content_type=content_type,
        size=len(raw_bytes),
        sha256=hashlib.sha256(raw_bytes).hexdigest(),
    )


def decide_replay(
    existing: OperationIdentity | None, incoming: OperationIdentity
) -> Literal["claim", "replay", "conflict"]:
    if existing is None or existing.operation_key != incoming.operation_key:
        return "claim"
    if existing.request_hash == incoming.request_hash and existing.scope == incoming.scope:
        return "replay"
    return "conflict"
