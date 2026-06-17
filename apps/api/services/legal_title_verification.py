"""Deterministic verifier for title analysis facts and evidence."""

from __future__ import annotations

import re
import unicodedata
from typing import Any

from pydantic import BaseModel

from core.logger import get_logger
from schemas.legal_titles import EvidencedValue, TitleAnalysis

logger = get_logger(__name__)


# ── Text normalization ────────────────────────────────────────────────


def normalize_text(text: str | None) -> str:
    """
    Remove extra whitespace, lowercase, and remove accents from text
    for robust comparison.
    """
    if text is None:
        return ""
    # Normalizar caracteres unicode, remover acentos
    text_normalized = unicodedata.normalize("NFKD", text)
    text_no_accents = "".join(c for c in text_normalized if not unicodedata.combining(c))

    # Reemplazar múltiples espacios/saltos de línea por un espacio único y limpiar extremos
    text_clean = re.sub(r"\s+", " ", text_no_accents)
    return text_clean.strip().lower()


# ── Chilean Rol and Superficie Normalization & Cross-Checks ───────────


def normalize_role(role: str | None) -> str:
    """Normalize a Chilean rol de avalúo (e.g. '00067-00023' or '67-23' -> '67-23')."""
    if not role:
        return ""
    # Remove any character that is not a digit or hyphen
    cleaned = re.sub(r"[^\d\-]", "", role)
    parts = cleaned.split("-")
    if len(parts) == 2:
        try:
            # Strip leading zeros from each numeric part
            part1 = str(int(parts[0]))
            part2 = str(int(parts[1]))
            return f"{part1}-{part2}"
        except ValueError:
            pass
    return cleaned.strip().lower()


def parse_chilean_float(s: str) -> float | None:
    """Parse a Chilean numeric string that might use dots as thousand separators and commas as decimals."""
    s = s.strip()
    if not s:
        return None
    # Handle cases with thousand dot and decimal comma
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "").replace(".", ".")
    elif "," in s:
        parts = s.split(",")
        if len(parts) == 2 and len(parts[1]) in (1, 2):
            s = s.replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "." in s:
        parts = s.split(".")
        if len(parts) == 2 and len(parts[1]) == 3:
            s = s.replace(".", "")
    try:
        return float(s)
    except ValueError:
        return None


def check_superficie_consistency(superficie_text: str | None, plano_superficie: float | None) -> bool:
    """Check if the extracted surface text is consistent with the plano/SAG surface in m2 or hectares."""
    if plano_superficie is None:
        return True
    if not superficie_text:
        return False

    # Clean text to keep only digits, dots, commas, and spaces
    cleaned = re.sub(r"[^\d.,\s]", " ", superficie_text)
    words = cleaned.split()

    targets = [
        plano_superficie,
        plano_superficie / 10000.0,
        plano_superficie * 10000.0
    ]

    for word in words:
        val = parse_chilean_float(word)
        if val is not None:
            for target in targets:
                if abs(val - target) < 1e-5 or (target > 0 and abs(val - target) / target < 0.001):
                    return True
    return False


# ── Value-vs-Snippet Consistency ──────────────────────────────────────


def number_to_spanish(n: int) -> list[str]:
    """Spanish word candidates for an integer. Covers any magnitude via the
    shared deterministic renderer (titles cite fojas/números in the
    thousands), keeping the historical sin-acentos variants for OCR text."""
    from services.legal_title_words import number_to_words_spanish

    rendered = number_to_words_spanish(n)
    candidates = [rendered]
    # Typewriter-era documents and OCR routinely drop accents.
    unaccented = normalize_text(rendered)
    if unaccented != rendered:
        candidates.append(unaccented)
    return candidates


def _clean_punc(text: str) -> str:
    """Drop thousand separators and turn remaining punctuation into spaces."""
    t = text.replace(".", "").replace(",", "")
    t = re.sub(r"[\-\(\)\/\\°º\"\'\[\]\:\;]", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def _contains_token(haystack: str, needle: str) -> bool:
    """Whole-token containment: '23' must not match inside '123', and 'dos'
    must not match inside 'doscientos'. Multi-word needles match as phrases."""
    if not needle:
        return False
    return re.search(r"(?<!\w)" + re.escape(needle) + r"(?!\w)", haystack) is not None


def check_value_snippet_consistency(value: str | None, snippet: str | None) -> bool:
    """Verify if the parsed value is consistent with the text snippet (catches hallucinations)."""
    if not value:
        return True
    if not snippet:
        return False

    norm_val = normalize_text(value)
    norm_snip = normalize_text(snippet)

    clean_val = _clean_punc(norm_val)
    clean_snip = _clean_punc(norm_snip)

    # 1. Direct substring check on cleaned versions
    if clean_val in clean_snip:
        return True

    # 2. Date consistency check (YYYY-MM-DD)
    date_match = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", value.strip())
    if date_match:
        year_str, month_str, day_str = date_match.groups()
        year_int = int(year_str)
        month_int = int(month_str)
        day_int = int(day_str)

        # Day
        day_words = number_to_spanish(day_int)
        if day_int == 1:
            day_words.append("primero")
        day_ok = (
            _contains_token(clean_snip, day_str) or
            _contains_token(clean_snip, str(day_int)) or
            any(_contains_token(clean_snip, _clean_punc(normalize_text(w))) for w in day_words)
        )

        # Check month
        months_spanish = {
            1: ["enero"], 2: ["febrero"], 3: ["marzo"], 4: ["abril"],
            5: ["mayo"], 6: ["junio"], 7: ["julio"], 8: ["agosto"],
            9: ["septiembre", "setiembre"], 10: ["octubre"],
            11: ["noviembre"], 12: ["diciembre"]
        }
        month_words = months_spanish.get(month_int, [])
        month_ok = (
            _contains_token(clean_snip, month_str) or
            _contains_token(clean_snip, str(month_int)) or
            any(_contains_token(clean_snip, _clean_punc(normalize_text(w))) for w in month_words)
        )

        # Check year. For years divisible by 100 the two-digit remainder is 0,
        # and accepting "cero"/"0" as evidence would match almost any snippet.
        year_words = []
        if year_int % 100:
            year_words.extend(number_to_spanish(year_int % 100))
        if year_int >= 2000:
            suffix = number_to_spanish(year_int % 100)[0] if year_int % 100 else ""
            year_words.append(f"dos mil {suffix}".strip())
        elif year_int >= 1900:
            suffix = number_to_spanish(year_int % 100)[0] if year_int % 100 else ""
            year_words.append(f"mil novecientos {suffix}".strip())

        year_ok = (
            _contains_token(clean_snip, year_str) or
            (year_int % 100 != 0 and _contains_token(clean_snip, str(year_int % 100))) or
            any(_contains_token(clean_snip, _clean_punc(normalize_text(w))) for w in year_words)
        )

        return day_ok and month_ok and year_ok

    # 3. Rol de avalúo consistency check (matches \d+-\d+)
    role_match = re.match(r"^(\d+)-(\d+)$", value.strip())
    if role_match:
        part1_str, part2_str = role_match.groups()
        part1_int = int(part1_str)
        part2_int = int(part2_str)

        part1_words = number_to_spanish(part1_int)
        part2_words = number_to_spanish(part2_int)

        part1_ok = (
            _contains_token(clean_snip, part1_str) or
            any(_contains_token(clean_snip, _clean_punc(normalize_text(w))) for w in part1_words)
        )
        part2_ok = (
            _contains_token(clean_snip, part2_str) or
            any(_contains_token(clean_snip, _clean_punc(normalize_text(w))) for w in part2_words)
        )
        return part1_ok and part2_ok

    # 4. Word-based token consistency (covers names/surnames/sentences)
    val_words = [w for w in clean_val.split() if len(w) >= 3]
    if not val_words:
        return clean_val in clean_snip
    return all(_contains_token(clean_snip, w) for w in val_words)


# ── OCR-noise heuristic for failed name matches ───────────────────────


def _within_edit_distance_one(a: str, b: str) -> bool:
    """True when a and b differ by at most one edit (insert/delete/replace)."""
    if a == b:
        return True
    if abs(len(a) - len(b)) > 1:
        return False
    if len(a) > len(b):
        a, b = b, a
    # a is the shorter (or equal length) string
    i = j = 0
    edited = False
    while i < len(a) and j < len(b):
        if a[i] == b[j]:
            i += 1
            j += 1
            continue
        if edited:
            return False
        edited = True
        if len(a) == len(b):
            i += 1
        j += 1
    return True


def is_ocr_suspect(value: str | None, snippet: str | None) -> bool:
    """A failed value/snippet match is 'OCR suspect' when every failing token
    of the value has a snippet token within edit distance 1 (Minghel/Minchel).
    The value stays unverified; this only prioritizes lawyer review (spec edge
    case: typewriter titles + OCR can differ by one character)."""
    if not value or not snippet:
        return False
    clean_val = _clean_punc(normalize_text(value))
    clean_snip = _clean_punc(normalize_text(snippet))
    val_words = [w for w in clean_val.split() if len(w) >= 3]
    if not val_words:
        return False
    snip_words = clean_snip.split()
    for word in val_words:
        if _contains_token(clean_snip, word):
            continue
        if not any(_within_edit_distance_one(word, candidate) for candidate in snip_words):
            return False
    return True


# ── Snippet matching ──────────────────────────────────────────────────


def check_snippet_match(page_text: str | None, snippet: str | None) -> bool:
    """Verify if the normalized snippet is a literal substring of the normalized page text."""
    if not snippet or not page_text:
        return False

    norm_page = normalize_text(page_text)
    norm_snippet = normalize_text(snippet)

    return norm_snippet in norm_page


# ── Per-field verification ────────────────────────────────────────────


def verify_evidenced_value(
    value: str | None,
    snippet: str | None,
    page_text: str | None,
) -> bool:
    """
    Runs deterministic verification checks:
    1. Snippet must exist literally within page text (after normalization).
    2. Value must be consistent with snippet.

    Returns True if the snippet is found in the page text and consistent, False otherwise.
    """
    if not check_snippet_match(page_text, snippet):
        return False

    if not check_value_snippet_consistency(value, snippet):
        return False

    return True


# ── Recursive EvidencedValue collector ────────────────────────────────


def _collect_evidenced_values(
    obj: Any,
    path_prefix: str = "",
) -> list[tuple[str, EvidencedValue]]:
    """Recursively collect all EvidencedValue instances with their dot-paths.

    Walks the Pydantic model tree starting from ``obj``, yielding
    ``(path, evidenced_value)`` for every EvidencedValue found.
    """
    results: list[tuple[str, EvidencedValue]] = []

    if isinstance(obj, EvidencedValue):
        results.append((path_prefix, obj))
        return results

    if isinstance(obj, BaseModel):
        for field_name in type(obj).model_fields:
            child = getattr(obj, field_name, None)
            if child is None:
                continue
            child_path = f"{path_prefix}.{field_name}" if path_prefix else field_name
            results.extend(_collect_evidenced_values(child, child_path))

    if isinstance(obj, list):
        for i, item in enumerate(obj):
            child_path = f"{path_prefix}[{i}]"
            results.extend(_collect_evidenced_values(item, child_path))

    return results


# ── Full analysis verification ────────────────────────────────────────


async def verify_title_analysis(
    analysis: TitleAnalysis,
    pages_by_doc: dict[str, dict[int, str]],
    sii_rol_matriz: str | None = None,
    plano_superficie: float | None = None,
) -> dict[str, Any]:
    """
    Recursively processes all EvidencedValue objects in TitleAnalysis,
    updates their ``verified`` field, and generates verification_stats.

    For each EvidencedValue with a non-null value:
    - If no evidence or snippet exists → ``verified = False``, reason ``no_evidence``.
    - If the referenced page is not found → ``verified = False``, reason ``page_not_found``.
    - If the snippet does not match the page text → ``verified = False``, reason ``snippet_mismatch``.
    - If the value is not consistent with the snippet → ``verified = False``, reason ``value_mismatch``.
    - Otherwise → ``verified = True``.

    After field verification, runs cross-checks:
    - ``property_identity.rol_avaluo`` vs ``sii_rol_matriz``. Mismatch degrades it and sets reason ``sii_mismatch``.
    - ``property_identity.superficie_texto`` vs ``plano_superficie``. Mismatch degrades it and sets reason ``superficie_mismatch``.
    """
    logger.info("verify_title_analysis_start")

    evidenced_values = _collect_evidenced_values(analysis)

    verified_count = 0
    unverified_count = 0
    failures: list[dict[str, Any]] = []

    for path, ev in evidenced_values:
        # ── Skip entirely null entries (no fact to verify) ──
        if ev.value is None and ev.evidence is None:
            continue

        # ── Value present but no evidence → unverified ──
        if ev.evidence is None or ev.evidence.snippet is None:
            if ev.value is not None:
                ev.verified = False
                unverified_count += 1
                failures.append({
                    "path": path,
                    "reason": "no_evidence",
                    "proposed_snippet": None,
                })
            continue

        # ── Look up page text ──
        doc_id = ev.evidence.legal_document_id
        page_num = ev.evidence.page_number

        doc_pages = pages_by_doc.get(doc_id) if doc_id else None
        page_text = (
            doc_pages.get(page_num) if doc_pages and page_num is not None else None
        )

        if page_text is None:
            ev.verified = False
            unverified_count += 1
            failures.append({
                "path": path,
                "reason": "page_not_found",
                "proposed_snippet": ev.evidence.snippet,
            })
            continue

        # ── Check snippet match and value consistency ──
        if not check_snippet_match(page_text, ev.evidence.snippet):
            ev.verified = False
            unverified_count += 1
            failures.append({
                "path": path,
                "reason": "snippet_mismatch",
                "proposed_snippet": ev.evidence.snippet,
            })
        elif not check_value_snippet_consistency(ev.value, ev.evidence.snippet):
            ev.verified = False
            unverified_count += 1
            failures.append({
                "path": path,
                # ocr_suspect keeps the value unverified; it only tells the
                # reviewer this looks like one-character OCR noise, not a
                # hallucination (spec: visual verification on low-OCR snippets).
                "reason": (
                    "value_mismatch_ocr_suspect"
                    if is_ocr_suspect(ev.value, ev.evidence.snippet)
                    else "value_mismatch"
                ),
                "proposed_snippet": ev.evidence.snippet,
            })
        else:
            ev.verified = True
            verified_count += 1

    # ── Cross-checks: SII Rol Matriz ──
    if sii_rol_matriz is not None:
        for path, ev in evidenced_values:
            if path == "property_identity.rol_avaluo" and ev.verified is True and ev.value is not None:
                if normalize_role(ev.value) != normalize_role(sii_rol_matriz):
                    ev.verified = False
                    verified_count -= 1
                    unverified_count += 1
                    failures.append({
                        "path": path,
                        "reason": "sii_mismatch",
                        "proposed_snippet": ev.evidence.snippet if ev.evidence else None,
                    })

    # ── Cross-checks: Plano/SAG Superficie ──
    if plano_superficie is not None:
        for path, ev in evidenced_values:
            if path == "property_identity.superficie_texto" and ev.verified is True and ev.value is not None:
                if not check_superficie_consistency(ev.value, plano_superficie):
                    ev.verified = False
                    verified_count -= 1
                    unverified_count += 1
                    failures.append({
                        "path": path,
                        "reason": "superficie_mismatch",
                        "proposed_snippet": ev.evidence.snippet if ev.evidence else None,
                    })

    stats = {
        "verified_count": verified_count,
        "unverified_count": unverified_count,
        "failures": failures,
    }

    logger.info(
        "verify_title_analysis_complete",
        verified_count=verified_count,
        unverified_count=unverified_count,
        failure_count=len(failures),
    )

    return stats
