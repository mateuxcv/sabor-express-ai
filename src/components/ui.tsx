"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { ArrowUpRight, CheckCheck, Phone, Sparkles, X } from "lucide-react";
import { currency, products, agentLabels, type Conversation } from "@/lib/demo-data";
import { VoiceMessage } from "./voice-message";
import { CsatSurveyCard } from "./csat";
import { OrderSetupCards } from "./order-setup";
import { BrandMark } from "./brand";
export { Brand, BrandMark } from "./brand";

export function Avatar({ name, color, small = false }: { name: string; color: string; small?: boolean }) {
  return <span className={`avatar ${color} ${small ? "avatar-small" : ""}`}>{name}</span>;
}

export function AiMark({ small = false }: { small?: boolean }) {
  return <span className={`ai-mark ${small ? "ai-mark-small" : ""}`}><Sparkles size={small ? 13 : 17} /></span>;
}

export function FoodArt({ variant = "classic" }: { variant?: string }) {
  if (variant === "fries") return <svg viewBox="0 0 180 130" fill="none" aria-hidden="true" className="food-art"><ellipse cx="90" cy="118" rx="55" ry="7" fill="#7b5028" opacity=".1" /><g fill="#F5C451" stroke="#D69B28" strokeWidth="2">{[45, 62, 79, 96, 113].map((x, i) => <rect key={x} x={x} y={22 + i % 2 * 9} width="14" height="73" rx="3" transform={`rotate(${(i - 2) * 5} ${x} 90)`} />)}</g><path d="M40 66h100l-12 49H53L40 66Z" fill="#E95F32" /><path d="M46 65c25 9 58-3 85 3" stroke="#FFCF38" strokeWidth="10" strokeLinecap="round" /><circle cx="90" cy="92" r="13" fill="#FBECCC" /><path d="M81 93h18" stroke="#DE7042" strokeWidth="4" strokeLinecap="round" /></svg>;
  if (variant === "milkshake") return <svg viewBox="0 0 180 130" fill="none" aria-hidden="true" className="food-art"><ellipse cx="90" cy="120" rx="35" ry="6" fill="#7b5028" opacity=".1" /><path d="m109 39 10-32h16" stroke="#E98282" strokeWidth="7" strokeLinecap="round" /><path d="M62 45h57l-7 70H70l-8-70Z" fill="#9D644A" /><path d="M72 53h35l-4 55H77l-5-55Z" fill="#BC866B" /><path d="M62 43c-8-12 5-20 14-17-2-19 27-23 30-7 16-5 24 16 9 24H62Z" fill="#FFF1DE" /><path d="M78 30c10 8 21-6 30 1" stroke="#71432B" strokeWidth="4" strokeLinecap="round" /><rect x="58" y="42" width="65" height="8" rx="4" fill="#F4DCCC" /></svg>;
  if (variant === "brownie") return <svg viewBox="0 0 180 130" fill="none" aria-hidden="true" className="food-art"><ellipse cx="90" cy="108" rx="65" ry="13" fill="#FFF9ED" /><path d="m39 54 71-20 32 30-73 23-30-33Z" fill="#78503A" /><path d="m39 54 30 33v25L39 81V54Z" fill="#513626" /><path d="m69 87 73-23v24l-73 24V87Z" fill="#633F2E" /><path d="m51 57 65-13M59 67l65-14M68 77l65-14" stroke="#C78C55" strokeWidth="5" strokeLinecap="round" /><g fill="#3C291E"><circle cx="75" cy="49" r="4" /><circle cx="99" cy="68" r="4" /><circle cx="116" cy="56" r="4" /></g></svg>;
  return <svg viewBox="0 0 180 130" fill="none" aria-hidden="true" className="food-art">
    <ellipse cx="90" cy="117" rx="62" ry="8" fill="#7b5028" opacity=".1" />
    <path d="M35 92h110v10c0 12-110 12-110 0V92Z" fill="#DF922E" />
    <path d="M35 92h110v7c-32 9-77 9-110 0v-7Z" fill="#F5B74F" />
    <rect x="29" y="79" width="122" height="18" rx="9" fill={variant === "veggie" ? "#826141" : variant === "chicken" ? "#CC8134" : "#694030"} />
    <path d="m35 76 35 2 24 18 25-18 27-2H35Z" fill="#FFD24B" />
    <rect x="33" y="66" width="114" height="12" rx="6" fill="#E86245" />
    {variant === "bacon" && <path d="m37 79 24-8 18 7 22-9 22 7 17-5" stroke="#AB4431" strokeWidth="7" strokeLinecap="round" />}
    <path d="M28 65c7-16 18 1 28-8s15 7 27-1 15 8 26 0 12 8 25 1 23 10 16 12-10-2-17 3-12-4-23 1-13-5-24 0-15-5-27 0-19-5-26-1-10-3-5-7Z" fill="#6E9E49" />
    <path d="M32 55c0-57 116-57 116 0 0 12-116 12-116 0Z" fill="#EDAB48" />
    <path d="M38 42c16-35 83-39 103 0-29-14-77-14-103 0Z" fill="#F8C86C" />
    <g stroke="#FFF0C8" strokeWidth="3" strokeLinecap="round"><path d="m60 33 4-2M86 23l2 4m21 4 4 2m-39 9 3-2m48 4 3 1m-35-6 3 1" /></g>
  </svg>;
}

export function MenuCards({ onChoose, compact = false }: { onChoose?: (name: string) => void; compact?: boolean }) {
  return <div className={`menu-cards ${compact ? "compact" : ""}`}>{products.map((p) => <button type="button" className="product-card" key={p.id} onClick={() => onChoose?.(p.name)} disabled={!onChoose}>
    <div className={`product-art ${p.color}`}><FoodArt variant={p.id} /><span className="product-label">{{ classic: "MAIS PEDIDO", veggie: "VEGETARIANO", chicken: "CROCANTE", bacon: "COM BACON", fries: "ACOMPANHAMENTO", milkshake: "400 ML", brownie: "SOBREMESA" }[p.id]}</span></div>
    <div className="product-copy"><strong>{p.name}</strong><span>{p.description}</span><div><b>{currency(p.price)}</b>{onChoose && <ArrowUpRight size={15} />}</div></div>
  </button>)}</div>;
}

export function MessageThread({ conversation, customerView = false, onChoose }: { conversation: Conversation; customerView?: boolean; onChoose?: (name: string) => void }) {
  const thread = useRef<HTMLDivElement>(null);
  const visible = conversation.messages.filter((m) => !customerView || (m.author !== "note" && m.author !== "event"));
  const last = visible.at(-1);
  const typing = conversation.status === "ai" && last?.author === "customer" && last.channel !== "call" && !last.csatResponse;
  useEffect(() => {
    const container = customerView ? thread.current?.closest(".whatsapp-messages") : thread.current;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const menu = customerView && last?.kind === "menu" ? [...(thread.current?.querySelectorAll(".menu-cards") || [])].at(-1)?.closest(".message-row") : null;
    const setup = customerView ? thread.current?.querySelector(".order-setup") || menu : null;
    const top = !conversation.messages.length && !conversation.orderPreferences?.storeSelected ? 0 : setup && container ? setup.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 8 : container?.scrollHeight || 0;
    container?.scrollTo({ top, behavior: reducedMotion ? "instant" : "smooth" });
  }, [conversation.id, conversation.messages.length, typing, customerView, conversation.orderPreferences?.storeSelected, conversation.orderPreferences?.fulfillment, conversation.orderSetupActive, last?.kind]);

  return <div ref={thread} className={`message-thread ${customerView ? "customer-thread" : ""}`}>
    {visible.length === 0 && <div className="chat-welcome"><BrandMark /><h3>Sua conversa começa aqui</h3><p>Envie uma mensagem para falar com a recepção da Sabor Express.</p></div>}
    {visible.length > 0 && <div className="day-divider"><span>Hoje</span></div>}
    {!customerView && visible.length > 0 && <div className="thread-start"><span className="whatsapp-tiny">◔</span> Conversa iniciada pelo WhatsApp</div>}
    {visible.map((m) => {
      if (m.author === "event") return <div className="event-message" key={m.id}><span />{m.text}<span /></div>;
      const outgoing = customerView ? m.author === "customer" : m.author === "ai" || m.author === "agent";
      return <div key={m.id} className={`message-row ${outgoing ? "outgoing" : "incoming"} ${m.author === "note" ? "internal-note" : ""}`}>
        {!customerView && m.author === "customer" && <Avatar name={conversation.initials} color={conversation.color} small />}
        {!customerView && <div className="message-author">{m.author === "ai" ? <><Sparkles size={11} /> {m.agentId ? agentLabels[m.agentId] : "Assistente Sabor"}</> : m.author === "agent" ? "Ana · Atendimento" : m.author === "note" ? "Ana · Nota interna" : conversation.name.split(" ")[0]}<span>{m.time}</span></div>}
        <div className={`message-bubble ${m.author === "ai" ? "ai-bubble" : ""} ${m.audio ? "voice-bubble" : ""}`}>
          {m.channel === "call" && <span className="call-transcript-label"><Phone size={11} />Ligação</span>}
          {m.audio ? <VoiceMessage key={m.audio.id} audio={m.audio} text={m.text} expanded={!customerView} /> : <p>{m.text}</p>}
          {m.kind === "menu" && <MenuCards onChoose={onChoose} compact={customerView} />}
          {m.csatSurveyId && conversation.csat?.id === m.csatSurveyId && <CsatSurveyCard survey={conversation.csat} customerView={customerView} />}
          {customerView && <div className="bubble-meta">{m.time}{outgoing && <CheckCheck size={14} />}</div>}
        </div>
        {!customerView && outgoing && <span className="message-receipt"><CheckCheck size={12} /> Entregue</span>}
      </div>;
    })}
    {customerView && <OrderSetupCards key={conversation.id} conversation={conversation} />}
    {typing && <div className="typing-bubble" aria-label="Assistente digitando"><span /><span /><span /></div>}
  </div>;
}

export function Modal({ title, children, onClose, className = "" }: { title: string; children: ReactNode; onClose: () => void; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className={`modal ${className}`} onCancel={onClose} onClick={(event) => { if (event.target === ref.current) onClose(); }} aria-labelledby={titleId}><div className="modal-header"><h2 id={titleId}>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={19} /></button></div><div className="modal-body">{children}</div></dialog>;
}
