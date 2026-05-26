from __future__ import annotations

import importlib
import sys
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[1]
api_root_str = str(API_ROOT)

if sys.path[0] != api_root_str:
    sys.path.insert(0, api_root_str)

loaded_api = sys.modules.get("api")
loaded_api_file = Path(getattr(loaded_api, "__file__", "")) if loaded_api else None

if loaded_api_file and API_ROOT not in loaded_api_file.parents:
    del sys.modules["api"]

importlib.import_module("api.v1")

import pytest

@pytest.fixture
def tenant_a_fixtures():
    """Fixture que modela los recursos del Tenant A para pruebas multi-tenant."""
    return {
        "org_id": "org-a-uuid",
        "project_id": "project-a-uuid",
        "lot_id": "lot-a-uuid",
        "template_id": "template-a-uuid",
        "vendor_id": "vendor-a-uuid",
        "user_id": "user-a-uuid",
        "admin_user_id": "admin-a-uuid",
        "vendor_user_id": "vendor-user-a-uuid",
        "vendor_project": {
            "vendor_id": "vendor-a-uuid",
            "project_id": "project-a-uuid",
        },
    }

@pytest.fixture
def tenant_b_fixtures():
    """Fixture que modela los recursos del Tenant B para pruebas multi-tenant."""
    return {
        "org_id": "org-b-uuid",
        "project_id": "project-b-uuid",
        "lot_id": "lot-b-uuid",
        "template_id": "template-b-uuid",
        "vendor_id": "vendor-b-uuid",
        "user_id": "user-b-uuid",
        "admin_user_id": "admin-b-uuid",
        "vendor_user_id": "vendor-user-b-uuid",
        "vendor_project": {
            "vendor_id": "vendor-b-uuid",
            "project_id": "project-b-uuid",
        },
    }


@pytest.fixture
def tenant_pair_fixtures(tenant_a_fixtures, tenant_b_fixtures):
    """Two isolated organizations with project, lot, template, vendor, and user resources."""
    return {
        "tenant_a": tenant_a_fixtures,
        "tenant_b": tenant_b_fixtures,
    }
