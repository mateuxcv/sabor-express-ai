import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx
from pydantic import ValidationError

from crm import CrmError, CrmIntegration, CustomerInput, MappingInput
from csat import SurveyInput, AnswerInput, issue_survey, answer_survey, get_survey, metrics
from systems import DemoSystems
from tests.test_crm import FakeRD, ENV, STORE, PIPELINE, STAGE, OWNER, NOW


class CsatTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.systems = DemoSystems(Path(directory.name) / "csat.sqlite", clock=lambda: NOW)
        self.rd = FakeRD()
        self.crm = CrmIntegration(self.systems, transport=httpx.MockTransport(self.rd), interval=0)
        env = patch.dict(os.environ, ENV)
        env.start(); self.addCleanup(env.stop)

    async def configure(self, profile=True):
        self.crm.save_tokens({"access_token": "access-1", "refresh_token": "refresh-1", "expires_in": 7200})
        await self.crm.save_mapping(MappingInput(store=STORE, pipelineId=PIPELINE, stageId=STAGE, ownerId=OWNER))
        if profile: self.crm.save_customer(CustomerInput(conversationId="conversation", name="Cliente Teste", phone="11999990000"))

    def issue(self, conversation_id="conversation", store=STORE):
        return issue_survey(self.systems, SurveyInput(conversationId=conversation_id, store=store, customerName="Cliente Teste"))

    def answer(self, survey, score=5, comment="Atendimento excelente"):
        return answer_survey(self.systems, AnswerInput(surveyId=survey["id"], conversationId=survey["conversationId"], score=score, comment=comment))

    def order(self):
        draft = self.systems.quote_order("conversation", STORE, "classic", 2)
        return self.systems.confirm_order("conversation", draft.id)

    def test_issue_is_idempotent_and_reopen_keeps_original_unit_and_answer(self):
        first = self.issue()
        self.assertEqual(first["id"], self.issue()["id"])
        self.answer(first)
        reopened = self.issue(store="São Paulo · Moema")
        self.assertEqual(reopened["score"], 5)
        self.assertEqual(reopened["store"], STORE)
        self.assertEqual(metrics(self.systems)["sent"], 1)

    def test_answer_retry_is_idempotent_and_conflicting_answer_is_rejected(self):
        survey = self.issue()
        first = self.answer(survey, comment="  Obrigada  ")
        second = self.answer(survey, comment="Obrigada")
        self.assertEqual(first["answeredAt"], second["answeredAt"])
        self.assertEqual(len(self.crm.status()["events"]), 1)
        with self.assertRaises(CrmError) as error: self.answer(survey, score=1)
        self.assertEqual(error.exception.status, 409)
        self.assertEqual(get_survey(self.systems, "conversation")["score"], 5)

    def test_wrong_conversation_and_invalid_scores_are_rejected(self):
        survey = self.issue()
        with self.assertRaises(CrmError):
            answer_survey(self.systems, AnswerInput(surveyId=survey["id"], conversationId="other", score=5))
        for score in (0, 6, 1.5, True, "5"):
            with self.assertRaises(ValidationError): AnswerInput(surveyId=survey["id"], conversationId="conversation", score=score)
        with self.assertRaises(ValidationError): AnswerInput(surveyId=survey["id"], conversationId="conversation", score=5, comment="x" * 1001)
        with self.assertRaises(CrmError): self.issue(store="Unknown")

    def test_outbox_failure_rolls_back_answer(self):
        survey = self.issue()
        with patch("csat.enqueue_event", side_effect=RuntimeError("disk failure")), self.assertRaises(RuntimeError): self.answer(survey)
        self.assertIsNone(get_survey(self.systems, "conversation")["score"])
        self.assertEqual(metrics(self.systems)["answered"], 0)

    def test_metrics_use_all_answers_correct_denominator_and_store_filter(self):
        self.assertIsNone(metrics(self.systems)["csatPercent"])
        self.assertIsNone(metrics(self.systems)["responseRate"])
        for index, score in enumerate((1, 3, 4, 5)):
            self.answer(self.issue(str(index)), score=score)
        self.issue("pending")
        self.answer(self.issue("other", "São Paulo · Moema"), score=5)
        values = metrics(self.systems, STORE)
        self.assertEqual((values["sent"], values["answered"], values["pending"]), (5, 4, 1))
        self.assertEqual((values["average"], values["csatPercent"], values["responseRate"]), (3.25, 50, 80))
        self.assertEqual(sum(row["count"] for row in values["distribution"]), 4)
        self.assertEqual(metrics(self.systems)["answered"], 5)
        reloaded = DemoSystems(self.systems.path, clock=lambda: NOW)
        self.assertEqual(metrics(reloaded, STORE), values)

    async def test_offline_answer_is_preserved_then_creates_service_record_without_revenue(self):
        survey = self.issue(); self.answer(survey, score=2, comment="Precisa melhorar <script>")
        self.assertFalse(await self.crm.process_once())
        self.assertEqual(metrics(self.systems)["average"], 2)
        await self.configure(); await self.crm.process_once()
        record = get_survey(self.systems, "conversation")
        self.assertEqual(record["crmStatus"], "synced")
        self.assertTrue(record["dealUrl"])
        deal = next(iter(self.rd.deals.values()))
        self.assertTrue(deal["name"].startswith("⭐ CSAT · Pinheiros · CSAT-"))
        self.assertEqual(deal["stage_id"], "6" * 24)
        self.assertNotIn("one_time_price", deal)
        note = next(iter(self.rd.notes.values()))[0]["description"]
        self.assertIn("**Nota:** 2/5", note)
        self.assertIn("&lt;script&gt;", note)
        self.assertIn("não representa venda", note)

    async def test_csat_attaches_to_original_order_without_changing_stage_or_status(self):
        await self.configure(); order = self.order(); await self.crm.process_once()
        survey = self.issue()
        original = next(iter(self.rd.deals.values())).copy()
        self.answer(survey); await self.crm.process_once()
        self.assertEqual(len(self.rd.deals), 1)
        self.assertEqual(next(iter(self.rd.deals.values())), original)
        self.assertIn(order.id, original["name"])
        self.assertEqual(len(self.rd.notes[original["id"]]), 2)
        self.assertEqual(get_survey(self.systems, "conversation")["crmStatus"], "synced")

    async def test_csat_waits_for_uncertain_order_then_resumes(self):
        await self.configure(); self.order(); self.rd.timeout_deal = True
        await self.crm.process_once()
        survey = self.issue(); self.answer(survey); await self.crm.process_once()
        self.assertEqual(get_survey(self.systems, "conversation")["crmStatus"], "blocked")
        event = next(event for event in self.crm.status()["events"] if event["type"] == "order.confirmed")
        self.crm.retry(event["id"]); await self.crm.process_once(); await self.crm.process_once()
        self.assertEqual(get_survey(self.systems, "conversation")["crmStatus"], "synced")
        self.assertEqual(len(self.rd.deals), 1)

    async def test_later_order_is_not_used_for_earlier_survey(self):
        await self.configure(); survey = self.issue(); self.order(); await self.crm.process_once()
        self.answer(survey); await self.crm.process_once()
        self.assertEqual(len(self.rd.deals), 2)
        event = next(event for event in self.crm.status()["events"] if event["type"] == "csat.answered")
        self.assertTrue(self.rd.deals[event["dealId"]]["name"].startswith("⭐ CSAT"))

    async def test_missing_profile_blocks_crm_but_not_metrics_and_resumes_after_identification(self):
        await self.configure(profile=False); self.answer(self.issue()); await self.crm.process_once()
        self.assertEqual(metrics(self.systems)["answered"], 1)
        self.assertEqual(self.crm.status()["events"][0]["code"], "missing_customer")
        self.crm.save_customer(CustomerInput(conversationId="conversation", name="Cliente Teste", phone="11999990000"))
        await self.crm.process_once()
        self.assertEqual(get_survey(self.systems, "conversation")["crmStatus"], "synced")

    async def test_uncertain_note_and_deal_are_reconciled_without_duplicates(self):
        await self.configure(); self.answer(self.issue()); self.rd.timeout_deal = True
        await self.crm.process_once()
        event = self.crm.status()["events"][0]
        self.assertEqual(event["status"], "uncertain")
        self.crm.retry(event["id"]); self.rd.timeout_note = True; await self.crm.process_once()
        self.assertEqual(self.crm.status()["events"][0]["status"], "uncertain")
        self.crm.retry(event["id"]); await self.crm.process_once()
        self.assertEqual(len(self.rd.deals), 1)
        self.assertEqual(sum(len(notes) for notes in self.rd.notes.values()), 1)
        self.assertEqual(get_survey(self.systems, "conversation")["crmStatus"], "synced")

    async def test_new_connection_requires_explicit_retry(self):
        await self.configure(); self.answer(self.issue())
        self.crm.save_tokens({"access_token": "access-1", "refresh_token": "refresh-new", "expires_in": 7200})
        await self.crm.process_once()
        self.assertEqual(self.crm.status()["events"][0]["code"], "connection_changed")
        self.assertEqual(len(self.rd.deals), 0)
