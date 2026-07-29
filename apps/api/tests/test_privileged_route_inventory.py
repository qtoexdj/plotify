"""Exact service-role/internal-secret API and worker inventory contract."""

from pathlib import Path

import pytest

from scripts.privileged_route_inventory import (
    PrivilegedSurface,
    assert_exact_inventory,
    discover_privileged_surfaces,
)


def test_inventory_discovers_api_and_worker_surfaces_with_stable_hashes():
    root = Path(__file__).resolve().parents[3]
    surfaces = discover_privileged_surfaces(root)
    assert surfaces
    assert {surface.runtime for surface in surfaces} == {"api", "worker"}
    assert all(surface.callsite_hash.startswith("sha256:") for surface in surfaces)
    assert any("webhook" in surface.route_or_symbol for surface in surfaces)


def test_inventory_equality_rejects_missing_stale_and_duplicate_rows():
    row = PrivilegedSurface("api", "POST", "/api/v1/example", "sha256:" + "a" * 64)
    assert_exact_inventory((row,), (row,))
    with pytest.raises(ValueError, match="missing"):
        assert_exact_inventory((row,), ())
    with pytest.raises(ValueError, match="stale"):
        assert_exact_inventory((), (row,))
    with pytest.raises(ValueError, match="duplicate"):
        assert_exact_inventory((row, row), (row,))
