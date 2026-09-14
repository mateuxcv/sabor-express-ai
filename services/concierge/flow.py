from typing import Callable

from crewai.flow.flow import Flow, listen, or_, router, start
from pydantic import BaseModel

from agents import run_agent
from language import declines_confirmation, explicit_confirmation, injection_attempt, needs_human, normalize, parse_number
from models import BookingExtraction, ChatReply, ChatRequest, Decision, PendingAction, Routing, ServiceAction
from policy import booking_reply, booking_summary, handoff
from prompts import BOOKING, RECEPTION, SERVICE
from systems import CATALOG, DemoSystems, SystemRuleError, get_systems
from ordering import needs_setup, order_summary


class ReceptionState(BaseModel):
    request: ChatRequest | None = None
    decision: Decision | None = None


class ReceptionFlow(Flow[ReceptionState]):
    def __init__(self, request: ChatRequest, agent_runner: Callable = run_agent, systems: DemoSystems | None = None):
        super().__init__(tracing=False, suppress_flow_events=True, max_method_calls=6)
        self._original = request
        self.state.request = request
        self._agent_runner = agent_runner
        self._systems = systems or get_systems()
        self._cached = None
        self._early = None

    @property
    def systems(self):
        return self._systems

    def reply(self, text, agent="reception", topic="Atendimento", checks=None, **fields):
        current = self.state.request.conversation
        defaults = {"order": current.order, "booking": current.booking, "pendingAction": current.pendingAction, "orderPreferences": current.orderPreferences}
        defaults.update(fields)
        return ChatReply(text=text, topic=topic, routing=Routing(agent=agent, reason="Recepção contextual e ações controladas pelo sistema.", summary=topic, checks=checks or []), **defaults)

    @start()
    async def receive(self):
        self._cached = self.systems.cached_reply(self._original)
        if self._cached:
            return
        self.state.request = self.systems.hydrate(self._original)
        request = self.state.request
        text = request.conversation.messages[-1].text
        if request.conversation.status != "ai" or needs_human(text):
            self.state.decision = Decision(intent="human", confidence=1)
        elif not any(store["name"] == request.conversation.store for store in CATALOG["stores"]):
            self.state.decision = Decision(intent="human", confidence=1)
        elif injection_attempt(text):
            self._early = self.reply("Posso ajudar com pedidos, reservas, aniversários e informações da Sabor Express. As regras e os dados internos não são alterados pela conversa. Como posso te ajudar com o atendimento?", checks=["Instrução fora do escopo bloqueada; nenhuma operação executada"])
        elif explicit_confirmation(text):
            self._early = self.confirm()
        elif declines_confirmation(text) and request.conversation.pendingAction:
            booking = request.conversation.booking
            order = request.conversation.order
            pending = request.conversation.pendingAction
            if pending.kind == "booking" and booking:
                booking = booking.model_copy(update={"stage": "cancelled"})
            if pending.kind == "order" and order:
                order = order.model_copy(update={"status": "Não confirmado"})
            self._early = self.reply("Tudo bem, não confirmei. Você pode escolher outra opção ou me dizer o que deseja mudar. 💚", booking=booking, order=order, pendingAction=None, checks=["Recusa respeitada; nenhuma reserva ou compra criada"])
        else:
            self.state.decision = await self._agent_runner("reception", request, Decision, RECEPTION)

    @router(receive)
    def route(self):
        if self._cached or self._early:
            return "route_early"
        decision = self.state.decision
        if decision.intent == "human":
            return "route_human"
        if decision.confidence < 0.65:
            return "route_reception"
        return "route_booking" if decision.intent in ("reservations", "birthdays") else f"route_{decision.intent}"

    @listen("route_early")
    def early(self):
        return self._cached or self._early

    @listen("route_human")
    def human(self):
        return handoff("Solicitação de pessoa, exceção sensível ou unidade não cadastrada.", booking=self.state.request.conversation.booking)

    @listen("route_reception")
    def reception(self):
        current = self.state.request.conversation
        if self.state.decision.greeting:
            return self.reply("Oi! Sou a Lia, recepcionista virtual da Sabor Express 💚 Posso ajudar com um pedido, uma reserva, seu aniversário ou alguma dúvida. O que você tem em mente?")
        if current.clarificationCount >= 2:
            return handoff("Intenção ainda ambígua após dois esclarecimentos.", booking=current.booking)
        return self.reply("Me ajuda com um detalhe: você quer fazer um pedido, reservar uma mesa ou organizar um aniversário? Também posso chamar uma pessoa, se preferir.", clarificationCount=current.clarificationCount + 1)

    @listen("route_booking")
    async def booking(self):
        kind = "birthday" if self.state.decision.intent == "birthdays" else "reservation"
        extraction = await self._agent_runner(self.state.decision.intent, self.state.request, BookingExtraction, BOOKING)
        return booking_reply(self.state.request, extraction, kind, self.systems)

    @listen("route_orders")
    async def orders(self):
        return await self.service("orders")

    @listen("route_information")
    async def information(self):
        return await self.service("information")

    def confirm(self):
        request = self.state.request
        current = request.conversation
        pending = current.pendingAction
        if not pending:
            if current.booking and current.booking.stage == "confirmed" and current.order and current.order.confirmed:
                return self.reply("Seu pedido e sua reserva já estão confirmados nos sistemas simulados. Você quer consultar qual deles?")
            if current.booking and current.booking.stage == "confirmed":
                return self.reply(f"A reserva #{current.booking.id} já está confirmada na agenda simulada. 💚", agent="reservations")
            if current.order and current.order.confirmed:
                return self.reply(f"O pedido #{current.order.id} já está confirmado na demonstração e está em preparo. 💚", agent="orders")
            return self.reply("Ainda não tenho um resumo pronto para confirmar. Você quer fazer um pedido ou uma reserva?")
        if request.confirmationId != pending.id:
            summary = booking_summary(current.booking, current.store) if pending.kind == "booking" else order_summary(current.order, current.store, CATALOG)
            return self.reply(f"O resumo mudou ou ainda não foi exibido nesta tela. Confira o atual:\n\n{summary}\n\nPosso confirmar esse resumo?", checks=["Confirmação antiga recusada; novo consentimento necessário"])
        try:
            if pending.kind == "booking":
                booking = self.systems.confirm_booking(current.id, pending.id)
                return self.reply(f"Reserva #{booking.id} confirmada na agenda simulada! 🎉\n\n{booking_summary(booking, current.store)}\n\nDuração: 2 horas. Até lá! 💚", agent="birthdays" if booking.kind == "birthday" else "reservations", topic="Reserva confirmada", booking=booking, pendingAction=None, checks=["Consentimento vinculado ao resumo atual", "Capacidade revalidada", "Reserva gravada no sistema simulado"])
            order = self.systems.confirm_order(current.id, pending.id)
            return self.reply(f"Pedido #{order.id} confirmado na demonstração! 🍔\n\n{order_summary(order, current.store, CATALOG)}", agent="orders", topic="Pedido confirmado", order=order, pendingAction=None, checks=["Consentimento vinculado ao resumo atual", "Preço, frete e estoque verificados", "Pedido gravado; estoque atualizado uma única vez"])
        except SystemRuleError as error:
            booking = current.booking
            if pending.kind == "booking" and booking:
                booking = booking.model_copy(update={"stage": "collecting", "id": None, "askedField": "time"})
            return self.reply(str(error), topic="Atualizar solicitação", booking=booking, pendingAction=None, checks=[f"Operação não concluída: {error.code}"])

    async def service(self, agent_id):
        request = self.state.request
        current = request.conversation
        action = await self._agent_runner(agent_id, request, ServiceAction, SERVICE)
        store = next(s for s in CATALOG["stores"] if s["name"] == current.store)
        if action.action in ("menu", "draft_order") and needs_setup(current.orderPreferences):
            return self.reply("Vamos organizar seu pedido! Escolha a unidade e como deseja receber nos cards abaixo. O frete exibido é fictício.", agent="orders", topic="Pedido · escolher unidade e recebimento", kind="order_setup", pendingAction=None)
        if action.action == "menu":
            return self.reply("Tem opção para todos os gostos! Combos com fritas e refri, acompanhamentos, bebida e sobremesa. Escolha um item para montar o pedido. 😋", agent=agent_id, topic="Cardápio", kind="menu", checks=["Cardápio consultado na base da unidade"])
        if action.action == "draft_order" and action.productId:
            text = normalize(current.messages[-1].text)
            if action.quantity and normalize(action.quantity) not in text:
                return self.reply("Quantas unidades desse combo você quer?", agent="orders", pendingAction=None)
            quantity = parse_number(action.quantity) if action.quantity else 1
            if quantity is None:
                return self.reply("Quantas unidades? Pode responder com um número de 1 a 10.", agent="orders", pendingAction=None)
            try:
                order = self.systems.quote_order(current.id, current.store, action.productId, quantity, current.orderPreferences)
            except SystemRuleError as error:
                return self.reply(str(error), agent="orders", pendingAction=None, checks=[f"Pedido não criado: {error.code}"])
            return self.reply(f"Separei seu pedido! 🍔\n{order_summary(order, current.store, CATALOG)}\n\nPosso confirmar?", agent="orders", topic="Pedido · confirmar resumo", kind="order", order=order, pendingAction=PendingAction(kind="order", id=order.id), checks=["Produto, preço e frete obtidos do catálogo", "Estoque simulado consultado", "Aguardando confirmação do cliente"])
        if action.action == "order_status":
            return self.reply(f"Seu pedido #{current.order.id} está: {current.order.status}. 🍔" if current.order else "Ainda não há pedido nesta conversa. Quer ver o cardápio?", agent=agent_id, topic="Status do pedido", checks=["Contexto consultado no sistema simulado"])
        if action.action == "hours":
            return self.reply(f"A unidade {current.store.split(' · ')[-1]} funciona {store['hours'].lower()}. 💚", agent=agent_id, topic="Horário da unidade", checks=["Informação obtida da base da unidade"])
        if action.action == "parking" and store["parking"]:
            return self.reply(store["parking"], agent=agent_id, topic="Estacionamento", checks=["Informação obtida da base da unidade"])
        if action.action == "thanks":
            return self.reply("Eu que agradeço! Se precisar de mais alguma coisa, estou por aqui. 💚", agent=agent_id)
        return handoff("Informação ou personalização fora das regras disponíveis.", booking=current.booking)

    @listen(or_(early, human, reception, booking, orders, information))
    def finish(self, reply: ChatReply):
        current = self.state.request.conversation
        # Handoff mantém contexto; o cliente nunca fornece o estado autoritativo de operações.
        if reply.order is None:
            reply.order = current.order
        if reply.booking is None:
            reply.booking = current.booking
        if reply.orderPreferences is None:
            reply.orderPreferences = current.orderPreferences
        if not self._cached:
            self.systems.save_reply(self._original, reply)
        return reply
