"""SDD 011 T020: trazabilidad completa por escritura (FR-012).

Agrega, en orden: matriz del proyecto aprobada, borrador generado, aceptado y
entregas — con su actor y momento.
"""

from __future__ import annotations

from typing import Any

from schemas.escritura_matrices import EscrituraTraceResponse

ORG = "00000000-0000-4000-8000-000000000001"
PROJECT = "00000000-0000-4000-8000-000000000002"
CASE = "00000000-0000-4000-8000-000000000003"
PM = "00000000-0000-4000-8000-000000000004"
ABOGADO = "00000000-0000-4000-8000-000000000005"
ADMIN = "00000000-0000-4000-8000-000000000006"
VENDOR = "00000000-0000-4000-8000-000000000007"
LOT = "00000000-0000-4000-8000-000000000008"
APPROVAL = "00000000-0000-4000-8000-000000000009"


class _FakeResult:
    def __init__(self, data: Any) -> None:
        self.data = data


class _FakeTable:
    def __init__(self, store: dict[str, list[dict]], name: str) -> None:
        self._store = store
        self._name = name
        self._filters: list[tuple[str, str, Any]] = []
        self._single = False

    def select(self, *_a: Any, **_k: Any) -> "_FakeTable":
        return self

    def eq(self, column: str, value: Any) -> "_FakeTable":
        self._filters.append(("eq", column, value))
        return self

    def neq(self, column: str, value: Any) -> "_FakeTable":
        self._filters.append(("neq", column, value))
        return self

    def is_(self, column: str, value: Any) -> "_FakeTable":
        self._filters.append(("is", column, value))
        return self

    def order(self, *_a: Any, **_k: Any) -> "_FakeTable":
        return self

    def maybe_single(self) -> "_FakeTable":
        self._single = True
        return self

    def _match(self, row: dict[str, Any]) -> bool:
        for kind, column, value in self._filters:
            rv = row.get(column)
            if kind == "eq" and rv != value:
                return False
            if kind == "neq" and rv == value:
                return False
            if kind == "is" and value == "null" and rv is not None:
                return False
        return True

    def execute(self) -> _FakeResult:
        rows = [r for r in self._store.get(self._name, []) if self._match(r)]
        if self._single:
            return _FakeResult(dict(rows[0]) if rows else None)
        return _FakeResult([dict(r) for r in rows])


class _FakeSupabase:
    def __init__(self, store: dict[str, list[dict]]) -> None:
        self._store = store

    def table(self, name: str) -> _FakeTable:
        return _FakeTable(self._store, name)


async def test_build_escritura_trace_aggregates_full_flow_in_order() -> None:
    from api.v1.endpoints.escritura_matrices import _build_escritura_trace

    store = {
        "escritura_matrices": [
            {
                "id": PM,
                "organization_id": ORG,
                "project_id": PROJECT,
                "escritura_case_id": None,
                "status": "approved",
                "version": 2,
                "approved_by": ABOGADO,
                "approved_at": "2026-06-15T10:00:00+00:00",
            }
        ],
        "escritura_minuta_generations": [
            {
                "escritura_case_id": CASE,
                "organization_id": ORG,
                "generated_at": "2026-06-16T09:00:00+00:00",
                "generated_by": ADMIN,
                "matriz_version": 2,
                "resolution_manifest": {
                    "tokens": [
                        {"variableKey": "comprador.nombre"},
                        {"variableKey": "transaccion.precio_numeros"},
                    ],
                    "blocks": [{"blockKey": "titulo.comparecencia_vendedor_texto"}],
                    "missing_count": 0,
                },
                "warning_acknowledged_by": ADMIN,
                "warning_acknowledged_at": "2026-06-16T09:05:00+00:00",
            }
        ],
        "approval_requests": [
            {
                "id": APPROVAL,
                "organization_id": ORG,
                "lot_id": LOT,
                "request_type": "sale",
                "status": "approved",
                "admin_phone": ADMIN,
                "resolved_at": "2026-06-16T08:50:00+00:00",
                "payload": {
                    "cliente_nombre": "Comprador Uno",
                    "valor_final": "1500",
                },
            }
        ],
        "escritura_deliveries": [
            {
                "escritura_case_id": CASE,
                "organization_id": ORG,
                "channel": "web",
                "status": "sent",
                "recipient_user_id": VENDOR,
                "sent_at": "2026-06-16T09:06:00+00:00",
                "created_at": "2026-06-16T09:06:00+00:00",
            }
        ],
    }
    case_row = {
        "id": CASE,
        "organization_id": ORG,
        "project_id": PROJECT,
        "lot_id": LOT,
    }

    trace = await _build_escritura_trace(_FakeSupabase(store), case_row)

    kinds = [event["kind"] for event in trace["events"]]
    assert kinds == [
        "project_matriz_approved",
        "sale_validated",
        "draft_generated",
        "draft_accepted",
        "delivered",
    ]
    assert trace["source_project_matriz_id"] == PM
    assert trace["events"][0]["actor_id"] == ABOGADO
    assert trace["events"][0]["matriz_version"] == 2
    assert trace["events"][1]["approval_id"] == APPROVAL
    assert trace["events"][1]["actor_id"] == ADMIN
    assert trace["events"][1]["input_keys"] == ["cliente_nombre", "valor_final"]
    assert trace["events"][2]["input_keys"] == [
        "comprador.nombre",
        "titulo.comparecencia_vendedor_texto",
        "transaccion.precio_numeros",
    ]
    assert trace["events"][-1]["label"] == "Entregada"
    assert trace["events"][-1]["channel"] == "web"
    # El contrato acepta el trace tal cual.
    EscrituraTraceResponse.model_validate(trace)


async def test_build_escritura_trace_omits_absent_steps() -> None:
    from api.v1.endpoints.escritura_matrices import _build_escritura_trace

    store = {
        "escritura_matrices": [
            {
                "id": PM,
                "organization_id": ORG,
                "project_id": PROJECT,
                "escritura_case_id": None,
                "status": "draft",  # aún no aprobada
                "version": 1,
            }
        ],
        "escritura_minuta_generations": [
            {
                "escritura_case_id": CASE,
                "organization_id": ORG,
                "generated_at": "2026-06-16T09:00:00+00:00",
                "generated_by": ADMIN,
                "matriz_version": 1,
            }  # sin aceptación
        ],
        "escritura_deliveries": [],
    }
    trace = await _build_escritura_trace(
        _FakeSupabase(store),
        {"id": CASE, "organization_id": ORG, "project_id": PROJECT},
    )
    assert [e["kind"] for e in trace["events"]] == ["draft_generated"]
