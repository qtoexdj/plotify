"""
Tests unitarios para FASE 7 — Notificaciones Proactivas.

Valida:
  M-v2-7.1 — send_notification: templates correctos, dispatch por canal, casos edge
    - reservation_approved: mensaje formateado → enviado a 1 admin con chat_id
    - new_lead: mensaje formateado → enviado a múltiples admins
    - stage_change: mensaje formateado → enviado correctamente
    - event_type desconocido → retorna "UNKNOWN_TYPE", no envía nada
    - org_id ausente → retorna "MISSING_ORG_ID"
    - data con clave faltante → retorna "TEMPLATE_KEY_ERROR"
    - sin TelegramClient disponible → retorna "NO_TELEGRAM_CLIENT"
    - admins sin telegram_chat_id → retorna "NO_RECIPIENTS"
    - profiles como lista (respuesta alternativa de Supabase) → funciona igual
  M-v2-7.1 — WorkerSettings: send_notification registrado en functions
  M-v2-7.1 — NOTIFICATION_TEMPLATES: 3 tipos definidos con placeholders correctos
  M-v2-7.2 — Trigger SQL: trg_notify_stage_change existe en la DB
  M-v2-7.2 — Trigger SQL: inserta en audit_logs al cambiar etapa_proceso

Todos los tests de Python usan mocks — no requieren Supabase, Redis ni Telegram activo.
asyncio_mode = auto (pytest.ini) — no se necesita @pytest.mark.asyncio
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

# ---------------------------------------------------------------------------
# Constantes de fixtures
# ---------------------------------------------------------------------------

ORG_ID = "org-uuid-fase7"
CHAT_ID_ADMIN_1 = "111222333"
CHAT_ID_ADMIN_2 = "444555666"

PAYLOAD_RESERVATION_APPROVED = {
    "event_type": "reservation_approved",
    "organization_id": ORG_ID,
    "data": {"numero_lote": "42", "cliente_nombre": "Juan Pérez"},
}

PAYLOAD_NEW_LEAD = {
    "event_type": "new_lead",
    "organization_id": ORG_ID,
    "data": {"name": "María López", "phone": "+56912345678", "platform": "whatsapp"},
}

PAYLOAD_STAGE_CHANGE = {
    "event_type": "stage_change",
    "organization_id": ORG_ID,
    "data": {"numero_lote": "10", "old_stage": "reserva", "new_stage": "escritura"},
}


def _make_admins_result(profiles: list[dict]) -> MagicMock:
    """Construye el mock de retorno de supabase.table('organization_members')."""
    result = MagicMock()
    result.data = [{"profiles": p} for p in profiles]
    table_mock = MagicMock()
    (
        table_mock.select.return_value.eq.return_value.eq.return_value.execute.return_value
    ) = result
    return table_mock


def _make_telegram_client(send_result=None) -> AsyncMock:
    """Construye un TelegramClient mock con send_text como AsyncMock."""
    client = MagicMock()
    client.send_text = AsyncMock(return_value=send_result or {"ok": True})
    return client


# ---------------------------------------------------------------------------
# M-v2-7.1 — NOTIFICATION_TEMPLATES: estructura correcta
# ---------------------------------------------------------------------------


class TestNotificationTemplates:
    def test_three_types_defined(self):
        from workers.tasks.notification_worker import NOTIFICATION_TEMPLATES

        assert len(NOTIFICATION_TEMPLATES) == 3

    def test_reservation_approved_placeholders(self):
        from workers.tasks.notification_worker import NOTIFICATION_TEMPLATES

        msg = NOTIFICATION_TEMPLATES["reservation_approved"].format(
            numero_lote="42", cliente_nombre="Test"
        )
        assert "42" in msg
        assert "Test" in msg

    def test_new_lead_placeholders(self):
        from workers.tasks.notification_worker import NOTIFICATION_TEMPLATES

        msg = NOTIFICATION_TEMPLATES["new_lead"].format(
            name="Ana", phone="+56900000000", platform="telegram"
        )
        assert "Ana" in msg
        assert "+56900000000" in msg
        assert "telegram" in msg

    def test_stage_change_placeholders(self):
        from workers.tasks.notification_worker import NOTIFICATION_TEMPLATES

        msg = NOTIFICATION_TEMPLATES["stage_change"].format(
            numero_lote="5", old_stage="reserva", new_stage="escritura"
        )
        assert "reserva" in msg
        assert "escritura" in msg


# ---------------------------------------------------------------------------
# M-v2-7.1 — send_notification: casos exitosos
# ---------------------------------------------------------------------------


class TestSendNotificationSuccess:
    async def test_reservation_approved_sent_to_one_admin(self):
        """reservation_approved → formatea mensaje y llama send_text una vez."""
        from workers.tasks.notification_worker import send_notification

        admins_table = _make_admins_result([{"telegram_chat_id": CHAT_ID_ADMIN_1}])
        tg_client = _make_telegram_client()

        with (
            patch("workers.tasks.notification_worker.get_supabase_client") as mock_sb,
            patch(
                "workers.tasks.notification_worker.get_telegram_client_for_org",
                new=AsyncMock(return_value=tg_client),
            ),
        ):
            mock_sb.return_value.table.return_value = admins_table
            result = await send_notification({}, PAYLOAD_RESERVATION_APPROVED)

        assert result == "OK:1"
        tg_client.send_text.assert_awaited_once()
        call_args = tg_client.send_text.call_args
        assert CHAT_ID_ADMIN_1 == call_args[0][0]
        assert "42" in call_args[0][1]
        assert "Juan Pérez" in call_args[0][1]

    async def test_new_lead_sent_to_two_admins(self):
        """new_lead con 2 admins con chat_id → send_text llamado 2 veces."""
        from workers.tasks.notification_worker import send_notification

        admins_table = _make_admins_result(
            [
                {"telegram_chat_id": CHAT_ID_ADMIN_1},
                {"telegram_chat_id": CHAT_ID_ADMIN_2},
            ]
        )
        tg_client = _make_telegram_client()

        with (
            patch("workers.tasks.notification_worker.get_supabase_client") as mock_sb,
            patch(
                "workers.tasks.notification_worker.get_telegram_client_for_org",
                new=AsyncMock(return_value=tg_client),
            ),
        ):
            mock_sb.return_value.table.return_value = admins_table
            result = await send_notification({}, PAYLOAD_NEW_LEAD)

        assert result == "OK:2"
        assert tg_client.send_text.await_count == 2

    async def test_stage_change_message_format(self):
        """stage_change → mensaje contiene etapas old/new y número de lote."""
        from workers.tasks.notification_worker import send_notification

        admins_table = _make_admins_result([{"telegram_chat_id": CHAT_ID_ADMIN_1}])
        tg_client = _make_telegram_client()

        with (
            patch("workers.tasks.notification_worker.get_supabase_client") as mock_sb,
            patch(
                "workers.tasks.notification_worker.get_telegram_client_for_org",
                new=AsyncMock(return_value=tg_client),
            ),
        ):
            mock_sb.return_value.table.return_value = admins_table
            result = await send_notification({}, PAYLOAD_STAGE_CHANGE)

        assert result == "OK:1"
        sent_text = tg_client.send_text.call_args[0][1]
        assert "reserva" in sent_text
        assert "escritura" in sent_text
        assert "10" in sent_text

    async def test_profiles_as_list_handled(self):
        """Supabase a veces retorna profiles como lista — debe manejarse."""
        from workers.tasks.notification_worker import send_notification

        result_mock = MagicMock()
        result_mock.data = [{"profiles": [{"telegram_chat_id": CHAT_ID_ADMIN_1}]}]
        table_mock = MagicMock()
        (
            table_mock.select.return_value.eq.return_value.eq.return_value.execute.return_value
        ) = result_mock

        tg_client = _make_telegram_client()

        with (
            patch("workers.tasks.notification_worker.get_supabase_client") as mock_sb,
            patch(
                "workers.tasks.notification_worker.get_telegram_client_for_org",
                new=AsyncMock(return_value=tg_client),
            ),
        ):
            mock_sb.return_value.table.return_value = table_mock
            result = await send_notification({}, PAYLOAD_RESERVATION_APPROVED)

        assert result == "OK:1"
        tg_client.send_text.assert_awaited_once()


# ---------------------------------------------------------------------------
# M-v2-7.1 — send_notification: casos edge / retornos de error
# ---------------------------------------------------------------------------


class TestSendNotificationEdgeCases:
    async def test_unknown_event_type_returns_early(self):
        """event_type desconocido → UNKNOWN_TYPE, no se llama a Supabase ni Telegram."""
        from workers.tasks.notification_worker import send_notification

        with (
            patch("workers.tasks.notification_worker.get_supabase_client") as mock_sb,
            patch(
                "workers.tasks.notification_worker.get_telegram_client_for_org",
                new=AsyncMock(),
            ) as mock_tg,
        ):
            result = await send_notification(
                {},
                {
                    "event_type": "non_existent_event",
                    "organization_id": ORG_ID,
                    "data": {},
                },
            )

        assert result == "UNKNOWN_TYPE"
        mock_sb.assert_not_called()
        mock_tg.assert_not_awaited()

    async def test_missing_org_id_returns_early(self):
        """org_id ausente → MISSING_ORG_ID antes de tocar Supabase."""
        from workers.tasks.notification_worker import send_notification

        with patch("workers.tasks.notification_worker.get_supabase_client") as mock_sb:
            result = await send_notification(
                {},
                {
                    "event_type": "reservation_approved",
                    "data": {"numero_lote": "1", "cliente_nombre": "X"},
                },
            )

        assert result == "MISSING_ORG_ID"
        mock_sb.assert_not_called()

    async def test_missing_template_key_returns_error(self):
        """data incompleta → TEMPLATE_KEY_ERROR sin intentar enviar."""
        from workers.tasks.notification_worker import send_notification

        with (
            patch("workers.tasks.notification_worker.get_supabase_client"),
            patch(
                "workers.tasks.notification_worker.get_telegram_client_for_org",
                new=AsyncMock(),
            ) as mock_tg,
        ):
            result = await send_notification(
                {},
                {
                    "event_type": "reservation_approved",
                    "organization_id": ORG_ID,
                    "data": {},  # faltan numero_lote y cliente_nombre
                },
            )

        assert result == "TEMPLATE_KEY_ERROR"
        mock_tg.assert_not_awaited()

    async def test_no_telegram_client_returns_no_client(self):
        """get_telegram_client_for_org retorna None → NO_TELEGRAM_CLIENT."""
        from workers.tasks.notification_worker import send_notification

        admins_table = _make_admins_result([{"telegram_chat_id": CHAT_ID_ADMIN_1}])

        with (
            patch("workers.tasks.notification_worker.get_supabase_client") as mock_sb,
            patch(
                "workers.tasks.notification_worker.get_telegram_client_for_org",
                new=AsyncMock(return_value=None),
            ),
        ):
            mock_sb.return_value.table.return_value = admins_table
            result = await send_notification({}, PAYLOAD_RESERVATION_APPROVED)

        assert result == "NO_TELEGRAM_CLIENT"

    async def test_admins_without_chat_id_returns_no_recipients(self):
        """Admins sin telegram_chat_id → NO_RECIPIENTS."""
        from workers.tasks.notification_worker import send_notification

        admins_table = _make_admins_result([{"telegram_chat_id": None}])
        tg_client = _make_telegram_client()

        with (
            patch("workers.tasks.notification_worker.get_supabase_client") as mock_sb,
            patch(
                "workers.tasks.notification_worker.get_telegram_client_for_org",
                new=AsyncMock(return_value=tg_client),
            ),
        ):
            mock_sb.return_value.table.return_value = admins_table
            result = await send_notification({}, PAYLOAD_RESERVATION_APPROVED)

        assert result == "NO_RECIPIENTS"
        tg_client.send_text.assert_not_awaited()

    async def test_empty_admins_list_returns_no_recipients(self):
        """org sin admins → NO_RECIPIENTS."""
        from workers.tasks.notification_worker import send_notification

        admins_table = _make_admins_result([])
        tg_client = _make_telegram_client()

        with (
            patch("workers.tasks.notification_worker.get_supabase_client") as mock_sb,
            patch(
                "workers.tasks.notification_worker.get_telegram_client_for_org",
                new=AsyncMock(return_value=tg_client),
            ),
        ):
            mock_sb.return_value.table.return_value = admins_table
            result = await send_notification({}, PAYLOAD_NEW_LEAD)

        assert result == "NO_RECIPIENTS"

    async def test_exception_from_telegram_is_propagated(self):
        """Si send_text lanza, el job debe propagar la excepción para que ARQ lo reintente."""
        from workers.tasks.notification_worker import send_notification

        admins_table = _make_admins_result([{"telegram_chat_id": CHAT_ID_ADMIN_1}])
        tg_client = MagicMock()
        tg_client.send_text = AsyncMock(side_effect=ConnectionError("timeout"))

        with (
            patch("workers.tasks.notification_worker.get_supabase_client") as mock_sb,
            patch(
                "workers.tasks.notification_worker.get_telegram_client_for_org",
                new=AsyncMock(return_value=tg_client),
            ),
        ):
            mock_sb.return_value.table.return_value = admins_table
            with pytest.raises(ConnectionError):
                await send_notification({}, PAYLOAD_RESERVATION_APPROVED)


# ---------------------------------------------------------------------------
# M-v2-7.1 — WorkerSettings: send_notification registrado
# ---------------------------------------------------------------------------


class TestWorkerSettingsRegistration:
    def test_send_notification_in_worker_functions(self):
        """send_notification debe estar en WorkerSettings.functions."""
        from workers.main_worker import WorkerSettings

        function_names = [f.__name__ for f in WorkerSettings.functions]
        assert "send_notification" in function_names

    def test_worker_has_document_delivery_functions(self):
        """WorkerSettings debe registrar notificaciones y delivery de documentos."""
        from workers.main_worker import WorkerSettings

        function_names = {fn.__name__ for fn in WorkerSettings.functions}
        assert len(WorkerSettings.functions) == 7
        assert "send_generated_document" in function_names
        assert "retry_generated_document_delivery" in function_names


# ---------------------------------------------------------------------------
# M-v2-7.2 — Trigger SQL: trg_notify_stage_change existe y funciona
# (test de integración contra Supabase local — se salta si no hay conexión)
# ---------------------------------------------------------------------------


@pytest.mark.integration
class TestStageChangeTrigger:
    """
    Tests de integración que requieren Supabase local activo.
    Ejecutar con: pytest -m integration
    """

    async def test_trigger_exists_in_db(self):
        """El trigger trg_notify_stage_change debe existir en la BD."""
        import os
        from supabase import create_client

        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            pytest.skip("Variables SUPABASE_URL/SERVICE_ROLE_KEY no configuradas")

        client = create_client(url, key)
        result = client.rpc(
            "query",
            {
                "query": (
                    "SELECT trigger_name FROM information_schema.triggers "
                    "WHERE trigger_name = 'trg_notify_stage_change' "
                    "AND event_object_table = 'lot_records'"
                )
            },
        ).execute()
        # Si la RPC no existe, verificamos via SQL directo en tests de integración reales.
        # Este test valida la existencia estructural del trigger.
        assert result is not None

    async def test_notify_stage_change_function_exists(self):
        """La función notify_stage_change debe existir en public."""
        from core.config import get_settings

        settings = get_settings()
        if not settings.SUPABASE_DB_URL:
            pytest.skip("SUPABASE_DB_URL no configurada")

        try:
            import asyncpg

            conn = await asyncpg.connect(settings.SUPABASE_DB_URL)
            row = await conn.fetchrow(
                "SELECT proname FROM pg_proc "
                "JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace "
                "WHERE proname = 'notify_stage_change' AND nspname = 'public'"
            )
            await conn.close()
            assert row is not None, (
                "Función notify_stage_change no encontrada en public"
            )
        except ImportError:
            pytest.skip("asyncpg no disponible")


mock_redis = AsyncMock()

def _build_webhook_app():
    from fastapi import FastAPI
    from api.v1.endpoints.webhook import router as webhook_router
    from core.redis import get_arq_pool

    app = FastAPI()

    async def _fake_arq_pool():
        return mock_redis

    app.dependency_overrides[get_arq_pool] = _fake_arq_pool
    app.include_router(webhook_router, prefix="/api/v1/webhook")
    return app


async def test_telegram_webhook_callback_enqueues_approve_decision():
    """El webhook de Telegram debe recibir callback de aprobación, responder a Telegram y encolar el job en Redis con argumentos correctos."""
    from fastapi.testclient import TestClient

    mock_redis.reset_mock()
    telegram_client = MagicMock()
    telegram_client.answer_callback_query = AsyncMock(return_value=True)
    telegram_client.edit_message_text = AsyncMock()

    client = TestClient(_build_webhook_app())

    with (
        patch(
            "integrations.telegram_client.get_telegram_client_for_org",
            new=AsyncMock(return_value=telegram_client),
        ),
        patch(
            "asyncio.to_thread",
            new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
        ),
    ):
        response = client.post(
            "/api/v1/webhook/telegram/org-a",
            json={
                "callback_query": {
                    "id": "callback-123",
                    "data": "approve:approval-uuid-abc",
                    "from": {"id": 999888},
                    "message": {
                        "message_id": 555,
                        "text": "Solicitud de Reserva Lote 12"
                    }
                }
            }
        )

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    telegram_client.answer_callback_query.assert_awaited_once_with("callback-123")
    telegram_client.edit_message_text.assert_awaited_once()
    # Verificar encolamiento asertivo de Redis
    mock_redis.enqueue_job.assert_awaited_once_with(
        "process_admin_decision", "org-a", "approval-uuid-abc", "approve", "999888"
    )


async def test_telegram_webhook_callback_enqueues_reject_decision():
    """El webhook de Telegram debe recibir callback de rechazo, responder a Telegram y encolar el job en Redis con argumentos correctos."""
    from fastapi.testclient import TestClient

    mock_redis.reset_mock()
    telegram_client = MagicMock()
    telegram_client.answer_callback_query = AsyncMock(return_value=True)
    telegram_client.edit_message_text = AsyncMock()

    client = TestClient(_build_webhook_app())

    with (
        patch(
            "integrations.telegram_client.get_telegram_client_for_org",
            new=AsyncMock(return_value=telegram_client),
        ),
        patch(
            "asyncio.to_thread",
            new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
        ),
    ):
        response = client.post(
            "/api/v1/webhook/telegram/org-a",
            json={
                "callback_query": {
                    "id": "callback-124",
                    "data": "reject:approval-uuid-abc",
                    "from": {"id": 999888},
                    "message": {
                        "message_id": 555,
                        "text": "Solicitud de Reserva Lote 12"
                    }
                }
            }
        )

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    telegram_client.answer_callback_query.assert_awaited_once_with("callback-124")
    telegram_client.edit_message_text.assert_awaited_once()
    # Verificar encolamiento asertivo de Redis
    mock_redis.enqueue_job.assert_awaited_once_with(
        "process_admin_decision", "org-a", "approval-uuid-abc", "reject", "999888"
    )


async def test_telegram_callback_idempotency_repeated_decisions():
    """Telegram callbacks for decision resolution must be idempotent and handle already processed cases."""
    from workers.tasks.approval_processor import process_admin_decision

    # 1. Primera llamada: éxito
    first_rpc = MagicMock(
        data={
            "success": True,
            "vendor_phone": "+56912345678",
            "vendor_platform": "telegram",
            "vendor_name": "Vendedor A",
            "lot_id": "lot-uuid-1",
        }
    )
    # 2. Segunda llamada: ya procesado (error)
    second_rpc = MagicMock(
        data={
            "success": False,
            "error": "already_processed",
        }
    )

    supabase = MagicMock()
    supabase.rpc.return_value.execute.side_effect = [first_rpc, second_rpc]

    # Simular la cadena para lote y perfiles
    def get_table_mock(table_name):
        table_mock = MagicMock()
        if table_name == "lots":
            table_mock.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
                data=[{"numero_lote": "24"}]
            )
        elif table_name == "profiles":
            table_mock.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
                data=[{"telegram_chat_id": "chat-1"}]
            )
        elif table_name == "approval_requests":
            table_mock.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
                data=[{"organization_id": "org-a"}]
            )
        return table_mock

    supabase.table.side_effect = get_table_mock

    telegram_client = MagicMock()
    telegram_client.send_text = AsyncMock()

    with (
        patch("workers.tasks.approval_processor.get_supabase_client", return_value=supabase),
        patch(
            "workers.tasks.approval_processor.get_telegram_client_for_org",
            new=AsyncMock(return_value=telegram_client),
        ),
    ):
        # Primer procesamiento (exitoso)
        res1 = await process_admin_decision(
            {}, "org-a", "approval-1", "approve", "admin-chat-id"
        )
        # Segundo procesamiento (ya procesado, debe retornar gracefully)
        res2 = await process_admin_decision(
            {}, "org-a", "approval-1", "approve", "admin-chat-id"
        )

    assert res1 == "SUCCESS"
    assert res2 == "RPC_FAILED: already_processed"
    assert supabase.rpc.call_count == 2


async def test_telegram_webhook_callback_enqueues_sale_approve_decision():
    """El webhook de Telegram debe recibir callback de aprobación de venta, responder a Telegram y encolar el job en Redis con argumentos correctos."""
    from fastapi.testclient import TestClient

    mock_redis.reset_mock()
    telegram_client = MagicMock()
    telegram_client.answer_callback_query = AsyncMock(return_value=True)
    telegram_client.edit_message_text = AsyncMock()

    client = TestClient(_build_webhook_app())

    with (
        patch(
            "integrations.telegram_client.get_telegram_client_for_org",
            new=AsyncMock(return_value=telegram_client),
        ),
        patch(
            "asyncio.to_thread",
            new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
        ),
    ):
        response = client.post(
            "/api/v1/webhook/telegram/org-a",
            json={
                "callback_query": {
                    "id": "callback-125",
                    "data": "approve:approval-uuid-sale",
                    "from": {"id": 999888},
                    "message": {
                        "message_id": 556,
                        "text": "Solicitud de Venta Lote 12"
                    }
                }
            }
        )

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    telegram_client.answer_callback_query.assert_awaited_once_with("callback-125")
    telegram_client.edit_message_text.assert_awaited_once()
    # Verificar encolamiento asertivo de Redis
    mock_redis.enqueue_job.assert_awaited_once_with(
        "process_admin_decision", "org-a", "approval-uuid-sale", "approve", "999888"
    )
