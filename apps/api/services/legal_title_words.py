"""Deterministic Spanish word-rendering utilities for legal title text.

Shared by the title agent tools (drafting narrative blocks) and the
deterministic block fact-checker. Survivors of the SDD 009 pipeline->agent
migration: these helpers are pure and corpus-independent, unlike the deleted
narrative templates.
"""

from __future__ import annotations

import re
import unicodedata
from datetime import date


def number_to_words_spanish(n: int) -> str:
    """
    Convert an integer to its written Spanish text representation.
    Supports numbers up to billions.
    """
    if n == 0:
        return "cero"

    UNITS = {
        1: "uno", 2: "dos", 3: "tres", 4: "cuatro", 5: "cinco",
        6: "seis", 7: "siete", 8: "ocho", 9: "nueve"
    }
    TEENS = {
        10: "diez", 11: "once", 12: "doce", 13: "trece", 14: "catorce", 15: "quince",
        16: "dieciseis", 17: "diecisiete", 18: "dieciocho", 19: "diecinueve"
    }
    TENS = {
        20: "veinte", 30: "treinta", 40: "cuarenta", 50: "cincuenta",
        60: "sesenta", 70: "setenta", 80: "ochenta", 90: "noventa"
    }
    HUNDREDS = {
        100: "cien", 200: "doscientos", 300: "trescientos", 400: "cuatrocientos",
        500: "quinientos", 600: "seiscientos", 700: "setecientos",
        800: "ochocientos", 900: "novecientos"
    }

    def convert_under_1000(num: int) -> str:
        if num == 0:
            return ""
        if num < 10:
            return UNITS[num]
        if num < 20:
            return TEENS[num]
        if num < 100:
            if num % 10 == 0:
                return TENS[num]
            if num < 30:
                special_veinte = {
                    21: "veintiuno", 22: "veintidos", 23: "veintitres",
                    24: "veinticuatro", 25: "veinticinco", 26: "veintiseis",
                    27: "veintisiete", 28: "veintiocho", 29: "veintinueve"
                }
                return special_veinte[num]
            return f"{TENS[(num // 10) * 10]} y {UNITS[num % 10]}"
        if num < 1000:
            if num == 100:
                return "cien"
            hundred_part = (num // 100) * 100
            prefix = "ciento" if hundred_part == 100 else HUNDREDS[hundred_part]
            suffix = convert_under_1000(num % 100)
            return f"{prefix} {suffix}".strip()
        return ""

    def convert(num: int) -> str:
        if num < 1000:
            return convert_under_1000(num)
        if num < 1000000:
            thousand_part = num // 1000
            remainder = num % 1000
            if thousand_part == 1:
                prefix = "mil"
            else:
                prefix = f"{convert_under_1000(thousand_part)} mil"
            suffix = convert_under_1000(remainder)
            return f"{prefix} {suffix}".strip()
        if num < 1000000000:
            million_part = num // 1000000
            remainder = num % 1000000
            if million_part == 1:
                prefix = "un millon"
            else:
                prefix = f"{convert_under_1000(million_part)} millones"
            suffix = convert(remainder)
            return f"{prefix} {suffix}".strip()
        return str(n)

    res = convert(n)
    accent_map = {
        "veintidos": "veintidós",
        "veintitres": "veintitrés",
        "veintiseis": "veintiséis",
        "un millon": "un millón",
        "dieciseis": "dieciséis",
    }
    for k, v in accent_map.items():
        res = re.sub(r"\b" + k + r"\b", v, res)

    return res


def date_to_words_spanish(d: date | str) -> str:
    """Convert a date object or string (YYYY-MM-DD) to written Spanish words."""
    if isinstance(d, str):
        match = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", d.strip())
        if not match:
            return d
        year, month, day = map(int, match.groups())
    elif isinstance(d, date):
        year, month, day = d.year, d.month, d.day
    else:
        return str(d)

    months = {
        1: "enero", 2: "febrero", 3: "marzo", 4: "abril",
        5: "mayo", 6: "junio", 7: "julio", 8: "agosto",
        9: "septiembre", 10: "octubre", 11: "noviembre", 12: "diciembre"
    }
    month_name = months.get(month, "")

    day_words = number_to_words_spanish(day)
    if day == 1:
        day_words = "primero"

    year_words = number_to_words_spanish(year)

    return f"{day_words} de {month_name} de {year_words}"


def rut_to_words_spanish(rut: str) -> str:
    """Convert RUT string (e.g. 4.606.955-2) into Spanish words."""
    clean_rut = re.sub(r"[^\d\-kK]", "", rut)
    parts = clean_rut.split("-")
    if len(parts) == 2:
        try:
            num = int(parts[0])
            num_words = number_to_words_spanish(num)
            dv = parts[1].lower()
            dv_word = "ka" if dv == "k" else number_to_words_spanish(int(dv)) if dv.isdigit() else dv
            return f"{num_words} guion {dv_word}"
        except ValueError:
            pass
    return rut


def superficie_to_words(sup: str) -> str:
    """Convert surface description like '26,82 hectáreas' or '5100 m2' to Spanish words."""
    match = re.search(r"(\d+)(?:[.,](\d+))?", sup)
    if not match:
        return sup

    whole_str, dec_str = match.groups()
    whole_int = int(whole_str)
    whole_words = number_to_words_spanish(whole_int)

    if dec_str:
        dec_int = int(dec_str)
        dec_words = number_to_words_spanish(dec_int)
        words = f"{whole_words} coma {dec_words}"
    else:
        words = whole_words

    unit_part = re.sub(r"[\d.,\s]+", " ", sup).strip().lower()
    if "hectarea" in unit_part or "hectáreas" in unit_part or "ha" in unit_part:
        unit = "hectáreas"
    elif "metro" in unit_part or "m2" in unit_part:
        unit = "metros cuadrados"
    else:
        unit = unit_part

    return f"{words} {unit}"


def normalize_text(text: str | None) -> str:
    """Lowercase, strip accents and collapse whitespace for robust comparison."""
    if text is None:
        return ""
    text_normalized = unicodedata.normalize("NFKD", text)
    text_no_accents = "".join(c for c in text_normalized if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", text_no_accents).strip().lower()


def parse_int_or_none(value: object) -> int | None:
    """Parse a numeric field tolerant of thousand separators; None when malformed."""
    if value is None:
        return None
    cleaned = re.sub(r"[.\s]", "", str(value).strip())
    if not re.fullmatch(r"\d+", cleaned):
        return None
    return int(cleaned)
