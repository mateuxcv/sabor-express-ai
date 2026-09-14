"use client";

import { useEffect, useState } from "react";
import { ArrowRight, CalendarDays, Cake, Check, Headphones, Info, RefreshCw, ShoppingBag, Sparkles, Workflow } from "lucide-react";
import { agentLabels, bookingStageLabels, bookingDate, type Conversation } from "@/lib/demo-data";

export function AssistantConnection({ compact = false }: { compact?: boolean }) {
  const [connection, setConnection] = useState({ provider: "loading", ready: false, label: "Verificando recepção…" });
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/assistant", { signal: controller.signal, cache: "no-store" })
      .then((response) => { if (!response.ok) throw new Error("unavailable"); return response.json(); })
      .then((data) => setConnection(data))
      .catch(() => { if (!controller.signal.aborted) setConnection({ provider: "unavailable", ready: false, label: "Conexão indisponível · equipe como saída" }); });
    return () => controller.abort();
  }, [refresh]);
  return <div className={`assistant-connection ${compact ? "connection-compact" : ""}`}><span className={connection.ready ? "live-dot" : "connection-pending"} /><span>{connection.label}</span>{!compact && <button className="icon-button" aria-label="Verificar conexão CrewAI" onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={13} /></button>}</div>;
}

export function ConversationRouting({ conversation }: { conversation: Conversation }) {
  const { routing, booking } = conversation;
  if (!routing && !booking) return null;
  return <div className="detail-section routing-panel"><h3><Workflow size={14} />Encaminhamento</h3>{routing && <><div className="routing-path"><span>Recepção</span><ArrowRight size={11} /><strong>{agentLabels[routing.agent]}</strong></div><span className={`routing-source ${routing.source}`}>{routing.source === "crewai" ? "CrewAI Flow" : routing.source === "fallback" ? "Contingência humana" : "Simulação local"}</span><p>{routing.summary}</p>{!!routing.checks?.length && <ul className="routing-checks" aria-label="Validações do atendimento">{routing.checks.map((check) => <li key={check}><Check size={12} />{check}</li>)}</ul>}</>}{booking && <div className="booking-details"><h4>{booking.kind === "birthday" ? <Cake size={13} /> : <CalendarDays size={13} />}{booking.kind === "birthday" ? "Aniversário" : "Reserva de mesa"}</h4><dl><div><dt>Data solicitada</dt><dd>{bookingDate(booking.date)}</dd></div><div><dt>Horário</dt><dd>{booking.time || "A informar"}</dd></div><div><dt>Pessoas</dt><dd>{booking.guests || "A informar"}</dd></div>{booking.id && <div><dt>Código</dt><dd>{booking.id}</dd></div>}</dl><span>{bookingStageLabels[booking.stage]}</span><small>{booking.stage === "confirmed" ? "Registro persistido na agenda fictícia desta demonstração." : "Disponibilidade consultada no sistema simulado antes da confirmação."}</small></div>}</div>;
}

export function ConciergeOverview() {
  const agents = [
    { icon: <Sparkles />, name: "Lia · Recepcionista", text: "Entende a intenção, considera o histórico e escolhe o especialista.", label: "PORTA DE ENTRADA" },
    { icon: <ShoppingBag />, name: "Pedidos", text: "Sete itens, entrega ou retirada, frete fictício e confirmação do resumo.", label: "CATÁLOGO VALIDADO" },
    { icon: <CalendarDays />, name: "Reservas", text: "Entende data e horário, consulta a agenda e confirma após o seu consentimento.", label: "AGENDA SIMULADA" },
    { icon: <Cake />, name: "Aniversários", text: "Organiza os convidados, verifica capacidade e registra a comemoração na agenda fictícia.", label: "CAPACIDADE VALIDADA" },
    { icon: <Info />, name: "Informações", text: "Responde a partir da base da unidade. Sem informação, chama a equipe.", label: "FONTE POR UNIDADE" },
    { icon: <Headphones />, name: "Equipe humana", text: "Recebe reclamações, exceções e pedidos de atendente com todo o contexto.", label: "SAÍDA SEMPRE DISPONÍVEL" },
  ];
  return <section className="concierge-overview"><div className="concierge-heading"><div><span className="section-kicker">RECEPÇÃO COM ESPECIALISTAS</span><h2>A conversa certa, com a pessoa certa.</h2><p>CrewAI Flows coordena agentes com responsabilidades delimitadas.</p></div><AssistantConnection /></div><div className="concierge-agents">{agents.map((agent) => <article key={agent.name}><span>{agent.icon}</span><small>{agent.label}</small><h3>{agent.name}</h3><p>{agent.text}</p></article>)}</div><div className="concierge-rules"><span><Check size={14} />Confirmação contextual</span><span><Check size={14} />Dados validados pelo sistema</span><span><Check size={14} />Tempo limite e saída humana</span></div><div className="info-callout">Demo funcional: a IA entende a conversa; agenda, estoque e pedidos fictícios validam e gravam as operações em SQLite. A confirmação depende do resumo atual e da disponibilidade. Grupos acima de 20 pessoas, reclamações e restrições alimentares seguem para a equipe.</div></section>;
}
