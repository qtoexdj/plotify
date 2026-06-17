"""SDD 011 T003: contratos Pydantic aditivos para matriz de proyecto y entrega.

Cubre: scope proyecto (`escritura_case_id` opcional), traza del borrador
instanciado (`source_project_matriz_id`) y los contratos de entrega — incluida
la garantia de que el `link_token` crudo jamas viaja en la respuesta.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from schemas.escritura_matrices import (
    DeliverDraftRequest,
    EscrituraDeliveryListResponse,
    EscrituraDeliveryView,
    MatrizTemplateRef,
    MatrizView,
    RenewDeliveryLinkRequest,
)


def _template_ref() -> MatrizTemplateRef:
    return MatrizTemplateRef(id=uuid.uuid4(), name="Compraventa", version=1)


def test_project_scope_matriz_allows_null_case() -> None:
    """Matriz del proyecto: escritura_case_id NULL, scope 'project'."""
    matriz = MatrizView(
        id=uuid.uuid4(),
        escritura_case_id=None,
        project_id=uuid.uuid4(),
        status="approved",
        version=1,
        scope="project",
        template=_template_ref(),
    )
    assert matriz.escritura_case_id is None
    assert matriz.scope == "project"
    assert matriz.source_project_matriz_id is None


def test_lot_draft_tracks_source_project_matriz() -> None:
    """Borrador del lote: instanciado desde la matriz de proyecto (FR-012)."""
    source = uuid.uuid4()
    matriz = MatrizView(
        id=uuid.uuid4(),
        escritura_case_id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        status="draft",
        version=2,
        scope="lot",
        source_project_matriz_id=source,
        template=_template_ref(),
    )
    assert matriz.scope == "lot"
    assert matriz.source_project_matriz_id == source


def test_matriz_view_defaults_to_lot_scope() -> None:
    """Construccion legacy (sin scope) sigue siendo lote: aditividad."""
    matriz = MatrizView(
        id=uuid.uuid4(),
        escritura_case_id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        status="draft",
        version=1,
        template=_template_ref(),
    )
    assert matriz.scope == "lot"


def test_delivery_view_never_exposes_link_token() -> None:
    """El link_token crudo jamas viaja en el contrato de respuesta (secreto)."""
    view = EscrituraDeliveryView.model_validate(
        {
            "id": str(uuid.uuid4()),
            "escritura_case_id": str(uuid.uuid4()),
            "generation_id": str(uuid.uuid4()),
            "recipient_user_id": str(uuid.uuid4()),
            "channel": "telegram",
            "status": "sent",
            "link_token": "super-secret-token",  # debe ser descartado
            "link_expires_at": datetime.now(timezone.utc).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    assert not hasattr(view, "link_token")
    assert "link_token" not in view.model_dump()
    assert view.channel == "telegram"
    assert view.status == "sent"


def test_delivery_rejects_unknown_channel_and_status() -> None:
    base = {
        "id": str(uuid.uuid4()),
        "escritura_case_id": str(uuid.uuid4()),
        "generation_id": str(uuid.uuid4()),
        "channel": "telegram",
        "status": "sent",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    with pytest.raises(ValidationError):
        EscrituraDeliveryView.model_validate({**base, "channel": "whatsapp"})
    with pytest.raises(ValidationError):
        EscrituraDeliveryView.model_validate({**base, "status": "delivered"})


def test_delivery_list_defaults_empty() -> None:
    assert EscrituraDeliveryListResponse().deliveries == []


def test_deliver_request_defaults_both_channels() -> None:
    req = DeliverDraftRequest()
    assert req.channels == ["telegram", "web"]
    assert req.recipient_user_id is None


def test_renew_link_request_requires_requested_by() -> None:
    with pytest.raises(ValidationError):
        RenewDeliveryLinkRequest()
    ok = RenewDeliveryLinkRequest(requested_by=uuid.uuid4())
    assert ok.requested_by is not None
