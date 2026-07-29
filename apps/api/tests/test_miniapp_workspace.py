from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Any

import jwt
from fastapi import HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials

import core.database as database
import core.miniapp_session as miniapp_session
from core.config import get_settings


MINIAPP_WORKSPACE_GUARD_NOT_IMPLEMENTED = (
    "MINIAPP_WORKSPACE_GUARD_NOT_IMPLEMENTED"
)

ORG_A = str(uuid.UUID("00000000-0000-4000-8000-000000000101"))
ORG_B = str(uuid.UUID("00000000-0000-4000-8000-000000000102"))
ADMIN_A = str(uuid.UUID("00000000-0000-4000-8000-000000000201"))
SELLER_A = str(uuid.UUID("00000000-0000-4000-8000-000000000202"))
REVOKED_USER = str(uuid.UUID("00000000-0000-4000-8000-000000000203"))
MISMATCHED_USER = str(uuid.UUID("00000000-0000-4000-8000-000000000204"))
VENDOR_A = str(uuid.UUID("00000000-0000-4000-8000-000000000301"))


@dataclass
class _Result:
    data: Any


@dataclass
class _Query:
    rows: list[dict[str, Any]]
    filters: list[tuple[str, Any]] = field(default_factory=list)
    single_result: bool = False

    def select(self, *_columns: str, **_kwargs: Any) -> _Query:
        return self

    def eq(self, column: str, value: Any) -> _Query:
        self.filters.append((column, value))
        return self

    def limit(self, _count: int) -> _Query:
        return self

    def maybe_single(self) -> _Query:
        self.single_result = True
        return self

    def single(self) -> _Query:
        self.single_result = True
        return self

    def execute(self) -> _Result:
        matches = [
            dict(row)
            for row in self.rows
            if all(row.get(column) == value for column, value in self.filters)
        ]
        if self.single_result:
            return _Result(matches[0] if matches else None)
        return _Result(matches)


class _Supabase:
    def __init__(self, tables: dict[str, list[dict[str, Any]]]) -> None:
        self.tables = tables
        self.reads: list[str] = []

    def table(self, name: str) -> _Query:
        self.reads.append(name)
        return _Query(self.tables.get(name, []))


def _credentials(
    *,
    user_id: str,
    organization_id: str,
    role: str,
    vendor_id: str | None = None,
    expired: bool = False,
) -> HTTPAuthorizationCredentials:
    now = int(time.time())
    settings = get_settings()
    payload = {
        "sub": user_id,
        "org": organization_id,
        "role": role,
        "chat_id": 560001,
        "vendor_id": vendor_id,
        "iat": now - 120 if expired else now,
        "exp": now - 60 if expired else now + 600,
    }
    token = jwt.encode(payload, settings.MINIAPP_SESSION_SECRET, algorithm="HS256")
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


async def _record_valid(
    failures: list[str],
    name: str,
    credentials: HTTPAuthorizationCredentials,
    *,
    expected_role: str,
    expected_vendor_id: str | None,
) -> None:
    try:
        context = await miniapp_session.verify_miniapp_session(credentials)
    except HTTPException as error:
        failures.append(f"{name}: unexpected HTTP {error.status_code}")
        return

    if context.role != expected_role:
        failures.append(f"{name}: role was {context.role!r}")
    actual_vendor_id = str(context.vendor_id) if context.vendor_id else None
    if actual_vendor_id != expected_vendor_id:
        failures.append(f"{name}: vendor_id was {actual_vendor_id!r}")


async def _record_denied(
    failures: list[str],
    name: str,
    credentials: HTTPAuthorizationCredentials,
    *,
    expected_statuses: set[int],
) -> None:
    try:
        await miniapp_session.verify_miniapp_session(credentials)
    except HTTPException as error:
        if error.status_code not in expected_statuses:
            failures.append(f"{name}: unexpected HTTP {error.status_code}")
        return

    failures.append(f"{name}: stale session was accepted")


async def test_miniapp_workspace_guard_contract(monkeypatch) -> None:
    """A signed JWT is selection context, not durable workspace authority."""
    supabase = _Supabase(
        {
            "organization_members": [
                {"organization_id": ORG_A, "user_id": ADMIN_A, "role": "admin"},
                {"organization_id": ORG_A, "user_id": SELLER_A, "role": "user"},
                {
                    "organization_id": ORG_B,
                    "user_id": MISMATCHED_USER,
                    "role": "admin",
                },
            ],
            "vendors": [
                {
                    "id": VENDOR_A,
                    "organization_id": ORG_A,
                    "user_id": SELLER_A,
                    "active": True,
                }
            ],
        }
    )
    monkeypatch.setattr(database, "get_supabase_client", lambda: supabase)
    monkeypatch.setattr(
        miniapp_session,
        "get_supabase_client",
        lambda: supabase,
        raising=False,
    )

    failures: list[str] = []

    await _record_valid(
        failures,
        "active admin membership",
        _credentials(user_id=ADMIN_A, organization_id=ORG_A, role="admin"),
        expected_role="admin",
        expected_vendor_id=None,
    )
    await _record_valid(
        failures,
        "active seller membership",
        _credentials(
            user_id=SELLER_A,
            organization_id=ORG_A,
            role="vendor",
            vendor_id=VENDOR_A,
        ),
        expected_role="vendor",
        expected_vendor_id=VENDOR_A,
    )
    await _record_denied(
        failures,
        "workspace mismatch",
        _credentials(
            user_id=MISMATCHED_USER,
            organization_id=ORG_A,
            role="admin",
        ),
        expected_statuses={status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN},
    )
    await _record_denied(
        failures,
        "revoked membership",
        _credentials(
            user_id=REVOKED_USER,
            organization_id=ORG_A,
            role="admin",
        ),
        expected_statuses={status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN},
    )
    await _record_denied(
        failures,
        "expired session",
        _credentials(
            user_id=ADMIN_A,
            organization_id=ORG_A,
            role="admin",
            expired=True,
        ),
        expected_statuses={status.HTTP_401_UNAUTHORIZED},
    )

    assert not failures, (
        f"{MINIAPP_WORKSPACE_GUARD_NOT_IMPLEMENTED}: " + "; ".join(failures)
    )
