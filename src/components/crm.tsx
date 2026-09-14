"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowUpRight, Check, CheckCheck, CircleAlert, Clock3, Link2, LoaderCircle, Plug, RefreshCw, Save, UserRound } from "lucide-react";
import { crmStatusSchema, customerProfileSchema, type CrmEvent, type CrmStatus } from "@/lib/crm-contract";
import { demoActions } from "@/lib/demo-store";
import type { Conversation } from "@/lib/demo-data";
import { Modal } from "./ui";

async function crmAction(body: unknown) {
  const response = await fetch("/api/crm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Não foi possível atualizar o CRM.");
  return data;
}

function useCrmStatus(conversationId?: string, revision?: string) {
  const [data, setData] = useState<CrmStatus | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((value) => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetch(`/api/crm${conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : ""}`, { cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "CRM indisponível");
        if (!controller.signal.aborted) { setData(crmStatusSchema.parse(body)); setError(""); }
      } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Falha na integração."); }
      finally { inFlight = false; }
    };
    void load();
    const timer = setInterval(() => void load(), 8000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [conversationId, version, revision]);
  return { data, error, refresh };
}

const eventLabels: Record<CrmEvent["status"], string> = { pending: "Na fila", processing: "Sincronizando", synced: "Sincronizado", blocked: "Ação necessária", failed: "Falha", uncertain: "Conferir no CRM", skipped: "Somente local" };
const eventTitles: Record<string, string> = { "reservation.confirmed": "Reserva confirmada", "order.confirmed": "Pedido confirmado", "call.completed": "Resumo de ligação", "csat.answered": "Avaliação CSAT", "sentiment.alerted": "Alerta de atendimento prioritário" };

export function CustomerProfileDialog({ conversation, onClose }: { conversation: Conversation; onClose: () => void }) {
  const [name, setName] = useState(conversation.name === "Você" ? "" : conversation.name);
  const [phone, setPhone] = useState(conversation.phone);
  const [email, setEmail] = useState(conversation.email || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const profile = customerProfileSchema.parse(await crmAction({ action: "customer", conversationId: conversation.id, name, phone, email }));
      demoActions.saveCustomer(conversation.id, profile); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar."); }
    finally { setSaving(false); }
  }
  return <Modal title="Identificação do cliente" onClose={onClose} className="customer-profile-dialog"><form className="crm-form" onSubmit={submit}>
    <p>Use um perfil fictício para demonstrar o vínculo entre esta conversa e o contato no RD Station CRM.</p>
    <label>Nome<input required minLength={2} maxLength={100} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do cliente" /></label>
    <label>Telefone<input required type="tel" autoComplete="tel" maxLength={40} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+55 (11) 99999-0000" /></label>
    <label>E-mail <small>opcional</small><input type="email" autoComplete="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cliente@example.com" /></label>
    {error && <div className="crm-error" role="alert">{error}</div>}
    <button className="primary-button" disabled={saving}>{saving ? <LoaderCircle size={16} /> : <Save size={16} />}{saving ? "Salvando…" : "Salvar cliente"}</button>
  </form></Modal>;
}

export function CrmContactCard({ conversation }: { conversation: Conversation }) {
  const revision = `${conversation.customerId}-${conversation.booking?.id}-${conversation.booking?.stage}-${conversation.order?.id}-${conversation.order?.confirmed}-${conversation.call?.status}`;
  const { data, error, refresh } = useCrmStatus(conversation.id, revision);
  const [editing, setEditing] = useState(false);
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const operations = data?.events.filter((event) => event.type === "reservation.confirmed" || event.type === "order.confirmed" || event.type === "csat.answered" || event.type === "sentiment.alerted") || [];
  const missingOperation = (conversation.booking?.stage === "confirmed" && !operations.some((event) => event.reference === conversation.booking?.id)) || (conversation.order?.confirmed && !operations.some((event) => event.reference === conversation.order?.id));
  const callActive = conversation.call?.status === "active" || conversation.call?.status === "connecting";
  async function enqueue() {
    setBusy(true); setActionError("");
    try { await crmAction({ action: "enqueue", conversationId: conversation.id }); refresh(); }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : "Falha ao enfileirar."); }
    finally { setBusy(false); }
  }
  return <section className="detail-section crm-contact-card"><h3><Plug size={15} />RD Station CRM<Link href="/crm" aria-label="Configurar RD Station CRM"><ArrowUpRight size={14} /></Link></h3>
    {!operations.length && <><span className={`crm-badge ${data?.connected ? "synced" : "pending"}`}>{data?.connected ? "Conectado" : "Conexão pendente"}</span><p>Pedidos, reservas e aniversários confirmados entram na fila de sincronização.</p></>}
    {error && <p className="crm-error" role="alert">{error}</p>}
    {operations.map((event) => <div key={event.id} className="crm-contact-operation">
      <span className={`crm-badge ${event.status}`}>{eventLabels[event.status]}</span>
      <p>{eventTitles[event.type]} · {event.reference}</p>
      {event.error && <p className="crm-error">{event.error}</p>}
      {event.dealUrl && <a className="crm-text-link" href={event.dealUrl} target="_blank" rel="noopener noreferrer">Ver negociação no RD <ArrowUpRight size={12} /></a>}
      {["blocked", "failed", "uncertain"].includes(event.status) && <Link className="crm-text-link" href="/crm">Revisar na fila do CRM <ArrowUpRight size={12} /></Link>}
    </div>)}
    {!data?.connected && <Link className="crm-text-link" href="/crm">Conectar e configurar <ArrowUpRight size={12} /></Link>}
    <button className="crm-secondary-button" disabled={callActive} onClick={() => setEditing(true)}><UserRound size={13} />{conversation.customerId ? "Editar cliente" : "Identificar cliente"}</button>
    {missingOperation && <button className="crm-secondary-button" disabled={busy} onClick={() => void enqueue()}><RefreshCw size={13} />Sincronizar confirmações</button>}
    {actionError && <p className="crm-error" role="alert">{actionError}</p>}
    {editing && <CustomerProfileDialog conversation={conversation} onClose={() => { setEditing(false); refresh(); }} />}
  </section>;
}

function MappingForm({ store, data, onSaved }: { store: string; data: CrmStatus; onSaved: () => void }) {
  const existing = data.mappings.find((mapping) => mapping.store === store);
  const [pipelineId, setPipeline] = useState(existing?.pipelineId || "");
  const [stageId, setStage] = useState(existing?.stageId || "");
  const [ownerId, setOwner] = useState(existing?.ownerId || "");
  const [options, setOptions] = useState<{ pipelines: Array<{ id: string; name: string }>; users: Array<{ id: string; name: string }> }>({ pipelines: [], users: [] });
  const [stages, setStages] = useState<Array<{ id: string; name: string }>>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/crm?options=true", { signal: controller.signal }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); return body; }).then(setOptions).catch((cause) => { if (!controller.signal.aborted) setError(cause.message || "Falha ao carregar opções."); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!pipelineId) return;
    const controller = new AbortController();
    fetch(`/api/crm?options=true&pipelineId=${pipelineId}`, { signal: controller.signal }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); return body; }).then((body) => setStages(body.stages)).catch((cause) => { if (!controller.signal.aborted) setError(cause.message || "Falha ao carregar etapas."); });
    return () => controller.abort();
  }, [pipelineId]);
  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try { await crmAction({ action: "mapping", store, pipelineId, stageId, ownerId }); setNotice("Mapeamento salvo. A fila será processada automaticamente."); onSaved(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar."); }
    finally { setSaving(false); }
  }
  return <form className="crm-form crm-mapping-form" onSubmit={save}>
    <label>Funil<select required value={pipelineId} onChange={(e) => { setPipeline(e.target.value); setStage(""); setStages([]); }}><option value="">Selecione o funil</option>{options.pipelines.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label>Etapa para pedidos e reservas confirmados<select required disabled={!pipelineId} value={stageId} onChange={(e) => setStage(e.target.value)}><option value="">Selecione a etapa</option>{stages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label>Responsável pela unidade<select required value={ownerId} onChange={(e) => setOwner(e.target.value)}><option value="">Selecione o responsável</option>{options.users.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    {error && <div className="crm-error" role="alert">{error}</div>}{notice && <div className="crm-success" role="status">{notice}</div>}
    <button className="primary-button" disabled={saving || !pipelineId || !stageId || !ownerId}><Save size={15} />{saving ? "Salvando…" : "Salvar mapeamento"}</button>
  </form>;
}

export function CrmWorkspace({ connectionResult }: { connectionResult?: string }) {
  const { data, error, refresh } = useCrmStatus();
  const [store, setStore] = useState("São Paulo · Pinheiros");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState("");
  const resultMessages: Record<string, string> = { connected: "Conta conectada. Agora selecione o funil e o responsável de cada unidade.", cancelled: "A autorização foi cancelada.", invalid_state: "A autorização expirou ou pertence a outra aba. Inicie a conexão novamente.", configuration_error: "Confira as credenciais e o callback no .env e reinicie o serviço.", authorization_failed: "O RD não aceitou a autorização. Confira o aplicativo e tente novamente.", service_unavailable: "O serviço de integração não respondeu. Tente novamente.", invalid_code: "O código de autorização não foi recebido. Conecte novamente." };
  async function retry(eventId: string) {
    setBusy(eventId); setActionError("");
    try { await crmAction({ action: "retry", eventId }); refresh(); }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : "Falha ao reprocessar."); }
    finally { setBusy(""); }
  }
  async function disconnect() {
    setBusy("disconnect"); setActionError("");
    try { await crmAction({ action: "disconnect" }); refresh(); }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : "Falha ao desconectar."); }
    finally { setBusy(""); }
  }
  return <div className="workspace-view crm-workspace"><div className="view-title"><span className="heading-eyebrow"><span className="live-dot" /> ATENDIMENTO QUE CHEGA AO COMERCIAL</span><h1>RD Station CRM<span>.</span></h1><p>Pedidos, reservas e relacionamentos registrados a partir da conversa.</p></div>
    {connectionResult && resultMessages[connectionResult] && <div className={connectionResult === "connected" ? "crm-success" : "crm-error"} role="status">{resultMessages[connectionResult]}</div>}
    <section className="crm-connection-card"><div className="crm-logo-mark">rd</div><div><h2>{data?.connected ? "Seu CRM está conectado" : "Conecte sua conta do CRM"}</h2><p>Pedidos, reservas confirmadas e resumos de ligações são sincronizados em segundo plano.</p><span className={`crm-badge ${data?.connected ? "synced" : "pending"}`}>{data?.connected ? <><CheckCheck size={12} />OAuth conectado</> : "Aguardando conexão"}</span></div><div className="crm-connection-actions">{data?.configured && !data.connected ? <a className="primary-button" href="/api/crm/connect"><Link2 size={15} />Conectar RD Station CRM</a> : data?.connected && <button className="crm-secondary-button" disabled={!!busy} onClick={() => void disconnect()}>Desconectar</button>}<button className="crm-secondary-button" onClick={refresh}><RefreshCw size={14} />Atualizar status</button></div></section>
    {!data?.configured && <div className="info-callout"><strong>Configure no .env da raiz</strong><p>RD_CRM_CLIENT_ID · RD_CRM_CLIENT_SECRET · RD_CRM_REDIRECT_URI</p><p>Cadastre um aplicativo do produto CRM no <a href="https://appstore.rdstation.com/pt-BR/publisher" target="_blank" rel="noopener noreferrer">App Publisher da RD</a>. Depois de preencher as variáveis, reinicie os serviços e volte aqui.</p>{data?.configurationMessage && <small>{data.configurationMessage}</small>}</div>}
    {(error || actionError) && <div className="crm-error" role="alert">{actionError || error}</div>}
    {data?.connected && <section className="crm-mapping-card"><div className="section-title"><h2>Destino por unidade</h2><span>Negociações abertas · confirmação representada pela etapa</span></div><div className="crm-unit-tabs">{["Pinheiros", "Vila Mariana", "Moema"].map((unit) => <button key={unit} aria-pressed={store.endsWith(unit)} className={store.endsWith(unit) ? "active" : ""} onClick={() => setStore(`São Paulo · ${unit}`)}>{unit}</button>)}</div><MappingForm key={store} store={store} data={data} onSaved={refresh} /></section>}
    <div className="section-title"><h2>Fila de sincronização</h2><span>{data?.events.length || 0} eventos recentes</span></div><div className="crm-event-list">{data?.events.map((event) => <article className="crm-event" key={event.id}><span className={`crm-event-icon ${event.status}`}>{event.status === "synced" ? <Check size={18} /> : event.status === "pending" || event.status === "processing" ? <Clock3 size={18} /> : <CircleAlert size={18} />}</span><div><h3>{eventTitles[event.type] || event.type}<span className={`crm-badge ${event.status}`}>{eventLabels[event.status]}</span></h3><p>{event.reference}</p>{event.error && <p className="crm-event-error">{event.error}</p>}<small>{new Date(event.createdAt * 1000).toLocaleString("pt-BR")} · {event.attempts} tentativa(s)</small></div><div className="crm-event-actions">{event.dealUrl && <a href={event.dealUrl} target="_blank" rel="noopener noreferrer">Ver no RD <ArrowUpRight size={13} /></a>}{["blocked", "failed", "uncertain"].includes(event.status) && <button disabled={!!busy} onClick={() => void retry(event.id)}><RefreshCw size={13} />{busy === event.id ? "Enfileirando…" : "Reprocessar"}</button>}</div></article>)}{data && !data.events.length && <div className="empty-state"><Plug size={30} /><strong>A primeira confirmação conecta tudo</strong><p>Identifique o cliente, confirme um pedido ou reserva e acompanhe a sincronização aqui.</p></div>}{!data && !error && <div className="empty-state"><LoaderCircle size={24} /><p>Carregando integração…</p></div>}</div>
  </div>;
}
