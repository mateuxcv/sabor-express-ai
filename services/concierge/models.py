from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

AgentId = Literal["reception", "orders", "reservations", "birthdays", "information", "human"]


class Message(BaseModel):
    id: str = Field(max_length=120)
    author: Literal["customer", "ai", "agent"]
    text: str = Field(min_length=1, max_length=4000)


class Booking(BaseModel):
    kind: Literal["reservation", "birthday"]
    date: str | None = Field(default=None, max_length=30)
    time: str | None = Field(default=None, max_length=20)
    guests: int | None = Field(default=None, ge=1, le=500)
    stage: Literal["collecting", "awaiting_confirmation", "confirmed", "unavailable", "cancelled", "pending_human"] = "collecting"
    attempts: int = Field(default=0, ge=0, le=20)
    id: str | None = Field(default=None, max_length=120)
    askedField: Literal["date", "time", "guests"] | None = None
    suggestedTimes: list[str] = Field(default_factory=list, max_length=3)


class DeliveryAddress(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    street: str = Field(min_length=3, max_length=120)
    number: str = Field(min_length=1, max_length=20)
    district: str = Field(min_length=2, max_length=80)
    complement: str = Field(default="", max_length=100)


class OrderPreferences(BaseModel):
    storeSelected: bool
    fulfillment: Literal["pickup", "delivery"] | None = None
    address: DeliveryAddress | None = None


class Order(BaseModel):
    id: str = Field(max_length=120)
    product: str = Field(max_length=100)
    price: float = Field(ge=0, le=10000)
    confirmed: bool
    status: str = Field(max_length=100)
    quantity: int = Field(default=1, ge=1, le=10)
    subtotal: float | None = Field(default=None, ge=0)
    deliveryFee: float = Field(default=0, ge=0)
    fulfillment: Literal["pickup", "delivery"] = "pickup"
    address: DeliveryAddress | None = None


class PendingAction(BaseModel):
    kind: Literal["order", "booking"]
    id: str = Field(min_length=1, max_length=120)


class Routing(BaseModel):
    agent: AgentId
    source: Literal["demo", "crewai", "fallback"] = "crewai"
    reason: str = Field(max_length=300)
    summary: str = Field(max_length=800)
    missingFields: list[str] = Field(default_factory=list, max_length=5)
    checks: list[str] = Field(default_factory=list, max_length=8)


class Conversation(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=100)
    store: str = Field(min_length=1, max_length=100)
    status: Literal["ai", "waiting", "human", "resolved"]
    messages: list[Message] = Field(min_length=1, max_length=30)
    order: Order | None = None
    booking: Booking | None = None
    clarificationCount: int = Field(default=0, ge=0, le=5)
    pendingAction: PendingAction | None = None
    customerId: str | None = Field(default=None, max_length=120)
    orderPreferences: OrderPreferences | None = None


class ChatRequest(BaseModel):
    requestId: str = Field(min_length=1, max_length=120)
    conversation: Conversation
    confirmationId: str | None = Field(default=None, max_length=120)


class ChatReply(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    status: Literal["ai", "waiting"] = "ai"
    topic: str = Field(max_length=100)
    kind: Literal["menu", "order", "order_setup"] | None = None
    order: Order | None = None
    booking: Booking | None = None
    clarificationCount: int = 0
    routing: Routing
    pendingAction: PendingAction | None = None
    orderPreferences: OrderPreferences | None = None


class Decision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    intent: AgentId
    confidence: float = Field(ge=0, le=1, description="Sinal heurístico, não probabilidade calibrada.")
    greeting: bool = False


class BookingExtraction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    date: str | None = Field(description="Trecho literal da ÚLTIMA mensagem: amanhã, sábado ou 24/10. Null se ausente.")
    time: str | None = Field(description="Trecho literal do horário na ÚLTIMA mensagem: sete da noite, 19h, 19:30. Null se ausente.")
    guests: str | None = Field(description="Trecho literal da quantidade na ÚLTIMA mensagem: quinze pessoas, somos 8, ou 15 ao responder a quantidade. Null se ausente.")


class ServiceAction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: Literal["menu", "draft_order", "order_status", "hours", "parking", "thanks", "unknown"]
    productId: Literal["classic", "chicken", "veggie", "bacon", "fries", "milkshake", "brownie"] | None
    quantity: str | None = Field(default=None, description="Trecho literal da quantidade solicitada, como dois ou 2. Null para uma unidade.")
