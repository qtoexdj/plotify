"""
Tests unitarios para FASE 6 — Agente Admin-Intelligence.

Valida:
  M-v2-6.1 — Seed admin_intelligence: system_prompts + prompt_versions activo
  M-v2-6.2 — Router por rol: graph elige slug correcto según role
  M-v2-6.2 — _get_custom_instructions: carga, fallback vacío, error silencioso
  M-v2-6.3 — get_delinquent_lots: mora detectada, sin mora, sin lotes, org vacío
  M-v2-6.3 — get_kpis: conteos correctos, manejo de sin datos
  M-v2-6.4 — AgentState tiene campo user_id

Todos los tests usan mocks — no requieren Supabase, Redis ni LLM activo.
asyncio_mode = auto (pytest.ini) — no se necesita @pytest.mark.asyncio
"""

from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

# ---------------------------------------------------------------------------
# Constantes de fixtures
# ---------------------------------------------------------------------------

ORG_ID = "org-uuid-fase6"
USER_ID = "user-uuid-admin"

# Fecha hace 45 días (>30 → mora)
OLD_DATE = (datetime.now(timezone.utc) - timedelta(days=45)).strftime(
    "%Y-%m-%dT%H:%M:%S+00:00"
)
# Fecha hace 10 días (<30 → sin mora)
RECENT_DATE = (datetime.now(timezone.utc) - timedelta(days=10)).strftime(
    "%Y-%m-%dT%H:%M:%S+00:00"
)

FAKE_RESERVED_OLD = {
    "numero_lote": "42",
    "estado": "reservado",
    "updated_at": OLD_DATE,
    "lot_records": {"cliente_nombre": "Juan Pérez", "etapa_proceso": "reserva"},
    "projects": {"organization_id": ORG_ID, "name": "Parcelación Norte"},
}

FAKE_RESERVED_RECENT = {
    "numero_lote": "10",
    "estado": "reservado",
    "updated_at": RECENT_DATE,
    "lot_records": {"cliente_nombre": "María López", "etapa_proceso": "escritura"},
    "projects": {"organization_id": ORG_ID, "name": "Parcelación Sur"},
}

FAKE_LOTS_FOR_KPIS = [
    {"estado": "disponible", "projects": {"organization_id": ORG_ID}},
    {"estado": "disponible", "projects": {"organization_id": ORG_ID}},
    {"estado": "reservado", "projects": {"organization_id": ORG_ID}},
    {"estado": "vendido", "projects": {"organization_id": ORG_ID}},
]


def _make_lots_table_mock(data):
    """Helper: crea el mock de supabase.table('lots') que retorna `data`."""
    result = MagicMock()
    result.data = data
    tbl = MagicMock()
    tbl.select.return_value.eq.return_value.eq.return_value.execute.return_value = (
        result
    )
    tbl.select.return_value.eq.return_value.execute.return_value = result
    return tbl, result


# ---------------------------------------------------------------------------
# M-v2-6.4 — AgentState incluye user_id
# ---------------------------------------------------------------------------


class TestAgentStateUserIdField:
    def test_user_id_field_present(self):
        """user_id debe estar declarado en AgentState como campo Optional[str]."""
        from agent.state import AgentState
        import typing

        hints = typing.get_type_hints(AgentState)
        assert "user_id" in hints, "AgentState debe tener el campo user_id"

    def test_user_id_is_optional_str(self):
        """user_id debe ser Optional[str] (puede ser None)."""
        from agent.state import AgentState
        import typing

        hints = typing.get_type_hints(AgentState)
        args = typing.get_args(hints["user_id"])
        # Optional[str] == Union[str, None]
        assert type(None) in args, "user_id debe aceptar None"
        assert str in args, "user_id debe aceptar str"

    def test_existing_fields_preserved(self):
        """Campos originales (messages, lead_info, context, role, organization_id) deben seguir presentes."""
        from agent.state import AgentState
        import typing

        hints = typing.get_type_hints(AgentState)
        for field in ("messages", "lead_info", "context", "role", "organization_id"):
            assert field in hints, f"AgentState debe conservar el campo '{field}'"


# ---------------------------------------------------------------------------
# M-v2-6.2 — Router de agentes por rol
# ---------------------------------------------------------------------------


class TestGraphPromptRouting:
    async def test_admin_usa_admin_intelligence(self):
        """get_graph_for_org con role='admin' debe llamar get_active_prompt con 'admin_intelligence'."""
        from langgraph.checkpoint.memory import MemorySaver
        from langchain_core.messages import HumanMessage, AIMessage

        captured_slugs = []

        async def fake_get_active_prompt(slug: str) -> str:
            captured_slugs.append(slug)
            return "prompt {organization_id} {custom_instructions}"

        fake_llm_bound = AsyncMock()
        # AIMessage sin tool_calls → should_continue retorna END de inmediato
        fake_llm_bound.ainvoke = AsyncMock(
            return_value=AIMessage(content="respuesta del agente admin")
        )
        fake_llm = MagicMock()
        fake_llm.bind_tools.return_value = fake_llm_bound

        with (
            patch("agent.graph.get_active_prompt", side_effect=fake_get_active_prompt),
            patch("agent.graph.get_tools_for_org", new=AsyncMock(return_value=[])),
            patch(
                "agent.graph._get_custom_instructions", new=AsyncMock(return_value="")
            ),
            patch("agent.graph.llm", fake_llm),
            patch(
                "agent.graph._get_checkpointer",
                new=AsyncMock(return_value=MemorySaver()),
            ),
        ):
            from agent.graph import get_graph_for_org

            graph = await get_graph_for_org(ORG_ID, "admin")
            await graph.ainvoke(
                {
                    "messages": [HumanMessage(content="hola")],
                    "lead_info": {},
                    "context": "",
                    "role": "admin",
                    "organization_id": ORG_ID,
                    "user_id": USER_ID,
                },
                config={"configurable": {"thread_id": "test-admin"}},
            )

        assert "admin_intelligence" in captured_slugs, (
            "get_active_prompt debe ser llamado con 'admin_intelligence' para role=admin"
        )

    async def test_lead_usa_sales_agent(self):
        """get_graph_for_org con role='lead' debe llamar get_active_prompt con 'sales_agent'."""
        from langgraph.checkpoint.memory import MemorySaver
        from langchain_core.messages import HumanMessage, AIMessage

        captured_slugs = []

        async def fake_get_active_prompt(slug: str) -> str:
            captured_slugs.append(slug)
            return "prompt {organization_id}"

        fake_llm_bound = AsyncMock()
        fake_llm_bound.ainvoke = AsyncMock(
            return_value=AIMessage(content="respuesta para lead")
        )
        fake_llm = MagicMock()
        fake_llm.bind_tools.return_value = fake_llm_bound

        with (
            patch("agent.graph.get_active_prompt", side_effect=fake_get_active_prompt),
            patch("agent.graph.get_tools_for_org", new=AsyncMock(return_value=[])),
            patch("agent.graph.llm", fake_llm),
            patch(
                "agent.graph._get_checkpointer",
                new=AsyncMock(return_value=MemorySaver()),
            ),
        ):
            from agent.graph import get_graph_for_org

            graph = await get_graph_for_org(ORG_ID, "lead")
            await graph.ainvoke(
                {
                    "messages": [HumanMessage(content="hola")],
                    "lead_info": {},
                    "context": "",
                    "role": "lead",
                    "organization_id": ORG_ID,
                    "user_id": None,
                },
                config={"configurable": {"thread_id": "test-lead"}},
            )

        assert "sales_agent" in captured_slugs, (
            "get_active_prompt debe ser llamado con 'sales_agent' para role='lead'"
        )
        assert "admin_intelligence" not in captured_slugs, (
            "role='lead' no debe usar prompt admin_intelligence"
        )


# ---------------------------------------------------------------------------
# M-v2-6.2 — _get_custom_instructions
# ---------------------------------------------------------------------------


class TestGetCustomInstructions:
    async def test_retorna_instrucciones_cuando_existen(self):
        """Debe retornar el campo 'instructions' si hay registro activo."""
        fake_result = MagicMock()
        fake_result.data = [{"instructions": "Respóndeme siempre formal."}]

        supabase = MagicMock()
        (
            supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value
        ) = fake_result

        with (
            patch("agent.graph.get_supabase_client", return_value=supabase),
            patch(
                "asyncio.to_thread",
                new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
            ),
        ):
            from agent.graph import _get_custom_instructions

            result = await _get_custom_instructions(ORG_ID, USER_ID)

        assert result == "Respóndeme siempre formal."

    async def test_retorna_vacio_sin_registro(self):
        """Debe retornar '' si no hay instrucciones para el admin."""
        fake_result = MagicMock()
        fake_result.data = []

        supabase = MagicMock()
        (
            supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value
        ) = fake_result

        with (
            patch("agent.graph.get_supabase_client", return_value=supabase),
            patch(
                "asyncio.to_thread",
                new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
            ),
        ):
            from agent.graph import _get_custom_instructions

            result = await _get_custom_instructions(ORG_ID, USER_ID)

        assert result == ""

    async def test_retorna_vacio_si_user_id_es_none(self):
        """Sin user_id debe retornar '' sin consultar la BD."""
        with patch("agent.graph.get_supabase_client") as mock_sb:
            from agent.graph import _get_custom_instructions

            result = await _get_custom_instructions(ORG_ID, None)

        assert result == ""
        mock_sb.assert_not_called()

    async def test_error_silencioso_retorna_vacio(self):
        """Si la BD falla, debe retornar '' sin propagar la excepción."""
        with (
            patch("agent.graph.get_supabase_client", side_effect=Exception("DB error")),
        ):
            from agent.graph import _get_custom_instructions

            result = await _get_custom_instructions(ORG_ID, USER_ID)

        assert result == ""


# ---------------------------------------------------------------------------
# M-v2-6.3 — get_delinquent_lots
# ---------------------------------------------------------------------------


class TestGetDelinquentLots:
    async def test_detecta_lote_con_mora(self):
        """Lote reservado hace >30 días debe aparecer en el resultado."""
        fake_result = MagicMock()
        fake_result.data = [FAKE_RESERVED_OLD]

        supabase = MagicMock()
        (
            supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value
        ) = fake_result

        with (
            patch("agent.tools.reports.get_supabase_client", return_value=supabase),
            patch(
                "asyncio.to_thread",
                new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
            ),
        ):
            from agent.tools.reports import get_delinquent_lots

            result = await get_delinquent_lots.ainvoke({"organization_id": ORG_ID})

        assert "42" in result
        assert "Juan Pérez" in result
        assert "posible mora" in result

    async def test_sin_mora_si_fecha_reciente(self):
        """Lote reservado hace <30 días no debe aparecer como mora."""
        fake_result = MagicMock()
        fake_result.data = [FAKE_RESERVED_RECENT]

        supabase = MagicMock()
        (
            supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value
        ) = fake_result

        with (
            patch("agent.tools.reports.get_supabase_client", return_value=supabase),
            patch(
                "asyncio.to_thread",
                new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
            ),
        ):
            from agent.tools.reports import get_delinquent_lots

            result = await get_delinquent_lots.ainvoke({"organization_id": ORG_ID})

        assert "No hay lotes en mora" in result

    async def test_sin_lotes_reservados(self):
        """Sin lotes reservados debe retornar mensaje informativo."""
        fake_result = MagicMock()
        fake_result.data = []

        supabase = MagicMock()
        (
            supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value
        ) = fake_result

        with (
            patch("agent.tools.reports.get_supabase_client", return_value=supabase),
            patch(
                "asyncio.to_thread",
                new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
            ),
        ):
            from agent.tools.reports import get_delinquent_lots

            result = await get_delinquent_lots.ainvoke({"organization_id": ORG_ID})

        assert "No hay lotes reservados" in result

    async def test_error_si_organization_id_vacio(self):
        """organization_id vacío debe retornar mensaje de error sin consultar BD."""
        with patch("agent.tools.reports.get_supabase_client") as mock_sb:
            from agent.tools.reports import get_delinquent_lots

            result = await get_delinquent_lots.ainvoke({"organization_id": ""})

        assert "Error" in result
        mock_sb.assert_not_called()

    async def test_mezcla_mora_y_reciente(self):
        """Solo el lote >30 días debe aparecer cuando hay mezcla."""
        fake_result = MagicMock()
        fake_result.data = [FAKE_RESERVED_OLD, FAKE_RESERVED_RECENT]

        supabase = MagicMock()
        (
            supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value
        ) = fake_result

        with (
            patch("agent.tools.reports.get_supabase_client", return_value=supabase),
            patch(
                "asyncio.to_thread",
                new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
            ),
        ):
            from agent.tools.reports import get_delinquent_lots

            result = await get_delinquent_lots.ainvoke({"organization_id": ORG_ID})

        assert "- Lote 42 " in result, "Lote 42 (>30 días) debe aparecer"
        assert "- Lote 10 " not in result, "Lote 10 (<30 días) no debe aparecer"
        assert "Lotes en posible mora (1)" in result


# ---------------------------------------------------------------------------
# M-v2-6.3 — get_kpis
# ---------------------------------------------------------------------------


class TestGetKpis:
    def _make_kpis_supabase_mock(self, lots_data, leads_count=5, vendors_count=3):
        """Construye mock de Supabase para get_kpis."""
        lots_result = MagicMock()
        lots_result.data = lots_data

        leads_result = MagicMock()
        leads_result.count = leads_count

        vendors_result = MagicMock()
        vendors_result.count = vendors_count

        supabase = MagicMock()

        def table_side(name):
            tbl = MagicMock()
            if name == "lots":
                tbl.select.return_value.eq.return_value.execute.return_value = (
                    lots_result
                )
            elif name == "leads":
                tbl.select.return_value.eq.return_value.execute.return_value = (
                    leads_result
                )
            elif name == "vendors":
                tbl.select.return_value.eq.return_value.execute.return_value = (
                    vendors_result
                )
            return tbl

        supabase.table.side_effect = table_side
        return supabase

    async def test_conteos_por_estado_correctos(self):
        """Debe contar lotes por estado correctamente."""
        supabase = self._make_kpis_supabase_mock(FAKE_LOTS_FOR_KPIS)

        with (
            patch("agent.tools.reports.get_supabase_client", return_value=supabase),
            patch(
                "asyncio.to_thread",
                new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
            ),
        ):
            from agent.tools.reports import get_kpis

            result = await get_kpis.ainvoke({"organization_id": ORG_ID})

        assert "Total lotes: 4" in result
        assert "disponible: 2" in result
        assert "reservado: 1" in result
        assert "vendido: 1" in result

    async def test_leads_y_vendors_incluidos(self):
        """El resultado debe incluir contadores de leads y vendedores."""
        supabase = self._make_kpis_supabase_mock(
            FAKE_LOTS_FOR_KPIS, leads_count=12, vendors_count=4
        )

        with (
            patch("agent.tools.reports.get_supabase_client", return_value=supabase),
            patch(
                "asyncio.to_thread",
                new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
            ),
        ):
            from agent.tools.reports import get_kpis

            result = await get_kpis.ainvoke({"organization_id": ORG_ID})

        assert "Leads capturados: 12" in result
        assert "Vendedores activos: 4" in result

    async def test_sin_lotes(self):
        """Con lista de lotes vacía debe retornar Total lotes: 0."""
        supabase = self._make_kpis_supabase_mock([], leads_count=0, vendors_count=0)

        with (
            patch("agent.tools.reports.get_supabase_client", return_value=supabase),
            patch(
                "asyncio.to_thread",
                new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
            ),
        ):
            from agent.tools.reports import get_kpis

            result = await get_kpis.ainvoke({"organization_id": ORG_ID})

        assert "Total lotes: 0" in result

    async def test_error_si_organization_id_vacio(self):
        """organization_id vacío debe retornar mensaje de error."""
        with patch("agent.tools.reports.get_supabase_client") as mock_sb:
            from agent.tools.reports import get_kpis

            result = await get_kpis.ainvoke({"organization_id": ""})

        assert "Error" in result
        mock_sb.assert_not_called()

    async def test_icono_kpi_en_resultado(self):
        """El resultado debe comenzar con el ícono 📊."""
        supabase = self._make_kpis_supabase_mock(FAKE_LOTS_FOR_KPIS)

        with (
            patch("agent.tools.reports.get_supabase_client", return_value=supabase),
            patch(
                "asyncio.to_thread",
                new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
            ),
        ):
            from agent.tools.reports import get_kpis

            result = await get_kpis.ainvoke({"organization_id": ORG_ID})

        assert "📊" in result


# ---------------------------------------------------------------------------
# M-v2-6.3 — Skills registradas en BUILTIN_HANDLERS
# ---------------------------------------------------------------------------


class TestSkillRegistration:
    def test_get_delinquent_lots_registrada(self):
        """get_delinquent_lots debe estar registrada en BUILTIN_HANDLERS."""
        import agent.tools.reports  # noqa: F401 — asegura que el módulo esté cargado
        from agent.skill_registry import BUILTIN_HANDLERS

        assert "get_delinquent_lots" in BUILTIN_HANDLERS, (
            "get_delinquent_lots debe estar registrada con @register_builtin"
        )

    def test_get_kpis_registrada(self):
        """get_kpis debe estar registrada en BUILTIN_HANDLERS."""
        import agent.tools.reports  # noqa: F401
        from agent.skill_registry import BUILTIN_HANDLERS

        assert "get_kpis" in BUILTIN_HANDLERS, (
            "get_kpis debe estar registrada con @register_builtin"
        )

    def test_skills_previas_intactas(self):
        """Las skills de fases anteriores no deben haberse eliminado."""
        import agent.tools.reports  # noqa: F401
        import agent.tools.clients  # noqa: F401
        from agent.skill_registry import BUILTIN_HANDLERS

        for slug in (
            "get_pipeline_summary",
            "search_clients",
            "get_delinquent_lots",
            "get_kpis",
        ):
            assert slug in BUILTIN_HANDLERS, f"Skill '{slug}' debe seguir registrada"
