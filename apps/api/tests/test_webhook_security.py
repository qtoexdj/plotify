"""Webhook authentication, replay identity, binding, and redaction contracts."""

import hashlib
import hmac

from core.webhook_security import (
    provider_event_key,
    redact_webhook_log,
    telegram_webhook_authorized,
    verify_meta_signature,
)


def test_meta_hmac_uses_exact_raw_body_and_constant_time_comparison_contract():
    raw = b'{"entry": [{"id": "1"}]}'
    signature = "sha256=" + hmac.new(b"meta-secret", raw, hashlib.sha256).hexdigest()
    assert verify_meta_signature(raw, signature, "meta-secret")
    assert not verify_meta_signature(raw + b" ", signature, "meta-secret")
    assert not verify_meta_signature(raw, None, "meta-secret")


def test_telegram_is_fail_closed_in_production_and_bound_to_tenant():
    base = {
        "production": True,
        "expected_secret": "telegram-secret",
        "provided_secret": "telegram-secret",
        "route_organization_id": "org-a",
        "bot_organization_id": "org-a",
    }
    assert telegram_webhook_authorized(**base)
    assert not telegram_webhook_authorized(**(base | {"provided_secret": None}))
    assert not telegram_webhook_authorized(**(base | {"expected_secret": ""}))
    assert not telegram_webhook_authorized(
        **(base | {"bot_organization_id": "org-attacker"})
    )


def test_provider_replay_key_is_stable_scoped_and_payload_logs_are_redacted():
    first = provider_event_key("telegram", "bot-a", "update-1")
    assert first == provider_event_key("telegram", "bot-a", "update-1")
    assert first != provider_event_key("telegram", "bot-b", "update-1")
    assert first.startswith("sha256:")
    redacted = redact_webhook_log(
        {
            "token": "secret",
            "phone": "+56912345678",
            "message_text": "private message",
            "event_id": "update-1",
        }
    )
    serialized = repr(redacted)
    assert "secret" not in serialized
    assert "+56912345678" not in serialized
    assert "private message" not in serialized
    assert redacted["event_id"] == "update-1"
