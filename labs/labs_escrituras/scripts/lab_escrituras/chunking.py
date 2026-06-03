from __future__ import annotations

import re
from dataclasses import dataclass


SECTION_PATTERNS = [
    ("comparecencia", re.compile(r"\b(comparecen|comparecencia)\b", re.I)),
    ("matriz_dominio", re.compile(r"\b(dominio|fojas|conservador|inscripci[oó]n)\b", re.I)),
    ("sag_plano", re.compile(r"\b(SAG|subdivisi[oó]n|plano)\b", re.I)),
    ("lote", re.compile(r"\b(lote|superficie|deslinda|deslindes)\b", re.I)),
    ("servidumbre", re.compile(r"\b(servidumbre|tr[aá]nsito)\b", re.I)),
    ("precio", re.compile(r"\b(precio|saldo|pago|compraventa)\b", re.I)),
    ("personeria", re.compile(r"\b(personer[ií]a|representaci[oó]n|mandato)\b", re.I)),
]


@dataclass(frozen=True)
class MarkdownChunk:
    index: int
    markdown: str
    section_label: str | None
    token_estimate: int


def estimate_tokens(text: str) -> int:
    return max(1, len(text.split()) * 4 // 3)


def detect_section_label(text: str) -> str | None:
    for label, pattern in SECTION_PATTERNS:
        if pattern.search(text):
            return label
    return None


def chunk_markdown(markdown: str, max_chars: int = 1800) -> list[MarkdownChunk]:
    blocks = [block.strip() for block in re.split(r"\n{2,}", markdown) if block.strip()]
    chunks: list[str] = []
    current: list[str] = []
    current_len = 0

    for block in blocks:
        if current and current_len + len(block) + 2 > max_chars:
            chunks.append("\n\n".join(current))
            current = []
            current_len = 0
        current.append(block)
        current_len += len(block) + 2

    if current:
        chunks.append("\n\n".join(current))

    if not chunks and markdown.strip():
        chunks = [markdown.strip()]

    return [
        MarkdownChunk(
            index=index,
            markdown=chunk,
            section_label=detect_section_label(chunk),
            token_estimate=estimate_tokens(chunk),
        )
        for index, chunk in enumerate(chunks)
    ]

