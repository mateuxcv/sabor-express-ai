"""Sistemas fictícios persistentes: agenda, estoque, pedidos e contexto por conversa."""
import hashlib
import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime, timedelta
from decimal import Decimal
from functools import lru_cache
from pathlib import Path
from uuid import uuid4

from language import now_local
from models import Booking, ChatReply, ChatRequest, Order, PendingAction, OrderPreferences
from ordering import needs_setup
from crm_storage import initialize_crm, enqueue_booking, enqueue_order, enqueue_event

CATALOG = json.loads((Path(__file__).resolve().parents[2] / "src/lib/catalog.json").read_text(encoding="utf-8"))


class SystemRuleError(ValueError):
    def __init__(self, code: str, message: str):
        self.code = code
        super().__init__(message)


class DemoSystems:
    def __init__(self, path=None, clock=now_local):
        self.path = Path(path or os.getenv("CONCIERGE_DB_PATH") or Path(__file__).parent / ".data/sabor.sqlite3")
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.clock = clock
        with self.connection() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, state TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS replies (conversation_id TEXT, request_id TEXT, fingerprint TEXT NOT NULL,
                    reply TEXT NOT NULL, PRIMARY KEY(conversation_id, request_id));
                CREATE TABLE IF NOT EXISTS inventory (store TEXT, product TEXT, available INTEGER NOT NULL,
                    PRIMARY KEY(store, product));
                CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, store TEXT NOT NULL,
                    product TEXT NOT NULL, quantity INTEGER NOT NULL, total REAL NOT NULL, status TEXT NOT NULL, expires TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS bookings (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, store TEXT NOT NULL,
                    day TEXT NOT NULL, start INTEGER NOT NULL, guests INTEGER NOT NULL, kind TEXT NOT NULL,
                    status TEXT NOT NULL, expires TEXT NOT NULL);
            """)
            initialize_crm(db)
            columns = {row[1] for row in db.execute("PRAGMA table_info(orders)")}
            for name, definition in (("subtotal", "REAL"), ("delivery_fee", "REAL NOT NULL DEFAULT 0"),
                                     ("fulfillment", "TEXT NOT NULL DEFAULT 'pickup'"), ("address", "TEXT")):
                if name not in columns: db.execute(f"ALTER TABLE orders ADD COLUMN {name} {definition}")
            for store in CATALOG["stores"]:
                for product, stock in CATALOG["inventory"].items():
                    db.execute("INSERT OR IGNORE INTO inventory VALUES (?, ?, ?)", (store["name"], product, stock))

    @contextmanager
    def connection(self):
        db = sqlite3.connect(self.path, timeout=5)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def fingerprint(self, request: ChatRequest):
        # O contexto do browser não autoriza operações. Deduplicar a mensagem e seu token de confirmação.
        values = [request.conversation.store, request.conversation.messages[-1].text, request.confirmationId]
        if request.conversation.orderPreferences is not None:
            values.append(request.conversation.orderPreferences.model_dump())
        return hashlib.sha256(json.dumps(values, ensure_ascii=False).encode()).hexdigest()

    def cached_reply(self, request: ChatRequest):
        with self.connection() as db:
            row = db.execute("SELECT * FROM replies WHERE conversation_id=? AND request_id=?", (request.conversation.id, request.requestId)).fetchone()
        if not row:
            return None
        if row["fingerprint"] != self.fingerprint(request):
            raise SystemRuleError("reused_message", "Esta mensagem já foi processada com outro conteúdo. Envie uma nova mensagem.")
        return ChatReply.model_validate_json(row["reply"])

    def hydrate(self, request: ChatRequest) -> ChatRequest:
        with self.connection() as db:
            if request.conversation.customerId:
                db.execute("""INSERT OR IGNORE INTO crm_conversation_customers (conversation_id, customer_id)
                    SELECT ?, id FROM crm_customers WHERE id=?""", (request.conversation.id, request.conversation.customerId))
            row = db.execute("SELECT state FROM sessions WHERE id=?", (request.conversation.id,)).fetchone()
        state = json.loads(row["state"]) if row else {}
        if state and state["store"] != request.conversation.store:
            # A unidade inicial é apenas provisória até o cliente escolher um card.
            unselected = (state.get("orderPreferences") or {}).get("storeSelected") is False
            if not unselected or state.get("order") or state.get("booking"):
                raise SystemRuleError("store_mismatch", "Abra uma nova conversa para atender por outra unidade.")
        preferences = request.conversation.orderPreferences
        if preferences is None and state.get("orderPreferences"):
            preferences = OrderPreferences.model_validate(state["orderPreferences"])
        values = {
            "order": Order.model_validate(state["order"]) if state.get("order") else None,
            "booking": Booking.model_validate(state["booking"]) if state.get("booking") else None,
            "pendingAction": PendingAction.model_validate(state["pendingAction"]) if state.get("pendingAction") else None,
            "clarificationCount": state.get("clarificationCount", 0),
            "orderPreferences": preferences,
        }
        old_preferences = state.get("orderPreferences")
        if values["order"] and not values["order"].confirmed and preferences is not None and old_preferences != preferences.model_dump():
            values["order"] = None
            if values["pendingAction"] and values["pendingAction"].kind == "order": values["pendingAction"] = None
        return request.model_copy(update={"conversation": request.conversation.model_copy(update=values)})

    def save_reply(self, original: ChatRequest, reply: ChatReply):
        data = {"store": original.conversation.store, "order": reply.order.model_dump() if reply.order else None,
                "booking": reply.booking.model_dump() if reply.booking else None,
                "pendingAction": reply.pendingAction.model_dump() if reply.pendingAction else None,
                "clarificationCount": reply.clarificationCount,
                "orderPreferences": reply.orderPreferences.model_dump() if reply.orderPreferences else None}
        with self.connection() as db:
            db.execute("INSERT INTO sessions VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET state=excluded.state", (original.conversation.id, json.dumps(data)))
            db.execute("INSERT OR IGNORE INTO replies VALUES (?, ?, ?, ?)", (original.conversation.id, original.requestId, self.fingerprint(original), reply.model_dump_json()))

    def product(self, product_id):
        product = next((p for p in CATALOG["products"] if p["id"] == product_id), None)
        if not product:
            raise SystemRuleError("unknown_product", "Esse item não está no nosso cardápio. Quer ver os combos disponíveis?")
        return product

    def quote_order(self, conversation_id: str, store: str, product_id: str, quantity: int, preferences: OrderPreferences | None = None):
        if not 1 <= quantity <= 10:
            raise SystemRuleError("quantity", "Posso montar de 1 a 10 unidades do mesmo item por pedido. Quantos você quer?")
        if needs_setup(preferences):
            raise SystemRuleError("order_setup", "Escolha a unidade e entrega ou retirada nos cards. Para entrega, informe também o endereço.")
        unit = next((item for item in CATALOG["stores"] if item["name"] == store), None)
        if not unit: raise SystemRuleError("store", "Unidade inválida.")
        product = self.product(product_id)
        fulfillment = preferences.fulfillment if preferences else "pickup"
        address = preferences.address if preferences and fulfillment == "delivery" else None
        subtotal = Decimal(str(product["price"])) * quantity
        fee = Decimal(str(unit["deliveryFee"])) if fulfillment == "delivery" else Decimal("0")
        total = float(subtotal + fee)
        order_id = "SE-" + uuid4().hex[:8].upper()
        with self.connection() as db:
            stock = db.execute("SELECT available FROM inventory WHERE store=? AND product=?", (store, product_id)).fetchone()
            if not stock or stock["available"] < quantity:
                raise SystemRuleError("stock", "Essa quantidade não está disponível no estoque simulado. Quer escolher outro combo ou uma quantidade menor?")
            db.execute("""INSERT INTO orders (id,conversation_id,store,product,quantity,total,status,expires,subtotal,delivery_fee,fulfillment,address)
                VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)""", (order_id, conversation_id, store, product_id, quantity, total,
                (self.clock() + timedelta(minutes=15)).isoformat(), float(subtotal), float(fee), fulfillment, address.model_dump_json() if address else None))
        return Order(id=order_id, product=product["name"], price=total, quantity=quantity, confirmed=False, status="Aguardando confirmação",
                     subtotal=float(subtotal), deliveryFee=float(fee), fulfillment=fulfillment, address=address)

    def confirm_order(self, conversation_id: str, order_id: str):
        with self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            order = db.execute("SELECT * FROM orders WHERE id=? AND conversation_id=?", (order_id, conversation_id)).fetchone()
            if not order:
                raise SystemRuleError("unknown_order", "Não encontrei um pedido desta conversa para confirmar.")
            if order["status"] != "confirmed":
                if datetime.fromisoformat(order["expires"]) <= self.clock():
                    raise SystemRuleError("expired", "Esse resumo expirou. Escolha o combo novamente para eu conferir preço e estoque.")
                changed = db.execute("UPDATE inventory SET available=available-? WHERE store=? AND product=? AND available>=?", (order["quantity"], order["store"], order["product"], order["quantity"]))
                if changed.rowcount != 1:
                    raise SystemRuleError("stock", "O estoque mudou desde o resumo. Não confirmei o pedido. Quer escolher outra opção?")
                db.execute("UPDATE orders SET status='confirmed' WHERE id=?", (order_id,))
                enqueue_order(db, order, self.product(order["product"])["name"])
            return Order(id=order_id, product=self.product(order["product"])["name"], price=order["total"], quantity=order["quantity"], confirmed=True, status="Em preparo",
                         subtotal=order["subtotal"] if order["subtotal"] is not None else order["total"], deliveryFee=order["delivery_fee"],
                         fulfillment=order["fulfillment"], address=json.loads(order["address"]) if order["address"] else None)

    def validate_slot(self, booking: Booking):
        rules = CATALOG["reservations"]
        try:
            day = date.fromisoformat(booking.date)
            hour, minute = map(int, booking.time.split(":"))
            scheduled = datetime(day.year, day.month, day.day, hour, minute, tzinfo=self.clock().tzinfo)
        except (ValueError, TypeError, AttributeError):
            raise SystemRuleError("date_time", "Preciso de uma data e horário válidos para consultar a agenda.")
        if scheduled < self.clock() + timedelta(minutes=rules["leadMinutes"]):
            raise SystemRuleError("past_date", "Escolha um horário futuro, com pelo menos uma hora de antecedência.")
        if day > self.clock().date() + timedelta(days=rules["horizonDays"]):
            raise SystemRuleError("horizon", "A agenda simulada aceita reservas para os próximos 60 dias. Qual data nesse período funciona?")
        if not rules["firstHour"] <= hour <= rules["lastHour"] or minute not in (0, 30) or (hour == rules["lastHour"] and minute != 0):
            raise SystemRuleError("hours", "As reservas começam entre 11h e 21h, de meia em meia hora. Qual horário você prefere?")
        if not booking.guests or booking.guests > rules["maxPartySize"]:
            raise SystemRuleError("party_size", "Grupos acima de 20 pessoas precisam de atendimento da equipe para organizar o espaço.")
        return day, hour * 60 + minute

    def available(self, store: str, booking: Booking, db=None):
        day, start = self.validate_slot(booking)
        duration = CATALOG["reservations"]["durationMinutes"]
        if db is None:
            with self.connection() as connection:
                return self.available(store, booking, connection)
        rows = db.execute("SELECT start, guests FROM bookings WHERE store=? AND day=? AND status='confirmed'", (store, day.isoformat())).fetchall()
        occupied = sum(row["guests"] for row in rows if start < row["start"] + duration and row["start"] < start + duration)
        for baseline in CATALOG["reservations"]["baselineBookings"]:
            h, m = map(int, baseline["time"].split(":"))
            base_start = h * 60 + m
            if day.weekday() == baseline["weekday"] and start < base_start + duration and base_start < start + duration:
                occupied += baseline["guests"]
        return occupied + booking.guests <= CATALOG["reservations"]["capacity"]

    def alternatives(self, store: str, booking: Booking):
        target = sum(value * factor for value, factor in zip(map(int, booking.time.split(":")), (60, 1)))
        choices = []
        for start in sorted(range(11 * 60, 21 * 60 + 1, 30), key=lambda value: abs(value - target)):
            candidate = booking.model_copy(update={"time": f"{start // 60:02d}:{start % 60:02d}"})
            try:
                if self.available(store, candidate):
                    choices.append(candidate.time)
            except SystemRuleError:
                continue
            if len(choices) == 3:
                break
        return choices

    def quote_booking(self, conversation_id: str, store: str, booking: Booking):
        _, start = self.validate_slot(booking)
        if not self.available(store, booking):
            return booking.model_copy(update={"id": None, "stage": "unavailable", "suggestedTimes": self.alternatives(store, booking), "askedField": "time"})
        booking_id = "RS-" + uuid4().hex[:8].upper()
        with self.connection() as db:
            db.execute("INSERT INTO bookings VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?)", (booking_id, conversation_id, store, booking.date, start, booking.guests, booking.kind, (self.clock() + timedelta(minutes=15)).isoformat()))
        return booking.model_copy(update={"id": booking_id, "stage": "awaiting_confirmation", "suggestedTimes": [], "askedField": None})

    def confirm_booking(self, conversation_id: str, booking_id: str):
        with self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM bookings WHERE id=? AND conversation_id=?", (booking_id, conversation_id)).fetchone()
            if not row:
                raise SystemRuleError("unknown_booking", "Não encontrei uma reserva desta conversa para confirmar.")
            booking = Booking(id=row["id"], kind=row["kind"], date=row["day"], time=f"{row['start'] // 60:02d}:{row['start'] % 60:02d}", guests=row["guests"], stage="confirmed")
            if row["status"] != "confirmed":
                if datetime.fromisoformat(row["expires"]) <= self.clock():
                    raise SystemRuleError("expired", "Esse resumo expirou. Informe o horário novamente para eu atualizar a disponibilidade.")
                if not self.available(row["store"], booking, db):
                    raise SystemRuleError("capacity", "A disponibilidade mudou desde a consulta. Não confirmei a reserva. Me diga outro horário para conferir.")
                db.execute("UPDATE bookings SET status='confirmed' WHERE id=?", (booking_id,))
                enqueue_booking(db, row)
            return booking

    def record_call_summary(self, call_id: str, conversation_id: str, summary: str):
        with self.connection() as db:
            db.execute("INSERT OR IGNORE INTO crm_call_summaries VALUES (?, ?, ?, ?)", (call_id, conversation_id, summary[:4000], self.clock().timestamp()))
            enqueue_event(db, "call.completed", call_id, conversation_id, {"call_id": call_id, "summary": summary[:4000]})


@lru_cache(maxsize=1)
def get_systems():
    return DemoSystems()
