from __future__ import annotations

from typing import Any

from openai import AuthenticationError, OpenAI
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from .config import LabConfig, load_config
from .db import connect


def vector_literal(values: list[float]) -> str:
    return "[" + ",".join(f"{value:.10f}" for value in values) + "]"


def fetch_chunks_without_embeddings(conn, limit: int) -> list[dict[str, Any]]:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            select c.id, c.document_id, c.chunk_index, c.markdown, d.original_filename
            from lab_escrituras.document_chunks c
            join lab_escrituras.source_documents d on d.id = c.document_id
            where c.embedding is null
              and c.markdown <> ''
            order by d.created_at, c.chunk_index
            limit %s
            """,
            (limit,),
        )
        return [dict(row) for row in cur.fetchall()]


def create_run(conn, config: LabConfig) -> str:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            insert into lab_escrituras.analysis_runs (
              run_type, status, parameters, started_at
            )
            values ('batch', 'processing', %s, now())
            returning id
            """,
            (
                Jsonb(
                    {
                        "source": "embeddings",
                        "embedding_model": config.embedding_model,
                        "embedding_batch_size": config.embedding_batch_size,
                    }
                ),
            ),
        )
        return str(cur.fetchone()["id"])


def finish_run(conn, run_id: str, *, status: str, embedded_count: int, error_message: str | None = None) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            update lab_escrituras.analysis_runs
            set status = %s,
                error_message = %s,
                parameters = parameters || %s::jsonb,
                completed_at = now()
            where id = %s
            """,
            (
                status,
                error_message,
                Jsonb({"embedded_count": embedded_count}),
                run_id,
            ),
        )


def embed_pending_chunks(limit: int | None = None) -> dict[str, Any]:
    config = load_config()
    if not config.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is required to generate lab embeddings.")

    client = OpenAI(api_key=config.openai_api_key)
    total_embedded = 0
    batch_size = max(1, min(config.embedding_batch_size, 128))
    remaining = limit if limit is not None else None

    with connect(config) as conn:
        run_id = create_run(conn, config)
        conn.commit()
        try:
            while remaining is None or remaining > 0:
                current_limit = batch_size if remaining is None else min(batch_size, remaining)
                chunks = fetch_chunks_without_embeddings(conn, current_limit)
                if not chunks:
                    break

                response = client.embeddings.create(
                    model=config.embedding_model,
                    input=[chunk["markdown"] for chunk in chunks],
                )

                with conn.cursor() as cur:
                    for chunk, item in zip(chunks, response.data, strict=True):
                        cur.execute(
                            """
                            update lab_escrituras.document_chunks
                            set embedding = %s::extensions.vector,
                                metadata = metadata || %s::jsonb
                            where id = %s
                            """,
                            (
                                vector_literal(item.embedding),
                                Jsonb({"embedding_model": config.embedding_model}),
                                chunk["id"],
                            ),
                        )

                conn.commit()
                total_embedded += len(chunks)
                if remaining is not None:
                    remaining -= len(chunks)

            finish_run(conn, run_id, status="completed", embedded_count=total_embedded)
            conn.commit()
        except Exception as exc:
            error_message = "OPENAI_API_KEY is invalid." if isinstance(exc, AuthenticationError) else str(exc)
            finish_run(conn, run_id, status="failed", embedded_count=total_embedded, error_message=error_message)
            conn.commit()
            raise

    return {
        "run_id": run_id,
        "embedding_model": config.embedding_model,
        "embedded_count": total_embedded,
    }


def main() -> None:
    result = embed_pending_chunks()
    print(result)


if __name__ == "__main__":
    main()
