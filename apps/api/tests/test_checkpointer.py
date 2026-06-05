from __future__ import annotations


class BrokenPool:
    def __init__(self) -> None:
        self.closed = False

    async def open(self, *, wait: bool, timeout: float) -> None:
        assert wait is True
        assert timeout == 5.0
        raise TimeoutError("network timeout")

    async def close(self, *, timeout: float) -> None:
        assert timeout == 5.0
        self.closed = True


async def test_setup_checkpointer_disables_pool_after_connection_failure(monkeypatch):
    from core import checkpointer

    async def fail_setup_tables_once() -> None:
        raise TimeoutError("network timeout")

    monkeypatch.setattr(checkpointer, "pool", None)
    monkeypatch.setattr(checkpointer, "_pool_ready", False)
    monkeypatch.setattr(checkpointer.settings, "SUPABASE_DB_URL", "postgresql://db.invalid/postgres")
    monkeypatch.setattr(checkpointer.settings, "CHECKPOINTER_CONNECT_TIMEOUT_SECONDS", 5.0)
    monkeypatch.setattr(checkpointer.settings, "CHECKPOINTER_REQUIRED", False)
    monkeypatch.setattr(checkpointer, "_setup_tables_once", fail_setup_tables_once)
    monkeypatch.setattr(
        checkpointer,
        "_build_pool",
        lambda: (_ for _ in ()).throw(AssertionError("pool should not be built")),
    )

    await checkpointer.setup_checkpointer()

    assert checkpointer.pool is None
    assert checkpointer.get_checkpointer_pool() is None


async def test_setup_checkpointer_raises_when_required_and_connection_fails(monkeypatch):
    import pytest
    from core import checkpointer

    async def fail_setup_tables_once() -> None:
        raise TimeoutError("network timeout")

    monkeypatch.setattr(checkpointer, "pool", None)
    monkeypatch.setattr(checkpointer, "_pool_ready", False)
    monkeypatch.setattr(checkpointer.settings, "SUPABASE_DB_URL", "postgresql://db.invalid/postgres")
    monkeypatch.setattr(checkpointer.settings, "CHECKPOINTER_REQUIRED", True)
    monkeypatch.setattr(checkpointer, "_setup_tables_once", fail_setup_tables_once)

    with pytest.raises(TimeoutError):
        await checkpointer.setup_checkpointer()

    assert checkpointer.pool is None
    assert checkpointer.get_checkpointer_pool() is None


async def test_setup_checkpointer_closes_pool_when_open_fails(monkeypatch):
    from core import checkpointer

    async def setup_tables_once() -> None:
        return None

    broken_pool = BrokenPool()
    monkeypatch.setattr(checkpointer, "pool", None)
    monkeypatch.setattr(checkpointer, "_pool_ready", False)
    monkeypatch.setattr(checkpointer.settings, "SUPABASE_DB_URL", "postgresql://db.invalid/postgres")
    monkeypatch.setattr(checkpointer.settings, "CHECKPOINTER_CONNECT_TIMEOUT_SECONDS", 5.0)
    monkeypatch.setattr(checkpointer.settings, "CHECKPOINTER_REQUIRED", False)
    monkeypatch.setattr(checkpointer, "_setup_tables_once", setup_tables_once)
    monkeypatch.setattr(checkpointer, "_build_pool", lambda: broken_pool)

    await checkpointer.setup_checkpointer()

    assert broken_pool.closed is True
    assert checkpointer.pool is None
    assert checkpointer.get_checkpointer_pool() is None


def test_get_checkpointer_pool_returns_none_until_startup_verified(monkeypatch):
    from core import checkpointer

    sentinel_pool = object()
    monkeypatch.setattr(checkpointer, "pool", sentinel_pool)
    monkeypatch.setattr(checkpointer, "_pool_ready", False)

    assert checkpointer.get_checkpointer_pool() is None

    monkeypatch.setattr(checkpointer, "_pool_ready", True)

    assert checkpointer.get_checkpointer_pool() is sentinel_pool


async def test_setup_checkpointer_is_noop_when_pool_is_already_ready(monkeypatch):
    from core import checkpointer

    sentinel_pool = object()
    monkeypatch.setattr(checkpointer, "pool", sentinel_pool)
    monkeypatch.setattr(checkpointer, "_pool_ready", True)
    monkeypatch.setattr(checkpointer.settings, "SUPABASE_DB_URL", "postgresql://db.invalid/postgres")
    monkeypatch.setattr(
        checkpointer,
        "_setup_tables_once",
        lambda: (_ for _ in ()).throw(AssertionError("setup should not rerun")),
    )

    await checkpointer.setup_checkpointer()

    assert checkpointer.pool is sentinel_pool
    assert checkpointer.get_checkpointer_pool() is sentinel_pool
