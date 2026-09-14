import json
import os
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import AsyncMock, patch

import httpx
from pydantic import ValidationError

from crm import CrmIntegration, CustomerInput, MappingInput
from flow import ReceptionFlow
from models import ChatRequest, ChatReply, Decision, DeliveryAddress, OrderPreferences, PendingAction, Routing, ServiceAction
from systems import CATALOG, DemoSystems, SystemRuleError
from tests.test_crm import FakeRD, ENV, STORE, PIPELINE, STAGE, OWNER, NOW

ADDRESS = {"street": "Rua de Teste", "number": "123", "district": "Pinheiros", "complement": "Apto 2"}


def incoming(text="Quero pedir o Combo Bacon", preferences=None, store=STORE, confirmation_id=None, message_id="m1"):
    return ChatRequest.model_validate({"requestId": message_id, "confirmationId": confirmation_id, "conversation": {
        "id": "conversation", "name": "Cliente Teste", "store": store, "status": "ai", "orderPreferences": preferences,
        "messages": [{"id": message_id, "author": "customer", "text": text}]}})


class OrderingTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.systems = DemoSystems(Path(directory.name) / "orders.sqlite", clock=lambda: NOW)

    def seed(self, preferences, order=None):
        self.systems.save_reply(incoming("seed", preferences, message_id="seed"), ChatReply(text="Resumo", topic="Pedido",
            routing=Routing(agent="orders", reason="Teste", summary="Teste"), orderPreferences=preferences,
            order=order, pendingAction=PendingAction(kind="order", id=order.id) if order else None))

    def test_seven_products_have_stock_and_valid_service_ids(self):
        self.assertEqual(len(CATALOG["products"]), 7)
        for product in CATALOG["products"]:
            ServiceAction(action="draft_order", productId=product["id"])
            order = self.systems.quote_order(product["id"], STORE, product["id"], 1)
            self.assertEqual(order.price, product["price"])
            self.assertFalse(order.confirmed)

    def test_delivery_fee_comes_from_store_and_is_not_multiplied_by_quantity(self):
        preferences = OrderPreferences.model_validate({"storeSelected": True, "fulfillment": "delivery", "address": ADDRESS, "deliveryFee": 0})
        for store in CATALOG["stores"]:
            order = self.systems.quote_order("conversation", store["name"], "brownie", 2, preferences)
            self.assertEqual(order.subtotal, 25.8)
            self.assertEqual(order.deliveryFee, store["deliveryFee"])
            self.assertEqual(order.price, round(25.8 + store["deliveryFee"], 2))
            self.assertEqual(order.address.street, ADDRESS["street"])

    def test_pickup_has_zero_fee_and_no_delivery_address(self):
        preferences = OrderPreferences(storeSelected=True, fulfillment="pickup", address=DeliveryAddress(**ADDRESS))
        order = self.systems.quote_order("conversation", STORE, "bacon", 1, preferences)
        self.assertEqual((order.price, order.subtotal, order.deliveryFee), (39.9, 39.9, 0))
        self.assertIsNone(order.address)

    def test_incomplete_preferences_never_create_order(self):
        for data in ({"storeSelected": False}, {"storeSelected": True}, {"storeSelected": True, "fulfillment": "delivery"}):
            with self.assertRaises(SystemRuleError):
                self.systems.quote_order("conversation", STORE, "bacon", 1, OrderPreferences(**data))
        with self.assertRaises(ValidationError): DeliveryAddress(street=" ", number="", district="x")
        with self.systems.connection() as db: self.assertEqual(db.execute("SELECT COUNT(*) FROM orders").fetchone()[0], 0)

    async def test_flow_asks_cards_before_quoting_and_stores_preferences(self):
        preferences = OrderPreferences(storeSelected=False)
        runner = AsyncMock(side_effect=[Decision(intent="orders", confidence=1), ServiceAction(action="draft_order", productId="bacon")])
        reply = await ReceptionFlow(incoming(preferences=preferences), runner, self.systems).kickoff_async()
        self.assertEqual(reply.kind, "order_setup")
        self.assertIsNone(reply.order)
        self.assertFalse(reply.orderPreferences.storeSelected)
        selected = OrderPreferences(storeSelected=True, fulfillment="pickup")
        request = incoming(preferences=selected, store="São Paulo · Moema", message_id="m2")
        runner = AsyncMock(side_effect=[Decision(intent="orders", confidence=1), ServiceAction(action="draft_order", productId="bacon")])
        result = await ReceptionFlow(request, runner, self.systems).kickoff_async()
        self.assertEqual(result.order.price, 39.9)
        self.assertIn("Moema", result.text)
        with self.assertRaises(SystemRuleError): self.systems.hydrate(incoming(preferences=selected, store=STORE, message_id="m3"))

    async def test_changing_receiving_invalidates_old_confirmation(self):
        pickup = OrderPreferences(storeSelected=True, fulfillment="pickup")
        old = self.systems.quote_order("conversation", STORE, "bacon", 1, pickup)
        self.seed(pickup, old)
        delivery = OrderPreferences(storeSelected=True, fulfillment="delivery", address=DeliveryAddress(**ADDRESS))
        response = await ReceptionFlow(incoming("Confirmar pedido", delivery, confirmation_id=old.id), AsyncMock(), self.systems).kickoff_async()
        self.assertIsNone(response.pendingAction)
        self.assertIsNone(response.order)
        with self.systems.connection() as db:
            self.assertEqual(db.execute("SELECT status FROM orders WHERE id=?", (old.id,)).fetchone()[0], "draft")

    async def test_delivery_confirmation_persists_snapshot_outbox_and_total(self):
        preferences = OrderPreferences(storeSelected=True, fulfillment="delivery", address=DeliveryAddress(**ADDRESS))
        runner = AsyncMock(side_effect=[Decision(intent="orders", confidence=1), ServiceAction(action="draft_order", productId="milkshake")])
        draft = await ReceptionFlow(incoming("Quero pedir o Milkshake de Chocolate", preferences), runner, self.systems).kickoff_async()
        self.assertAlmostEqual(draft.order.price, 25.8)
        self.assertIn("Frete fictício: R$ 6,90", draft.text)
        confirmation = incoming("Confirmar pedido", preferences, confirmation_id=draft.order.id, message_id="m2")
        result = await ReceptionFlow(confirmation, AsyncMock(), self.systems).kickoff_async()
        self.assertTrue(result.order.confirmed)
        self.assertEqual(result.order.address.number, "123")
        self.assertIn("Pagamento na entrega", result.text)
        second = self.systems.confirm_order("conversation", result.order.id)
        self.assertEqual(second.price, result.order.price)
        with self.systems.connection() as db:
            rows = db.execute("SELECT payload FROM crm_events").fetchall()
            self.assertEqual(len(rows), 1)
            payload = json.loads(rows[0][0])
            self.assertEqual(payload["delivery_fee"], 6.9)
            self.assertEqual(payload["address"]["street"], ADDRESS["street"])

    async def test_crm_receives_total_including_fee_and_delivery_details(self):
        rd = FakeRD()
        crm = CrmIntegration(self.systems, transport=httpx.MockTransport(rd), interval=0)
        with patch.dict(os.environ, ENV):
            crm.save_tokens({"access_token": "access-1", "refresh_token": "refresh-1", "expires_in": 7200})
            await crm.save_mapping(MappingInput(store=STORE, pipelineId=PIPELINE, stageId=STAGE, ownerId=OWNER))
            crm.save_customer(CustomerInput(conversationId="conversation", name="Cliente Teste", phone="11999990000"))
            draft = self.systems.quote_order("conversation", STORE, "brownie", 2, OrderPreferences(storeSelected=True, fulfillment="delivery", address=DeliveryAddress(**ADDRESS)))
            self.systems.confirm_order("conversation", draft.id)
            await crm.process_once()
        self.assertEqual(next(iter(rd.deals.values()))["one_time_price"], 32.7)
        note = next(iter(rd.notes.values()))[0]["description"]
        self.assertIn("**Modalidade:** Entrega", note)
        self.assertIn("**Frete fictício:** R$ 6,90", note)
        self.assertIn("Rua de Teste, 123", note)

    def test_old_database_migration_preserves_order_values(self):
        path = self.systems.path.parent / "legacy.sqlite"
        with closing(sqlite3.connect(path)) as db, db:
            db.execute("CREATE TABLE orders (id TEXT PRIMARY KEY, conversation_id TEXT, store TEXT, product TEXT, quantity INTEGER, total REAL, status TEXT, expires TEXT)")
            db.execute("INSERT INTO orders VALUES ('SE-OLD','conversation',?,'classic',1,35.9,'confirmed','2030-01-01T12:00:00-03:00')", (STORE,))
        migrated = DemoSystems(path, clock=lambda: NOW)
        order = migrated.confirm_order("conversation", "SE-OLD")
        self.assertEqual(order.price, 35.9)
        self.assertEqual(order.deliveryFee, 0)
        self.assertEqual(order.fulfillment, "pickup")
        self.assertEqual(order.subtotal, 35.9)
