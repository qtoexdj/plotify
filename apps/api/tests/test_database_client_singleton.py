"""SDD019 F6: el cliente Supabase debe ser singleton por proceso.

Regresión: `get_supabase_client()` creaba un httpx.Client NUEVO en cada
llamada (~145 call sites). Cada cliente abandonado por timeout dejaba
conexiones reservadas en Supavisor y agotaba el pool (PGRST003).
"""

import threading
from types import SimpleNamespace

import pytest

import core.database as database


@pytest.fixture(autouse=True)
def _clean_singleton():
    """Aísla el singleton entre tests: nunca filtrar clientes fake."""
    database.reset_supabase_client()
    yield
    database.reset_supabase_client()


def test_get_supabase_client_returns_same_instance(monkeypatch):
    """Llamadas repetidas devuelven la MISMA instancia (no se reconstruye)."""
    builds: list[object] = []

    def _fake_build() -> object:
        client = SimpleNamespace(
            name=f"client-{len(builds)}",
            postgrest=SimpleNamespace(
                session=SimpleNamespace(close=lambda: None),
            ),
        )
        builds.append(client)
        return client

    monkeypatch.setattr(database, "_build_client", _fake_build)

    client_a = database.get_supabase_client()
    client_b = database.get_supabase_client()

    assert client_a is client_b
    assert len(builds) == 1, "el cliente no debe reconstruirse en cada llamada"


def test_get_supabase_client_is_thread_safe(monkeypatch):
    """N hilos concurrentes obtienen exactamente una instancia."""
    instances: list[object] = []
    lock = threading.Lock()
    builds: list[object] = []

    def _fake_build() -> object:
        client = SimpleNamespace(
            name=f"client-{len(builds)}",
            postgrest=SimpleNamespace(
                session=SimpleNamespace(close=lambda: None),
            ),
        )
        builds.append(client)
        return client

    monkeypatch.setattr(database, "_build_client", _fake_build)

    def _grab() -> None:
        client = database.get_supabase_client()
        with lock:
            instances.append(client)

    threads = [threading.Thread(target=_grab) for _ in range(10)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert len({id(instance) for instance in instances}) == 1
    assert len(builds) == 1


def test_reset_supabase_client_rebuilds(monkeypatch):
    """reset_supabase_client descarta el singleton para reinicios limpios."""
    builds: list[object] = []

    def _fake_build() -> object:
        client = SimpleNamespace(
            name=f"client-{len(builds)}",
            postgrest=SimpleNamespace(
                session=SimpleNamespace(close=lambda: None),
            ),
        )
        builds.append(client)
        return client

    monkeypatch.setattr(database, "_build_client", _fake_build)

    first = database.get_supabase_client()
    database.reset_supabase_client()
    second = database.get_supabase_client()

    assert first is not second
    assert len(builds) == 2
