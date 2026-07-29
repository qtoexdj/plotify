"""Provider-neutral webhook authentication, replay, and logging helpers."""

from typing import Any, Mapping
import hashlib
import hmac

API_SECURITY_FOUNDATION_NOT_IMPLEMENTED = "API_SECURITY_FOUNDATION_NOT_IMPLEMENTED"


def verify_meta_signature(raw_body: bytes, signature_header: str | None, secret: str) -> bool:
    if not signature_header or not secret or not signature_header.startswith("sha256="):
        return False
    expected = "sha256=" + hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header)


def provider_event_key(provider: str, account_id: str, event_id: str) -> str:
    identity = "|".join((provider, account_id, event_id)).encode()
    return "sha256:" + hashlib.sha256(identity).hexdigest()


def telegram_webhook_authorized(
    *,
    production: bool,
    expected_secret: str | None,
    provided_secret: str | None,
    route_organization_id: str,
    bot_organization_id: str | None,
) -> bool:
    if route_organization_id != bot_organization_id:
        return False
    if production and not expected_secret:
        return False
    if expected_secret:
        return bool(provided_secret) and hmac.compare_digest(expected_secret, provided_secret)
    return not production


def redact_webhook_log(payload: Mapping[str, Any]) -> dict[str, Any]:
    prohibited = {
        "token",
        "secret",
        "authorization",
        "phone",
        "phone_number",
        "message_text",
        "text",
        "payload",
        "body",
        "chat_id",
    }
    return {
        key: "[REDACTED]" if key.lower() in prohibited else value
        for key, value in payload.items()
    }
