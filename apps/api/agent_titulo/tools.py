"""Read-only, bounded tools for the title agent.

Every tool closes over a :class:`TitleAgentContext` built from documents the
orchestrator already gathered (tenant-scoped) plus the deterministic
expediente data (SII rol, plano surface, personerías). Tools never touch the
database and never mutate state.
"""

from __future__ import annotations

import json
import unicodedata
from dataclasses import dataclass, field
from typing import Any

from langchain_core.tools import tool
from pydantic import BaseModel, Field

from core.logger import get_logger
from services.legal_title_verification import (
    check_snippet_match,
    check_value_snippet_consistency,
)
from services.legal_title_words import (
    date_to_words_spanish,
    number_to_words_spanish,
    rut_to_words_spanish,
)

logger = get_logger(__name__)

SEARCH_MAX_MATCHES = 8
SEARCH_CONTEXT_CHARS = 160


@dataclass(frozen=True, slots=True)
class TitleAgentContext:
    """In-memory corpus and expediente snapshot for one agent run."""

    documents: list[dict[str, Any]]
    expediente: dict[str, Any] = field(default_factory=dict)
    max_tool_chars: int = 60_000


class HechoAVerificar(BaseModel):
    """One draft fact with its literal citation, as the agent proposes it."""

    valor: str = Field(description="Valor propuesto (texto exacto del dato).")
    legal_document_id: str = Field(description="ID del documento citado.")
    pagina: int = Field(description="Número de página citada (1-based).")
    snippet: str = Field(
        description="Cita literal de la página que respalda el valor."
    )


def _document_by_id(context: TitleAgentContext, legal_document_id: str) -> dict[str, Any] | None:
    for document in context.documents:
        doc_id = str(document.get("legal_document_id") or document.get("id") or "")
        if doc_id == legal_document_id:
            return document
    return None


def _sorted_pages(document: dict[str, Any]) -> list[dict[str, Any]]:
    pages = [p for p in document.get("pages", []) if isinstance(p, dict)]
    return sorted(pages, key=lambda p: int(p.get("page_number") or 0))


def _page_text(context: TitleAgentContext, legal_document_id: str, pagina: int) -> str | None:
    document = _document_by_id(context, legal_document_id)
    if document is None:
        return None
    for page in document.get("pages", []):
        if isinstance(page, dict) and int(page.get("page_number") or 0) == pagina:
            return str(page.get("text_content") or "")
    return None


def _normalize_with_map(text: str) -> tuple[str, list[int]]:
    """Normalize like the verifier (NFKD, accent-strip, collapse whitespace,
    lowercase) while keeping a map from normalized index to original index,
    so search hits can be returned as literal original-text snippets."""
    norm_chars: list[str] = []
    positions: list[int] = []
    prev_space = True  # leading whitespace is stripped
    for i, ch in enumerate(text):
        decomposed = unicodedata.normalize("NFKD", ch)
        base = "".join(c for c in decomposed if not unicodedata.combining(c))
        if not base:
            continue
        if base.isspace():
            if prev_space:
                continue
            norm_chars.append(" ")
            positions.append(i)
            prev_space = True
        else:
            for c in base.lower():
                norm_chars.append(c)
                positions.append(i)
            prev_space = False
    if norm_chars and norm_chars[-1] == " ":
        norm_chars.pop()
        positions.pop()
    return "".join(norm_chars), positions


def _normalize_query(query: str) -> str:
    decomposed = unicodedata.normalize("NFKD", query)
    no_accents = "".join(c for c in decomposed if not unicodedata.combining(c))
    return " ".join(no_accents.lower().split())


def build_title_agent_tools(context: TitleAgentContext) -> list[Any]:
    """Build the bounded tool belt for one agent run."""

    @tool
    def listar_documentos() -> str:
        """Lista los documentos de título activos del proyecto: id, tipo,
        nombre de archivo y cantidad de páginas. Úsala primero para planificar
        la lectura."""
        inventory = []
        for document in context.documents:
            inventory.append(
                {
                    "legal_document_id": str(
                        document.get("legal_document_id") or document.get("id") or ""
                    ),
                    "document_type": str(document.get("document_type") or ""),
                    "filename": str(
                        document.get("filename")
                        or document.get("original_filename")
                        or ""
                    ),
                    "paginas": len(_sorted_pages(document)),
                }
            )
        return json.dumps(inventory, ensure_ascii=False)

    @tool
    def leer_paginas(
        legal_document_id: str,
        pagina_desde: int = 1,
        pagina_hasta: int | None = None,
    ) -> str:
        """Lee el texto OCR de un rango de páginas de un documento. Devuelve
        cada página encabezada con [pagina=N]. Si la salida excede el
        presupuesto, entrega páginas completas hasta el límite e indica desde
        cuál página continuar."""
        document = _document_by_id(context, legal_document_id)
        if document is None:
            return f"ERROR: documento {legal_document_id} no existe en este caso."
        pages = _sorted_pages(document)
        if not pages:
            return f"ERROR: documento {legal_document_id} no tiene páginas extraídas."

        selected = [
            page
            for page in pages
            if int(page.get("page_number") or 0) >= pagina_desde
            and (pagina_hasta is None or int(page.get("page_number") or 0) <= pagina_hasta)
        ]
        if not selected:
            return (
                f"ERROR: rango de páginas vacío. El documento tiene páginas "
                f"{int(pages[0].get('page_number') or 0)} a "
                f"{int(pages[-1].get('page_number') or 0)}."
            )

        chunks: list[str] = []
        used = 0
        for page in selected:
            page_number = int(page.get("page_number") or 0)
            block = f"[pagina={page_number}]\n{str(page.get('text_content') or '').strip()}\n"
            if used + len(block) > context.max_tool_chars:
                if not chunks:
                    return (
                        f"ERROR: la página {page_number} sola excede el presupuesto "
                        f"de {context.max_tool_chars} caracteres."
                    )
                chunks.append(
                    f"[SALIDA ACOTADA] Presupuesto alcanzado. Continúa con "
                    f"leer_paginas(legal_document_id='{legal_document_id}', "
                    f"pagina_desde={page_number})."
                )
                break
            chunks.append(block)
            used += len(block)
        return "\n".join(chunks)

    @tool
    def buscar_texto(consulta: str) -> str:
        """Busca un texto en todas las páginas de todos los documentos del
        caso (insensible a acentos, mayúsculas y espaciado). Devuelve hasta 8
        coincidencias con documento, página y el fragmento LITERAL de la
        página (útil para construir snippets de evidencia exactos)."""
        query = _normalize_query(consulta)
        if not query:
            return "ERROR: consulta vacía."
        matches: list[dict[str, Any]] = []
        for document in context.documents:
            doc_id = str(document.get("legal_document_id") or document.get("id") or "")
            for page in _sorted_pages(document):
                page_number = int(page.get("page_number") or 0)
                original = str(page.get("text_content") or "")
                normalized, positions = _normalize_with_map(original)
                start = 0
                while len(matches) < SEARCH_MAX_MATCHES:
                    idx = normalized.find(query, start)
                    if idx == -1:
                        break
                    orig_start = positions[idx]
                    orig_end = positions[min(idx + len(query) - 1, len(positions) - 1)]
                    ctx_start = max(0, orig_start - SEARCH_CONTEXT_CHARS)
                    ctx_end = min(len(original), orig_end + 1 + SEARCH_CONTEXT_CHARS)
                    matches.append(
                        {
                            "legal_document_id": doc_id,
                            "pagina": page_number,
                            "fragmento_literal": original[ctx_start:ctx_end],
                        }
                    )
                    start = idx + len(query)
                if len(matches) >= SEARCH_MAX_MATCHES:
                    break
            if len(matches) >= SEARCH_MAX_MATCHES:
                break
        if not matches:
            return f"Sin coincidencias para: {consulta}"
        return json.dumps(matches, ensure_ascii=False)

    @tool
    def verificar_hechos(hechos: list[HechoAVerificar]) -> str:
        """Verifica hechos en borrador con el verificador determinístico real:
        cada snippet debe existir literalmente en la página citada y el valor
        debe ser consistente con el snippet. Úsala ANTES de entregar el
        resultado final y corrige toda cita que falle."""
        results: list[dict[str, Any]] = []
        for hecho in hechos:
            page_text = _page_text(context, hecho.legal_document_id, hecho.pagina)
            if page_text is None:
                results.append(
                    {
                        "valor": hecho.valor,
                        "ok": False,
                        "motivo": "pagina_no_encontrada",
                    }
                )
                continue
            if not check_snippet_match(page_text, hecho.snippet):
                results.append(
                    {
                        "valor": hecho.valor,
                        "ok": False,
                        "motivo": "snippet_no_es_literal_en_pagina",
                    }
                )
                continue
            if not check_value_snippet_consistency(hecho.valor, hecho.snippet):
                results.append(
                    {
                        "valor": hecho.valor,
                        "ok": False,
                        "motivo": "valor_inconsistente_con_snippet",
                    }
                )
                continue
            results.append({"valor": hecho.valor, "ok": True})
        return json.dumps(results, ensure_ascii=False)

    @tool
    def numero_a_palabras(numero: int) -> str:
        """Convierte un número entero a palabras en español legal (p. ej.
        4699 -> 'cuatro mil seiscientos noventa y nueve'). Obligatorio para
        todo número que escribas en los bloques narrativos."""
        return number_to_words_spanish(numero)

    @tool
    def fecha_a_palabras(fecha: str) -> str:
        """Convierte una fecha YYYY-MM-DD a palabras en español legal (p. ej.
        '2022-02-02' -> 'dos de febrero de dos mil veintidós')."""
        return date_to_words_spanish(fecha)

    @tool
    def rut_a_palabras(rut: str) -> str:
        """Convierte un RUT (p. ej. '4.606.955-2') a palabras en español
        legal para la comparecencia."""
        return rut_to_words_spanish(rut)

    @tool
    def datos_expediente() -> str:
        """Datos ya extraídos determinísticamente del expediente (NO los
        re-extraigas): rol de avalúo del certificado SII, superficie del
        plano y personerías activas. Úsalos para cruces y alertas."""
        return json.dumps(context.expediente or {}, ensure_ascii=False, default=str)

    return [
        listar_documentos,
        leer_paginas,
        buscar_texto,
        verificar_hechos,
        numero_a_palabras,
        fecha_a_palabras,
        rut_a_palabras,
        datos_expediente,
    ]
