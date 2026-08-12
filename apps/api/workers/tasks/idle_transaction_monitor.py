"""T-CPU-02: Automated idle transaction monitoring via ARQ cron.

Calls the reusable detection logic from ``scripts/check_idle_transactions``
every 10 minutes.  Detection-only — never terminates sessions automatically.
"""

from __future__ import annotations

import asyncio

from core.config import get_settings
from core.logger import get_logger
from scripts.check_idle_transactions import check_idle_transactions

logger = get_logger(__name__)


async def check_idle_transactions_cron(ctx: dict) -> None:
    """Detect idle-in-transaction sessions and log the result."""
    settings = get_settings()
    db_url = settings.SUPABASE_DB_URL

    if not db_url:
        logger.warning("idle_tx_monitor_skip", reason="SUPABASE_DB_URL not configured")
        ctx["job_outcome"] = True
        return

    try:
        report = await asyncio.to_thread(
            check_idle_transactions, db_url, max_age_seconds=300, terminate=False
        )
    except Exception:
        logger.exception("idle_tx_monitor_error")
        ctx["job_outcome"] = False
        raise

    zombie_count = report.get("zombie_count", 0)
    if zombie_count > 0:
        logger.warning(
            "idle_tx_zombies_detected",
            zombie_count=zombie_count,
            zombies=report["zombies"],
        )
    else:
        logger.debug("idle_tx_monitor_ok", zombie_count=0)

    ctx["job_outcome"] = True
