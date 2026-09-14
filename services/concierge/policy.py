from language import normalize, parse_date, parse_number, parse_time
from models import Booking, BookingExtraction, ChatReply, ChatRequest, PendingAction, Routing
from systems import CATALOG, DemoSystems, SystemRuleError, get_systems


def handoff(reason: str, source: str = "crewai", booking: Booking | None = None) -> ChatReply:
    return ChatReply(text="Vou chamar uma pessoa da equipe para te ajudar. O histórico segue junto, então você não precisa repetir sua história. 💚", status="waiting", topic="Atendimento humano", booking=booking,
                     routing=Routing(agent="human", source=source, reason=reason, summary="Atendimento encaminhado com o contexto da conversa."))


def booking_summary(booking: Booking, store: str):
    day = "/".join(reversed(booking.date.split("-"))) if booking.date and "-" in booking.date else booking.date or "a informar"
    label = "Aniversário" if booking.kind == "birthday" else "Reserva de mesa"
    return f"{label} · {store.split(' · ')[-1]}\n📅 {day} às {booking.time or 'a informar'}\n👥 {booking.guests or 'a informar'} pessoas"


def booking_reply(request: ChatRequest, extraction: BookingExtraction, kind: str, systems: DemoSystems | None = None) -> ChatReply:
    systems = systems or get_systems()
    previous = request.conversation.booking
    active = previous and previous.stage not in ("confirmed", "cancelled", "pending_human")
    booking = previous.model_copy(deep=True) if active else Booking(kind=kind)
    kind_changed = bool(active and booking.kind != kind)
    booking.kind = kind
    before = (booking.date, booking.time, booking.guests)
    latest = normalize(request.conversation.messages[-1].text)
    invalid = None
    for field in ("date", "time", "guests"):
        value = getattr(extraction, field)
        if not value or normalize(value) not in latest:
            continue
        if field == "date":
            parsed = parse_date(value, systems.clock())
            booking.date = parsed.isoformat() if parsed else None
        elif field == "time":
            booking.time = parse_time(value)
        else:
            parsed = parse_number(value)
            booking.guests = parsed if parsed is not None and 1 <= parsed <= 500 else None
        if getattr(booking, field) is None:
            invalid = field
    progressed = kind_changed or before != (booking.date, booking.time, booking.guests)
    booking.attempts = 0 if progressed else booking.attempts + 1
    missing = [field for field in ("date", "time", "guests") if getattr(booking, field) is None]
    agent = "birthdays" if kind == "birthday" else "reservations"
    label = "aniversário" if kind == "birthday" else "reserva"
    routing = Routing(agent=agent, reason="Coleta contextual com validação em código.", summary=booking_summary(booking, request.conversation.store), missingFields=missing, checks=["Dados conferidos com a última mensagem do cliente"])
    if booking.attempts >= 3:
        booking.stage = "pending_human"
        return handoff("Três tentativas sem avanço na coleta. Equipe continua com os dados informados.", booking=booking)
    if missing:
        booking.stage = "collecting"
        booking.id = None
        booking.askedField = invalid or missing[0]
        questions = {"date": "Qual dia você prefere? Pode dizer ‘amanhã’, ‘sábado’ ou uma data como 24/10.", "time": "Qual horário? Por exemplo, ‘19h30’ ou ‘sete da noite’.", "guests": "Para quantas pessoas? Pode me dizer só o número."}
        prefix = "Esse dado não ficou válido. " if invalid else f"Vamos organizar seu {label}! " if not active else ""
        if not active and booking.guests:
            prefix = f"Legal, {label} para {booking.guests} pessoas! "
        return ChatReply(text=prefix + questions[booking.askedField], topic=f"{label.capitalize()} · coletando dados", booking=booking, order=request.conversation.order, routing=routing)
    try:
        booking = systems.quote_booking(request.conversation.id, request.conversation.store, booking)
    except SystemRuleError as error:
        if error.code == "party_size":
            booking.stage = "pending_human"
            return handoff(str(error), booking=booking)
        booking.askedField = "date" if error.code in ("past_date", "horizon") else "time"
        setattr(booking, booking.askedField, None)
        booking.stage = "collecting"
        booking.id = None
        booking.attempts = (previous.attempts if active else 0) + 1
        if booking.attempts >= 3:
            booking.stage = "pending_human"
            return handoff("Três tentativas de agenda inválidas. A equipe ajuda a escolher outra opção.", booking=booking)
        routing.missingFields = [booking.askedField]
        routing.checks.append("Data, antecedência e horário validados pela agenda")
        return ChatReply(text=str(error), topic="Ajustar reserva", booking=booking, order=request.conversation.order, routing=routing)
    routing.summary = booking_summary(booking, request.conversation.store)
    routing.checks.extend(["Agenda simulada consultada", "Capacidade e duração de 2 horas verificadas"])
    if booking.stage == "unavailable":
        alternatives = ", ".join(booking.suggestedTimes)
        text = f"Nesse horário não há lugares suficientes na agenda simulada. Tenho {alternatives}. Qual você prefere?" if alternatives else "Esse dia está sem espaço para o grupo na agenda simulada. Qual outra data funciona?"
        if not alternatives:
            booking.date = None
            booking.askedField = "date"
        return ChatReply(text=text, topic="Reserva · escolher alternativa", booking=booking, order=request.conversation.order, routing=routing)
    routing.reason = "Disponibilidade encontrada. Aguardar consentimento sobre este resumo."
    return ChatReply(text=f"Encontrei disponibilidade na agenda simulada!\n\n{routing.summary}\n\nDuração: 2 horas. Posso confirmar assim?", topic=f"{label.capitalize()} · confirmar resumo", booking=booking, order=request.conversation.order, pendingAction=PendingAction(kind="booking", id=booking.id), routing=routing)
