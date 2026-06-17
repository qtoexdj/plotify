"""Deterministic fact-checker for agent-drafted narrative blocks (FR-006).

The title agent drafts ``comparecencia`` and ``clausula PRIMERO``; this module
guarantees SC-002 (zero unverified facts reach blocks) without the deleted
corpus-specific templates:

- Every number in the block (written in Spanish words or digits) must match a
  number present in a *verified* chain/identity field.
- Every proper-name token in the block must appear in a verified field value
  (legal boilerplate vocabulary excluded).

A failed match never deletes the draft: the block degrades to manual review
with the failing facts listed for the lawyer.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from core.logger import get_logger
from schemas.legal_titles import TitleAnalysis
from services.legal_title_verification import _collect_evidenced_values
from services.legal_title_words import normalize_text

logger = get_logger(__name__)


# ── Spanish number-words parsing (inverse of number_to_words_spanish) ──

_UNITS = {
    "cero": 0, "un": 1, "uno": 1, "una": 1, "dos": 2, "tres": 3,
    "cuatro": 4, "cinco": 5, "seis": 6, "siete": 7, "ocho": 8, "nueve": 9,
}
_TEENS = {
    "diez": 10, "once": 11, "doce": 12, "trece": 13, "catorce": 14,
    "quince": 15, "dieciseis": 16, "diecisiete": 17, "dieciocho": 18,
    "diecinueve": 19,
}
_TWENTIES = {
    "veinte": 20, "veintiun": 21, "veintiuno": 21, "veintidos": 22,
    "veintitres": 23, "veinticuatro": 24, "veinticinco": 25,
    "veintiseis": 26, "veintisiete": 27, "veintiocho": 28,
    "veintinueve": 29,
}
_TENS = {
    "treinta": 30, "cuarenta": 40, "cincuenta": 50, "sesenta": 60,
    "setenta": 70, "ochenta": 80, "noventa": 90,
}
_HUNDREDS = {
    "cien": 100, "ciento": 100, "doscientos": 200, "trescientos": 300,
    "cuatrocientos": 400, "quinientos": 500, "seiscientos": 600,
    "setecientos": 700, "ochocientos": 800, "novecientos": 900,
}
_SIMPLE_NUMBER_WORDS = {**_UNITS, **_TEENS, **_TWENTIES, **_TENS, **_HUNDREDS}
_NUMBER_TOKENS = set(_SIMPLE_NUMBER_WORDS) | {"y", "mil", "millon", "millones"}
# "primero" appears both as clause header and as day-one in dates.
_ORDINAL_ONE_WORDS = {"primero", "primera"}


def extract_spanish_numbers(text: str) -> list[tuple[int, str]]:
    """Extract every number written in Spanish words or digits from ``text``.

    Returns ``(value, raw_phrase)`` pairs. Word runs are parsed with the same
    grammar ``number_to_words_spanish`` emits; digit runs accept Chilean
    thousand separators ("4.699"). "coma" and "guion" split runs, so
    "veintiséis coma ochenta y dos" yields 26 and 82 (matching how the
    verified values store them).
    """
    results: list[tuple[int, str]] = []
    normalized = normalize_text(text)
    # Punctuation tokens flush the current word run: "…noventa y seis. Dos)"
    # is two numbers (1996 and the ordinal 2), not 1998.
    tokens = re.findall(r"[a-z]+|\d[\d.]*|[^\sa-z0-9]", normalized)

    run: list[str] = []

    def flush() -> None:
        if not run:
            return
        # Drop trailing connector "y" left by run boundaries.
        words = run[-1] == "y" and run[:-1] or list(run)
        run.clear()
        if not words:
            return
        total = 0
        current = 0
        for word in words:
            if word == "y":
                continue
            if word in _SIMPLE_NUMBER_WORDS:
                current += _SIMPLE_NUMBER_WORDS[word]
            elif word == "mil":
                total += (current or 1) * 1000
                current = 0
            elif word in ("millon", "millones"):
                total = (total + (current or 1)) * 1_000_000
                current = 0
        results.append((total + current, " ".join(words)))

    for token in tokens:
        if token[0].isdigit():
            flush()
            digits = token.rstrip(".").replace(".", "")
            if digits.isdigit():
                results.append((int(digits), token))
            continue
        if token in _NUMBER_TOKENS:
            if token == "y" and not run:
                continue
            run.append(token)
            continue
        flush()
    flush()
    return results


# ── Spanish full-date parsing ──────────────────────────────────────────

_MONTHS = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "septiembre": 9, "setiembre": 9, "octubre": 10,
    "noviembre": 11, "diciembre": 12,
}


def _parse_number_word_run(words: list[str]) -> int | None:
    """Strictly parse a run of Spanish number words; None when any token is
    not part of the number grammar."""
    if not words:
        return None
    total = 0
    current = 0
    for word in words:
        if word == "y":
            continue
        if word in _ORDINAL_ONE_WORDS:
            current += 1
        elif word in _SIMPLE_NUMBER_WORDS:
            current += _SIMPLE_NUMBER_WORDS[word]
        elif word == "mil":
            total += (current or 1) * 1000
            current = 0
        elif word in ("millon", "millones"):
            total = (total + (current or 1)) * 1_000_000
            current = 0
        else:
            return None
    return total + current


def extract_spanish_dates(text: str) -> list[tuple[str, str]]:
    """Extract full written dates ("dos de febrero de dos mil veintidós") as
    ``(YYYY-MM-DD, raw_phrase)`` pairs.

    A swapped year is invisible to the plain number check when both years
    exist somewhere in the chain (escritura 2022 vs inscripción 2023 — the
    pilot's hallucination class), so dates are validated as full triples.
    """
    found: list[tuple[str, str]] = []
    normalized = normalize_text(text)
    tokens = re.findall(r"[a-z]+|\d+|[^\sa-z0-9]", normalized)
    number_vocab = (
        set(_SIMPLE_NUMBER_WORDS) | _ORDINAL_ONE_WORDS | {"y", "mil", "millon", "millones"}
    )
    for idx, token in enumerate(tokens):
        if token not in _MONTHS:
            continue
        if idx < 2 or idx + 2 >= len(tokens):
            continue
        if tokens[idx - 1] != "de" or tokens[idx + 1] != "de":
            continue
        # Day: trailing number-word run right before "de <mes>".
        day_words: list[str] = []
        cursor = idx - 2
        while cursor >= 0 and tokens[cursor] in number_vocab and len(day_words) < 6:
            day_words.insert(0, tokens[cursor])
            cursor -= 1
        # Year: leading number-word run right after "<mes> de".
        year_words: list[str] = []
        cursor = idx + 2
        while (
            cursor < len(tokens)
            and tokens[cursor] in number_vocab
            and len(year_words) < 8
        ):
            year_words.append(tokens[cursor])
            cursor += 1
        day = _parse_number_word_run(day_words)
        year = _parse_number_word_run(year_words)
        if day is None or year is None or not (1 <= day <= 31) or year < 1000:
            continue
        raw = " ".join([*day_words, "de", token, "de", *year_words])
        found.append((f"{year:04d}-{_MONTHS[token]:02d}-{day:02d}", raw))
    return found


# ── Allowed facts from the verified analysis ───────────────────────────


def _verified_values(analysis: TitleAnalysis) -> list[str]:
    values: list[str] = []
    for _, ev in _collect_evidenced_values(analysis):
        if ev.verified is True and ev.value:
            values.append(str(ev.value))
    return values


def _numbers_in_value(value: str) -> set[int]:
    numbers: set[int] = set()
    date_match = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", value.strip())
    if date_match:
        year, month, day = (int(part) for part in date_match.groups())
        return {year, month, day}
    for token in re.findall(r"\d[\d.]*", value):
        digits = token.replace(".", "")
        if digits.isdigit():
            numbers.add(int(digits))
    # Chilean RUT/rol style "4.606.955-2": both sides already captured above.
    return numbers


def allowed_block_numbers(analysis: TitleAnalysis) -> set[int]:
    """Numbers a drafted block may mention: digits of every verified value
    plus the chain ordinals. 1 is always allowed (clause header PRIMERO /
    day "primero")."""
    allowed: set[int] = {1}
    for value in _verified_values(analysis):
        allowed |= _numbers_in_value(value)
    for inscription in analysis.inscripciones:
        allowed.add(int(inscription.orden))
    return allowed


# Legal/notarial boilerplate vocabulary (normalized, accent-free). Generic
# Spanish deed language only — never a person, notary or place name; those
# must come from verified values.
BLOCK_BOILERPLATE_WORDS = frozenset(
    """
    don dona y de del la las los el en a ante que por con sobre segun consta
    constan como hoy
    escritura publica rectificatoria otorgada otorgado fecha repertorio
    numero fojas ano anos registro propiedad conservador bienes raices
    inscribio inscripcion titulo dominio adquirio adquirieron compra
    compraventa acciones derechos correspondian comun iguales partes hicieron
    hizo cesion herencia posesion efectiva especial
    inmueble denominado denominada ubicado ubicada sector comuna provincia
    region superficie hectareas hectarea metros cuadrados dato meramente
    informativo indica deslindes deslinde norte sur oriente poniente
    rol avaluo figura
    cedula nacional identidad domiciliado domiciliada kilometro camino
    chileno chilena casado casada soltero soltera divorciado divorciada
    viudo viuda separado separada
    vendedor vendedora parte tambien adelante senor senora
    notario notaria publico titular suplente interino
    primera segunda tercera cuarta quinta sexta septima octava novena decima
    undecima duodecima decimotercera decimocuarta decimoquinta vigesima
    trigesima
    lote hijuela fundo parcela resto ex plano subdivision archivado
    enero febrero marzo abril mayo junio julio agosto septiembre octubre
    noviembre diciembre
    siguiente siguientes forma adquiere siendo cuyo cuya
    """.split()
)


@dataclass(slots=True)
class BlockFactIssue:
    hecho: str
    motivo: str

    def as_dict(self) -> dict[str, str]:
        return {"hecho": self.hecho, "motivo": self.motivo}


@dataclass(slots=True)
class BlockCheckResult:
    ok: bool
    issues: list[BlockFactIssue] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {"ok": self.ok, "issues": [issue.as_dict() for issue in self.issues]}


def check_block_facts(block_text: str, analysis: TitleAnalysis) -> BlockCheckResult:
    """Validate an agent-drafted block against the verified analysis."""
    issues: list[BlockFactIssue] = []

    # 1. Numbers: words or digits, every parsed number must be allowed.
    allowed_numbers = allowed_block_numbers(analysis)
    for value, raw in extract_spanish_numbers(block_text):
        if value not in allowed_numbers:
            issues.append(
                BlockFactIssue(
                    hecho=f"{raw} ({value})",
                    motivo="numero_sin_respaldo_verificado",
                )
            )

    # 2. Full dates as triples: a swapped year between two legitimate chain
    #    numbers (escritura 2022 -> 2023) passes the plain number check, so
    #    every written date must match a verified date value exactly.
    allowed_dates = {
        value.strip()
        for value in _verified_values(analysis)
        if re.match(r"^\d{4}-\d{2}-\d{2}$", value.strip())
    }
    for date_iso, raw in extract_spanish_dates(block_text):
        if date_iso not in allowed_dates:
            issues.append(
                BlockFactIssue(
                    hecho=f"{raw} ({date_iso})",
                    motivo="fecha_sin_respaldo_verificado",
                )
            )

    # 3. Proper names: capitalized tokens must be boilerplate, number words
    #    (validated above) or present in a verified value.
    verified_blob = normalize_text(" ".join(_verified_values(analysis)))
    verified_tokens = set(re.findall(r"[a-z0-9]+", verified_blob))
    for token in re.findall(r"\b[A-ZÁÉÍÓÚÑÜ][\wÁÉÍÓÚÑÜáéíóúñü]+\b", block_text):
        normalized = normalize_text(token)
        if len(normalized) < 2:
            continue
        if normalized in BLOCK_BOILERPLATE_WORDS:
            continue
        if normalized in _NUMBER_TOKENS or normalized in _SIMPLE_NUMBER_WORDS:
            continue
        if normalized in _ORDINAL_ONE_WORDS:
            continue
        if normalized in verified_tokens:
            continue
        issues.append(
            BlockFactIssue(hecho=token, motivo="nombre_sin_respaldo_verificado")
        )

    # Deduplicate repeated findings, keep first-seen order.
    seen: set[tuple[str, str]] = set()
    unique_issues: list[BlockFactIssue] = []
    for issue in issues:
        key = (issue.hecho.lower(), issue.motivo)
        if key not in seen:
            seen.add(key)
            unique_issues.append(issue)

    return BlockCheckResult(ok=not unique_issues, issues=unique_issues)


def check_title_blocks(
    *,
    comparecencia: str | None,
    primero: str | None,
    analysis: TitleAnalysis,
) -> dict[str, dict[str, Any]]:
    """Check both narrative blocks; absent drafts are reported, not hidden."""
    results: dict[str, dict[str, Any]] = {}
    for name, text in (("comparecencia", comparecencia), ("primero", primero)):
        if not text or not text.strip():
            results[name] = BlockCheckResult(
                ok=False,
                issues=[
                    BlockFactIssue(
                        hecho="bloque completo",
                        motivo="no_redactado_por_el_agente",
                    )
                ],
            ).as_dict()
            continue
        results[name] = check_block_facts(text, analysis).as_dict()
    return results
