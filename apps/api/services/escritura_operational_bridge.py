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

from core.logger import get_logger
from services.legal_title_words import (
    hectareas_to_words,
    metros_cuadrados_to_words,
    number_to_words_spanish,
    pesos_to_words,
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
    whole = int(number)
    decimals = round((number - whole) * 100)
    if decimals:
        # Trailing zero decimals read naturally as the bare digit (5 for ,50).
        if decimals % 10 == 0:
            decimals //= 10
        words = (
            f"{number_to_words_spanish(whole)} coma "
            f"{number_to_words_spanish(decimals)}"
        )
    else:
        words = number_to_words_spanish(whole)
    return f"{words} metros"


def compose_deslindes_text(boundaries: list[dict[str, Any]] | None) -> str | None:
    """Compose the legal deslindes sentence from ``lots.boundaries_official``.

    Production shape (apps/web types): ``[{label, description, distance?,
    colinda?, es_servidumbre?}, ...]``. A boundary without ``colinda`` falls
    back to ``description``; if both are empty the composition fails (the
    variable stays missing) rather than rendering a silent gap.
    """
    if not boundaries:
        return None
    parts: list[str] = []
    for boundary in boundaries:
        if not isinstance(boundary, dict):
            return None
        label = _clean(boundary.get("label"))
        neighbor = _clean(boundary.get("colinda")) or _clean(
            boundary.get("description")
        )
        if not label or not neighbor:
            return None
        distance_words = _distance_words(boundary.get("distance"))
        if distance_words:
            parts.append(f"al {label}, en {distance_words}, con {neighbor}")
        else:
            parts.append(f"al {label}, con {neighbor}")
    if not parts:
        return None
    if len(parts) > 1:
        parts[-1] = f"y {parts[-1]}"
    return "; ".join(parts)


def _lot_record_hash_fields(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "cliente_nombre": record.get("cliente_nombre"),
        "cliente_run": record.get("cliente_run"),
        "cliente_direccion": record.get("cliente_direccion"),
        "cliente_estado_civil": record.get("cliente_estado_civil"),
        "cliente_ocupacion": record.get("cliente_ocupacion"),
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


async def _assert_lot_scope(
    *, client: Any, organization_id: str, project_id: str, lot_id: str
) -> None:
    result = await asyncio.to_thread(
        lambda: (
            client.table("lots")
            .select("id, project_id, projects!inner(organization_id)")
            .eq("id", lot_id)
            .eq("project_id", project_id)
            .eq("projects.organization_id", organization_id)
            .maybe_single()
            .execute()
        )
    )
    if not result.data:
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
                .maybe_single()
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
                .maybe_single()
                .execute()
            )
        ),
    )
    return (
        _first_row(lot_result.data),
        _first_row(record_result.data),
        _first_row(payment_result.data),
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
            .select("id, variable_key, state, source_ref")
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
            if state in PROTECTED_VARIABLE_STATES:
                protected.append(variable.variable_key)
                continue
            existing_hash = (existing.get("source_ref") or {}).get("source_row_hash")
            if existing_hash == variable.source_row_hash:
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
