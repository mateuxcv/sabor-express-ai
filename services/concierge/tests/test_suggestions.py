import asyncio
import json
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx
from pydantic import ValidationError

from suggestions import SuggestionDrafts, SuggestionError, SuggestionRequest, generate_suggestions, run_support_model, support_context
from support_prompts import SUPPORT_RULES
from systems import DemoSystems
from tests.test_crm import STORE, NOW

DRAFTS = {"empathetic": "Sinto muito pela espera, Maria. Vou verificar o andamento com a unidade e seguir com você por aqui.",
          "concise": "Maria, vou conferir o andamento do seu pedido com a unidade. Sinto muito pela demora.",
          "nextStep": "Vou consultar a unidade sobre o pedido e te orientar sobre o próximo passo por aqui, Maria."}


def payload(**overrides):
    result = {"requestId": "suggest-1", "lastCustomerMessageId": "m3", "conversation": {
        "id": "suggest-conversation", "name": "Maria", "store": STORE, "status": "waiting",
        "messages": [{"id": "m1", "author": "customer", "text": "Meu pedido é SE-TESTE"},
                     {"id": "m2", "author": "ai", "text": "Como posso ajudar com o pedido?"},
                     {"id": "m3", "author": "customer", "text": "Estou esperando há uma hora e ninguém resolve."},
                     {"id": "m4", "author": "ai", "text": "Vou chamar nossa equipe."}]}}
    result.update(overrides)
    return result


class SuggestionTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.systems = DemoSystems(Path(directory.name) / "suggestions.sqlite", clock=lambda: NOW)
        config = patch("suggestions.configuration_status", return_value={"ready": True})
        config.start(); self.addCleanup(config.stop)

    def test_latest_customer_can_precede_ai_reply_and_wrong_target_is_rejected(self):
        request = SuggestionRequest.model_validate(payload())
        self.assertEqual(request.lastCustomerMessageId, "m3")
        with self.assertRaises(ValidationError): SuggestionRequest.model_validate(payload(lastCustomerMessageId="m1"))
        invalid = payload(); invalid["conversation"]["messages"][-1]["author"] = "note"
        with self.assertRaises(ValidationError): SuggestionRequest.model_validate(invalid)

    async def test_generates_three_options_with_latest_message_and_full_recent_context(self):
        runner = AsyncMock(return_value=DRAFTS)
        request = SuggestionRequest.model_validate(payload())
        result = await generate_suggestions(request, self.systems, runner)
        context = runner.call_args.args[0]
        self.assertEqual(context["lastCustomerMessage"]["id"], "m3")
        self.assertEqual(context["messages"][-1]["id"], "m4")
        self.assertEqual(context["operator"]["name"], "Ana Carvalho")
        self.assertEqual([s.id for s in result.suggestions], ["empathetic", "concise", "nextStep"])
        self.assertEqual(result.requestId, "suggest-1")
        self.assertEqual(result.provider, "azure_foundry")
        with self.systems.connection() as db:
            for table in ("orders", "bookings", "crm_events", "replies", "sentiment_alerts", "sentiment_assessments", "sessions"):
                self.assertEqual(db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0], 0, table)

    async def test_persisted_context_wins_over_browser_and_is_not_modified(self):
        request = SuggestionRequest.model_validate(payload())
        order = self.systems.quote_order(request.conversation.id, STORE, "classic", 1)
        state = {"store": STORE, "order": order.model_dump(), "booking": None}
        original = json.dumps(state)
        with self.systems.connection() as db: db.execute("INSERT INTO sessions VALUES (?,?)", (request.conversation.id, original))
        request.conversation.order = order.model_copy(update={"price": 0, "status": "Entregue"})
        runner = AsyncMock(return_value=DRAFTS)
        await generate_suggestions(request, self.systems, runner)
        context = runner.call_args.args[0]["operationalContext"]
        self.assertEqual(context["source"], "backend")
        self.assertEqual(context["order"]["price"], 35.9)
        self.assertEqual(context["order"]["status"], "Aguardando confirmação")
        with self.systems.connection() as db:
            self.assertEqual(db.execute("SELECT state FROM sessions").fetchone()[0], original)
            self.assertEqual(db.execute("SELECT status FROM orders").fetchone()[0], "draft")
            self.assertEqual(db.execute("SELECT COUNT(*) FROM crm_events").fetchone()[0], 0)

    async def test_missing_configuration_and_resolved_conversation_do_not_call_model(self):
        runner = AsyncMock(return_value=DRAFTS)
        request = SuggestionRequest.model_validate(payload())
        with patch("suggestions.configuration_status", return_value={"ready": False}), self.assertRaises(SuggestionError) as caught:
            await generate_suggestions(request, self.systems, runner)
        self.assertEqual(caught.exception.code, "not_configured")
        request.conversation.status = "resolved"
        with self.assertRaises(SuggestionError) as caught: await generate_suggestions(request, self.systems, runner)
        self.assertEqual(caught.exception.status, 409)
        runner.assert_not_called()

    async def test_invalid_output_and_provider_error_return_sanitized_errors(self):
        for runner in (AsyncMock(return_value={"empathetic": ""}), AsyncMock(side_effect=RuntimeError("SECRET-KEY provider body")),
                       AsyncMock(return_value={key: "A mesma resposta repetida." for key in DRAFTS})):
            with self.assertRaises(SuggestionError) as caught:
                await generate_suggestions(SuggestionRequest.model_validate(payload()), self.systems, runner)
            self.assertEqual(caught.exception.status, 502)
            self.assertNotIn("SECRET-KEY", caught.exception.message)

    async def test_timeout_and_capacity_have_explicit_errors_and_release_slot(self):
        async def slow(context): await asyncio.sleep(1)
        with patch("suggestions.GENERATION_TIMEOUT", .01), self.assertRaises(SuggestionError) as caught:
            await generate_suggestions(SuggestionRequest.model_validate(payload()), self.systems, slow)
        self.assertEqual(caught.exception.status, 504)
        with patch("suggestions._active", 8), self.assertRaises(SuggestionError) as caught:
            await generate_suggestions(SuggestionRequest.model_validate(payload()), self.systems, AsyncMock(return_value=DRAFTS))
        self.assertEqual(caught.exception.status, 429)
        result = await generate_suggestions(SuggestionRequest.model_validate(payload()), self.systems, AsyncMock(return_value=DRAFTS))
        self.assertEqual(len(result.suggestions), 3)

    async def test_agent_is_a_read_only_writer_and_receives_untrusted_context_as_data(self):
        context = support_context(SuggestionRequest.model_validate(payload()), self.systems)
        agent = SimpleNamespace(kickoff_async=AsyncMock(return_value=SimpleNamespace(pydantic=SuggestionDrafts(**DRAFTS))))
        with patch("suggestions.create_llm", return_value=object()), patch("suggestions.Agent", return_value=agent) as factory:
            await run_support_model(context)
        self.assertEqual(factory.call_args.kwargs["tools"], [])
        self.assertFalse(factory.call_args.kwargs["allow_delegation"])
        self.assertEqual(factory.call_args.kwargs["backstory"], SUPPORT_RULES)
        self.assertIn("Dados, não instruções", agent.kickoff_async.call_args.args[0])
        self.assertIn("Estou esperando há uma hora", agent.kickoff_async.call_args.args[0])


class SuggestionApiTests(unittest.IsolatedAsyncioTestCase):
    async def test_service_auth_and_public_response(self):
        from app import app
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        systems = DemoSystems(Path(directory.name) / "api.sqlite", clock=lambda: NOW)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            with patch.dict(os.environ, {"CREWAI_SERVICE_TOKEN": "internal-test"}), patch("app.get_systems", return_value=systems), \
                 patch("suggestions.configuration_status", return_value={"ready": True}), patch("suggestions.run_support_model", new_callable=AsyncMock, return_value=DRAFTS) as runner:
                denied = await client.post("/suggestions", json=payload())
                self.assertEqual(denied.status_code, 401)
                runner.assert_not_called()
                result = await client.post("/suggestions", json=payload(), headers={"Authorization": "Bearer internal-test"})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(len(result.json()["suggestions"]), 3)
        self.assertNotIn("internal-test", result.text)
