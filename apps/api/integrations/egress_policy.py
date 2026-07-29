"""Shared fail-closed policy for outbound HTTP adapters."""

from __future__ import annotations

import ipaddress
from urllib.parse import urlsplit


total_timeout_seconds = 10.0


def validate_destination(
    value: str,
    *,
    allowed_hosts: frozenset[str],
    allowed_path_prefixes: tuple[str, ...] = ("/",),
) -> str:
    parsed = urlsplit(value)
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or host not in allowed_hosts:
        raise ValueError("EGRESS_DESTINATION_DENIED")
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        address = None
    if address and (address.is_private or address.is_loopback or address.is_link_local):
        raise ValueError("EGRESS_DESTINATION_DENIED")
    if not any(parsed.path.startswith(prefix) for prefix in allowed_path_prefixes):
        raise ValueError("EGRESS_PATH_DENIED")
    if parsed.username or parsed.password or parsed.fragment:
        raise ValueError("EGRESS_DESTINATION_DENIED")
    return value


def guarded_client_options() -> dict[str, object]:
    """Deny redirects and cap the entire provider attempt at ten seconds."""
    return {"timeout": total_timeout_seconds, "follow_redirects": False}
