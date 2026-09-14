import asyncio
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

import httpx

from crm import CrmError, CrmIntegration, CustomerInput, MappingInput
from models import ChatRequest
from sentiment import Assessment, AlertAction, analyze, change_alert, classify, dashboard, latest_alert, rule_assessment
from systems import DemoSystems
from tests.test_crm import FakeRD, ENV, STORE, PIPELINE, STAGE, OWNER, NOW


def request(text="Você não está me entendendo", message_id="m1", history=None, status="ai", conversation_id="conversation"):
    return ChatRequest.model_validate({"requestId": message_id, "conversation": {
        "id": conversation_id, "name": "Cliente Teste", "store": STORE, "status": status,
        "messages": [*(history or []), {"id": message_id, "author": "customer", "text": text}]}})


class SentimentRD(FakeRD):
    def __init__(self):
        super().__init__()
        self.tasks = {}
        self.timeout_task = False
        self.deny_task = False

    async def __call__(self, req):
        path = req.url.path.removeprefix("/crm/v2")
        if path == "/tasks" or path.startswith("/tasks/"):
            self.requests[(req.method, path)] += 1
            if self.deny_task: return httpx.Response(403, json={"errors": []})
            if req.method == "GET":
                deal_id = req.url.params["filter"].removeprefix("deal_id:")
                return httpx.Response(200, json={"data": [t for t in self.tasks.values() if t["deal_id"] == deal_id]})
            data = json.loads(req.content)["data"]
            if req.method == "PATCH":
                task_id = path.split("/")[-1]
                self.tasks[task_id].update(data)
                return httpx.Response(200, json={"data": self.tasks[task_id]})
            assert data["status"] == "open" and data["owner_ids"] == [OWNER]
            task_id = f"{len(self.tasks) + 900:024x}"
            self.tasks[task_id] = {"id": task_id, **data}
            if self.timeout_task:
                self.timeout_task = False
                raise httpx.ReadTimeout("accepted_without_response", request=req)
            return httpx.Response(201, json={"data": self.tasks[task_id]})
        return await super().__call__(req)


class SentimentTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.systems = DemoSystems(Path(directory.name) / "sentiment.sqlite", clock=lambda: NOW)
        self.rd = SentimentRD()
        self.crm = CrmIntegration(self.systems, transport=httpx.MockTransport(self.rd), interval=0)
        env = patch.dict(os.environ, {**ENV, "ASSISTANT_PROVIDER": "crewai", "SENTIMENT_USE_LLM": "false"})
        env.start(); self.addCleanup(env.stop)

    async def configure(self, profile=True):
        self.crm.save_tokens({"access_token": "access-1", "refresh_token": "refresh-1", "expires_in": 7200})
        await self.crm.save_mapping(MappingInput(store=STORE, pipelineId=PIPELINE, stageId=STAGE, ownerId=OWNER))
        if profile: self.crm.save_customer(CustomerInput(conversationId="conversation", name="Cliente Teste", phone="11999990000"))

    def test_rules_distinguish_human_preference_negation_and_unrelated_emotion(self):
        for text in ("Quero falar com um humano", "Prefiro falar com uma pessoa, por favor", "Chame um atendente", "Quero um atendente", "Me passa para um humano"):
            value = rule_assessment(request(text))
            self.assertEqual((value.level, value.category), ("high", "human_request"))
        for text in ("Não quero falar com um humano", "Não precisa chamar um atendente", "Não estou insatisfeito com o atendimento", "Meu dia foi horrível, quero um combo", "Obrigada, ótimo atendimento", "Não está demorando", 'Ele disse "quero falar com um humano"', "Já expliquei e agora está tudo resolvido"):
            with self.subTest(text=text): self.assertEqual(rule_assessment(request(text)).level, "none")
        self.assertEqual(rule_assessment(request("O atendimento de vocês é péssimo")).category, "service")

    async def test_first_message_handoff_does_not_call_model(self):
        with patch("sentiment.classify", wraps=classify), patch("agents.run_agent", new_callable=AsyncMock) as model:
            alert = (await analyze(self.systems, request()))["alert"]
        self.assertEqual(alert["level"], "high")
        self.assertEqual(alert["category"], "automation")
        self.assertIsNotNone(alert["waitingSince"])
        model.assert_not_called()

    async def test_contextual_model_requires_literal_evidence_and_confidence(self):
        text = "Que maravilha, mais uma resposta que não tem nada a ver."
        value = Assessment(level="high", category="automation", reason="Ironia e falta de solução", evidence=text, confidence=.93)
        with patch.dict(os.environ, {"SENTIMENT_USE_LLM": "true"}), patch("llm_config.configuration_status", return_value={"ready": True}), patch("agents.run_agent", new_callable=AsyncMock, return_value=value):
            assessment, source = await classify(request(text))
            self.assertEqual((assessment.level, source), ("high", "model"))
            value.evidence = "texto inventado"
            assessment, source = await classify(request(text))
            self.assertEqual((assessment.level, source), ("none", "rules_fallback"))
            value.evidence = text; value.confidence = .7
            assessment, source = await classify(request(text))
            self.assertEqual(assessment.level, "attention")

    async def test_model_failure_preserves_mild_rule_signal(self):
        with patch.dict(os.environ, {"SENTIMENT_USE_LLM": "true"}), patch("llm_config.configuration_status", return_value={"ready": True}), patch("agents.run_agent", new_callable=AsyncMock, side_effect=TimeoutError):
            assessment, source = await classify(request("Está demorando"))
        self.assertEqual((assessment.level, source), ("attention", "rules_fallback"))

    async def test_repeated_mild_signals_escalate_but_retry_does_not(self):
        first = await analyze(self.systems, request("Está demorando"))
        repeat = await analyze(self.systems, request("Está demorando"))
        self.assertEqual(repeat["alert"]["level"], "attention")
        self.assertEqual(self.crm.status()["events"], [])
        second = await analyze(self.systems, request("Ainda estou esperando", "m2"))
        self.assertEqual(first["alert"]["id"], second["alert"]["id"])
        self.assertEqual(second["alert"]["level"], "high")
        self.assertEqual(len(self.crm.status()["events"]), 1)

    async def test_concurrent_retry_and_new_messages_keep_single_occurrence(self):
        results = await asyncio.gather(*(analyze(self.systems, request()) for _ in range(4)))
        self.assertEqual(len({r["alert"]["id"] for r in results}), 1)
        await analyze(self.systems, request("Já expliquei isso", "m2"))
        self.assertEqual(len(dashboard(self.systems)["alerts"]), 1)
        self.assertEqual(len(self.crm.status()["events"]), 1)
        with self.assertRaises(CrmError): await analyze(self.systems, request("Outro texto", "m1"))

    async def test_outbox_failure_rolls_back_alert_and_assessment(self):
        with patch("sentiment.enqueue_event", side_effect=RuntimeError("disk")), self.assertRaises(RuntimeError):
            await analyze(self.systems, request())
        self.assertIsNone(latest_alert(self.systems, "conversation"))
        with self.systems.connection() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM sentiment_assessments").fetchone()[0], 0)

    async def test_acknowledge_resolve_reload_and_new_occurrence(self):
        alert = (await analyze(self.systems, request()))["alert"]
        accepted = await change_alert(self.systems, AlertAction(alertId=alert["id"], action="acknowledge"))
        self.assertEqual(accepted["ownerName"], "Ana Carvalho")
        self.assertEqual((await analyze(self.systems, request("Já expliquei isso", "m2")))["alert"]["status"], "acknowledged")
        await change_alert(self.systems, AlertAction(alertId=alert["id"], action="resolve"))
        self.assertEqual(dashboard(self.systems)["alerts"], [])
        reloaded = DemoSystems(self.systems.path, clock=lambda: NOW)
        self.assertEqual(latest_alert(reloaded, "conversation")["status"], "resolved")
        self.assertEqual((await analyze(self.systems, request()))["alert"]["status"], "resolved")
        new = (await analyze(self.systems, request("O atendimento é péssimo", "m3")))["alert"]
        self.assertNotEqual(new["id"], alert["id"])

    async def test_human_conversation_is_recorded_as_already_acknowledged(self):
        alert = (await analyze(self.systems, request(status="human")))["alert"]
        self.assertEqual(alert["status"], "acknowledged")

    async def test_offline_alert_then_task_without_sales_value(self):
        await analyze(self.systems, request())
        self.assertFalse(await self.crm.process_once())
        await self.configure(); await self.crm.process_once()
        alert = latest_alert(self.systems, "conversation")
        self.assertEqual(alert["crmStatus"], "synced")
        self.assertIsNotNone(alert["taskId"])
        deal = next(iter(self.rd.deals.values()))
        self.assertTrue(deal["name"].startswith("🚨 Atenção · Pinheiros · SENT-"))
        self.assertNotIn("one_time_price", deal)
        self.assertEqual(len(self.rd.tasks), 1)

    async def test_missing_profile_preserves_alert_and_resumes(self):
        await self.configure(profile=False)
        await analyze(self.systems, request()); await self.crm.process_once()
        self.assertEqual(latest_alert(self.systems, "conversation")["crmStatus"], "blocked")
        self.crm.save_customer(CustomerInput(conversationId="conversation", name="Cliente Teste", phone="11999990000"))
        await self.crm.process_once()
        self.assertEqual(latest_alert(self.systems, "conversation")["crmStatus"], "synced")

    async def test_existing_order_keeps_value_status_and_stage(self):
        await self.configure()
        order = self.systems.quote_order("conversation", STORE, "classic", 1)
        self.systems.confirm_order("conversation", order.id); await self.crm.process_once()
        before = dict(next(iter(self.rd.deals.values())))
        await analyze(self.systems, request()); await self.crm.process_once()
        self.assertEqual(list(self.rd.deals.values()), [before])
        self.assertEqual(next(iter(self.rd.tasks.values()))["deal_id"], before["id"])

    async def test_task_timeout_reconciles_without_duplicate(self):
        await self.configure(); await analyze(self.systems, request())
        self.rd.timeout_task = True
        await self.crm.process_once()
        event = self.crm.status()["events"][0]
        self.assertEqual(event["status"], "uncertain")
        self.crm.retry(event["id"]); await self.crm.process_once()
        self.assertEqual(latest_alert(self.systems, "conversation")["crmStatus"], "synced")
        self.assertEqual(len(self.rd.tasks), 1)
        self.assertEqual(sum(len(n) for n in self.rd.notes.values()), 1)

    async def test_new_evidence_updates_task_and_preserves_original_note(self):
        await self.configure(); await analyze(self.systems, request()); await self.crm.process_once()
        note = next(iter(self.rd.notes.values()))[0]["description"]
        await analyze(self.systems, request("Já expliquei três vezes", "m2")); await self.crm.process_once()
        self.assertEqual(len(self.rd.tasks), 1)
        self.assertIn("Já expliquei três vezes", next(iter(self.rd.tasks.values()))["description"])
        self.assertEqual(next(iter(self.rd.notes.values()))[0]["description"], note)
        self.assertEqual(latest_alert(self.systems, "conversation")["crmStatus"], "synced")

    async def test_task_permission_error_never_claims_sync_success(self):
        await self.configure(); await analyze(self.systems, request()); self.rd.deny_task = True
        await self.crm.process_once()
        alert = latest_alert(self.systems, "conversation")
        self.assertEqual(alert["crmStatus"], "blocked")
        self.assertIsNone(alert["taskId"])
        self.assertFalse(await self.crm.process_once())
