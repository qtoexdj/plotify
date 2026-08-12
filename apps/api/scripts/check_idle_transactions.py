"""SDD019 F5: detectar transacciones huérfanas que agotan el pool PostgREST.

Read-only. Reporta sesiones ``idle in transaction`` / ``idle in transaction
(aborted)`` con más de N segundos de antigüedad y muestra qué locks retienen.
No termina nada: la terminación manual se hace con
``SELECT pg_terminate_backend(<pid>)`` según el runbook
``docs/runbooks/postgres-connection-pool.md``.

Uso:
  apps/api/.venv/bin/python apps/api/scripts/check_idle_transactions.py \\
      [--max-age-seconds 300] [--terminate]

Exit codes: 0 ok, 1 hay zombies, 2 error de configuración.
"""

import argparse
import ipaddress
import json
import os
import sys
from pathlib import Path
from urllib.parse import urlparse

import psycopg
from dotenv import dotenv_values

WORKSPACE = Path(__file__).resolve().parents[3]
environment = dotenv_values(WORKSPACE / "apps" / "api" / ".env")
DATABASE_URL = os.environ.get("SUPABASE_DB_URL") or environment.get("SUPABASE_DB_URL")

ZOMBIE_STATES = ("idle in transaction", "idle in transaction (aborted)")


def check_idle_transactions(
    db_url: str, max_age_seconds: int = 300, terminate: bool = False
) -> dict:
    """Detect idle-in-transaction sessions older than *max_age_seconds*.

    Returns a dict with keys ``zombie_count``, ``max_age_seconds``,
    ``terminated`` (list of PIDs) and ``zombies`` (list of detail dicts).
    Optionally terminates them when *terminate* is ``True``.

    This is the reusable core that both the CLI ``main()`` and the ARQ cron
    task ``idle_transaction_monitor`` call.
    """
    with psycopg.connect(db_url, connect_timeout=10) as conn:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute(
                """
                select a.pid, a.state, a.query_start, a.xact_start,
                       left(a.query, 120),
                       coalesce(
                         (select string_agg(distinct c.relname, ', ')
                          from pg_locks l
                          left join pg_class c on c.oid = l.relation
                          where l.pid = a.pid and l.locktype = 'relation'),
                         'sin locks de relación'
                       )
                from pg_stat_activity a
                where a.state in ('idle in transaction', 'idle in transaction (aborted)')
                  and a.xact_start < now() - make_interval(secs => %s)
                  and a.pid <> pg_backend_pid()
                order by a.xact_start
                """,
                (max_age_seconds,),
            )
            zombies = cur.fetchall()

    report: dict = {
        "zombie_count": len(zombies),
        "max_age_seconds": max_age_seconds,
        "terminated": [],
        "zombies": [
            {
                "pid": pid,
                "state": state,
                "xact_start": str(xact_start),
                "query": query,
                "locks": locks,
            }
            for pid, state, _qstart, xact_start, query, locks in zombies
        ],
    }

    if zombies and terminate:
        with psycopg.connect(db_url, connect_timeout=10) as conn:
            conn.autocommit = True
            with conn.cursor() as cur:
                for zombie in zombies:
                    cur.execute(
                        "select pg_terminate_backend(%s)", (zombie[0],)
                    )
                    report["terminated"].append(zombie[0])

    return report


def _fail(message: str) -> int:
    print(f"ERROR: {message}", file=sys.stderr)
    return 2


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--max-age-seconds", type=int, default=300)
    parser.add_argument(
        "--terminate",
        action="store_true",
        help="termina las sesiones zombie con pg_terminate_backend (mutante)",
    )
    args = parser.parse_args()

    if not DATABASE_URL:
        return _fail("SUPABASE_DB_URL required (apps/api/.env)")
    host = (urlparse(DATABASE_URL).hostname or "").lower()
    try:
        ip = ipaddress.ip_address(host)
        if ip.is_private or ip.is_loopback or host == "localhost":
            return _fail("SUPABASE_DB_URL debe apuntar a un host cloud (no IP local)")
    except ValueError:
        # dominio (p. ej. aws-*.pooler.supabase.com): esperado
        pass

    report = check_idle_transactions(
        DATABASE_URL, max_age_seconds=args.max_age_seconds, terminate=args.terminate
    )
    print(json.dumps(report, indent=2, default=str))
    return 1 if report["zombie_count"] > 0 else 0


if __name__ == "__main__":
    raise SystemExit(main())
