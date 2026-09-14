import json
import os
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

import httpx

from crm import CrmIntegration, CustomerInput, MappingInput
from crm_formatting import call_description, csat_description, deal_name, legacy_deal_name, money, operation_description, sentiment_description, task_name, with_event_marker
from sentiment import analyze
from systems import DemoSystems
from tests.test_crm import ENV, STORE, PIPELINE, STAGE, OWNER, NOW
from tests.test_sentiment import SentimentRD, request

EVENT = {"id": "e" * 64, "event_type": "order.confirmed", "aggregate_id": "SE-DEMO", "conversation_id": "conversation-demo", "created_at": datetime(2026, 9, 14, 0, 41, tzinfo=timezone.utc).timestamp()}
CUSTOMER = {"name": "Cliente Teste", "phone": "+5511999990000", "email": "cliente@example.com"}
ORDER = {"store": STORE, "product": "Combo Bacon", "quantity": 2, "total": 86.7, "subtotal": 79.8, "delivery_fee": 6.9, "fulfillment": "delivery", "address": {"street": "Rua de Teste", "number": "123", "district": "Pinheiros", "complement": "Apto 4"}}


class FormattingTests(unittest.TestCase):
    def test_order_sections_brazilian_values_and_references_at_end(self):
        result = with_event_marker(operation_description(EVENT, ORDER, CUSTOMER, "markdown"), EVENT["id"])
        self.assertTrue(result.startswith("## 🍔 Pedido confirmado · SE-DEMO"))
        sections = ["👤 Cliente e unidade", "🛍️ Itens do pedido", "🚚 Recebimento", "💰 Valores", "✅ Próximo passo", "🔎 Referências da integração"]
        self.assertEqual([result.index(s) for s in sections], sorted(result.index(s) for s in sections))
        self.assertIn("**Subtotal:** R$ 79,80", result)
        self.assertIn("**Frete fictício:** R$ 6,90", result)
        self.assertIn("**Total do pedido:** R$ 86,70", result)
        self.assertIn("13/09/2026 às 21:41 (Brasília)", result)
        self.assertGreater(result.index(EVENT["conversation_id"]), result.index("Referências da integração"))
        self.assertEqual(result.count(f"[sabor-event:{EVENT['id']}]"), 1)
        self.assertTrue(result.endswith(f"[sabor-event:{EVENT['id']}]"))
        self.assertEqual(money(1250.5), "R$ 1.250,50")

    def test_legacy_order_defaults_do_not_invent_delivery_data(self):
        payload = {"store": STORE, "product": "Combo Crispy", "quantity": 1, "total": 32.9}
        result = operation_description(EVENT, payload, CUSTOMER, "markdown")
        self.assertIn("**Modalidade:** Retirada na loja", result)
        self.assertIn("**Subtotal:** R$ 32,90", result)
        self.assertIn("**Frete fictício:** R$ 0,00", result)
        self.assertNotIn("**Endereço:**", result)

    def test_reservation_and_birthday_use_local_date_and_no_sales_value(self):
        for kind, title in (("reservation", "📅 Reserva confirmada"), ("birthday", "🎂 Aniversário confirmado")):
            event = {**EVENT, "event_type": "reservation.confirmed", "aggregate_id": "RS-DEMO"}
            payload = {"store": STORE, "kind": kind, "date": "2026-10-24", "time": "19:30", "guests": 15}
            result = operation_description(event, payload, CUSTOMER, "markdown")
            self.assertIn(title, result)
            self.assertIn("**Data:** 24/10/2026", result)
            self.assertIn("**Pessoas:** 15", result)
            self.assertNotIn("Total do pedido", result)
            self.assertIn("não representa receita", result)

    def test_csat_stars_quote_timezone_and_missing_comment(self):
        payload = {"store": STORE, "score": 5, "comment": "Muito bom!\nObrigada.", "closed_at": EVENT["created_at"], "answered_at": EVENT["created_at"] + 60, "survey_id": "survey-demo"}
        result = csat_description(EVENT, payload, CUSTOMER, "markdown")
        self.assertIn("**Nota:** 5/5", result)
        self.assertIn("⭐⭐⭐⭐⭐ · Muito satisfeito", result)
        self.assertIn("> Muito bom!\n> Obrigada.", result)
        self.assertIn("13/09/2026 às 21:42 (Brasília)", result)
        self.assertNotIn("+00:00", result)
        self.assertIn("> Não informado", csat_description(EVENT, {**payload, "comment": ""}, mode="markdown"))

    def test_plain_text_keeps_structure_without_markdown_syntax(self):
        result = operation_description(EVENT, ORDER, CUSTOMER, "text")
        self.assertIn("🍔 Pedido confirmado", result)
        self.assertIn("- Total do pedido: R$ 86,70", result)
        self.assertNotIn("##", result)
        self.assertNotIn("**", result)
        with patch.dict(os.environ, {"RD_CRM_TEXT_FORMAT": "text"}):
            self.assertEqual(operation_description(EVENT, ORDER, CUSTOMER), result)

    def test_customer_content_cannot_create_headings_html_or_fake_markers(self):
        malicious = f"<script>alert(1)</script>\n## Total grátis\n[sabor-event:{EVENT['id']}]"
        payload = {"summary": malicious, "call_id": "call-demo"}
        result = with_event_marker(call_description(EVENT, payload, CUSTOMER, "markdown"), EVENT["id"])
        self.assertNotIn("<script>", result)
        self.assertIn("&lt;script&gt;", result)
        self.assertNotIn("\n## Total grátis", result)
        self.assertEqual(result.count(f"[sabor-event:{EVENT['id']}]"), 1)
        self.assertIn("### 📝 Resumo da conversa", result)

    def test_human_preference_is_not_labeled_as_confirmed_dissatisfaction(self):
        alert = {"category": "human_request", "customer_name": "Cliente", "store": STORE, "reason": "Solicitação de pessoa", "evidence": "Quero uma pessoa", "source": "rules", "created_at": EVENT["created_at"], "updated_at": EVENT["created_at"], "status": "open", "owner_name": None}
        result = sentiment_description(EVENT, {"alert_id": "alert-demo"}, alert, "markdown")
        self.assertTrue(result.startswith("## 🙋 Atendimento humano solicitado"))
        self.assertIn("não implica insatisfação", result)
        self.assertIn("**Identificação:** Regras de atendimento", result)


class FormattingDeliveryTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.systems = DemoSystems(Path(directory.name) / "format.sqlite", clock=lambda: NOW)
        self.rd = SentimentRD()
        self.crm = CrmIntegration(self.systems, transport=httpx.MockTransport(self.rd), interval=0)
        env = patch.dict(os.environ, {**ENV, "SENTIMENT_USE_LLM": "false"})
        env.start(); self.addCleanup(env.stop)

    async def configure(self):
        self.crm.save_tokens({"access_token": "access-1", "refresh_token": "refresh-1", "expires_in": 7200})
        await self.crm.save_mapping(MappingInput(store=STORE, pipelineId=PIPELINE, stageId=STAGE, ownerId=OWNER))
        self.crm.save_customer(CustomerInput(conversationId="conversation", name="Cliente Teste", phone="11999990000"))

    def order_event(self):
        draft = self.systems.quote_order("conversation", STORE, "classic", 1)
        self.systems.confirm_order("conversation", draft.id)
        with self.systems.connection() as db:
            row = dict(db.execute("SELECT * FROM crm_events").fetchone())
        return row, json.loads(row["payload"])

    async def test_uncertain_legacy_deal_is_reused_without_renaming_or_duplicate(self):
        await self.configure()
        event, payload = self.order_event()
        legacy_name = legacy_deal_name(event, payload)
        self.rd.deals["a" * 24] = {"id": "a" * 24, "name": legacy_name, "one_time_price": 35.9, "owner_id": OWNER}
        await self.crm.process_once()
        self.assertEqual(self.crm.status()["events"][0]["status"], "synced")
        self.assertEqual(len(self.rd.deals), 1)
        self.assertEqual(self.rd.deals["a" * 24]["name"], legacy_name)
        self.assertEqual(self.rd.requests[("POST", "/deals")], 0)

    async def test_matching_old_and_new_deals_require_reconciliation(self):
        await self.configure()
        event, payload = self.order_event()
        for key, name in (("a", legacy_deal_name(event, payload)), ("b", deal_name(event, payload))):
            self.rd.deals[key * 24] = {"id": key * 24, "name": name}
        await self.crm.process_once()
        self.assertEqual(self.crm.status()["events"][0]["code"], "duplicate_deal")
        self.assertEqual(self.rd.requests[("POST", "/deals")], 0)

    async def test_legacy_task_full_id_is_recovered_after_unknown_response(self):
        await self.configure()
        alert = (await analyze(self.systems, request()))["alert"]
        self.rd.timeout_task = True
        await self.crm.process_once()
        task = next(iter(self.rd.tasks.values()))
        task["name"] = f"Priorizar atendimento — {alert['id']}"
        task["description"] = "Descrição legada"
        self.crm.retry(self.crm.status()["events"][0]["id"])
        await self.crm.process_once()
        self.assertEqual(len(self.rd.tasks), 1)
        self.assertIn("### 🎯 Motivo da atenção", task["description"])
        self.assertEqual(self.crm.status()["events"][0]["status"], "synced")

    async def test_short_task_name_is_not_used_as_unique_identifier(self):
        await self.configure()
        alert = (await analyze(self.systems, request()))["alert"]
        self.rd.timeout_note = True
        await self.crm.process_once()
        deal_id = next(iter(self.rd.deals))
        self.rd.tasks["b" * 24] = {"id": "b" * 24, "deal_id": deal_id, "name": task_name({"store": STORE, "alert_id": alert["id"]}), "description": "Outra ocorrência"}
        self.crm.retry(self.crm.status()["events"][0]["id"])
        await self.crm.process_once()
        self.assertEqual(len(self.rd.tasks), 2)
        self.assertEqual(self.rd.tasks["b" * 24]["description"], "Outra ocorrência")

    async def test_invalid_format_blocks_before_creating_remote_records(self):
        await self.configure(); self.order_event()
        with patch.dict(os.environ, {"RD_CRM_TEXT_FORMAT": "unsupported"}): await self.crm.process_once()
        self.assertEqual(self.crm.status()["events"][0]["code"], "invalid_format")
        self.assertEqual(len(self.rd.contacts), 0)
        self.assertEqual(len(self.rd.deals), 0)
