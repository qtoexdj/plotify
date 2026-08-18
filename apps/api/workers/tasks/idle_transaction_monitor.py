"""T-CPU-02: Automated idle transaction monitoring and cleanup via ARQ cron.

Calls the reusable detection and termination logic from ``scripts/check_idle_transactions``
every 10 minutes to prevent orphan zombie connections.
"""

from __future__ import annotations

import asyncio

from core.config import get_settings
from core.logger import get_logger
from scripts.check_idle_transactions import check_idle_transactions

logger = get_logger(__name__)


async def check_idle_transactions_cron(ctx: dict) -> None:
    """Detect and terminate idle-in-transaction sessions older than 120s."""
    settings = get_settings()
    db_url = settings.SUPABASE_DB_URL

    if not db_url:
        logger.warning("idle_tx_monitor_skip", reason="SUPABASE_DB_URL not configured")
        ctx["job_outcome"] = True
        return

    try:
        report = await asyncio.to_thread(
            check_idle_transactions, db_url, max_age_seconds=120, terminate=True
        )
    except Exception:
        logger.exception("idle_tx_monitor_error")
        ctx["job_outcome"] = False
        raise

    zombie_count = report.get("zombie_count", 0)
    terminated = report.get("terminated", [])
    if zombie_count > 0:
        logger.warning(
            "idle_tx_zombies_detected_and_terminated",
            zombie_count=zombie_count,
            terminated=terminated,
            zombies=report["zombies"],
        )
    else:
        logger.debug("idle_tx_monitor_ok", zombie_count=0)

    ctx["job_outcome"] = True
