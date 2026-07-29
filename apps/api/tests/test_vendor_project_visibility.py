from pathlib import Path


MARKER = "VENDOR_PROJECT_VISIBILITY_NOT_IMPLEMENTED"
APP_ROOT = Path(__file__).resolve().parents[1]


def _source(path: str) -> str:
    return (APP_ROOT / path).read_text()


def test_vendor_inventory_uses_active_same_org_vendor_projects_only() -> None:
    miniapp = _source("api/v1/endpoints/miniapp.py")
    processor = _source("workers/tasks/message_processor.py")
    combined = f"{miniapp}\n{processor}"

    assert "vendor_projects" in combined, f"{MARKER}: assignment table missing"
    assert "active" in combined, f"{MARKER}: inactive vendors still authorize"
    assert '.eq("lots.vendedor_id"' not in miniapp, f"{MARKER}: lot owner grants inventory"


def test_revoke_and_reassign_are_checked_on_each_sensitive_read() -> None:
    miniapp = _source("api/v1/endpoints/miniapp.py")
    reservations = _source("services/reservations.py")

    assert "vendor_projects" in miniapp, f"{MARKER}: Mini App assignment not revalidated"
    assert "vendor_projects" in reservations, f"{MARKER}: reservation assignment not revalidated"
    assert "organization_id" in reservations, f"{MARKER}: organization B is not excluded"
