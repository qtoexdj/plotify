"""Human notification copy for the venta -> escritura flow."""

from __future__ import annotations

from dataclasses import dataclass

from core.config import get_settings
from services.legal_microcopy import (
    admin_notification_label,
    flow_state_description,
    flow_state_label,
)


@dataclass(frozen=True)
class AdminNotificationCopy:
    title: str
    message: str
    action_label: str
    deep_link: str
    flow_state_label: str | None = None
    flow_state_description: str | None = None


def absolute_frontend_link(path: str) -> str:
    if path.startswith(("http://", "https://")):
        return path
    return f"{get_settings().FRONTEND_URL.rstrip('/')}/{path.lstrip('/')}"


def project_link(project_id: str | None) -> str:
    return f"/projects/{project_id}" if project_id else "/projects"


def case_mesa_link(escritura_case_id: str) -> str:
    return f"/documentos/matriz/{escritura_case_id}"


def project_matriz_link(project_id: str | None) -> str:
    return (
        f"/documentos/matriz/proyecto/{project_id}"
        if project_id
        else "/documentos"
    )


def sale_pending_validation_copy(
    *,
    project_id: str | None,
    lot_label: str,
    project_name: str,
    client_name: str,
) -> AdminNotificationCopy:
    return AdminNotificationCopy(
        title=admin_notification_label("sale_pending_validation"),
        message=(
            f"Revisa la venta de {lot_label} en {project_name} para validarla. "
            f"Cliente: {client_name}."
        ),
        action_label="Validar venta",
        deep_link=project_link(project_id),
    )


def draft_ready_for_review_copy(
    *,
    escritura_case_id: str,
    lot_label: str,
) -> AdminNotificationCopy:
    state = "draft_for_review"
    return AdminNotificationCopy(
        title=admin_notification_label("draft_ready_for_review"),
        message=(
            f"El borrador de escritura de {lot_label} está listo para revisión "
            "en la mesa."
        ),
        action_label="Abrir borrador",
        deep_link=case_mesa_link(escritura_case_id),
        flow_state_label=flow_state_label(state),
        flow_state_description=flow_state_description(state),
    )


def vendor_documents_link() -> str:
    return "/mis-documentos"


def vendor_draft_delivered_copy(*, lot_label: str) -> AdminNotificationCopy:
    """Aviso al vendedor: su borrador está entregado, con deep link a "mis
    documentos" (la superficie que jamás falla, FR-010). Vocabulario único."""
    state = "delivered"
    return AdminNotificationCopy(
        title=admin_notification_label("draft_delivered_to_vendor"),
        message=(
            f"El borrador de escritura de {lot_label} ya está disponible. "
            "Lo encuentras en Mis documentos para descargarlo o compartirlo."
        ),
        action_label="Ver mis documentos",
        deep_link=vendor_documents_link(),
        flow_state_label=flow_state_label(state),
        flow_state_description=flow_state_description(state),
    )


def waiting_project_matriz_copy(
    *,
    project_id: str | None,
    lot_label: str,
) -> AdminNotificationCopy:
    state = "waiting_project_matriz"
    return AdminNotificationCopy(
        title=admin_notification_label("waiting_project_matriz"),
        message=(
            f"La venta de {lot_label} está validada, pero falta aprobar la "
            "matriz del proyecto. El borrador se genera apenas quede aprobada."
        ),
        action_label="Abrir matriz del proyecto",
        deep_link=project_matriz_link(project_id),
        flow_state_label=flow_state_label(state),
        flow_state_description=flow_state_description(state),
    )
