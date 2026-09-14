import { type Conversation, type Message, type Order, type Status, type Routing, type Booking, products } from "./demo-data";
import { deliveryFee, needsOrderSetup, orderSummary } from "./ordering";

export type Reply = { text: string; kind?: Message["kind"]; status?: Status; topic?: string; order?: Order; routing?: Routing; booking?: Booking; clarificationCount?: number };

const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export const requestsHuman = (text: string) => /atendente|humano|falar com (?:uma |alguem|pessoa)|reclam|atras|errad|cancel|reembolso|alerg|intoler|passando mal|intoxic/.test(normalize(text));

export function generateReply(text: string, conversation: Conversation): Reply {
  const normalized = normalize(text);
  if (!requestsHuman(text)) {
    const birthday = /aniversario|festa|comemoracao/.test(normalized);
    const reservation = /reserv|mesa para/.test(normalized);
    const continuing = conversation.booking?.stage === "collecting" && !/cardapio|combo|menu|estacion|pedido/.test(normalized);
    if (birthday || reservation || continuing) return collectBooking(text, conversation, birthday ? "birthday" : reservation ? "reservation" : conversation.booking!.kind);
  }
  const reply = basicReply(text, conversation);
  const agent = reply.status === "waiting" ? "human" : reply.order || reply.kind === "menu" || reply.kind === "order" ? "orders" : /horario|estacion/.test(normalized) ? "information" : "reception";
  return { ...reply, routing: { agent, source: "demo", reason: "Encaminhamento por regras locais de demonstração.", summary: reply.status === "waiting" ? "A equipe deve continuar o atendimento a partir do histórico." : `Atendimento de ${conversation.name} na unidade ${conversation.store.split(" · ")[1]}.`, missingFields: [] } };
}

function collectBooking(text: string, conversation: Conversation, kind: Booking["kind"]): Reply {
  const booking: Booking = conversation.booking?.kind === kind ? { ...conversation.booking } : { kind, stage: "collecting", attempts: 0 };
  const dateMatch = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/);
  if (dateMatch) {
    const day = Number(dateMatch[1]), month = Number(dateMatch[2]), year = Number(dateMatch[3] || 2000);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) booking.date = dateMatch[0];
  }
  const time = normalize(text).match(/\b([01]?\d|2[0-3])(?:h([0-5]\d)?|:([0-5]\d))\b/);
  if (time) booking.time = `${time[1].padStart(2, "0")}:${time[2] || time[3] || "00"}`;
  const guests = normalize(text).match(/\b(\d{1,3})\s*(?:pessoas|convidados|participantes|adultos)\b/);
  if (guests && Number(guests[1]) >= 1 && Number(guests[1]) <= 500) booking.guests = Number(guests[1]);
  const missing = (["date", "time", "guests"] as const).filter((field) => !booking[field]);
  const label = kind === "birthday" ? "aniversário" : "reserva";
  booking.attempts += 1;
  const routing: Routing = { agent: kind === "birthday" ? "birthdays" : "reservations", source: "demo", reason: "Coletar os dados antes de encaminhar à loja.", summary: `${label === "reserva" ? "Reserva" : "Aniversário"} em ${conversation.store.split(" · ")[1]}. Data: ${booking.date || "a informar"}. Horário: ${booking.time || "a informar"}. Pessoas: ${booking.guests || "a informar"}. Disponibilidade não confirmada.`, missingFields: missing };
  if (!missing.length || booking.attempts >= 4) {
    booking.stage = "pending_human";
    return { text: !missing.length ? `Anotei os dados do seu ${label}! Vou encaminhar à equipe da unidade para conferir disponibilidade e condições. Isso ainda não é uma confirmação. 💚` : "Vou chamar a equipe para concluir os detalhes com você. Já compartilhei o que você informou; a disponibilidade ainda precisa ser confirmada. 💚", status: "waiting", topic: `${kind === "birthday" ? "Aniversário" : "Reserva"} · validar com a loja`, booking, routing };
  }
  const questions = { date: "Qual é a data? Pode informar dia/mês?", time: "Qual horário você tem em mente?", guests: "Para quantas pessoas? Pode informar como, por exemplo, ‘15 pessoas’?" };
  return { text: `${booking.attempts === 1 ? `Posso organizar os detalhes do seu ${label} para a equipe da loja! ` : ""}${questions[missing[0]]}${booking.attempts === 1 ? " A disponibilidade será confirmada pela unidade." : ""}`, topic: `${kind === "birthday" ? "Aniversário" : "Reserva"} · coletando dados`, booking, routing };
}

// Motor determinístico de demonstração. A integração com um LLM substituiria esta função.
function basicReply(text: string, conversation: Conversation): Reply {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const store = conversation.store.split(" · ")[1];
  if (requestsHuman(text)) {
    return { text: "Vou chamar uma pessoa da nossa equipe para te ajudar com isso. Já compartilhei o contexto da conversa, então você não precisa repetir tudo. 💚", status: "waiting", topic: /atras/.test(normalized) ? "Pedido atrasado" : "Atendimento humano" };
  }
  if (/\b(nao|nunca)\b/.test(normalized) && /confirm|pedir|combo|quero/.test(normalized)) {
    return { text: "Tudo bem! Não confirmei nenhum novo pedido. Você pode ver o cardápio ou me chamar quando decidir. 💚" };
  }
  const product = products.find((p) => normalized.includes(normalize(p.name)));
  if (needsOrderSetup(conversation.orderPreferences) && (product || /cardapio|combo|menu|vegetarian|opcoes|(?:fazer|confirmar) (?:um |o )?pedido/.test(normalized))) {
    return { text: "Vamos organizar seu pedido! Escolha a unidade e como deseja receber nos cards abaixo. O frete exibido é fictício.", kind: "order_setup", topic: "Pedido · escolher unidade e recebimento" };
  }
  const explicitConfirmation = /^(sim[,!. ]*)?(confirmar(?: o)? pedido|confirmo(?: o pedido)?|pode confirmar(?: o pedido)?|pode fechar(?: o pedido)?|pode pedir)[!. ]*$/.test(normalized.trim());
  if (explicitConfirmation && conversation.order) {
    if (conversation.order.confirmed) return { text: `O pedido #${conversation.order.id} já está confirmado! Status: ${conversation.order.status}. 💚` };
    return { text: `Pedido #${conversation.order.id} confirmado na demonstração! 🎉\n\n${orderSummary(conversation.order, conversation.store)}\n\nObrigada por escolher a Sabor Express! 💚`, order: { ...conversation.order, confirmed: true, status: "Em preparo" }, topic: "Pedido confirmado" };
  }
  if (product && /quero|querer|pedir|escolh|manda/.test(normalized)) {
    const fee = deliveryFee(conversation.store, conversation.orderPreferences);
    const order: Order = { id: `SE-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, product: product.name, quantity: 1,
      subtotal: product.price, deliveryFee: fee, price: (Math.round(product.price * 100) + Math.round(fee * 100)) / 100,
      fulfillment: conversation.orderPreferences?.fulfillment || "pickup", address: conversation.orderPreferences?.fulfillment === "delivery" ? conversation.orderPreferences.address : undefined,
      confirmed: false, status: "Aguardando confirmação" };
    return { text: `Boa escolha! ${product.emoji}\n${orderSummary(order, conversation.store)}\n\nPosso confirmar?`, kind: "order", topic: "Novo pedido", order };
  }
  if (/cardapio|combo|menu|vegetarian|opcoes|fazer (?:um )?pedido/.test(normalized)) return { text: "Combos com fritas e refri, acompanhamentos, bebida e sobremesa. Escolha um item para montar seu pedido! 😋", kind: "menu", topic: "Cardápio" };
  if (/estacion/.test(normalized)) return store === "Pinheiros" ? { text: "Temos estacionamento conveniado ao lado da unidade Pinheiros, com a primeira hora gratuita para clientes! 🚗", topic: "Informações da loja" } : { text: `Vou pedir à equipe de ${store} para confirmar as opções de estacionamento. 💚`, status: "waiting", topic: "Informações da loja" };
  if (/horario|abre|aberto|fecha|funciona/.test(normalized)) return { text: `A unidade ${store} funciona todos os dias, das 11h às 23h. Te esperamos por aqui! 💚`, topic: "Horário de funcionamento" };
  if (/status|meu pedido|acompanhar/.test(normalized) && conversation.order?.confirmed) return { text: `O pedido #${conversation.order.id} está: ${conversation.order.status.toLowerCase()}. Essa é a informação do nosso sistema de pedidos demonstrativo. 🍔` };
  if (/obrigad|valeu/.test(normalized)) return { text: "Eu que agradeço! Se precisar de algo, é só chamar. Bom apetite! 💚" };
  if (/^(oi|ola|bom dia|boa tarde|boa noite|oie|hey)[! .😊]*$/.test(normalized)) return { text: `Oi! Sou a Lia, recepcionista virtual da Sabor Express ${store} 💚 Você quer fazer um pedido, reservar uma mesa, organizar um aniversário ou tirar uma dúvida? Se preferir, chamo uma pessoa.` };
  return { text: "Quero te passar a informação certa. Vou chamar nossa equipe para entender melhor e te ajudar, tudo bem? 💚", status: "waiting", topic: "Atendimento humano" };
}
