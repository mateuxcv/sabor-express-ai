"""Apresentação determinística dos registros CRM, sem alterar valores de negócio.

Markdown leve por padrão. RD_CRM_TEXT_FORMAT=text remove a sintaxe de Markdown
para interfaces que exibem a descrição literalmente. Nenhum HTML é gerado.
"""
import html
import os
import re
from datetime import date, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

TIMEZONE = ZoneInfo("America/Sao_Paulo")
ICONS = {"order.confirmed": "🍔", "reservation.confirmed": "📅", "csat.answered": "⭐", "sentiment.alerted": "🚨"}


def single_line(value):
    return " ".join(str(value if value is not None else "Não informado").split())


def unit_name(store):
    return single_line(store).split(" · ")[-1]


def money(value):
    if value is None: return "Não informado"
    return "R$ " + f"{Decimal(str(value)):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def local_datetime(value):
    if value is None: return "Não informado"
    return datetime.fromtimestamp(value, TIMEZONE).strftime("%d/%m/%Y às %H:%M") + " (Brasília)"


def calendar_date(value):
    try: return date.fromisoformat(value).strftime("%d/%m/%Y")
    except (TypeError, ValueError): return single_line(value)


def event_label(event_type, payload):
    if event_type == "order.confirmed": return "Pedido"
    if event_type == "csat.answered": return "Atendimento"
    if event_type == "sentiment.alerted": return "Atenção"
    return "Aniversário" if payload.get("kind") == "birthday" else "Reserva"


def legacy_deal_name(event, payload):
    return f"{event_label(event['event_type'], payload)} Sabor Express {event['aggregate_id']}"


def deal_name(event, payload):
    icon = "🎂" if payload.get("kind") == "birthday" else ICONS[event["event_type"]]
    label = "CSAT" if event["event_type"] == "csat.answered" else event_label(event["event_type"], payload)
    # Unidade e código são imutáveis no evento: o nome permanece reconciliável.
    return f"{icon} {label} · {unit_name(payload['store'])} · {event['aggregate_id']}"


def task_name(payload):
    return f"🚨 Priorizar atendimento · {unit_name(payload['store'])} · {payload['alert_id'][:8]}"


class Layout:
    def __init__(self, mode=None):
        self.mode = mode or os.getenv("RD_CRM_TEXT_FORMAT", "markdown").strip().lower()
        if self.mode not in ("markdown", "text"):
            raise ValueError("RD_CRM_TEXT_FORMAT deve ser markdown ou text")
        self.parts = []

    def safe(self, value, multiline=False):
        text = str(value if value is not None else "Não informado") if multiline else single_line(value)
        text = html.escape(text, quote=False).replace("[sabor-event:", "［sabor-event:")
        if self.mode == "markdown":
            text = re.sub(r"([\\`*_\[\]#|])", r"\\\1", text)
        return text

    def title(self, title):
        self.parts.append(("## " if self.mode == "markdown" else "") + title)

    def section(self, title):
        self.parts.extend(["", ("### " if self.mode == "markdown" else "") + title])

    def field(self, label, value):
        label = f"**{label}:**" if self.mode == "markdown" else f"{label}:"
        self.parts.append(f"- {label} {self.safe(value)}")

    def quote(self, value):
        text = str(value or "Não informado").strip()
        self.parts.extend(("> " if self.mode == "markdown" else "  ") + self.safe(line) for line in text.splitlines())

    def paragraph(self, text):
        self.parts.extend(["", self.safe(text)])

    def references(self, event, **extra):
        self.parts.extend(["", "---"])
        self.section("🔎 Referências da integração")
        self.field("Conversa", event["conversation_id"])
        for label, value in extra.items():
            if value: self.field(label, value)

    def render(self):
        return "\n".join(self.parts).strip()


def with_event_marker(description, event_id):
    # Marcador mantido literalmente para reenfileiramento/reconciliação, sempre ao final.
    return description.rstrip() + f"\n\n[sabor-event:{event_id}]"


def customer_section(layout, customer, store):
    layout.section("👤 Cliente e unidade")
    if customer:
        layout.field("Cliente", customer.get("name"))
        if customer.get("phone"): layout.field("Telefone", customer["phone"])
        if customer.get("email"): layout.field("E-mail", customer["email"])
    layout.field("Unidade", store)


def operation_description(event, payload, customer, mode=None):
    layout = Layout(mode)
    is_order = event["event_type"] == "order.confirmed"
    birthday = payload.get("kind") == "birthday"
    layout.title(f"{'🍔 Pedido confirmado' if is_order else '🎂 Aniversário confirmado' if birthday else '📅 Reserva confirmada'} · {event['aggregate_id']}")
    customer_section(layout, customer, payload["store"])
    if is_order:
        layout.section("🛍️ Itens do pedido")
        layout.field("Produto", payload["product"])
        layout.field("Quantidade", payload["quantity"])
        layout.section("🚚 Recebimento")
        delivery = payload.get("fulfillment") == "delivery"
        layout.field("Modalidade", "Entrega" if delivery else "Retirada na loja")
        address = payload.get("address")
        if delivery and address:
            layout.field("Endereço", f"{address['street']}, {address['number']}")
            layout.field("Bairro", address["district"])
            if address.get("complement"): layout.field("Complemento", address["complement"])
        elif delivery:
            layout.field("Endereço", "Não informado no registro")
        layout.field("Pagamento previsto", "Na entrega" if delivery else "Na retirada")
        layout.section("💰 Valores")
        subtotal = payload.get("subtotal")
        # Eventos antigos não separavam subtotal e frete; não inventar um subtotal.
        if subtotal is None and not payload.get("delivery_fee"): subtotal = payload["total"]
        layout.field("Subtotal", money(subtotal))
        layout.field("Frete fictício", money(payload.get("delivery_fee", 0)))
        layout.field("Total do pedido", money(payload["total"]))
        layout.section("✅ Próximo passo")
        layout.field("Ação da equipe", "Conferir o pedido na unidade e acompanhar o preparo e o recebimento.")
        layout.paragraph("🧪 Pedido confirmado no sistema demonstrativo; não houve cobrança real nem acionamento de entrega.")
    else:
        layout.section("🗓️ Dados da reserva")
        layout.field("Data", calendar_date(payload["date"]))
        layout.field("Horário", payload["time"])
        layout.field("Pessoas", payload["guests"])
        layout.field("Tipo", "Aniversário" if birthday else "Reserva de mesa")
        layout.section("✅ Próximo passo")
        layout.field("Ação da equipe", "Conferir a organização da unidade para a data, horário e quantidade de pessoas.")
        layout.paragraph("🧪 Reserva confirmada na agenda demonstrativa, sem valor de venda; não representa receita.")
    if event.get("created_at") is not None:
        layout.section("🕒 Confirmação")
        layout.field("Registrada em", local_datetime(event["created_at"]))
    layout.references(event, **{"Operação": event["aggregate_id"]})
    return layout.render()


def csat_description(event, payload, customer=None, mode=None):
    layout = Layout(mode)
    score = payload["score"]
    labels = {1: "Muito insatisfeito", 2: "Insatisfeito", 3: "Neutro", 4: "Satisfeito", 5: "Muito satisfeito"}
    layout.title("⭐ Avaliação de atendimento · CSAT")
    customer_section(layout, customer, payload["store"])
    layout.section("📊 Resultado")
    layout.field("Nota", f"{score}/5")
    layout.field("Avaliação", "⭐" * score + "☆" * (5 - score) + " · " + labels[score])
    layout.field("Satisfeito (nota 4 ou 5)", "Sim" if score >= 4 else "Não")
    layout.section("💬 Comentário do cliente")
    layout.quote(payload.get("comment"))
    layout.section("🕒 Datas do atendimento")
    layout.field("Encerramento", local_datetime(payload["closed_at"]))
    layout.field("Resposta", local_datetime(payload["answered_at"]))
    layout.paragraph("Avaliação de atendimento; não representa venda ou receita.")
    layout.references(event, **{"Pesquisa": payload["survey_id"], "Operação vinculada": payload.get("operation_id")})
    return layout.render()


def call_description(event, payload, customer=None, mode=None):
    layout = Layout(mode)
    layout.title("☎️ Ligação encerrada · Resumo")
    if customer:
        layout.section("👤 Cliente")
        layout.field("Nome", customer.get("name"))
    layout.section("📝 Resumo da conversa")
    layout.quote(payload.get("summary"))
    layout.section("🕒 Registro")
    layout.field("Encerramento", local_datetime(event.get("created_at")))
    layout.paragraph("Resumo textual do atendimento. O áudio da ligação não é enviado ao CRM.")
    layout.references(event, **{"Ligação": payload.get("call_id")})
    return layout.render()


def sentiment_description(event, payload, alert, mode=None):
    layout = Layout(mode)
    preference = alert["category"] == "human_request"
    layout.title("🙋 Atendimento humano solicitado" if preference else "🚨 Possível insatisfação · Prioridade alta")
    customer_section(layout, {"name": alert["customer_name"]}, alert["store"])
    layout.section("🎯 Motivo da atenção")
    layout.field("Prioridade", "Alta")
    layout.field("Motivo", alert["reason"])
    sources = {"model": "Análise contextual por IA", "rules": "Regras de atendimento", "rules_fallback": "Regras de contingência"}
    layout.field("Identificação", sources.get(alert["source"], "Monitor de atendimento"))
    layout.section("💬 Trecho da conversa")
    layout.quote(alert["evidence"])
    layout.section("🕒 Acompanhamento")
    layout.field("Detectado em", local_datetime(alert["created_at"]))
    layout.field("Última atualização", local_datetime(alert["updated_at"]))
    states = {"open": "Aguardando a equipe", "acknowledged": "Em acompanhamento", "resolved": "Resolvido no painel"}
    layout.field("Situação no momento do envio", states.get(alert["status"], "Não informada"))
    if alert["owner_name"]: layout.field("Acompanhamento no painel", alert["owner_name"])
    layout.section("✅ Próximo passo")
    layout.field("Ação da equipe", "Consultar o histórico, assumir o atendimento e retornar ao cliente.")
    layout.paragraph("Preferência por atendimento humano; não implica insatisfação nem substitui o CSAT." if preference else "Sinal preventivo de possível insatisfação; não é uma nota CSAT nem uma avaliação confirmada pelo cliente.")
    layout.references(event, **{"Ocorrência": payload["alert_id"], "Operação vinculada": payload.get("operation_id")})
    return layout.render()
