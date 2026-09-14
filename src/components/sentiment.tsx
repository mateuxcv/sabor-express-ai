"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowUpRight, RefreshCw } from "lucide-react";
import { demoActions, useDemo } from "@/lib/demo-store";
import { sentimentAction, sentimentAlertSchema, sentimentDashboardSchema, sentimentTitle, type SentimentAlert } from "@/lib/sentiment-contract";
import type { Conversation } from "@/lib/demo-data";

const crmLabels: Record<string, string> = { pending: "Na fila do RD", processing: "Sincronizando com RD", synced: "Anotação e tarefa registradas no RD", blocked: "Ação necessária no CRM", failed: "Falha no CRM", uncertain: "Conferir no CRM" };

export function useSentimentMonitor() {
  const [alerts, setAlerts] = useState<SentimentAlert[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [version, setVersion] = useState(0);
  const state = useDemo();
  const localIds = state.conversations.filter((c) => c.sentiment && c.sentiment.status !== "resolved").map((c) => c.id).sort().join("\n");
  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    async function load() {
      if (busy) return;
      busy = true;
      try {
        const response = await fetch("/api/sentiment", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Não foi possível atualizar os alertas. Confira o serviço Python.");
        const body = sentimentDashboardSchema.parse(await response.json());
        if (controller.signal.aborted) return;
        setAlerts(body.alerts); setError(""); setLoaded(true);
        body.alerts.forEach(demoActions.syncSentiment);
        // Também reconcilia alertas resolvidos no servidor que ainda estavam no navegador.
        for (const id of localIds.split("\n").filter(Boolean)) {
          if (body.alerts.some((alert) => alert.conversationId === id)) continue;
          const result = await fetch(`/api/sentiment?conversationId=${encodeURIComponent(id)}`, { cache: "no-store", signal: controller.signal });
          if (!result.ok) continue;
          const { alert } = await result.json();
          if (alert && !controller.signal.aborted) demoActions.syncSentiment(sentimentAlertSchema.parse(alert));
        }
      } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Monitor indisponível."); }
      finally { busy = false; }
    }
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [version, localIds]);
  return { alerts, error, loaded, refresh: () => setVersion((n) => n + 1) };
}

function WaitingTime({ alert }: { alert: SentimentAlert }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 10000); return () => clearInterval(timer); }, []);
  if (alert.status === "resolved") return <span>Ocorrência resolvida</span>;
  if (alert.status === "acknowledged") return <span>Em acompanhamento · {alert.ownerName || "Equipe"}</span>;
  if (!alert.waitingSince) return <span>Monitorando os próximos sinais</span>;
  const minutes = Math.max(0, Math.floor((now / 1000 - alert.waitingSince) / 60));
  return <span>Aguardando humano {minutes ? `há ${minutes} min` : "há menos de 1 min"}</span>;
}

function AlertContent({ alert }: { alert: SentimentAlert }) {
  return <>
    <strong className="sentiment-title"><AlertTriangle size={16} />{sentimentTitle(alert)} <small>{alert.level === "high" ? "Prioridade alta" : "Atenção"}</small></strong>
    <p>{alert.reason}</p><blockquote>{alert.evidence}</blockquote>
    <div className="sentiment-details"><WaitingTime alert={alert} /><span>{alert.source === "model" ? "Análise contextual por IA" : alert.source === "rules_fallback" ? "Regras de contingência · IA indisponível" : "Detecção por regras"}</span></div>
    <div className="sentiment-crm"><span>{alert.crmStatus ? crmLabels[alert.crmStatus] || alert.crmStatus : "Monitoramento local"}</span>
      {alert.dealUrl && <a href={alert.dealUrl} target="_blank" rel="noopener noreferrer">Ver no RD <ArrowUpRight size={13} /></a>}
      {alert.taskId && <small>ID da tarefa: {alert.taskId}</small>}
      {alert.crmError && <p>{alert.crmError} <a href="/crm">Revisar integração</a></p>}
    </div>
  </>;
}

export function SentimentBanner({ conversation }: { conversation: Conversation }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const alert = conversation.sentiment;
  async function resolve() {
    setBusy(true); setError("");
    try { await demoActions.resolveSentiment(conversation.id); }
    catch { setError("Não foi possível resolver o alerta. Tente novamente."); }
    finally { setBusy(false); }
  }
  return <>
    {conversation.sentimentError && <div className="sentiment-error" role="alert">{conversation.sentimentError}<button onClick={() => demoActions.retrySentiment(conversation.id)}>Tentar análise novamente</button></div>}
    {alert && alert.status !== "resolved" && <section className={`sentiment-banner ${alert.level}`} aria-label="Alerta de atendimento" role="status">
      <AlertContent alert={alert} />
      {error && <p role="alert">{error}</p>}
      <div className="sentiment-actions">
        {conversation.status !== "human" && conversation.status !== "resolved" && <button onClick={() => demoActions.setStatus(conversation.id, "human")}>Assumir atendimento</button>}
        <button disabled={busy} onClick={() => void resolve()}>{busy ? "Salvando…" : "Marcar alerta como resolvido"}</button>
      </div>
    </section>}
  </>;
}

export function SentimentDashboard({ monitor, onOpen, compact = false }: { monitor: ReturnType<typeof useSentimentMonitor>; onOpen: (id: string) => void; compact?: boolean }) {
  const { alerts, error, loaded, refresh } = monitor;
  const [store, setStore] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const state = useDemo();
  const filtered = alerts.filter((alert) => !store || alert.store === store);
  async function assume(alert: SentimentAlert) {
    setBusy(alert.id); setActionError("");
    try {
      demoActions.syncSentiment(await sentimentAction(alert.id, "acknowledge"));
      if (state.conversations.some((c) => c.id === alert.conversationId)) {
        demoActions.setStatus(alert.conversationId, "human"); onOpen(alert.conversationId);
      }
      refresh();
    } catch { setActionError("Não foi possível registrar o acompanhamento. Tente novamente."); }
    finally { setBusy(null); }
  }
  return <section className={`sentiment-dashboard ${compact ? "compact" : ""}`} aria-label="Clientes que precisam de atenção">
    <div className="section-title"><div><h2>Clientes que precisam de atenção</h2><p>Detecção preventiva durante a conversa · atualização a cada 5 segundos</p></div><button className="icon-button" onClick={refresh} aria-label="Atualizar alertas"><RefreshCw size={17} /></button></div>
    {!compact && <div className="sentiment-filters"><label>Unidade<select aria-label="Unidade dos alertas" value={store} onChange={(e) => setStore(e.target.value)}><option value="">Todas as unidades</option>{["Pinheiros", "Vila Mariana", "Moema"].map((s) => <option key={s} value={`São Paulo · ${s}`}>{s}</option>)}</select></label><b>{filtered.filter((a) => a.level === "high" && a.status === "open").length} aguardando humano</b><span>{filtered.filter((a) => a.status === "acknowledged").length} em acompanhamento</span></div>}
    {(error || actionError) && <p className="sentiment-error" role="alert">{actionError || error}{error && loaded ? " Exibindo a última atualização disponível." : ""}</p>}
    {!loaded && !error && <p>Carregando alertas…</p>}
    {loaded && !filtered.length && <p className="sentiment-empty">Nenhum alerta ativo{store ? " nesta unidade" : ""}.</p>}
    <div className="sentiment-cards">{filtered.map((alert) => {
      const local = state.conversations.some((c) => c.id === alert.conversationId);
      return <article className={`sentiment-card ${alert.level}`} key={alert.id}>
        <header><strong>{alert.customerName}</strong><span>{alert.store}</span><time>{new Date(alert.createdAt * 1000).toLocaleString("pt-BR")}</time></header>
        <AlertContent alert={alert} />
        <div className="sentiment-actions">{alert.status === "open" && <button disabled={busy !== null} onClick={() => void assume(alert)}>{busy === alert.id ? "Salvando…" : local ? "Assumir atendimento" : "Registrar acompanhamento"}</button>}{local && <button onClick={() => onOpen(alert.conversationId)}>Abrir conversa</button>}</div>
        {!local && <small>Histórico de chat disponível no navegador de origem. O alerta permanece salvo no servidor.</small>}
      </article>;
    })}</div>
  </section>;
}
