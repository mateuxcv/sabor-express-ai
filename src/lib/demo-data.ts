import catalog from "./catalog.json";
import type { CsatSurvey } from "./csat-contract";
import type { SentimentAlert } from "./sentiment-contract";
import type { DeliveryAddress, OrderPreferences } from "./ordering";

export type Status = "ai" | "waiting" | "human" | "resolved";
export type AgentId = "reception" | "orders" | "reservations" | "birthdays" | "information" | "human";
export type Routing = { agent: AgentId; source: "demo" | "crewai" | "fallback"; reason: string; summary: string; missingFields: string[]; checks?: string[] };
export type Booking = { kind: "reservation" | "birthday"; date?: string; time?: string; guests?: number; stage: "collecting" | "awaiting_confirmation" | "confirmed" | "unavailable" | "cancelled" | "pending_human"; attempts: number; id?: string; askedField?: "date" | "time" | "guests"; suggestedTimes?: string[] };
export type PendingAction = { kind: "order" | "booking"; id: string };
export const bookingStageLabels: Record<Booking["stage"], string> = { collecting: "Coletando informações", awaiting_confirmation: "Aguardando sua confirmação", confirmed: "Confirmada na agenda simulada", unavailable: "Escolhendo outro horário", cancelled: "Não confirmada pelo cliente", pending_human: "Aguardando validação da loja" };
export const bookingDate = (value?: string) => value?.includes("-") ? value.split("-").reverse().join("/") : value || "A informar";
export const agentLabels: Record<AgentId, string> = { reception: "Lia · Recepção", orders: "Pedidos", reservations: "Reservas", birthdays: "Aniversários", information: "Informações", human: "Equipe humana" };
export type AudioAttachment = { id: string; mimeType: string; durationSeconds: number; transcriptionEdited: boolean };
export type CallRecord = { id: string; status: "connecting" | "active" | "ended" | "failed" | "transferred"; startedAt: string; durationSeconds: number; reason?: string | null };
export type Message = { id: string; author: "customer" | "ai" | "agent" | "note" | "event"; text: string; time: string; kind?: "menu" | "order" | "order_setup"; agentId?: AgentId; audio?: AudioAttachment; confirmationId?: string | null; channel?: "call"; callId?: string; csatSurveyId?: string; csatResponse?: boolean; sentimentPending?: boolean };
export type Order = { id: string; product: string; price: number; confirmed: boolean; status: string; quantity?: number; subtotal?: number; deliveryFee?: number; fulfillment?: "pickup" | "delivery"; address?: DeliveryAddress };
export type CustomerProfile = { id: string; name: string; phone: string; email?: string | null };
export type Conversation = {
  id: string; name: string; initials: string; color: string; phone: string; store: string;
  status: Status; topic: string; unread: number; messages: Message[]; order?: Order;
  routing?: Routing; booking?: Booking; clarificationCount?: number;
  pendingAction?: PendingAction;
  call?: CallRecord;
  customerId?: string;
  email?: string | null;
  csat?: CsatSurvey;
  sentiment?: SentimentAlert;
  sentimentError?: string;
  orderPreferences?: OrderPreferences;
  orderSetupMessage?: string;
  orderSetupActive?: boolean;
};
export type DemoState = { conversations: Conversation[]; activeId: string; automation: boolean; customer?: CustomerProfile };

export const products = catalog.products;
export const currency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const statusLabels: Record<Status, string> = { ai: "Com a IA", waiting: "Aguardando", human: "Com você", resolved: "Resolvida" };

export function createSession(id: string, automation = true, customer?: CustomerProfile): DemoState {
  return {
    activeId: id, automation, customer,
    conversations: [{ id, name: customer?.name || "Você", initials: customer ? customer.name.split(" ").filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase() : "VC", color: "mint", phone: customer?.phone || "", customerId: customer?.id, email: customer?.email, store: "São Paulo · Pinheiros", status: automation ? "ai" : "waiting", topic: "Nova conversa", unread: 0, messages: [], orderPreferences: { storeSelected: false } }],
  };
}

// Snapshot estável para SSR. Nenhum histórico fictício é carregado na interface.
export const initialSession = createSession("session-start");

// Cenários de referência usados nos testes das regras de atendimento.
export const initialState: DemoState = {
  activeId: "mariana", automation: true,
  conversations: [
    {
      id: "mariana", name: "Mariana Costa", initials: "MC", color: "lavender", phone: "+55 (11) 99999-0142", store: "São Paulo · Pinheiros", status: "ai", topic: "Novo pedido", unread: 2,
      order: { id: "SE-2048", product: "Combo Clássico", price: 35.9, confirmed: false, status: "Aguardando confirmação" },
      messages: [
        { id: "m1", author: "customer", text: "Oi! Boa tarde 😊 Posso fazer um pedido para retirar em Pinheiros?", time: "12:32" },
        { id: "m2", author: "ai", text: "Oi, Mariana! Boa tarde 💚 Sou a assistente virtual da Sabor Express. Pode sim! O preparo na unidade Pinheiros leva de 20 a 30 min.\n\nQue tal escolher algo gostoso para hoje?", time: "12:32" },
        { id: "m3", author: "customer", text: "Queria ver os combos, por favor!", time: "12:33" },
        { id: "m4", author: "ai", text: "Claro! Esses são os queridinhos da casa 👇", time: "12:33", kind: "menu" },
        { id: "m5", author: "customer", text: "Vou querer o Combo Clássico! 😍", time: "12:34" },
        { id: "m6", author: "ai", text: "Ótima escolha! 🍔 Separei 1 Combo Clássico por R$ 35,90 para retirada em Pinheiros. Posso confirmar seu pedido?", time: "12:34", kind: "order" },
      ],
    },
    { id: "rafael", name: "Rafael Almeida", initials: "RA", color: "peach", phone: "+55 (11) 99999-0231", store: "São Paulo · Vila Mariana", status: "waiting", topic: "Pedido atrasado", unread: 1,
      order: { id: "SE-2041", product: "Combo Crispy", price: 32.9, confirmed: true, status: "Em entrega · atraso reportado" },
      messages: [
        { id: "r1", author: "customer", text: "Meu pedido está atrasado há mais de uma hora. Consegue me ajudar?", time: "12:29" },
        { id: "r2", author: "ai", text: "Sinto muito pela espera, Rafael. Vou chamar uma pessoa da nossa equipe para verificar o pedido #SE-2041 com a loja. Você não precisa repetir sua história. 💚", time: "12:29" },
        { id: "r3", author: "event", text: "Transferência para a equipe · Reclamação de atraso", time: "12:29" },
      ] },
    { id: "beatriz", name: "Beatriz Santos", initials: "BS", color: "pink", phone: "+55 (11) 99999-0332", store: "São Paulo · Pinheiros", status: "ai", topic: "Cardápio", unread: 0,
      messages: [{ id: "b1", author: "customer", text: "Tem alguma opção vegetariana?", time: "12:27" }, { id: "b2", author: "ai", text: "Temos o Combo Veggie! 🥗 Burger de grão-de-bico, fritas e refri por R$ 34,90. Se tiver alguma restrição alimentar, chamo a equipe para confirmar os ingredientes com você.", time: "12:27" }] },
    { id: "lucas", name: "Lucas Oliveira", initials: "LO", color: "blue", phone: "+55 (11) 99999-0442", store: "São Paulo · Moema", status: "human", topic: "Reserva de aniversário", unread: 0,
      messages: [{ id: "l1", author: "customer", text: "Queria reservar para um aniversário com 15 pessoas no sábado!", time: "12:22" }, { id: "l2", author: "ai", text: "Que legal! 🎉 Vou chamar nossa equipe para consultar a disponibilidade e cuidar dos detalhes.", time: "12:22" }, { id: "l3", author: "agent", text: "Oi, Lucas! Sou a Ana. Qual seria o horário da comemoração?", time: "12:24" }] },
    { id: "juliana", name: "Juliana Ferreira", initials: "JF", color: "mint", phone: "+55 (11) 99999-0552", store: "São Paulo · Pinheiros", status: "resolved", topic: "Informações da loja", unread: 0,
      messages: [{ id: "j1", author: "customer", text: "Vocês têm estacionamento?", time: "12:18" }, { id: "j2", author: "ai", text: "Na unidade Pinheiros temos estacionamento conveniado ao lado! A primeira hora é gratuita para clientes. 🚗", time: "12:18" }, { id: "j3", author: "customer", text: "Perfeito, obrigada!", time: "12:19" }] },
    { id: "pedro", name: "Pedro Henrique", initials: "PH", color: "yellow", phone: "+55 (11) 99999-0662", store: "São Paulo · Moema", status: "ai", topic: "Horário de funcionamento", unread: 0,
      messages: [{ id: "p1", author: "customer", text: "Até que horas vocês abrem hoje?", time: "12:15" }, { id: "p2", author: "ai", text: "A unidade Moema funciona das 11h às 23h todos os dias. Vai ser um prazer te receber! 💚", time: "12:15" }] },
  ],
};
