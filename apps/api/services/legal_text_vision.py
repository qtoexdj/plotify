"""SDD 009: transcripción por visión de PDFs escaneados.

Los dominios vigentes del CBR son PDFs mixtos: el título está como IMAGEN
escaneada y encima va una capa de texto del certificado ("vigente"). El OCR
clásico (tesseract) y la extracción de texto plano solo ven el certificado.
Aquí un modelo multimodal (gpt-5.5 vía Responses API `input_file`) lee el PDF
directo y transcribe el contenido escaneado a texto fiel, página por página,
para alimentar el pipeline de texto existente (con su verificación).
"""

from __future__ import annotations

import asyncio
import base64
from typing import Any

from pydantic import BaseModel, Field

from core.config import get_settings
from core.logger import get_logger

logger = get_logger(__name__)


class LegalVisionTranscriptionError(Exception):
    """Falla de la transcripción por visión."""


class _VisionPage(BaseModel):
    page_number: int = Field(description="Número de página del PDF (1-based).")
    text: str = Field(description="Transcripción literal y completa de la página.")


class _VisionTranscript(BaseModel):
    pages: list[_VisionPage] = Field(default_factory=list)


_TRANSCRIPTION_PROMPT = (
    "Eres un transcriptor legal. Transcribe FIEL y COMPLETO todo el texto de "
    "este documento, INCLUYENDO el contenido ESCANEADO (la inscripción de "
    "dominio que suele anteceder al certificado de vigencia). Es una "
    "transcripción literal: NO resumas, NO interpretes, NO completes datos que "
    "no estén. Conserva nombres, RUT/cédulas, domicilios, profesión u ocupación, "
    "estado civil, a quién se compró, identidad del inmueble, superficie, "
    "deslindes, fojas/número/año de inscripción, notas marginales y montos tal "
    "como aparecen. Si algo es ilegible, escribe [ilegible]. Devuelve una "
    "entrada por cada página del PDF, en orden, con su número de página."
)


def transcribe_pdf_with_vision_sync(pdf_bytes: bytes) -> list[tuple[int, str]]:
    """Transcribe el PDF con el modelo multimodal. Devuelve [(page_number, text)].

    Síncrono (usa el cliente OpenAI sync); el llamador lo corre en un hilo.
    """
    settings = get_settings()
    if settings.LEGAL_TEXT_VISION_PROVIDER != "openai":
        raise LegalVisionTranscriptionError(
            f"Unsupported vision provider: {settings.LEGAL_TEXT_VISION_PROVIDER}"
        )
    if not settings.OPENAI_API_KEY:
        raise LegalVisionTranscriptionError("OPENAI_API_KEY is not configured.")

    try:
        from openai import OpenAI
    except ImportError as exc:  # pragma: no cover - dependency always present
        raise LegalVisionTranscriptionError("openai SDK is not installed.") from exc

    client = OpenAI(
        api_key=settings.OPENAI_API_KEY,
        timeout=settings.LEGAL_TEXT_VISION_TIMEOUT_SECONDS,
    )
    b64 = base64.b64encode(pdf_bytes).decode("utf-8")
    request: dict[str, Any] = {
        "model": settings.LEGAL_TEXT_VISION_MODEL,
        "input": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_file",
                        "filename": "documento.pdf",
                        "file_data": f"data:application/pdf;base64,{b64}",
                    },
                    {"type": "input_text", "text": _TRANSCRIPTION_PROMPT},
                ],
            }
        ],
        "text_format": _VisionTranscript,
    }
    effort = (settings.LEGAL_TEXT_VISION_REASONING_EFFORT or "").strip()
    if effort:
        request["reasoning"] = {"effort": effort}

    try:
        response = client.responses.parse(**request)
    except Exception as exc:
        raise LegalVisionTranscriptionError(
            f"Vision transcription request failed: {exc}"
        ) from exc

    parsed = getattr(response, "output_parsed", None)
    if parsed is None or not parsed.pages:
        raise LegalVisionTranscriptionError("Vision transcription returned no pages.")

    pages = sorted(parsed.pages, key=lambda p: p.page_number)
    return [(int(p.page_number), p.text or "") for p in pages]


async def transcribe_pdf_with_vision(pdf_bytes: bytes) -> list[tuple[int, str]]:
    """Versión async: corre la transcripción síncrona en un hilo."""
    return await asyncio.to_thread(transcribe_pdf_with_vision_sync, pdf_bytes)
