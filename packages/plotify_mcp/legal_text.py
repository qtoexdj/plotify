"""
Generador Legal de Textos para Lotes y Servidumbres de Plotify.
Implementación idéntica a los módulos canónicos en TypeScript del frontend de Plotify
(deslinde-generator.ts, servidumbre-generator.ts, number-to-words.ts).
"""

import math
import re
from typing import Any, Dict, List, Optional

BLANK = "___________"

UNIDADES = [
    "", "UN", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE",
    "DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISEIS", "DIECISIETE",
    "DIECIOCHO", "DIECINUEVE", "VEINTE", "VEINTIUN", "VEINTIDOS", "VEINTITRES",
    "VEINTICUATRO", "VEINTICINCO", "VEINTISEIS", "VEINTISIETE", "VEINTIOCHO", "VEINTINUEVE"
]

DECENAS = [
    "", "DIEZ", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"
]

CENTENAS = [
    "", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS",
    "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"
]


def convertir_grupo(n: int) -> str:
    if n == 0:
        return ""
    if n == 100:
        return "CIEN"

    centena = n // 100
    resto = n % 100
    resultado = ""

    if centena > 0:
        resultado = CENTENAS[centena]
        if resto == 0:
            return resultado
        resultado += " "

    if resto <= 29:
        resultado += UNIDADES[resto]
    else:
        decena = resto // 10
        unidad = resto % 10
        resultado += DECENAS[decena]
        if unidad > 0:
            resultado += " Y " + UNIDADES[unidad]

    return resultado


def entero_a_palabras(n: int) -> str:
    if n == 0:
        return "CERO"

    partes: List[str] = []

    # Millones
    millones = n // 1_000_000
    if millones > 0:
        if millones == 1:
            partes.append("UN MILLON")
        else:
            partes.append(convertir_grupo(millones) + " MILLONES")

    # Miles
    miles = (n % 1_000_000) // 1000
    if miles > 0:
        if miles == 1:
            partes.append("MIL")
        else:
            partes.append(convertir_grupo(miles) + " MIL")

    # Unidades
    unidades = n % 1000
    if unidades > 0:
        partes.append(convertir_grupo(unidades))

    return " ".join(partes).strip()


def number_to_words(value: float) -> str:
    """
    Convierte un número decimal a palabras en español (mayúsculas).
    Ej: 5133.3 -> 'CINCO MIL CIENTO TREINTA Y TRES COMA TRES'
    """
    if value is None:
        return BLANK

    entero = math.floor(abs(value))
    parte_entera = entero_a_palabras(entero)

    decimal_str = f"{abs(value):.1f}"
    parte_decimal_digito = int(decimal_str.split(".")[1])

    if parte_decimal_digito == 0:
        return parte_entera

    parte_decimal = entero_a_palabras(parte_decimal_digito)
    return f"{parte_entera} COMA {parte_decimal}"


def number_to_words_lower(value: float) -> str:
    """Convierte un número decimal a palabras en minúsculas."""
    if value is None:
        return BLANK
    return number_to_words(value).lower()


def lot_number_to_words(numero: str) -> str:
    """Convierte el número de lote a palabras en mayúsculas."""
    if not numero:
        return BLANK
    num_clean = str(numero).strip()
    try:
        parsed = int(num_clean)
        return number_to_words(parsed).replace("UN", "UNO")
    except ValueError:
        return num_clean.upper()


def convert_lot_numbers_in_text(text: str) -> str:
    """Convierte referencias tipo 'Lote 31' o '31' en texto a 'lote treinta y uno'."""
    if not text:
        return ""

    def replace_fn(match: re.Match) -> str:
        digit_str = match.group(1)
        n = int(digit_str)
        words = number_to_words_lower(n)
        words_uno = re.sub(r"\bun\b", "uno", words)
        return f"lote {words_uno}"

    return re.sub(r"(?:[Ll]otes?\s+)?\b(\d+)\b", replace_fn, text)


def format_grouped_boundaries(boundaries: List[Dict[str, Any]]) -> List[str]:
    """Agrupa tramos oficiales secuencialmente por cardinalidad y redacta la cláusula legal."""
    if not boundaries:
        return []

    groups: List[Dict[str, Any]] = []

    for b in boundaries:
        label = (b.get("label") or "").upper().strip() or BLANK
        if groups and groups[-1]["label"] == label:
            groups[-1]["items"].append(b)
        else:
            groups.append({"label": label, "items": [b]})

    # Wrap-around: Si el primer y último grupo tienen la misma etiqueta, unirlos
    if len(groups) > 1 and groups[0]["label"] == groups[-1]["label"]:
        last_group = groups.pop()
        groups[0]["items"] = last_group["items"] + groups[0]["items"]

    formatted_groups: List[str] = []

    for g in groups:
        tramos_strs: List[str] = []
        for b in g["items"]:
            dist = b.get("distance")
            if dist is not None and dist > 0:
                dist_str = f"{number_to_words_lower(dist)} metros"
            else:
                dist_str = BLANK

            neighbors_meta = b.get("neighbors_metadata")
            if neighbors_meta and len(neighbors_meta) > 0:
                names = [
                    convert_lot_numbers_in_text(
                        ("parte del " if n.get("is_partial") else "") + str(n.get("name", ""))
                    )
                    for n in neighbors_meta
                ]
                if len(names) == 2:
                    colinda = f"{names[0]} y {names[1]}"
                elif len(names) > 2:
                    colinda = f"{', '.join(names[:-1])} y {names[-1]}"
                else:
                    colinda = names[0]
            else:
                raw_colinda = (b.get("colinda") or "").strip()
                colinda = convert_lot_numbers_in_text(raw_colinda) if raw_colinda else BLANK

            tramos_strs.append(f"en {dist_str} con {colinda}")

        if len(tramos_strs) == 1:
            tramos_unidos = tramos_strs[0]
        else:
            all_but_last = ", y ".join(tramos_strs[:-1])
            last = tramos_strs[-1]
            tramos_unidos = f"{all_but_last}, y {last}"

        has_neighbors = any((b.get("colinda") or "").strip() for b in g["items"])
        sufijos = ""
        if has_neighbors:
            total_cols = " ".join((b.get("colinda") or "") for b in g["items"])
            is_plural = " y " in total_cols or "," in total_cols or len(g["items"]) > 1
            sufijos += " todos de la misma subdivisión" if is_plural else " de la misma subdivisión"

        has_servidumbre = any(b.get("es_servidumbre") for b in g["items"])
        if has_servidumbre:
            sufijos += ", servidumbre de por medio"

        formatted_groups.append(f"{g['label']}, {tramos_unidos}{sufijos}")

    return formatted_groups


def generate_deslinde_text(lot: Dict[str, Any]) -> str:
    """
    Genera el texto legal notarial completo de deslindes para un lote.
    """
    lot_name = lot_number_to_words(lot.get("numero_lote", ""))

    area = lot.get("area_official_m2") if (lot.get("area_official_m2") or 0) > 0 else lot.get("m2")
    area_text = number_to_words(area) if area and area > 0 else BLANK

    serv_m2 = lot.get("servidumbre_m2")
    servidumbre_text = number_to_words(serv_m2) if serv_m2 and serv_m2 > 0 else BLANK

    boundaries = lot.get("boundaries_official") or []
    if not boundaries:
        return (
            f"LOTE {lot_name}, de una superficie aproximada de {area_text} METROS CUADRADOS, "
            f"de los cuales {servidumbre_text} METROS CUADRADOS quedan afectas a servidumbre de tránsito, "
            f"y deslinda: {BLANK}."
        )

    formatted = format_grouped_boundaries(boundaries)
    if len(formatted) == 1:
        deslindes_str = formatted[0]
    else:
        all_but_last = "; ".join(formatted[:-1])
        last = formatted[-1]
        deslindes_str = f"{all_but_last}; y {last}"

    return (
        f"LOTE {lot_name}, de una superficie aproximada de {area_text} METROS CUADRADOS, "
        f"de los cuales {servidumbre_text} METROS CUADRADOS quedan afectas a servidumbre de tránsito, "
        f"y deslinda: {deslindes_str}."
    )


def generate_servidumbre_text(lot: Dict[str, Any]) -> str:
    """
    Genera el texto legal notarial para la cláusula de servidumbre de tránsito del lote.
    """
    lot_name = lot_number_to_words(lot.get("numero_lote", ""))
    serv_m2 = lot.get("servidumbre_m2")
    servidumbre_text = number_to_words_lower(serv_m2) if serv_m2 and serv_m2 > 0 else BLANK

    width_label = (lot.get("servidumbre_ancho_label") or "").strip()
    if width_label.lower().endswith(" m"):
        width_label = width_label[:-2].strip()
    elif width_label.lower().endswith("m"):
        width_label = width_label[:-1].strip()
    width_clause = f", de {width_label} metros de ancho" if width_label else ""

    boundaries = lot.get("boundaries_official") or []
    if not boundaries:
        return (
            f"LOTE {lot_name}. Tiene una servidumbre de {servidumbre_text} metros cuadrados{width_clause} "
            f"y deslinda: {BLANK}."
        )

    formatted_boundaries: List[str] = []
    for b in boundaries:
        label = (b.get("label") or "").upper() or BLANK
        raw_colinda = (b.get("colinda") or "").strip()
        if raw_colinda:
            colinda_text = convert_lot_numbers_in_text(raw_colinda)
            colinda = f"con servidumbre que grava al {colinda_text} de la misma subdivisión"
        else:
            colinda = BLANK

        dist = b.get("distance")
        if dist is not None and dist > 0:
            dist_text = f"{number_to_words_lower(dist)} metros"
            formatted_boundaries.append(f"{label}, en {dist_text} {colinda}")
        else:
            formatted_boundaries.append(f"{label}, {colinda}")

    if len(formatted_boundaries) == 1:
        deslindes_str = formatted_boundaries[0]
    else:
        all_but_last = "; ".join(formatted_boundaries[:-1])
        last = formatted_boundaries[-1]
        deslindes_str = f"{all_but_last}; y {last}"

    return (
        f"LOTE {lot_name}. Tiene una servidumbre de {servidumbre_text} metros cuadrados{width_clause} "
        f"y deslinda: {deslindes_str}."
    )
