"""SDD 011 T013: copy de notificacion al administrador (FR-009).

Verifica que cada aviso del flujo venta -> escritura lleve su deep link a la
superficie correcta y el vocabulario del diccionario unico (sin jerga cruda).
"""

from __future__ import annotations

from services.escritura_notifications import (
    case_mesa_link,
    draft_ready_for_review_copy,
    project_link,
    project_matriz_link,
    sale_pending_validation_copy,
    vendor_documents_link,
    vendor_draft_delivered_copy,
    waiting_project_matriz_copy,
)
from services.legal_microcopy import admin_notification_label, flow_state_label


def test_sale_pending_validation_links_to_project_and_uses_dictionary() -> None:
    copy = sale_pending_validation_copy(
        project_id="proj-1",
        lot_label="Lote 5",
        project_name="Teno",
        client_name="Juan Pérez",
    )
    assert copy.title == admin_notification_label("sale_pending_validation")
    assert copy.deep_link == project_link("proj-1") == "/projects/proj-1"
    assert copy.action_label == "Validar venta"
    assert "Lote 5" in copy.message
    assert "Teno" in copy.message
    assert "Juan Pérez" in copy.message


def test_draft_ready_links_to_mesa_with_flow_vocabulary() -> None:
    copy = draft_ready_for_review_copy(escritura_case_id="case-9", lot_label="Lote 5")
    assert copy.deep_link == case_mesa_link("case-9") == "/documentos/matriz/case-9"
    assert copy.title == admin_notification_label("draft_ready_for_review")
    assert copy.flow_state_label == flow_state_label("draft_for_review")
    assert copy.action_label == "Abrir borrador"


def test_waiting_project_matriz_links_to_project_matriz() -> None:
    copy = waiting_project_matriz_copy(project_id="proj-1", lot_label="Lote 5")
    assert (
        copy.deep_link
        == project_matriz_link("proj-1")
        == "/documentos/matriz/proyecto/proj-1"
    )
    assert copy.title == admin_notification_label("waiting_project_matriz")
    assert copy.flow_state_label == flow_state_label("waiting_project_matriz")
    assert copy.action_label == "Abrir matriz del proyecto"


def test_vendor_draft_delivered_links_to_mis_documentos() -> None:
    """T018: el vendedor recibe el aviso con deep link a "mis documentos"."""
    copy = vendor_draft_delivered_copy(lot_label="Lote 5")
    assert copy.deep_link == vendor_documents_link() == "/mis-documentos"
    assert copy.title == admin_notification_label("draft_delivered_to_vendor")
    assert copy.flow_state_label == flow_state_label("delivered") == "Entregada"
    assert copy.action_label == "Ver mis documentos"
    assert "Lote 5" in copy.message


def test_admin_notification_titles_are_human_no_raw_codes() -> None:
    # FR-009/FR-014: el admin ve el vocabulario humano unico, sin claves crudas.
    for event in (
        "sale_pending_validation",
        "draft_ready_for_review",
        "waiting_project_matriz",
    ):
        title = admin_notification_label(event)
        assert title.strip()
        assert "_" not in title
