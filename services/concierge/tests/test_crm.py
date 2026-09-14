import asyncio
import json
import os
import tempfile
import time
import unittest
from collections import Counter
from datetime import datetime
from pathlib import Path
from unittest.mock import patch
from urllib.parse import parse_qs
from zoneinfo import ZoneInfo

import httpx

from crm import CrmError, CrmIntegration, CustomerInput, MappingInput
from models import Booking, ChatRequest
from systems import DemoSystems

STORE = "São Paulo · Pinheiros"
PIPELINE = "1" * 24
STAGE = "2" * 24
OWNER = "3" * 24
CONTACT = "4" * 24
NOW = datetime(2026, 9, 13, 10, tzinfo=ZoneInfo("America/Sao_Paulo"))
ENV = {"RD_CRM_CLIENT_ID": "test-client", "RD_CRM_CLIENT_SECRET": "private-test-secret", "RD_CRM_REDIRECT_URI": "http://localhost:3000/api/crm/callback", "RD_CRM_TEXT_FORMAT": "markdown"}


class FakeRD:
    def __init__(self):
        self.contacts = {}
        self.deals = {}
        self.notes = {}
        self.requests = Counter()
        self.refreshes = 0
        self.timeout_deal = False
        self.timeout_note = False
        self.rate_limit = False
        self.access = "access-1"

    async def __call__(self, request):
        path = request.url.path.removeprefix("/crm/v2")
        method = request.method
        self.requests[(method, path)] += 1
        if path == "/oauth2/token":
            form = parse_qs(request.content.decode())
            assert form["client_secret"] == ["private-test-secret"]
            assert "application/x-www-form-urlencoded" in request.headers["content-type"]
            if form["grant_type"] == ["refresh_token"]:
                self.refreshes += 1
                await asyncio.sleep(0.01)
                self.access = f"access-{self.refreshes + 1}"
            return httpx.Response(200, json={"access_token": self.access, "refresh_token": f"refresh-{self.refreshes + 1}", "expires_in": 7200})
        assert request.headers.get("authorization") == f"Bearer {self.access}"
        if self.rate_limit:
            return httpx.Response(429, json={"errors": []}, headers={"Retry-After": "7"})
        body = json.loads(request.content)["data"] if request.content else None
        if path == "/pipelines": return httpx.Response(200, json={"data": [{"id": PIPELINE, "name": "Reservas e eventos"}]})
        if path == "/users": return httpx.Response(200, json={"data": [{"id": OWNER, "name": "Ana"}]})
        if path == f"/pipelines/{PIPELINE}/stages": return httpx.Response(200, json={"data": [{"id": STAGE, "name": "Reserva confirmada"}, {"id": "6" * 24, "name": "Pós-atendimento"}]})
        if path == "/contacts":
            if method == "GET":
                field, raw = request.url.params["filter"].split(":", 1)
                value = json.loads(raw)
                data = [c for c in self.contacts.values() if any(item.get(field) == value for item in c.get("phones" if field == "phone" else "emails", []))]
                return httpx.Response(200, json={"data": data})
            contact_id = str(4 + len(self.contacts)) * 24
            self.contacts[contact_id] = {"id": contact_id, **body}
            return httpx.Response(201, json={"data": self.contacts[contact_id]})
        if path.startswith("/contacts/"):
            contact = self.contacts.get(path.split("/")[-1])
            return httpx.Response(200 if contact else 404, json={"data": contact} if contact else {"errors": []})
        if path == "/deals":
            if method == "GET":
                name = json.loads(request.url.params["filter"].split(":", 1)[1])
                return httpx.Response(200, json={"data": [deal for deal in self.deals.values() if deal["name"] == name]})
            assert body["status"] == "ongoing"
            assert "total_price" not in body
            if not body["name"].startswith(("Pedido ", "🍔 Pedido")): assert "one_time_price" not in body
            assert body["stage_id"] == ("6" * 24 if body["name"].startswith(("Atendimento ", "⭐ CSAT")) else STAGE) and body["owner_id"] == OWNER
            deal_id = f"{len(self.deals) + 1:024x}"
            self.deals[deal_id] = {"id": deal_id, **body}
            if self.timeout_deal:
                self.timeout_deal = False
                raise httpx.ReadTimeout("accepted_without_response", request=request)
            return httpx.Response(201, json={"data": self.deals[deal_id]})
        if path.startswith("/deals/") and path.endswith("/notes"):
            deal_id = path.split("/")[2]
            notes = self.notes.setdefault(deal_id, [])
            if method == "GET": return httpx.Response(200, json={"data": notes})
            note = {"id": f"{len(notes) + 100:024x}", **body}
            notes.append(note)
            if self.timeout_note:
                self.timeout_note = False
                raise httpx.ReadTimeout("accepted_without_response", request=request)
            return httpx.Response(201, json={"data": note})
        if path.startswith("/deals/"):
            deal = self.deals.get(path.split("/")[-1])
            return httpx.Response(200 if deal else 404, json={"data": deal} if deal else {"errors": []})
        raise AssertionError(f"Unexpected RD request {method} {path}")


class CrmTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.systems = DemoSystems(Path(directory.name) / "crm.sqlite", clock=lambda: NOW)
        self.rd = FakeRD()
        self.crm = CrmIntegration(self.systems, transport=httpx.MockTransport(self.rd), interval=0)
        env = patch.dict(os.environ, ENV)
        env.start(); self.addCleanup(env.stop)

    async def configure(self, profile=True):
        self.crm.save_tokens({"access_token": "access-1", "refresh_token": "refresh-1", "expires_in": 7200})
        await self.crm.save_mapping(MappingInput(store=STORE, pipelineId=PIPELINE, stageId=STAGE, ownerId=OWNER))
        if profile:
            return self.crm.save_customer(CustomerInput(conversationId="conversation", name="Mariana Costa", phone="(11) 99999-0000", email="mariana@example.com"))

    def booking(self, conversation_id="conversation"):
        draft = self.systems.quote_booking(conversation_id, STORE, Booking(kind="birthday", date="2026-09-14", time="19:00", guests=4))
        return self.systems.confirm_booking(conversation_id, draft.id)

    def order(self, conversation_id="conversation"):
        draft = self.systems.quote_order(conversation_id, STORE, "classic", 2)
        return self.systems.confirm_order(conversation_id, draft.id)

    async def test_order_commits_once_offline_and_syncs_catalog_total(self):
        order = self.order()
        self.systems.confirm_order("conversation", order.id)
        self.assertEqual(len(self.crm.status()["events"]), 1)
        self.assertFalse(await self.crm.process_once())
        await self.configure()
        await self.crm.process_once()
        event = self.crm.status()["events"][0]
        self.assertEqual(event["type"], "order.confirmed")
        self.assertEqual(event["status"], "synced")
        deal = self.rd.deals[event["dealId"]]
        self.assertEqual(deal["one_time_price"], 71.8)
        self.assertEqual(deal["contact_ids"], [CONTACT])
        self.assertIn(order.id, deal["name"])
        self.assertIn("**Quantidade:** 2", self.rd.notes[event["dealId"]][0]["description"])
        self.assertIn("não houve cobrança real", self.rd.notes[event["dealId"]][0]["description"])
        self.assertFalse(await self.crm.process_once())

    def test_outbox_failure_rolls_back_order_and_stock(self):
        draft = self.systems.quote_order("conversation", STORE, "classic", 2)
        with self.systems.connection() as db:
            before = db.execute("SELECT available FROM inventory WHERE store=? AND product='classic'", (STORE,)).fetchone()[0]
        with patch("systems.enqueue_order", side_effect=RuntimeError("database_failure")), self.assertRaises(RuntimeError):
            self.systems.confirm_order("conversation", draft.id)
        with self.systems.connection() as db:
            self.assertEqual(db.execute("SELECT status FROM orders WHERE id=?", (draft.id,)).fetchone()[0], "draft")
            self.assertEqual(db.execute("SELECT available FROM inventory WHERE store=? AND product='classic'", (STORE,)).fetchone()[0], before)
            self.assertEqual(db.execute("SELECT count(*) FROM crm_events").fetchone()[0], 0)

    async def test_order_and_booking_share_contact_but_have_distinct_deals(self):
        await self.configure()
        self.order(); self.booking()
        await self.crm.process_once(); await self.crm.process_once()
        self.assertEqual(len(self.rd.contacts), 1)
        self.assertEqual(len(self.rd.deals), 2)
        self.assertEqual(self.crm.enqueue_conversation("conversation"), {"queued": 2})
        self.assertEqual(len(self.crm.status()["events"]), 2)
        self.assertFalse(await self.crm.process_once())

    async def test_order_timeout_reconciles_and_call_waits_for_that_order(self):
        await self.configure()
        self.booking(); await self.crm.process_once()
        order = self.order()
        self.systems.record_call_summary("order-call", "conversation", "Pedido confirmado durante a ligação.")
        self.rd.timeout_deal = True
        await self.crm.process_once(); await self.crm.process_once()
        events = self.crm.status()["events"]
        order_event = next(e for e in events if e["reference"] == order.id)
        call_event = next(e for e in events if e["type"] == "call.completed")
        self.assertEqual(order_event["status"], "uncertain")
        self.assertEqual(call_event["code"], "awaiting_deal")
        self.crm.retry(order_event["id"])
        await self.crm.process_once(); await self.crm.process_once()
        events = self.crm.status()["events"]
        order_event = next(e for e in events if e["reference"] == order.id)
        call_event = next(e for e in events if e["type"] == "call.completed")
        self.assertEqual(call_event["dealId"], order_event["dealId"])
        self.assertTrue(all(e["status"] == "synced" for e in events))
        self.assertEqual(self.rd.requests[("POST", "/deals")], 2)

    def test_existing_booking_link_migrates_without_losing_mapping(self):
        with self.systems.connection() as db:
            db.execute("ALTER TABLE crm_deal_links RENAME COLUMN aggregate_id TO booking_id")
            db.execute("INSERT INTO crm_deal_links VALUES ('connection', 'RS-OLD', 'conversation', ?)", (CONTACT,))
        migrated = DemoSystems(self.systems.path, clock=lambda: NOW)
        with migrated.connection() as db:
            link = db.execute("SELECT * FROM crm_deal_links WHERE aggregate_id='RS-OLD'").fetchone()
            self.assertEqual(link["deal_id"], CONTACT)

    async def test_booking_and_outbox_commit_together_without_crm_connection(self):
        booking = self.booking()
        self.systems.confirm_booking("conversation", booking.id)
        status = self.crm.status()
        self.assertEqual(len(status["events"]), 1)
        self.assertEqual(status["events"][0]["status"], "pending")
        self.assertFalse(await self.crm.process_once())

    def test_outbox_error_rolls_back_booking_confirmation(self):
        draft = self.systems.quote_booking("conversation", STORE, Booking(kind="reservation", date="2026-09-14", time="18:00", guests=4))
        with patch("systems.enqueue_booking", side_effect=RuntimeError("database_failure")), self.assertRaises(RuntimeError):
            self.systems.confirm_booking("conversation", draft.id)
        with self.systems.connection() as db:
            self.assertEqual(db.execute("SELECT status FROM bookings WHERE id=?", (draft.id,)).fetchone()[0], "draft")

    async def test_reservation_creates_contact_deal_and_note_once(self):
        await self.configure()
        self.booking()
        self.assertTrue(await self.crm.process_once())
        self.assertFalse(await self.crm.process_once())
        event = self.crm.status()["events"][0]
        self.assertEqual(event["status"], "synced")
        self.assertEqual(len(self.rd.contacts), 1)
        self.assertEqual(len(self.rd.deals), 1)
        self.assertEqual(len(self.rd.notes[event["dealId"]]), 1)
        self.assertIn("não representa receita", self.rd.notes[event["dealId"]][0]["description"])
        self.assertEqual(next(iter(self.rd.contacts.values()))["phones"][0]["phone"], "+5511999990000")

    async def test_same_customer_in_new_conversation_reuses_contact(self):
        profile = await self.configure()
        self.booking(); await self.crm.process_once()
        req = ChatRequest(requestId="m", conversation={"id": "second", "name": "Mariana", "store": STORE, "status": "ai", "customerId": profile["id"], "messages": [{"id": "m", "author": "customer", "text": "Quero reservar"}]})
        self.systems.hydrate(req)
        self.booking("second"); await self.crm.process_once()
        self.assertEqual(len(self.rd.contacts), 1)
        self.assertEqual(len(self.rd.deals), 2)
        self.assertTrue(all(e["contactId"] for e in self.crm.status()["events"]))

    async def test_missing_profile_blocks_only_integration_then_resumes(self):
        await self.configure(profile=False)
        confirmed = self.booking(); await self.crm.process_once()
        self.assertEqual(confirmed.stage, "confirmed")
        self.assertEqual(self.crm.status()["events"][0]["code"], "missing_customer")
        self.crm.save_customer(CustomerInput(conversationId="conversation", name="Mariana", phone="11999990000"))
        await self.crm.process_once()
        self.assertEqual(self.crm.status()["events"][0]["status"], "synced")

    async def test_timeout_after_deal_creation_reconciles_without_duplicate(self):
        await self.configure(); self.booking(); self.rd.timeout_deal = True
        await self.crm.process_once()
        event = self.crm.status()["events"][0]
        self.assertEqual(event["status"], "uncertain")
        self.assertFalse(await self.crm.process_once())
        self.crm.retry(event["id"]); await self.crm.process_once()
        self.assertEqual(self.crm.status()["events"][0]["status"], "synced")
        self.assertEqual(self.rd.requests[("POST", "/deals")], 1)

    async def test_timeout_after_note_creation_reuses_marker(self):
        await self.configure(); self.booking(); self.rd.timeout_note = True
        await self.crm.process_once()
        event = self.crm.status()["events"][0]
        self.assertEqual(event["status"], "uncertain")
        self.crm.retry(event["id"]); await self.crm.process_once()
        self.assertEqual(sum(len(notes) for notes in self.rd.notes.values()), 1)
        self.assertEqual(self.crm.status()["events"][0]["status"], "synced")

    async def test_refresh_is_serialized_and_rotated_token_is_saved_encrypted(self):
        self.crm.save_tokens({"access_token": "access-1", "refresh_token": "refresh-1", "expires_in": 1})
        cid = self.crm.connection()["connection_id"]
        await asyncio.gather(self.crm.request("GET", "/pipelines", cid), self.crm.request("GET", "/users", cid))
        self.assertEqual(self.rd.refreshes, 1)
        self.assertEqual(self.crm.connection(decrypt=True)["credentials"]["refresh_token"], "refresh-2")
        stored = self.crm.connection()["tokens"]
        self.assertNotIn(b"access-2", stored)
        self.assertNotIn(b"refresh-2", stored)
        self.assertNotIn("access-2", json.dumps(self.crm.status()))

    async def test_rate_limit_schedules_retry_after(self):
        await self.configure(); self.booking(); self.rd.rate_limit = True
        before = time.time()
        await self.crm.process_once()
        event = self.crm.status()["events"][0]
        self.assertEqual(event["status"], "pending")
        self.assertEqual(event["code"], "rate_limit")
        with self.systems.connection() as db:
            self.assertGreaterEqual(db.execute("SELECT next_attempt FROM crm_events WHERE id=?", (event["id"],)).fetchone()[0], before + 7)
        self.assertFalse(await self.crm.process_once())

    async def test_call_summary_waits_for_deal_and_is_added_as_note(self):
        await self.configure(); self.booking()
        self.systems.record_call_summary("call-test", "conversation", "Ligação finalizada. Reserva confirmada para quatro pessoas.")
        await self.crm.process_once(); await self.crm.process_once()
        events = self.crm.status()["events"]
        self.assertTrue(all(event["status"] == "synced" for event in events))
        self.assertEqual(sum(len(notes) for notes in self.rd.notes.values()), 2)

    async def test_different_oauth_connection_does_not_silently_reuse_mapping(self):
        await self.configure(); self.booking()
        self.crm.save_tokens({"access_token": "access-1", "refresh_token": "refresh-new", "expires_in": 7200})
        await self.crm.process_once()
        self.assertEqual(self.crm.status()["events"][0]["code"], "connection_changed")
        self.assertEqual(len(self.rd.contacts), 0)

    async def test_retry_with_new_connection_clears_old_remote_ids(self):
        await self.configure(); self.booking(); self.rd.timeout_note = True
        await self.crm.process_once()
        event = self.crm.status()["events"][0]
        self.assertIsNotNone(event["dealId"])
        self.crm.save_tokens({"access_token": "access-1", "refresh_token": "refresh-new", "expires_in": 7200})
        self.crm.retry(event["id"])
        self.assertIsNone(self.crm.status()["events"][0]["dealId"])

    async def test_oauth_exchange_uses_crm_form_contract(self):
        result = await self.crm.exchange("authorization-code")
        self.assertTrue(result["connected"])
        self.assertTrue(self.crm.status()["connected"])
        self.assertNotIn("refresh-1", json.dumps(self.crm.status()))

    def test_customer_validation_and_phone_deduplication(self):
        first = self.crm.save_customer(CustomerInput(conversationId="a", name="Maria", phone="(11) 99999-0000"))
        second = self.crm.save_customer(CustomerInput(conversationId="b", name="Maria", phone="+5511999990000"))
        self.assertEqual(first["id"], second["id"])
        with self.assertRaises(ValueError): CustomerInput(conversationId="c", name="Nome", phone="phone:invalid or status:won")

    async def test_mapping_rejects_stage_outside_pipeline(self):
        self.crm.save_tokens({"access_token": "access-1", "refresh_token": "refresh-1", "expires_in": 7200})
        with self.assertRaises(CrmError): await self.crm.save_mapping(MappingInput(store=STORE, pipelineId=PIPELINE, stageId="9" * 24, ownerId=OWNER))
