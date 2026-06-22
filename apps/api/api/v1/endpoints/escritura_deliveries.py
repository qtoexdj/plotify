"""SDD 011 T017: "mis documentos del vendedor" (FR-011 / SC-005).

Lista las entregas del vendedor autenticado y le permite renovar un enlace
vencido. La identidad llega por cabeceras puestas por el backend web (sesión
autenticada), nunca por el navegador; la consulta filtra por organización y por
vendedor destinatario, así que un vendedor jamás ve documentos de ventas ajenas.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, status

from api.deps import verify_internal_secret
from core.database import get_supabase_client
from core.logger import get_logger
from schemas.escritura_matrices import (
    EscrituraDeliveryListResponse,
    EscrituraDeliveryView,
)
from services.escritura_delivery import list_vendor_deliveries, renew_delivery_link

logger = get_logger(__name__)

router = APIRouter(
    tags=["escritura-deliveries"],
    dependencies=[Depends(verify_internal_secret)],
)


def _validate_ids(user_id: str, organization_id: str) -> None:
    try:
        UUID(user_id)
        UUID(organization_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user or organization id.",
        ) from exc


@router.get(
    "/escritura-deliveries/mine",
    response_model=EscrituraDeliveryListResponse,
)
async def list_my_deliveries(
    x_user_id: str = Header(..., alias="X-User-Id"),
    x_organization_id: str = Header(..., alias="X-Organization-Id"),
) -> EscrituraDeliveryListResponse:
    _validate_ids(x_user_id, x_organization_id)
    client = get_supabase_client()
    deliveries = await list_vendor_deliveries(
        client,
        recipient_user_id=x_user_id,
        organization_id=x_organization_id,
    )
    return EscrituraDeliveryListResponse.model_validate({"deliveries": deliveries})


@router.post(
    "/escritura-deliveries/{delivery_id}/renew",
    response_model=EscrituraDeliveryView,
)
async def renew_my_delivery_link(
    delivery_id: UUID,
    x_user_id: str = Header(..., alias="X-User-Id"),
    x_organization_id: str = Header(..., alias="X-Organization-Id"),
) -> EscrituraDeliveryView:
    _validate_ids(x_user_id, x_organization_id)
    client = get_supabase_client()
    view = await renew_delivery_link(
        client,
        delivery_id=str(delivery_id),
        recipient_user_id=x_user_id,
        organization_id=x_organization_id,
    )
    if view is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Delivery not found for this vendor.",
        )
    return EscrituraDeliveryView.model_validate(view)
