"use client";

import { ArrowUpRight, ChevronDown, MapPin, MessageCircle, ShoppingBag, Sparkles, Tag } from "lucide-react";
import { agentLabels, products, statusLabels, type Conversation } from "@/lib/demo-data";
import { AiMark, Avatar, FoodArt } from "./ui";
import { ConversationRouting } from "./concierge";
import { CrmContactCard } from "./crm";
import { OrderBreakdown } from "./order-setup";

export function ContactDetails({ conversation: c, onOpenOrder }: { conversation: Conversation; onOpenOrder: () => void }) {
  return <div className="contact-details-content">
    <div className="contact-profile">
      <Avatar name={c.initials} color={c.color} />
      <h3>{c.name}</h3>
      {c.phone && <span>{c.phone}</span>}
      <span className="contact-channel"><MessageCircle size={11} />WhatsApp</span>
    </div>
    <div className="contact-properties">
      <div><span>Status</span><span className={`status-pill ${c.status}`}><span />{statusLabels[c.status]}</span></div>
      <div><span>Responsável</span><strong>{c.status === "ai" ? <><AiMark small />{c.routing ? agentLabels[c.routing.agent] : "Assistente Sabor"}</> : c.status === "human" ? <><Avatar name="AC" color="portrait" small />Ana Carvalho</> : c.status === "waiting" ? "Não atribuído" : "Ana / Assistente"}</strong></div>
      <div><span>Unidade</span><strong><MapPin size={12} />{c.store.split(" · ")[1]}</strong></div>
      <div><span>Origem</span><strong>WhatsApp Business</strong></div>
    </div>
    <ConversationRouting conversation={c} />
    <div className="detail-section">
      <h3><Tag size={14} />Etiquetas</h3>
      <div className="tags"><span>{c.topic}</span><span>Unidade piloto</span></div>
    </div>
    <div className="detail-section ai-summary">
      <h3><Sparkles size={14} />Contexto em um instante<span>IA</span></h3>
      <p>{c.status === "waiting" ? `${c.name.split(" ")[0]} precisa de ajuda da equipe sobre ${c.topic.toLowerCase()}. O histórico está disponível para continuar sem repetir perguntas.` : c.order ? `Cliente da unidade ${c.store.split(" · ")[1]}. Escolheu ${c.order.product}. ${c.order.confirmed ? "Pedido confirmado e em acompanhamento." : "Aguardando confirmação para concluir o pedido."}` : `Conversa sobre ${c.topic.toLowerCase()} na unidade ${c.store.split(" · ")[1]}. Veja o histórico antes de responder.`}</p>
      <span className="summary-footnote">Resumo demonstrativo · confira o histórico</span>
    </div>
    {c.order && <div className="detail-section">
      <h3><ShoppingBag size={14} />Pedido em andamento<ChevronDown size={13} /></h3>
      <div className="order-card">
        <div className="order-card-top"><strong>#{c.order.id}</strong><span className={c.order.confirmed ? "confirmed-dot" : "pending-dot"} /></div>
        <span className="order-status">{c.order.status}</span>
        <div className="order-product"><div><FoodArt variant={products.find((p) => p.name === c.order?.product)?.id} /></div><span><strong>{c.order.quantity || 1}× {c.order.product}</strong><small>{products.find((p) => p.name === c.order?.product)?.description}</small></span></div>
        <OrderBreakdown order={c.order} store={c.store} />
        <button onClick={onOpenOrder}>Ver pedido completo<ArrowUpRight size={13} /></button>
      </div>
    </div>}
    <CrmContactCard key={c.id} conversation={c} />
  </div>;
}
