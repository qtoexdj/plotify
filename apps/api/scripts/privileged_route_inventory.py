"""Inventory helpers for service-role/internal-secret runtime surfaces."""

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Literal
import hashlib
import re

API_SECURITY_FOUNDATION_NOT_IMPLEMENTED = "API_SECURITY_FOUNDATION_NOT_IMPLEMENTED"


@dataclass(frozen=True, order=True)
class PrivilegedSurface:
    runtime: Literal["api", "worker"]
    method: str
    route_or_symbol: str
    callsite_hash: str


def discover_privileged_surfaces(
    repository_root: Path,
) -> tuple[PrivilegedSurface, ...]:
    api_root = repository_root / "apps" / "api"
    markers = re.compile(
        r"get_supabase_client|SUPABASE_SERVICE_ROLE_KEY|verify_internal_secret|admin\.(?:create|delete)_user"
    )
    route_pattern = re.compile(r"@router\.(get|post|put|patch|delete)\(\s*[rf]?['\"]([^'\"]+)")
    surfaces: set[PrivilegedSurface] = set()
    for path in sorted(api_root.rglob("*.py")):
        if any(part in {".venv", "__pycache__", "tests"} for part in path.parts):
            continue
        source = path.read_text(encoding="utf-8")
        matches = list(markers.finditer(source))
        if not matches and "webhook" not in path.name:
            continue
        relative = path.relative_to(repository_root).as_posix()
        runtime: Literal["api", "worker"] = "worker" if "workers" in path.parts else "api"
        routes = route_pattern.findall(source) if runtime == "api" else []
        if routes:
            identities = [(method.upper(), route) for method, route in routes]
        else:
            identities = [("WORK", relative)]
        digest = "sha256:" + hashlib.sha256(source.encode()).hexdigest()
        for method, identity in identities:
            surfaces.add(PrivilegedSurface(runtime, method, identity, digest))
    return tuple(sorted(surfaces))


def assert_exact_inventory(
    discovered: Iterable[PrivilegedSurface], expected: Iterable[PrivilegedSurface]
) -> None:
    discovered_rows = tuple(discovered)
    expected_rows = tuple(expected)
    if len(discovered_rows) != len(set(discovered_rows)) or len(expected_rows) != len(
        set(expected_rows)
    ):
        raise ValueError("duplicate privileged inventory row")
    actual = set(discovered_rows)
    classified = set(expected_rows)
    missing = actual - classified
    stale = classified - actual
    if missing:
        raise ValueError(f"missing classification: {sorted(missing)!r}")
    if stale:
        raise ValueError(f"stale classification: {sorted(stale)!r}")
