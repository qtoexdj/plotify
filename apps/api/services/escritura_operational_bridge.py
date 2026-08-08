"""SDD 008 US6: operational data bridge for escritura cases.

Maps operational rows (`lot_records`, `lots`, `organization_payment_info`)
into auditable variable proposals (research D3). This module owns the
field-by-field mapping and the source-row hashing used for idempotency
(FR-019/FR-021); staging through ``LegalVariableResolutionService`` happens
in :func:`stage_operational_variables`.

Architecture rule (agent-execution.md #1): this bridge is the ONLY producer
that reads operational tables for the matriz; the builder and the renderer
consume the case snapshot exclusively.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
from dataclasses import dataclass, field
from typing import Any

import re

from core.logger import get_logger
from services.legal_title_words import (
    hectareas_to_words,
    metros_cuadrados_to_words,
    number_to_words_spanish,
    pesos_to_words,
    quantity_to_words,
)

logger = get_logger(__name__)

OPERATIONAL_BRIDGE_EXTRACTOR_NAME = "operational_bridge_v1"

# Variable keys produced by each operational source (research D3 table).
LOT_RECORD_VARIABLE_KEYS = (
    "comprador.nombre",
    "comprador.rut",
    "comprador.domicilio",
    "comprador.estado_civil",
    "comprador.profesion_giro",
    "comprador.nacionalidad",
    "transaccion.precio_numeros",
    "transaccion.moneda",
    "transaccion.forma_pago",
    "transaccion.detalle_pago[]",
    "transaccion.saldo_pendiente",
)
LOT_GEOMETRY_VARIABLE_KEYS = (
    "lote.numero",
    "lote.numero_nombre",
    "lote.superficie_m2",
    "lote.boundaries_official",
    "lote.deslindes",
    "servidumbre.aplica",
    "servidumbre.superficie_m2",
    "servidumbre.ancho_label",
    "servidumbre.predio_sirviente",
    "servidumbre.predios_dominantes",
    "servidumbre.deslindes_tramo",
)
DERIVED_VARIABLE_KEYS = (
    "transaccion.precio_letras",
    "lote.superficie_texto",
    "lote.superficie_ha_texto",
    "servidumbre.superficie_texto",
)


class OperationalBridgeError(Exception):
    """Base error for operational bridge failures."""


class OperationalBridgeScopeError(OperationalBridgeError):
    """Raised when the case/lot scope cannot be proven."""


@dataclass(frozen=True)
class BridgeVariable:
    """One mapped operational value, pre-staging."""

    variable_key: str
    value_text: str | None
    value_json: Any
    source_type: str  # system | geometry | derived
    source: str  # lot_records | lots | organization_payment_info | derived
    source_row_id: str | None
    source_row_hash: str

    @property
    def has_value(self) -> bool:
        return bool(self.value_text) or self.value_json is not None

    def source_ref(self) -> dict[str, Any]:
        ref: dict[str, Any] = {
            "source": self.source,
            "source_row_hash": self.source_row_hash,
        }
        if self.source_row_id:
            ref["row_id"] = self.source_row_id
        return ref


@dataclass(frozen=True)
class BridgeMapping:
    """All mapped variables for a case, plus the keys with no source value."""

    variables: tuple[BridgeVariable, ...] = ()
    missing_keys: tuple[str, ...] = ()


def compute_source_row_hash(fields: dict[str, Any]) -> str:
    """Stable sha256 of the source fields actually used by the mapping.

    Only re-propose when one of these fields changes; unrelated row updates
    (e.g. cbr_estado) must not invalidate staged proposals.
    """
    payload = json.dumps(fields, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _clean(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _format_clp(amount: int | float) -> str:
    """45000000 -> '45.000.000' (Chilean thousands separator)."""
    whole = int(round(amount))
    return f"{whole:,}".replace(",", ".")


def _distance_words(value: Any) -> str | None:
    """60 -> 'sesenta metros'; 85.5 -> 'ochenta y cinco coma cinco metros'."""
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number <= 0:
        return None
    return f"{quantity_to_words(number)} metros"


_LOT_NUMBER_PATTERN = re.compile(r"[Ll]otes?\s+(?:N\s*[°º]\s*)?(\d+)")


def _lot_numbers_to_words(text: str) -> str:
    """'lote 24' / 'Lote N°2' -> 'lote veinticuatro' / 'lote dos'.

    Espejo acotado de convertLotNumbersInText (deslinde-generator.ts): solo
    convierte números precedidos por 'lote'; un número suelto ('Parcela 5',
    'Ruta 5') se deja intacto para no inventar lotes en el texto legal.
    """

    def replace(match: re.Match[str]) -> str:
        words = number_to_words_spanish(int(match.group(1)))
        return f"lote {re.sub(r'un$', 'uno', words)}"

    return _LOT_NUMBER_PATTERN.sub(replace, text)


def _boundary_neighbor_text(boundary: dict[str, Any]) -> str | None:
    """Redacción del colindante de un tramo, priorizando metadata estructurada
    (mismo orden que formatGroupedBoundaries en deslinde-generator.ts)."""
    metadata = boundary.get("neighbors_metadata")
    if isinstance(metadata, list) and metadata:
        names: list[str] = []
        for neighbor in metadata:
            if not isinstance(neighbor, dict):
                continue
            name = _clean(neighbor.get("name"))
            if not name:
                continue
            prefix = "parte del " if neighbor.get("is_partial") else ""
            names.append(_lot_numbers_to_words(f"{prefix}{name}"))
        if names:
            if len(names) == 1:
                return names[0]
            return f"{', '.join(names[:-1])} y {names[-1]}"
    raw = _clean(boundary.get("colinda")) or _clean(boundary.get("description"))
    return _lot_numbers_to_words(raw) if raw else None


def compose_deslindes_text(boundaries: list[dict[str, Any]] | None) -> str | None:
    """Compose the legal deslindes sentence from ``lots.boundaries_official``.

    Production shape (apps/web types): ``[{label, description, distance?,
    colinda?, es_servidumbre?, neighbors_metadata?}, ...]``. Espejo del
    formato oficial de deslinde-generator.ts (validado contra la escritura
    real LOTE 29): agrupación por cardinalidad consecutiva con wrap-around,
    'parte del' desde neighbors_metadata, números de lote en palabras,
    sufijo 'de la misma subdivisión' y 'servidumbre de por medio' cuando el
    tramo toca la servidumbre (``es_servidumbre``). Un tramo sin colindante
    hace fallar la composición (la variable queda missing) en vez de
    renderizar un hueco silencioso.
    """
    if not boundaries:
        return None

    # 1. Agrupar tramos consecutivos por cardinalidad (+ wrap-around).
    groups: list[dict[str, Any]] = []
    for boundary in boundaries:
        if not isinstance(boundary, dict):
            return None
        label = _clean(boundary.get("label"))
        if not label:
            return None
        label = label.upper()
        if groups and groups[-1]["label"] == label:
            groups[-1]["items"].append(boundary)
        else:
            groups.append({"label": label, "items": [boundary]})
    if len(groups) > 1 and groups[0]["label"] == groups[-1]["label"]:
        last = groups.pop()
        groups[0]["items"] = last["items"] + groups[0]["items"]

    # 2. Redactar cada grupo.
    parts: list[str] = []
    for group in groups:
        tramos: list[str] = []
        neighbor_texts: list[str] = []
        for boundary in group["items"]:
            neighbor = _boundary_neighbor_text(boundary)
            if not neighbor:
                return None
            neighbor_texts.append(neighbor)
            distance_words = _distance_words(boundary.get("distance"))
            if distance_words:
                tramos.append(f"en {distance_words} con {neighbor}")
            else:
                tramos.append(f"con {neighbor}")
        joined = ", y ".join(tramos)

        suffixes = ""
        all_neighbors = " ".join(neighbor_texts)
        # 'de la misma subdivisión' solo cuando el colindante es un lote y la
        # redacción no lo trae ya (colindas manuales suelen incluirlo).
        if "lote" in all_neighbors.lower() and "subdivisión" not in all_neighbors:
            plural = (
                len(group["items"]) > 1
                or " y " in all_neighbors
                or "," in all_neighbors
            )
            suffixes += (
                " todos de la misma subdivisión"
                if plural
                else " de la misma subdivisión"
            )
        if any(item.get("es_servidumbre") for item in group["items"]):
            suffixes += ", servidumbre de por medio"

        parts.append(f"{group['label']}, {joined}{suffixes}")

    if not parts:
        return None
    if len(parts) > 1:
        return "; ".join(parts[:-1]) + f"; y {parts[-1]}"
    return parts[0]


def _ancho_words(lot: dict[str, Any]) -> str | None:
    """Ancho de la servidumbre en palabras: 5 -> 'cinco'; '5 y 10' -> 'cinco y
    diez' (ancho variable por tramo). Prefiere el label (puede describir más
    de un ancho) y cae al ancho numérico."""
    label = _clean(lot.get("servidumbre_ancho_label"))
    source = label or _clean(lot.get("servidumbre_ancho_m"))
    if not source:
        return None
    return re.sub(
        r"\d+(?:[.,]\d+)?",
        lambda match: quantity_to_words(float(match.group(0).replace(",", "."))),
        source,
    )


def compose_servidumbre_tramo_text(lot: dict[str, Any]) -> str | None:
    """Describe el tramo de servidumbre que grava el lote (clausula
    servidumbre_transito, token ``servidumbre.deslindes_tramo``), p. ej.
    'franja de ocho metros de ancho a lo largo del deslinde Oriente del Lote
    N°3, según el trazado que consta en el plano de subdivisión archivado'.
    Deriva de datos que el puente ya carga: ancho oficial + los deslindes
    marcados ``es_servidumbre`` en la verificación del lote. Sin ancho ni
    deslindes marcados igual produce la referencia al plano (nunca deja la
    clausula bloqueada por un dato que solo existe dibujado en el plano)."""
    ancho = _ancho_words(lot)
    fragments = ["franja"]
    if ancho:
        fragments.append(f"de {ancho} metros de ancho")
    else:
        fragments.append("de servidumbre de tránsito")

    boundaries = lot.get("boundaries_official")
    if isinstance(boundaries, list):
        directions = [
            _clean(boundary.get("label"))
            for boundary in boundaries
            if isinstance(boundary, dict)
            and boundary.get("es_servidumbre")
            and _clean(boundary.get("label"))
        ]
        if directions:
            joined = (
                directions[0]
                if len(directions) == 1
                else f"{', '.join(directions[:-1])} y {directions[-1]}"
            )
            prefix = (
                "a lo largo de los deslindes"
                if len(directions) > 1
                else "a lo largo del deslinde"
            )
            fragments.append(f"{prefix} {joined}")

    numero = _clean(lot.get("numero_lote"))
    if numero:
        fragments.append(f"del Lote N°{numero}")
    fragments.append(
        ", según el trazado que consta en el plano de subdivisión archivado"
    )
    return " ".join(fragments).replace(" ,", ",")


# Redacción estándar de la servidumbre recíproca: en una parcelación todos
# los demás lotes son predios dominantes; el detalle fino vive en el plano.
PREDIOS_DOMINANTES_DEFAULT = "los demás lotes de la misma subdivisión"


def _lot_record_hash_fields(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "cliente_nombre": record.get("cliente_nombre"),
        "cliente_run": record.get("cliente_run"),
        "cliente_direccion": record.get("cliente_direccion"),
        "cliente_estado_civil": record.get("cliente_estado_civil"),
        "cliente_ocupacion": record.get("cliente_ocupacion"),
        "cliente_nacionalidad": record.get("cliente_nacionalidad"),
        "valor": record.get("valor"),
        "abono": record.get("abono"),
        "saldo": record.get("saldo"),
    }


def _lot_hash_fields(lot: dict[str, Any]) -> dict[str, Any]:
    return {
        "numero_lote": lot.get("numero_lote"),
        "area_official_m2": lot.get("area_official_m2"),
        "superficie_neta_m2": lot.get("superficie_neta_m2"),
        "boundaries_official": lot.get("boundaries_official"),
        "servidumbre_m2": lot.get("servidumbre_m2"),
        "servidumbre_ancho_m": lot.get("servidumbre_ancho_m"),
        "servidumbre_ancho_label": lot.get("servidumbre_ancho_label"),
    }


def _payment_hash_fields(payment_info: dict[str, Any] | None) -> dict[str, Any]:
    if not payment_info:
        return {}
    return {
        "banco": payment_info.get("banco"),
        "tipo_cuenta": payment_info.get("tipo_cuenta"),
        "numero_cuenta": payment_info.get("numero_cuenta"),
        "razon_social": payment_info.get("razon_social"),
    }


def map_lot_record_variables(
    record: dict[str, Any],
    payment_info: dict[str, Any] | None = None,
) -> BridgeMapping:
    """Map ``lot_records`` (+ payment info) to comprador.* / transaccion.*."""
    row_id = _clean(record.get("id"))
    row_hash = compute_source_row_hash(
        {**_lot_record_hash_fields(record), **_payment_hash_fields(payment_info)}
    )

    def system_var(key: str, value_text: str | None, value_json: Any = None) -> BridgeVariable:
        return BridgeVariable(
            variable_key=key,
            value_text=value_text,
            value_json=value_json,
            source_type="system",
            source="lot_records",
            source_row_id=row_id,
            source_row_hash=row_hash,
        )

    variables: list[BridgeVariable] = [
        system_var("comprador.nombre", _clean(record.get("cliente_nombre"))),
        system_var("comprador.rut", _clean(record.get("cliente_run"))),
        system_var("comprador.domicilio", _clean(record.get("cliente_direccion"))),
        system_var("comprador.estado_civil", _clean(record.get("cliente_estado_civil"))),
        system_var("comprador.profesion_giro", _clean(record.get("cliente_ocupacion"))),
        system_var("comprador.nacionalidad", _clean(record.get("cliente_nacionalidad"))),
    ]

    valor = record.get("valor")
    abono = record.get("abono")
    saldo = record.get("saldo")
    if valor is not None:
        variables.append(
            system_var("transaccion.precio_numeros", _format_clp(valor), valor)
        )
        variables.append(system_var("transaccion.moneda", "$"))
    else:
        variables.append(system_var("transaccion.precio_numeros", None))
        variables.append(system_var("transaccion.moneda", None))

    variables.append(
        system_var("transaccion.forma_pago", _forma_pago_text(abono, saldo))
    )
    detalle = _detalle_pago_items(abono, saldo, payment_info)
    variables.append(
        system_var(
            "transaccion.detalle_pago[]",
            None,
            detalle if detalle else None,
        )
    )
    variables.append(
        system_var("transaccion.saldo_pendiente", _saldo_pendiente_text(saldo))
    )

    mapped = tuple(variables)
    missing = tuple(var.variable_key for var in mapped if not var.has_value)
    return BridgeMapping(variables=mapped, missing_keys=missing)


def _forma_pago_text(abono: Any, saldo: Any) -> str | None:
    has_abono = abono is not None and abono > 0
    has_saldo = saldo is not None and saldo > 0
    if has_abono and has_saldo:
        return (
            "una parte al contado en este acto y el saldo contra la inscripción "
            "del inmueble a nombre del comprador, según se detalla a continuación"
        )
    if has_saldo:
        return (
            "el saldo de precio contra la inscripción del inmueble a nombre del "
            "comprador, según se detalla a continuación"
        )
    if abono is None and saldo is None:
        return None
    return "al contado, pagado en este acto a entera satisfacción del vendedor"


def _saldo_pendiente_text(saldo: Any) -> str | None:
    if saldo is None:
        return None
    if saldo <= 0:
        return "sin obligaciones pendientes"
    return (
        f"el saldo de {pesos_to_words(int(saldo))} pagadero "
        "contra inscripción, garantizado mediante instrucciones notariales"
    )


def _detalle_pago_items(
    abono: Any,
    saldo: Any,
    payment_info: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    medio_abono = "transferencia electrónica a la cuenta del vendedor"
    if payment_info and payment_info.get("banco"):
        medio_abono = (
            f"transferencia electrónica a la {payment_info.get('tipo_cuenta')} "
            f"número {payment_info.get('numero_cuenta')} del "
            f"{payment_info.get('banco')}"
        )
    if abono is not None and abono > 0:
        items.append(
            {
                "concepto": "Abono pagado a la firma de la promesa",
                "monto_numeros": int(abono),
                "monto_letras": pesos_to_words(int(abono)),
                "medio": medio_abono,
            }
        )
    if saldo is not None and saldo > 0:
        items.append(
            {
                "concepto": "Saldo de precio pagadero contra inscripción",
                "monto_numeros": int(saldo),
                "monto_letras": pesos_to_words(int(saldo)),
                "medio": "instrucciones notariales irrevocables dejadas en la notaría que autoriza",
            }
        )
    return items


def map_lot_geometry_variables(lot: dict[str, Any]) -> BridgeMapping:
    """Map ``lots`` official geometry to lote.* / servidumbre.* (geometry)."""
    row_id = _clean(lot.get("id"))
    row_hash = compute_source_row_hash(_lot_hash_fields(lot))

    def geometry_var(key: str, value_text: str | None, value_json: Any = None) -> BridgeVariable:
        return BridgeVariable(
            variable_key=key,
            value_text=value_text,
            value_json=value_json,
            source_type="geometry",
            source="lots",
            source_row_id=row_id,
            source_row_hash=row_hash,
        )

    numero = _clean(lot.get("numero_lote"))
    superficie = lot.get("area_official_m2") or lot.get("superficie_neta_m2")
    boundaries = lot.get("boundaries_official")
    deslindes = compose_deslindes_text(
        boundaries if isinstance(boundaries, list) else None
    )
    servidumbre_m2 = lot.get("servidumbre_m2")
    servidumbre_ancho_label = _clean(lot.get("servidumbre_ancho_label"))
    servidumbre_aplica = servidumbre_m2 is not None and servidumbre_m2 > 0

    variables = [
        BridgeVariable(
            variable_key="lote.numero",
            value_text=numero,
            value_json=None,
            source_type="system",
            source="lots",
            source_row_id=row_id,
            source_row_hash=row_hash,
        ),
        BridgeVariable(
            variable_key="lote.numero_nombre",
            value_text=f"Lote N°{numero}" if numero else None,
            value_json=None,
            source_type="system",
            source="lots",
            source_row_id=row_id,
            source_row_hash=row_hash,
        ),
        geometry_var(
            "lote.superficie_m2",
            _clean(superficie),
            superficie,
        ),
        geometry_var(
            "lote.boundaries_official",
            None,
            boundaries if isinstance(boundaries, list) and boundaries else None,
        ),
        geometry_var("lote.deslindes", deslindes),
        geometry_var(
            "servidumbre.aplica",
            "true" if servidumbre_aplica else "false",
            servidumbre_aplica,
        ),
    ]
    if servidumbre_aplica:
        variables.append(
            geometry_var(
                "servidumbre.superficie_m2",
                _clean(servidumbre_m2),
                servidumbre_m2,
            )
        )
        if servidumbre_ancho_label:
            variables.append(
                geometry_var(
                    "servidumbre.ancho_label",
                    servidumbre_ancho_label,
                    servidumbre_ancho_label,
                )
            )
        # Tokens de la clausula servidumbre_transito (antes huérfanos: ningún
        # productor los generaba y dejaban la matriz del caso inaprobable
        # para todo lote con servidumbre).
        variables.append(
            geometry_var(
                "servidumbre.predio_sirviente",
                f"Lote N°{numero}" if numero else None,
            )
        )
        variables.append(
            geometry_var(
                "servidumbre.predios_dominantes",
                PREDIOS_DOMINANTES_DEFAULT,
            )
        )
        variables.append(
            geometry_var(
                "servidumbre.deslindes_tramo",
                compose_servidumbre_tramo_text(lot),
            )
        )
    mapped = tuple(variables)
    missing = tuple(var.variable_key for var in mapped if not var.has_value)
    return BridgeMapping(variables=mapped, missing_keys=missing)


def build_derived_variables(
    *,
    record_variables: tuple[BridgeVariable, ...],
    lot_variables: tuple[BridgeVariable, ...],
) -> tuple[BridgeVariable, ...]:
    """Words-rendered derivations (FR-020) via the shared engine (D4).

    Each derived value inherits its parent's source row hash so idempotency
    follows the source row; a derived value is only staged when its parent
    has a value (a missing parent already surfaces through its own gate).
    """
    by_key = {var.variable_key: var for var in (*record_variables, *lot_variables)}

    def derived_from(parent_key: str, key: str, value_text: str) -> BridgeVariable:
        parent = by_key[parent_key]
        return BridgeVariable(
            variable_key=key,
            value_text=value_text,
            value_json=None,
            source_type="derived",
            source="derived",
            source_row_id=parent.source_row_id,
            source_row_hash=parent.source_row_hash,
        )

    derived: list[BridgeVariable] = []

    precio = by_key.get("transaccion.precio_numeros")
    if precio and precio.value_json is not None:
        derived.append(
            derived_from(
                "transaccion.precio_numeros",
                "transaccion.precio_letras",
                pesos_to_words(precio.value_json),
            )
        )

    superficie = by_key.get("lote.superficie_m2")
    if superficie and superficie.value_json is not None:
        m2 = float(superficie.value_json)
        derived.append(
            derived_from(
                "lote.superficie_m2",
                "lote.superficie_texto",
                metros_cuadrados_to_words(m2),
            )
        )
        derived.append(
            derived_from(
                "lote.superficie_m2",
                "lote.superficie_ha_texto",
                hectareas_to_words(round(m2 / 10000, 4)),
            )
        )

    servidumbre = by_key.get("servidumbre.superficie_m2")
    if servidumbre and servidumbre.value_json is not None:
        derived.append(
            derived_from(
                "servidumbre.superficie_m2",
                "servidumbre.superficie_texto",
                metros_cuadrados_to_words(float(servidumbre.value_json)),
            )
        )

    return tuple(derived)


# ─── Staging through the SDD 007 variable state machine (T013/T015) ─────────

# Human-reviewed states the bridge must never supersede (FR-021): approved
# values, explicit not-applicable decisions and manually resolved values.
PROTECTED_VARIABLE_STATES = frozenset(("approved", "resolved", "not_applicable"))


@dataclass(frozen=True)
class StageOperationalOutcome:
    """Result of one staging run (api-contracts 'stage-operational')."""

    proposed: tuple[str, ...] = ()
    skipped_same_hash: tuple[str, ...] = ()
    superseded: tuple[str, ...] = ()
    missing: tuple[str, ...] = ()
    protected: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return {
            "proposed": list(self.proposed),
            "skipped_same_hash": list(self.skipped_same_hash),
            "superseded": list(self.superseded),
            "missing": list(self.missing),
            "protected": list(self.protected),
        }


def _first_row(data: Any) -> dict[str, Any] | None:
    if isinstance(data, list):
        return data[0] if data else None
    return data if isinstance(data, dict) else None


def _safe_data(result: Any) -> Any:
    """supabase-py's maybe_single().execute() returns None (not a result
    object with .data = None) on 0 rows; guard against AttributeError."""
    return getattr(result, "data", None) if result is not None else None


async def _assert_lot_scope(
    *, client: Any, organization_id: str, project_id: str, lot_id: str
) -> None:
    lot_res = await asyncio.to_thread(
        lambda: (
            client.table("lots")
            .select("id, project_id")
            .eq("id", lot_id)
            .limit(1)
            .execute()
        )
    )
    lot_row = _first_row(_safe_data(lot_res))
    if not lot_row or str(lot_row.get("project_id")) != project_id:
        raise OperationalBridgeScopeError(
            "lot_id does not belong to the requested organization/project."
        )

    proj_res = await asyncio.to_thread(
        lambda: (
            client.table("projects")
            .select("id, organization_id")
            .eq("id", project_id)
            .limit(1)
            .execute()
        )
    )
    proj_row = _first_row(_safe_data(proj_res))
    if not proj_row or str(proj_row.get("organization_id")) != organization_id:
        raise OperationalBridgeScopeError(
            "lot_id does not belong to the requested organization/project."
        )


async def _fetch_operational_rows(
    *, client: Any, organization_id: str, project_id: str, lot_id: str
) -> tuple[dict[str, Any] | None, dict[str, Any] | None, dict[str, Any] | None]:
    lot_result, record_result, payment_result = await asyncio.gather(
        asyncio.to_thread(
            lambda: (
                client.table("lots")
                .select("*")
                .eq("id", lot_id)
                .eq("project_id", project_id)
                .limit(1)
                .execute()
            )
        ),
        asyncio.to_thread(
            lambda: (
                client.table("lot_records")
                .select("*")
                .eq("lot_id", lot_id)
                .order("updated_at", desc=True)
                .limit(1)
                .execute()
            )
        ),
        asyncio.to_thread(
            lambda: (
                client.table("organization_payment_info")
                .select("*")
                .eq("organization_id", organization_id)
                .limit(1)
                .execute()
            )
        ),
    )
    return (
        _first_row(_safe_data(lot_result)),
        _first_row(_safe_data(record_result)),
        _first_row(_safe_data(payment_result)),
    )


async def _fetch_active_bridge_rows(
    *,
    client: Any,
    organization_id: str,
    project_id: str,
    lot_id: str,
    variable_keys: list[str],
) -> dict[str, dict[str, Any]]:
    result = await asyncio.to_thread(
        lambda: (
            client.table("variable_resolutions")
            .select("id, variable_key, state, source_ref, extractor_name")
            .eq("organization_id", organization_id)
            .eq("project_id", project_id)
            .eq("lot_id", lot_id)
            .is_("escritura_case_id", "null")
            .neq("state", "superseded")
            .in_("variable_key", variable_keys)
            .execute()
        )
    )
    rows = result.data if isinstance(result.data, list) else []
    return {
        str(row.get("variable_key")): row
        for row in rows
        if isinstance(row, dict) and row.get("variable_key")
    }


def map_operational_variables(
    *,
    lot: dict[str, Any] | None,
    lot_record: dict[str, Any] | None,
    payment_info: dict[str, Any] | None,
) -> tuple[BridgeVariable, ...]:
    """Full D3 mapping for a case: sale record + geometry + derived words."""
    record_mapping = map_lot_record_variables(lot_record or {}, payment_info)
    lot_mapping = map_lot_geometry_variables(lot or {})
    derived = build_derived_variables(
        record_variables=record_mapping.variables,
        lot_variables=lot_mapping.variables,
    )
    return record_mapping.variables + lot_mapping.variables + derived


async def stage_operational_variables(
    *,
    organization_id: str,
    project_id: str,
    lot_id: str,
    supabase: Any | None = None,
    resolution_service: Any | None = None,
) -> StageOperationalOutcome:
    """Stage operational proposals for a lot (FR-019/FR-021).

    Idempotent per source row hash: an unchanged hash skips the key, a
    changed hash supersedes + re-proposes, and human-reviewed states
    (``PROTECTED_VARIABLE_STATES``) are never touched.
    """
    from services.legal_variable_resolution import LegalVariableResolutionService

    if supabase is None:
        from core.database import get_supabase_client

        supabase = get_supabase_client()
    service = resolution_service or LegalVariableResolutionService()

    await _assert_lot_scope(
        client=supabase,
        organization_id=organization_id,
        project_id=project_id,
        lot_id=lot_id,
    )
    lot, lot_record, payment_info = await _fetch_operational_rows(
        client=supabase,
        organization_id=organization_id,
        project_id=project_id,
        lot_id=lot_id,
    )

    mapped = map_operational_variables(
        lot=lot, lot_record=lot_record, payment_info=payment_info
    )
    existing_by_key = await _fetch_active_bridge_rows(
        client=supabase,
        organization_id=organization_id,
        project_id=project_id,
        lot_id=lot_id,
        variable_keys=[var.variable_key for var in mapped],
    )

    to_stage: list[BridgeVariable] = []
    skipped: list[str] = []
    superseded: list[str] = []
    protected: list[str] = []
    for variable in mapped:
        existing = existing_by_key.get(variable.variable_key)
        if existing:
            state = str(existing.get("state") or "")
            is_bridge_row = (
                str(existing.get("extractor_name") or "")
                == OPERATIONAL_BRIDGE_EXTRACTOR_NAME
            )
            # Una fila `resolved` escrita por el PROPIO puente no es una
            # revisión humana: sigue la regla de hash (skip/supersede) para
            # que un cambio en la fuente (p. ej. deslindes corregidos en la
            # verificación) se refleje. Lo humano (approved/not_applicable,
            # o resolved de otro origen) sí queda protegido (FR-021).
            if state in PROTECTED_VARIABLE_STATES and not (
                state == "resolved" and is_bridge_row
            ):
                protected.append(variable.variable_key)
                continue
            existing_hash = (existing.get("source_ref") or {}).get("source_row_hash")
            if existing_hash == variable.source_row_hash:
                # Saneo de legado pre-SDD16: el puente stageaba `proposed`
                # (aprobación humana extra sin pantalla). Una fila proposed
                # del propio puente con el MISMO hash se re-stagea resolved
                # por el flujo auditado de supersesión, para que los casos
                # viejos se curen solos al siguiente refresh del caso.
                if not (state == "proposed" and is_bridge_row):
                    skipped.append(variable.variable_key)
                    continue
            superseded.append(variable.variable_key)
        to_stage.append(variable)

    classified = [
        service.propose_variable(
            organization_id=organization_id,
            project_id=project_id,
            variable_key=variable.variable_key,
            value_text=variable.value_text,
            value_json=variable.value_json,
            source_type=variable.source_type,
            source_ref=variable.source_ref(),
            lot_id=lot_id,
            extractor_name=OPERATIONAL_BRIDGE_EXTRACTOR_NAME,
            confidence=1.0 if variable.has_value else None,
            # SDD16 (SC-001/SC-002, AS2): el único pendiente humano de un caso
            # debe ser la revisión jurídica. Estos datos ya pasaron por un
            # humano al aprobar la venta (admin, por Telegram); tratarlos
            # como "proposed" los deja bloqueando la mesa (BLOCKED_SNAPSHOT_
            # STATES en matriz_token_resolution.py) sin ninguna pantalla que
            # los apruebe uno por uno. classify_proposals igual los baja a
            # "missing"/"conflict" si corresponde.
            state="resolved",
            approval_required=False,
        )
        for variable in to_stage
    ]
    if classified:
        # persist_proposals supersedes the previous active row per scope
        # before inserting, which implements the supersede+repropose rule.
        await service.persist_proposals(classified, supabase=supabase)

    missing = sorted(
        item.proposal.variable_key
        for item in classified
        if item.classification == "missing"
    )
    proposed = sorted(
        item.proposal.variable_key
        for item in classified
        if item.classification != "missing"
    )
    outcome = StageOperationalOutcome(
        proposed=tuple(proposed),
        skipped_same_hash=tuple(sorted(skipped)),
        superseded=tuple(sorted(superseded)),
        missing=tuple(missing),
        protected=tuple(sorted(protected)),
    )
    logger.info(
        "operational_bridge_staged",
        organization_id=organization_id,
        project_id=project_id,
        lot_id=lot_id,
        proposed_count=len(outcome.proposed),
        skipped_count=len(outcome.skipped_same_hash),
        superseded_count=len(outcome.superseded),
        missing_count=len(outcome.missing),
        protected_count=len(outcome.protected),
    )
    return outcome
