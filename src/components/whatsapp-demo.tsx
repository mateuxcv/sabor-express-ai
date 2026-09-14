"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, CalendarDays, Cake, Check, Headphones, LockKeyhole, MessageCircle, MoreVertical, Phone, Plus, ShieldCheck, ShoppingBag, Trash2, UserRound, Wifi, Zap } from "lucide-react";
import { Brand, BrandMark, MessageThread } from "./ui";
import { demoActions, useDemo } from "@/lib/demo-store";
import { agentLabels } from "@/lib/demo-data";
import { AssistantConnection } from "./concierge";
import { VoiceComposer } from "./voice-composer";
import { RealtimeCall } from "./realtime-call";
import { CustomerProfileDialog } from "./crm";
import { currency } from "@/lib/demo-data";
import { deliveryFee, needsOrderSetup } from "@/lib/ordering";

export function WhatsAppDemo() {
  const state = useDemo();
  const conversation = state.conversations.find((c) => c.id === state.activeId) || state.conversations[0];
  const [draft, setDraft] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [scenario, setScenario] = useState("order");
  const waiting = conversation.status === "waiting" || conversation.status === "human";
  const callActive = conversation.call?.status === "connecting" || conversation.call?.status === "active";
  const last = conversation.messages.filter((m) => m.author !== "event" && m.author !== "note").at(-1);
  const typing = state.automation && conversation.status === "ai" && last?.author === "customer";

  function send(event?: FormEvent, text = draft) {
    event?.preventDefault();
    if (!text.trim()) return;
    demoActions.sendCustomer(conversation.id, text);
    setDraft("");
  }

  function startScenario(value: string) {
    const id = demoActions.newConversation();
    setScenario(value);
    setDraft("");
    const prompts: Record<string, string> = { order: "Quero ver o cardápio", complaint: "Meu pedido está atrasado. Pode me ajudar?", faq: "Vocês têm estacionamento?", reservation: "Quero reservar uma mesa para 4 pessoas", birthday: "Quero organizar um aniversário para 15 pessoas" };
    demoActions.sendCustomer(id, prompts[value]);
  }

  return <main className="whatsapp-page">
    <header className="demo-header"><Link href="/" aria-label="Voltar à capa do projeto"><Brand /></Link><div><span className="demo-badge"><span /> Experiência demonstrativa</span><Link href="/dashboard" className="back-to-inbox"><ArrowLeft size={15} />Voltar ao inbox</Link></div></header>
    <div className="experience-layout">
      <fieldset className="experience-copy scenario-controls" disabled={conversation.id === "session-start"}><span className="experience-eyebrow"><span className="live-dot" /> ATENDIMENTO COM UM INGREDIENTE A MAIS</span><h1>Mais conversa.<br />Menos espera.<br /><span>Muito mais sabor.</span></h1><p>Do primeiro “oi” ao seu combo favorito.<br />Uma experiência que combina a agilidade da IA<br className="desktop-break" /> com o cuidado de gente de verdade.</p>
        <div className="experience-features"><span><Zap size={15} />Resposta na hora</span><span><Headphones size={15} />Equipe por perto</span><span><Phone size={15} />Por texto ou voz</span></div>
        <div className="scenario-section"><span className="section-kicker">EXPERIMENTE UMA CONVERSA</span><button className={`scenario-card ${scenario === "order" ? "active" : ""}`} onClick={() => startScenario("order")}><span className="scenario-icon peach"><ShoppingBag size={21} /></span><span><strong>Bateu aquela fome?</strong><small>Explore o cardápio e faça um pedido.</small></span><ArrowUpRight size={19} /></button><button className={`scenario-card ${scenario === "complaint" ? "active" : ""}`} onClick={() => startScenario("complaint")}><span className="scenario-icon lavender"><Headphones size={21} /></span><span><strong>Quando precisa de uma pessoa.</strong><small>Veja a transferência para a equipe acontecer.</small></span><ArrowUpRight size={19} /></button><button className={`scenario-card ${scenario === "faq" ? "active" : ""}`} onClick={() => startScenario("faq")}><span className="scenario-icon mint"><MessageCircle size={21} /></span><span><strong>Só uma dúvida rapidinha.</strong><small>Informações certas, na hora certa.</small></span><ArrowUpRight size={19} /></button></div>
        <div className="booking-scenarios"><button className={scenario === "reservation" ? "active" : ""} onClick={() => startScenario("reservation")}><CalendarDays size={16} /><span>Reservar uma mesa</span></button><button className={scenario === "birthday" ? "active" : ""} onClick={() => startScenario("birthday")}><Cake size={16} /><span>Planejar aniversário</span></button></div>
        <div className="experience-trust"><div className="trust-icon"><ShieldCheck size={20} /></div><p>A IA ajuda. A equipe tem o controle.<br /><strong>O cliente nunca fica sem saída.</strong></p></div>
      </fieldset>

      <section className="phone-stage" aria-label="Simulador de WhatsApp">
        <div className="phone-frame"><div className="phone-status"><span>9:41</span><span className="dynamic-island" /><div><span className="signal-bars">▂▄▆█</span><Wifi size={14} /><span className="battery"><i /></span></div></div>
          <header className="whatsapp-header"><Link href="/dashboard" aria-label="Voltar ao inbox"><ArrowLeft size={20} /></Link><div className="whatsapp-brand-icon"><BrandMark /></div><div className="whatsapp-contact"><strong>Sabor Express <span><Check size={9} strokeWidth={3} /></span></strong><small>{callActive ? "Ligação em andamento" : typing ? "digitando…" : conversation.status === "human" ? "Ana · equipe de atendimento" : conversation.status === "waiting" ? "aguardando nossa equipe" : "Conta comercial · online"}</small></div><RealtimeCall key={conversation.id} conversation={conversation} automation={state.automation} /><div className="phone-menu-anchor"><button className="icon-button" aria-label="Opções da conversa" onClick={() => setMenuOpen(!menuOpen)}><MoreVertical size={19} /></button>{menuOpen && <div className="phone-menu"><button onClick={() => { demoActions.newConversation(); setDraft(""); setMenuOpen(false); }}><Plus size={14} />Nova conversa</button><button disabled={callActive} onClick={() => { setProfileOpen(true); setMenuOpen(false); }}><UserRound size={14} />Identificar cliente</button><button onClick={() => { if (window.confirm("Limpar o histórico desta sessão? As conversas, pedidos e dados de reservas deste navegador serão apagados.")) { demoActions.clearSession(); setDraft(""); setMenuOpen(false); } }}><Trash2 size={14} />Limpar histórico da sessão</button><Link href="/dashboard"><Headphones size={14} />Abrir central</Link></div>}</div></header>
          <div className="phone-store"><span className="live-dot" />{conversation.orderPreferences?.storeSelected === false ? "Escolha a unidade do pedido" : `Unidade ${conversation.store.split(" · ")[1]}`}<span>{waiting ? "Equipe" : conversation.routing ? agentLabels[conversation.routing.agent] : "Lia · Recepção"}</span></div>
          {conversation.orderPreferences?.fulfillment && !needsOrderSetup(conversation.orderPreferences) && <div className="order-preferences-bar"><span>{conversation.orderPreferences.fulfillment === "delivery" ? `Entrega · frete fictício ${currency(deliveryFee(conversation.store, conversation.orderPreferences))}` : "Retirada na loja · sem frete"}</span>{!waiting && !callActive && !conversation.order?.confirmed && <button onClick={() => demoActions.editOrderPreferences(conversation.id)}>Alterar recebimento</button>}</div>}
          <div className="whatsapp-messages"><div className="encryption-note"><LockKeyhole size={10} />Esta é uma simulação. Nenhuma mensagem é enviada ao WhatsApp real.</div><MessageThread conversation={conversation} customerView onChoose={(name) => send(undefined, `Quero pedir o ${name}`)} /></div>
          {conversation.status !== "resolved" && conversation.order && !conversation.order.confirmed && !waiting && (conversation.pendingAction?.kind === "order" || conversation.routing?.source === "demo") && <div className="quick-confirm"><button disabled={typing} onClick={() => send(undefined, "Confirmar pedido")}><ShoppingBag size={13} />Confirmar pedido<ArrowRight size={13} /></button></div>}
          {conversation.status !== "resolved" && conversation.pendingAction?.kind === "booking" && !waiting && <div className="quick-confirm"><button disabled={typing} onClick={() => send(undefined, "Confirmar reserva")}><CalendarDays size={13} />Confirmar reserva<ArrowRight size={13} /></button></div>}
          {conversation.status !== "resolved" && conversation.booking?.stage === "unavailable" && !waiting && <div className="quick-replies">{conversation.booking.suggestedTimes?.map((time) => <button key={time} disabled={typing} onClick={() => send(undefined, time)}>{time}</button>)}</div>}
          {waiting && <div className="human-handoff"><Headphones size={13} /><span>{conversation.status === "human" ? "Ana está cuidando de você" : "A equipe já recebeu sua conversa"}</span><Link href="/dashboard">Ver inbox <ArrowUpRight size={11} /></Link></div>}
          {conversation.status !== "resolved" && !waiting && !conversation.order && !conversation.booking && <div className="quick-replies"><button disabled={typing} onClick={() => send(undefined, "Quero ver o cardápio")}>Ver cardápio 🍔</button><button disabled={typing} onClick={() => send(undefined, "Quero falar com um atendente")}>Falar com a equipe</button></div>}
          {callActive ? <div className="call-in-progress"><Phone size={14} />Ligação em andamento · histórico sincronizado</div> : <VoiceComposer key={conversation.id} conversationId={conversation.id} confirmationId={conversation.pendingAction?.id} draft={draft} onDraftChange={setDraft} onSendText={send} />}<div className="phone-bottom"><span /></div>
        </div>
        <div className="phone-caption"><AssistantConnection compact /></div>
      </section>
    </div>
    <footer className="experience-footer"><span>Sabor Express <span>×</span> <b>headoffice.ai</b></span><span>Conexões reais. Tecnologia com propósito.</span><span>PROTÓTIPO INTERATIVO <span className="footer-star">✳</span></span></footer>
    {profileOpen && <CustomerProfileDialog key={conversation.id} conversation={conversation} onClose={() => setProfileOpen(false)} />}
  </main>;
}
