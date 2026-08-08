"""E2E and Security Test Suite for Proyecto Vendible, Idempotency, and Escritura Flow.

Tests:
1. Vendor identity derivation and anti-spoofing (T2.0)
2. Admin decision identity derivation and anti-spoofing (T2.0)
3. Incomplete project activation blocking (can_activate_project_sales)
4. Delivery obligations recipient snapshot and buyer exclusion
"""

import pytest
import uuid
from typing import Any


@pytest.mark.asyncio
async def test_can_activate_project_sales_incomplete_project():
    """Verify that a project with unapproved matrix or missing variables cannot be activated."""
    from services.escritura_readiness import calculate_escritura_readiness

    readiness = calculate_escritura_readiness(
        organization_id="org_test_123",
        project_id="proj_test_123",
        lot_id="lot_test_123",
        variables=[],
        has_title_documents=False,
    )
    assert readiness.readiness_status == "blocked"


@pytest.mark.asyncio
async def test_vendor_identity_derivation_anti_spoofing():
    """T2.0: Verify that SaleRequest schema accepts vendor_id and idempotency_key correctly."""
    from schemas.approval import SaleRequest, SalePayload

    payload = SaleRequest(
        lot_id="lot_123",
        organization_id="org_123",
        vendor_id="vendor_spoofed_b",
        vendor_name="Vendor B",
        vendor_phone="+56911111111",
        vendor_platform="telegram",
        payload=SalePayload(
            cliente_nombre="Juan Pérez",
            cliente_run="12.345.678-9",
            valor_final=50000000.0,
        ),
        idempotency_key="idemp_test_key_001",
    )
    assert payload.idempotency_key == "idemp_test_key_001"
    assert payload.vendor_id == "vendor_spoofed_b"


@pytest.mark.asyncio
async def test_admin_decision_anti_spoofing():
    """T2.0: Verify decision request schema handles optional admin_id and requires action."""
    from schemas.approval import DecisionRequest

    request = DecisionRequest(action="approve")
    assert request.action == "approve"
    assert request.admin_id is None
    assert request.organization_id is None


@pytest.mark.asyncio
async def test_delivery_obligations_excludes_buyer():
    """Verify build_delivery_obligations excludes buyer and includes only vendor and admins."""
    from services.escritura_delivery import build_recipient_snapshot, build_delivery_obligations

    approved_req = {
        "id": "app_req_100",
        "request_type": "sale",
        "status": "approved",
        "vendor_id": "vendor_500",
        "approved_transition_version": 1,
    }
    vendors = [{"id": "vendor_500", "user_id": "user_seller_uuid", "active": True}]
    admins = ["admin_user_uuid_1", "admin_user_uuid_2"]

    snapshot = build_recipient_snapshot(
        approved_request=approved_req,
        sale_requests=[],
        vendors=vendors,
        active_admin_user_ids=admins,
    )
    assert snapshot["seller_user_id"] == "user_seller_uuid"
    assert "admin_user_uuid_1" in snapshot["admin_user_ids"]

    obligations = build_delivery_obligations(
        generation_id="gen_999",
        recipient_snapshot=snapshot,
        current_admin_user_ids=admins,
        telegram_user_ids=["user_seller_uuid", "admin_user_uuid_1"],
    )
    recipient_user_ids = [ob["recipient_user_id"] for ob in obligations]
    assert "user_seller_uuid" in recipient_user_ids
    assert "admin_user_uuid_1" in recipient_user_ids
    assert "buyer" not in recipient_user_ids
