from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from .config import LabConfig


@contextmanager
def connect(config: LabConfig) -> Iterator[psycopg.Connection]:
    with psycopg.connect(config.db_url, row_factory=dict_row, prepare_threshold=None) as conn:
        yield conn


def fetch_pending_documents(conn: psycopg.Connection, limit: int = 10) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(
            """
            select *
            from lab_escrituras.source_documents
            where processing_status in ('uploaded', 'pending')
            order by created_at
            limit %s
            """,
            (limit,),
        )
        return list(cur.fetchall())


def ensure_lab_schema_current(conn: psycopg.Connection) -> None:
    """Apply idempotent lab-only compatibility fixes needed by local scripts."""
    with conn.cursor() as cur:
        cur.execute(
            """
            alter table lab_escrituras.source_documents
              drop constraint if exists source_documents_status_check
            """
        )
        cur.execute(
            """
            alter table lab_escrituras.source_documents
              add constraint source_documents_status_check
              check (processing_status in (
                'uploaded',
                'pending',
                'processing',
                'processed',
                'needs_ocr',
                'low_quality_extraction',
                'failed'
              ))
            """
        )


def reset_interrupted_processing_documents(conn: psycopg.Connection) -> int:
    """Return documents left in processing by an interrupted local command to the queue."""
    with conn.cursor() as cur:
        cur.execute(
            """
            update lab_escrituras.source_documents
            set processing_status = 'uploaded',
                error_message = null,
                updated_at = now()
            where processing_status = 'processing'
            """
        )
        return cur.rowcount or 0


def mark_document_status(
    conn: psycopg.Connection,
    document_id: str,
    status: str,
    *,
    error_message: str | None = None,
    metadata: dict | None = None,
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            update lab_escrituras.source_documents
            set processing_status = %s,
                error_message = %s,
                layout_metadata = coalesce(%s::jsonb, layout_metadata),
                updated_at = now()
            where id = %s
            """,
            (status, error_message, Jsonb(metadata) if metadata is not None else None, document_id),
        )
