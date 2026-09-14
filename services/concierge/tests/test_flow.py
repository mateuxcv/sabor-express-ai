import asyncio
import os
import unittest
import tempfile
from datetime import datetime
from pathlib import Path
from uuid import uuid4
from zoneinfo import ZoneInfo
from unittest.mock import AsyncMock, patch

os.environ["CREWAI_TRACING_ENABLED"] = "false"
os.environ["OTEL_SDK_DISABLED"] = "true"

from app import app, cache, inflight
from flow import ReceptionFlow
from models import Booking, BookingExtraction, ChatReply, ChatRequest, Decision, PendingAction, Routing, ServiceAction
from policy import booking_reply, handoff
from httpx import ASGITransport, AsyncClient
from crewai import BaseLLM
from agents import run_agent
from systems import DemoSystems


def request(text="Quero organizar um aniversário para 15 pessoas", **overrides):
    message_id = uuid4().hex
    confirmation = overrides.pop("confirmationId", None)
    conversation = {"id": "client-1", "name": "Cliente", "store": "São Paulo · Pinheiros", "status": "ai", "messages": [{"id": message_id, "author": "customer", "text": text}], **overrides}
    return ChatRequest(requestId=message_id, conversation=conversation, confirmationId=confirmation)


class FlowTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.systems = DemoSystems(Path(directory.name) / "test.sqlite", clock=lambda: datetime(2026, 9, 13, 10, tzinfo=ZoneInfo("America/Sao_Paulo")))
        for module in ("flow", "policy"):
            patcher = patch(f"{module}.get_systems", return_value=self.systems)
            patcher.start()
            self.addCleanup(patcher.stop)

    def save_context(self, **fields):
        self.systems.save_reply(request("contexto anterior"), ChatReply(text="Resumo anterior", topic="Teste", routing=Routing(agent="reception", reason="Teste", summary="Teste"), **fields))

    async def test_real_crewai_agent_parses_structured_output_with_fake_llm(self):
        class FakeLLM(BaseLLM):
            def call(self, messages, **kwargs):
                return '{"intent":"birthdays","confidence":0.95}'

        with patch("agents.create_llm", return_value=FakeLLM(model="test-local")):
            result = await run_agent("reception", request(), Decision, "Classifique a intenção.")
        self.assertEqual(result.intent, "birthdays")

    async def test_birthday_routes_to_correct_specialist(self):
        calls = []

        async def runner(agent_id, req, schema, instruction):
            calls.append(agent_id)
            if schema is Decision:
                return Decision(intent="birthdays", confidence=0.95)
            return BookingExtraction(date=None, time=None, guests="15 pessoas")

        result = await ReceptionFlow(request(), runner).kickoff_async()
        self.assertEqual(calls, ["reception", "birthdays"])
        self.assertEqual(result.booking.guests, 15)
        self.assertEqual(result.status, "ai")
        self.assertEqual(result.routing.missingFields, ["date", "time"])

    async def test_explicit_human_request_bypasses_model(self):
        runner = AsyncMock(side_effect=AssertionError("Não chamar o modelo"))
        result = await ReceptionFlow(request("Quero falar com um atendente"), runner).kickoff_async()
        self.assertEqual(result.status, "waiting")
        self.assertEqual(result.routing.agent, "human")
        runner.assert_not_called()

    async def test_low_confidence_clarifies_then_handoff(self):
        runner = AsyncMock(return_value=Decision(intent="orders", confidence=0.4))
        first = await ReceptionFlow(request("Preciso organizar uma coisa"), runner).kickoff_async()
        self.assertEqual(first.routing.agent, "reception")
        self.assertEqual(first.clarificationCount, 1)
        second = await ReceptionFlow(request("Aquela coisa"), runner).kickoff_async()
        self.assertEqual(second.clarificationCount, 2)
        third = await ReceptionFlow(request("Ainda aquela coisa"), runner).kickoff_async()
        self.assertEqual(third.status, "waiting")

    async def test_missing_information_does_not_invent_parking(self):
        runner = AsyncMock(side_effect=[Decision(intent="information", confidence=0.99), ServiceAction(action="parking", productId=None)])
        result = await ReceptionFlow(request("Tem estacionamento?", store="São Paulo · Moema"), runner).kickoff_async()
        self.assertEqual(result.status, "waiting")

    async def test_booking_context_is_preserved(self):
        runner = AsyncMock(side_effect=[Decision(intent="reservations", confidence=0.99), BookingExtraction(date=None, time="19h", guests=None)])
        self.save_context(booking=Booking(kind="reservation", date="2026-10-24", guests=4, askedField="time"))
        result = await ReceptionFlow(request("19h"), runner).kickoff_async()
        self.assertEqual(result.booking.date, "2026-10-24")
        self.assertEqual(result.booking.time, "19:00")
        self.assertEqual(result.booking.stage, "awaiting_confirmation")
        self.assertEqual(result.status, "ai")
        self.assertIn("Posso confirmar", result.text)

    def test_extracted_values_require_customer_evidence(self):
        result = booking_reply(request("Quero reservar"), BookingExtraction(date="24/10", time="19h", guests="15 pessoas"), "reservation")
        self.assertIsNone(result.booking.date)
        self.assertIsNone(result.booking.time)
        self.assertIsNone(result.booking.guests)

    def test_invalid_date_time_are_not_accepted(self):
        result = booking_reply(request("Reservar para 4 pessoas em 31/02 às 19:90"), BookingExtraction(date="31/02", time="19:90", guests="4 pessoas"), "reservation")
        self.assertIsNone(result.booking.date)
        self.assertIsNone(result.booking.time)

    async def test_order_confirmation_is_explicit_and_price_comes_from_catalog(self):
        order = self.systems.quote_order("client-1", "São Paulo · Pinheiros", "classic", 1)
        self.save_context(order=order, pendingAction=PendingAction(kind="order", id=order.id))
        forged = order.model_copy(update={"price": 0.01})
        runner = AsyncMock(side_effect=AssertionError("Confirmação é determinística"))
        result = await ReceptionFlow(request("sim", order=forged, confirmationId=order.id), runner).kickoff_async()
        self.assertTrue(result.order.confirmed)
        self.assertEqual(result.order.price, 35.9)
        self.assertEqual(result.order.id, order.id)
        runner.assert_not_called()


class ApiTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        cache.clear()
        inflight.clear()
        self.client = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
        self.token = patch.dict(os.environ, {"CREWAI_SERVICE_TOKEN": "", "SENTIMENT_USE_LLM": "false"})
        self.token.start()
        self.directory = tempfile.TemporaryDirectory()
        self.systems = DemoSystems(Path(self.directory.name) / "api.sqlite")
        self.systems_patch = patch("flow.get_systems", return_value=self.systems)
        self.systems_patch.start()
        from crm import CrmIntegration
        self.crm_patch = patch("app.get_crm", return_value=CrmIntegration(self.systems))
        self.crm_patch.start()

    async def asyncTearDown(self):
        await self.client.aclose()
        self.token.stop()
        self.systems_patch.stop()
        self.crm_patch.stop()
        self.directory.cleanup()

    async def test_invalid_input_and_internal_notes_are_rejected(self):
        payload = request().model_dump(mode="json", exclude_none=True)
        payload["conversation"]["messages"][0]["author"] = "note"
        response = await self.client.post("/chat", json=payload)
        self.assertEqual(response.status_code, 422)

    async def test_service_token_is_checked(self):
        with patch.dict(os.environ, {"CREWAI_SERVICE_TOKEN": "test-secret"}):
            response = await self.client.post("/chat", json=request().model_dump(mode="json", exclude_none=True))
        self.assertEqual(response.status_code, 401)

    async def test_duplicate_requests_coalesce_and_cache(self):
        calls = 0

        async def execute(req):
            nonlocal calls
            calls += 1
            await asyncio.sleep(0.02)
            return handoff("Teste")

        payload = request().model_dump(mode="json", exclude_none=True)
        with patch("app.execute", execute):
            first, second = await asyncio.gather(self.client.post("/chat", json=payload), self.client.post("/chat", json=payload))
            third = await self.client.post("/chat", json=payload)
        self.assertEqual(calls, 1)
        self.assertEqual(first.json(), second.json())
        self.assertEqual(second.json(), third.json())

    async def test_provider_error_falls_back_to_team(self):
        with patch("app.ReceptionFlow.kickoff_async", AsyncMock(side_effect=TimeoutError)):
            response = await self.client.post("/chat", json=request().model_dump(mode="json", exclude_none=True))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "waiting")
        self.assertEqual(response.json()["routing"]["source"], "fallback")

    async def test_sentiment_handoff_precedes_business_flow(self):
        payload = request().model_dump(mode="json", exclude_none=True)
        payload["conversation"]["messages"][-1]["text"] = "Quero falar com um humano"
        with patch("app.ReceptionFlow.kickoff_async", AsyncMock()) as flow:
            response = await self.client.post("/chat", json=payload)
        self.assertEqual(response.json()["status"], "waiting")
        self.assertEqual(response.json()["routing"]["agent"], "human")
        flow.assert_not_called()
        with self.systems.connection() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM sentiment_alerts").fetchone()[0], 1)


if __name__ == "__main__":
    unittest.main()
