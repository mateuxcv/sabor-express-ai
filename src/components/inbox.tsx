"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent, type SetStateAction } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, BarChart3, Bell, BookOpen, Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clock3, ExternalLink, Headphones, Inbox as InboxIcon, Layers3, Leaf, MapPin, MessageCircle, MoreHorizontal, PanelRightClose, Plug, Plus, Search, Send, Settings2, ShieldCheck, ShoppingBag, SlidersHorizontal, Smile, Sparkles, Users, X } from "lucide-react";
import { Avatar, Brand, FoodArt, MessageThread, Modal } from "./ui";
import { demoActions, useDemo } from "@/lib/demo-store";
import { currency, products, statusLabels, agentLabels, type Conversation } from "@/lib/demo-data";
import { WorkspaceView } from "./workspace-view";
import { ContactDetails } from "./contact-details";
import { CrmWorkspace } from "./crm";
import { SentimentBanner, SentimentDashboard, useSentimentMonitor } from "./sentiment";
import { needsHandoff } from "@/lib/sentiment-contract";
import "@/app/sentiment.css";
import { OrderBreakdown } from "./order-setup";
import { ReplySuggestionButton, ReplySuggestionPanel, useReplySuggestions } from "./reply-suggestions";

type View = "inbox" | "metrics" | "automation" | "knowledge" | "crm";
type Filter = "all" | "human" | "waiting" | "ai" | "resolved";

export function Inbox({ initialView = "inbox", connectionResult }: { initialView?: View; connectionResult?: string }) {
  const shell = useRef<HTMLDivElement>(null);
  const state = useDemo();
  const selected = state.conversations.find((c) => c.id === state.activeId) || state.conversations[0];
  const sentimentMonitor = useSentimentMonitor();
  const [view, setView] = useState<View>(initialView);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [store, setStore] = useState("all");
  const [note, setNote] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const draftRevision = useRef(0);
  const draftKey = `${selected.id}:${note ? "note" : "reply"}`;
  const draft = drafts[draftKey] || "";
  const setDraft = useCallback((value: SetStateAction<string>) => {
    draftRevision.current += 1;
    setDrafts((previous) => ({ ...previous, [draftKey]: typeof value === "function" ? value(previous[draftKey] || "") : value }));
  }, [draftKey]);
  const [details, setDetails] = useState(true);
  const [mobileChat, setMobileChat] = useState(false);
  const [modal, setModal] = useState<"help" | "settings" | "order" | "notifications" | "contact" | "menu" | "indicators" | null>(null);
  const [toast, setToast] = useState("");
  const [reverse, setReverse] = useState(false);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [closeError, setCloseError] = useState<{ id: string; message: string } | null>(null);
  const suggestion = useReplySuggestions({ conversation: selected, enabled: !note && view === "inbox" && closingId === null,
    draft, setDraft, getDraftRevision: () => draftRevision.current });
  const waiting = state.conversations.filter((c) => c.status === "waiting").length;
  const open = state.conversations.filter((c) => c.status !== "resolved").length;
  const filtered = state.conversations.filter((c) => (filter === "all" ? c.status !== "resolved" : c.status === filter) && (store === "all" || c.store.includes(store)) && `${c.name} ${c.topic} ${c.messages.at(-1)?.text}`.toLowerCase().includes(query.toLowerCase()));
  const conversations = (reverse ? [...filtered].reverse() : [...filtered]).sort((a, b) => Number(needsHandoff(b.sentiment) && b.status === "waiting") - Number(needsHandoff(a.sentiment) && a.status === "waiting"));
  const notify = (text: string) => { setToast(text); setTimeout(() => setToast(""), 3200); };
  const changeConversation = (id: string) => { demoActions.select(id); setMobileChat(true); };
  const changeView = (next: View) => { setView(next); setMobileChat(false); };
  const openAlertConversation = (id: string) => { setView("inbox"); setFilter("all"); setQuery(""); setStore("all"); changeConversation(id); setModal(null); };
  const toggleDetails = () => {
    if (window.matchMedia("(max-width: 1279px)").matches) setModal("contact");
    else setDetails(!details);
  };

  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () => {
      const height = Math.round(viewport?.height || window.innerHeight);
      if (!shell.current) return;
      shell.current.style.setProperty("--app-height", `${height}px`);
      shell.current.dataset.density = height < 560 ? "short" : height < 800 ? "compact" : "regular";
    };
    resize();
    viewport?.addEventListener("resize", resize);
    window.addEventListener("resize", resize);
    return () => { viewport?.removeEventListener("resize", resize); window.removeEventListener("resize", resize); };
  }, []);

  function send(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    demoActions.sendAgent(selected.id, draft, note);
    setDraft("");
    if (note) notify("Nota interna adicionada. Visível apenas para a equipe.");
  }

  async function finalize() {
    if (selected.status === "resolved") { demoActions.setStatus(selected.id, "human"); notify("Conversa reaberta."); return; }
    const id = selected.id;
    setClosingId(id); setCloseError(null);
    try { await demoActions.finalizeConversation(id); notify("Conversa finalizada. Pesquisa CSAT disponível para o cliente."); }
    catch (cause) { setCloseError({ id, message: cause instanceof Error ? cause.message : "Não foi possível enviar a pesquisa. Tente novamente." }); }
    finally { setClosingId(null); }
  }

  return <div ref={shell} className={`app-shell ${sentimentMonitor.alerts.some((a) => a.status === "open") ? "has-attention" : ""} ${view === "inbox" ? "inbox-screen" : ""} ${mobileChat && view === "inbox" ? "chat-focused" : ""}`}>
    <aside className="sidebar">
      <Link href="/" className="brand-link" aria-label="Sabor Express início"><Brand /></Link>
      <button className="workspace-picker" onClick={() => setModal("settings")}><span className="workspace-icon"><ShoppingBag size={16} /></span><span>Workspace da rede<small>Sabor Express</small></span><ChevronDown size={14} /></button>
      <div className="nav-label">WORKSPACE</div>
      <nav className="main-nav" aria-label="Navegação principal">
        <button aria-label="Caixa de entrada" title="Caixa de entrada" className={view === "inbox" ? "active" : ""} onClick={() => changeView("inbox")}><InboxIcon size={18} /><span>Caixa de entrada</span><b>{open}</b></button>
        <button aria-label="Visão geral" title="Visão geral" className={view === "metrics" ? "active" : ""} onClick={() => setView("metrics")}><BarChart3 size={18} /><span>Visão geral</span></button>
        <button aria-label="Assistente IA" title="Assistente IA" className={view === "automation" ? "active" : ""} onClick={() => setView("automation")}><Sparkles size={18} /><span>Assistente IA</span><span className="new-dot" /></button>
        <button aria-label="Base de conhecimento" title="Base de conhecimento" className={view === "knowledge" ? "active" : ""} onClick={() => setView("knowledge")}><BookOpen size={18} /><span>Base de conhecimento</span></button>
        <button aria-label="RD Station CRM" title="RD Station CRM" className={view === "crm" ? "active" : ""} onClick={() => changeView("crm")}><Plug size={18} /><span>RD Station CRM</span></button>
      </nav>
      <div className="sidebar-divider" />
      <div className="nav-label label-with-icon">CAIXAS DE ENTRADA <Layers3 size={12} /></div>
      <nav className="secondary-nav" aria-label="Filtros de atendimento">
        <button className={view === "inbox" && filter === "all" ? "selected" : ""} onClick={() => { setView("inbox"); setFilter("all"); }}><span className="channel-dot green" />Todas as conversas<span>{open}</span></button>
        <button className={filter === "human" ? "selected" : ""} onClick={() => { setView("inbox"); setFilter("human"); }}><span className="channel-dot blue-dot" />Atribuídas a mim<span>{state.conversations.filter((c) => c.status === "human").length}</span></button>
        <button className={filter === "waiting" ? "selected" : ""} onClick={() => { setView("inbox"); setFilter("waiting"); }}><span className="channel-dot amber" />Aguardando equipe<span>{waiting}</span></button>
        <button className={filter === "resolved" ? "selected" : ""} onClick={() => { setView("inbox"); setFilter("resolved"); }}><CheckCheck size={14} />Resolvidas<span>{state.conversations.filter((c) => c.status === "resolved").length}</span></button>
      </nav>
      <div className="sidebar-bottom"><div className="pilot-card"><div><span className="live-dot" /> PILOTO EM ANDAMENTO</div><strong>Pequeno começo.<br />Grande impacto.</strong><p>3 unidades. Uma experiência<br />mais próxima do cliente.</p><button onClick={() => setView("metrics")}>Acompanhar resultados <ArrowUpRight size={14} /></button><Leaf className="pilot-leaf" size={75} /></div>
        <button className="bottom-link" onClick={() => setModal("help")}><CircleHelp size={17} />Guia da demonstração<ArrowUpRight size={13} /></button>
        <button className="user-profile" aria-label="Configurações do workspace" onClick={() => setModal("settings")}><Avatar name="AC" color="portrait" small /><span>Ana Carvalho<small>Administradora</small></span><Settings2 size={16} /></button>
      </div>
      <div className="powered">feito para aproximar <span>✳</span> <b>headoffice.ai</b></div>
    </aside>

    <main className={`main-workspace ${mobileChat ? "mobile-chat-open" : ""}`}>
      <header className="topbar"><Link href="/" className="mobile-brand" aria-label="Sabor Express início"><Brand /></Link><div className="breadcrumb">Workspace <ChevronRight size={13} /><strong>{view === "inbox" ? "Caixa de entrada" : view === "metrics" ? "Visão geral" : view === "automation" ? "Assistente IA" : view === "crm" ? "RD Station CRM" : "Base de conhecimento"}</strong></div><div className="topbar-actions"><span className="demo-badge"><span /> Ambiente demo</span><Link className="preview-link" href="/whatsapp" aria-label="Visão do cliente"><MessageCircle size={15} /><span>Visão do cliente</span><ArrowUpRight size={14} /></Link><span className="topbar-separator" /><button className="icon-button notification-button" onClick={() => setModal("notifications")} aria-label="Notificações"><Bell size={18} />{waiting > 0 && <i />}</button><Avatar name="AC" color="portrait" small /></div></header>
      {view === "crm" ? <CrmWorkspace connectionResult={connectionResult} /> : view !== "inbox" ? <WorkspaceView key={view} view={view} onDemo={() => setModal("help")} attention={<SentimentDashboard monitor={sentimentMonitor} onOpen={openAlertConversation} />} /> : <>
        <section className="page-heading"><div><div className="heading-eyebrow"><span className="live-dot" /> CONVERSAS QUE VIRAM CONEXÕES</div><h1>Caixa de entrada<span>.</span></h1><p>Um bom atendimento começa com uma boa conversa.</p></div><div className="heading-controls"><label className="store-selector"><MapPin size={15} /><select aria-label="Filtrar por unidade" value={store} onChange={(e) => setStore(e.target.value)}><option value="all">Todas as unidades</option><option>Pinheiros</option><option>Vila Mariana</option><option>Moema</option></select><ChevronDown size={13} /></label><button className="inbox-indicators-button" aria-label="Ver indicadores do piloto" title="Ver indicadores do piloto" onClick={() => setModal("indicators")}><BarChart3 size={17} /><span>Indicadores</span></button><Link href="/whatsapp" className="primary-button" aria-label="Testar conversa"><Plus size={16} /><span>Testar conversa</span></Link></div></section>
        <section className="stats-strip" aria-label="Indicadores ilustrativos do piloto"><PilotStats /></section>

        <div className={`inbox-layout ${details ? "" : "details-hidden"}`}>
          <section className="conversation-list"><div className="list-heading"><h2>Conversas <span>{filtered.length}</span></h2><button className="icon-button" onClick={() => setReverse(!reverse)} aria-label="Inverter ordem das conversas" title="Inverter ordem"><SlidersHorizontal size={16} /></button></div><div className="search-field"><Search size={15} /><input aria-label="Buscar conversas" placeholder="Buscar uma conversa..." value={query} onChange={(e) => setQuery(e.target.value)} /><kbd>⌕</kbd></div><div className="list-tabs" aria-label="Filtrar conversas por status"><button aria-pressed={filter === "all"} className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Todas <span>{open}</span></button><button aria-pressed={filter === "waiting"} className={filter === "waiting" ? "active" : ""} onClick={() => setFilter("waiting")}>Equipe <span>{waiting}</span></button><button aria-pressed={filter === "ai"} className={filter === "ai" ? "active" : ""} onClick={() => setFilter("ai")}><Sparkles size={12} />IA</button><button aria-pressed={filter === "human"} className={filter === "human" ? "active" : ""} onClick={() => setFilter("human")}>Minhas</button><button aria-pressed={filter === "resolved"} className={filter === "resolved" ? "active" : ""} onClick={() => setFilter("resolved")}>Resolvidas</button></div><div className="list-sort"><span>{filter === "resolved" ? "RESOLVIDAS" : filter === "human" ? "ATRIBUÍDAS A MIM" : "CONVERSAS ATIVAS"}</span><button onClick={() => setReverse(!reverse)}>{reverse ? "Mais antigas" : "Mais recentes"}<ArrowDown size={11} /></button></div><div className="conversation-scroll">{conversations.map((c) => <ConversationItem key={c.id} conversation={c} active={selected.id === c.id} onClick={() => changeConversation(c.id)} />)}{!conversations.length && <div className="empty-state"><Search size={26} /><strong>Nenhuma conversa por aqui</strong><p>Tente outra busca ou unidade.</p><button onClick={() => { setFilter("all"); setQuery(""); setStore("all"); }}>Limpar filtros</button></div>}</div><div className="list-footer"><ShieldCheck size={13} /> Pessoas e IA, trabalhando juntas.</div></section>

          <section className="chat-panel" aria-label={`Conversa com ${selected.name}`}><div className="chat-header"><button className="icon-button mobile-back" aria-label="Voltar às conversas" onClick={() => setMobileChat(false)}><ChevronLeft size={20} /></button><Avatar name={selected.initials} color={selected.color} /><div className="chat-contact"><h2>{selected.name}</h2><span><span className="live-dot" /> WhatsApp <i>·</i> {selected.store.split(" · ")[1]}</span></div><div className="chat-header-actions"><button className="icon-button" title="Detalhes da conversa" aria-label="Alternar detalhes da conversa" onClick={toggleDetails}><PanelRightClose size={17} /></button><button className="resolve-button" disabled={closingId !== null || selected.id === "session-start"} aria-label={selected.status === "resolved" ? "Reabrir" : "Resolver"} title={selected.status === "resolved" ? "Reabrir conversa" : "Finalizar conversa e enviar pesquisa CSAT"} onClick={() => void finalize()}><Check size={15} /><span>{closingId === selected.id ? "Finalizando…" : selected.status === "resolved" ? "Reabrir" : "Finalizar"}</span></button></div></div>
            {closeError?.id === selected.id && <div className="crm-error csat-close-error" role="alert">{closeError.message} Clique em Finalizar para tentar novamente.</div>}
            <SentimentBanner key={selected.id} conversation={selected} />
            <div className={`ai-status-bar ${selected.status === "waiting" ? "waiting-bar" : ""}`}><span><Sparkles size={14} /><strong>{selected.status === "ai" ? "A assistente está cuidando dessa conversa" : selected.status === "waiting" ? "Essa conversa precisa do seu toque humano" : selected.status === "human" ? "Você está no controle · Assistente pausada" : "Tudo certo por aqui. Conversa resolvida."}</strong></span>{selected.status === "ai" || selected.status === "waiting" ? <button onClick={() => demoActions.setStatus(selected.id, "human")}>Assumir <ArrowRight size={13} /></button> : selected.status === "human" && <button disabled={!state.automation || needsHandoff(selected.sentiment)} title={needsHandoff(selected.sentiment) ? "Resolva o alerta antes de devolver à IA" : undefined} onClick={() => demoActions.setStatus(selected.id, "ai")}>Devolver à IA <ArrowRight size={13} /></button>}</div>
            {selected.routing && <div className="chat-routing"><span><Sparkles size={12} />Recepção <ArrowRight size={10} />{agentLabels[selected.routing.agent]}</span><small>{selected.routing.source === "crewai" ? "CrewAI" : selected.routing.source === "fallback" ? "Contingência" : "Demo local"}</small></div>}
            <MessageThread key={`${selected.id}-${mobileChat}`} conversation={selected} />
            <form className={`composer ${note ? "note-composer" : ""}`} onSubmit={send}>
              <div className="composer-type"><button type="button" className={!note ? "active" : ""} onClick={() => setNote(false)}><MessageCircle size={13} />Responder</button><button type="button" className={note ? "active" : ""} onClick={() => setNote(true)}>Nota interna</button><span>{note ? "Somente sua equipe" : "WhatsApp"}</span></div>
              <ReplySuggestionPanel control={suggestion} />
              <textarea data-lt-active="false" data-gramm="false" aria-label={note ? "Escrever nota interna" : "Escrever resposta"} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={note ? "Adicione um contexto para a equipe..." : "Escreva sua mensagem. Um toque humano faz a diferença."} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(e); } }} />
              <div className="composer-toolbar"><div><button type="button" className="icon-button" aria-label="Adicionar emoji" onClick={() => setDraft((v) => `${v} 💚`)}><Smile size={17} /></button><ReplySuggestionButton control={suggestion} /></div><button type="submit" className="send-button" disabled={!draft.trim()}>{note ? "Adicionar" : "Enviar"}<Send size={13} /></button></div>
            </form>
            <div className="composer-hint"><span>↵ para enviar</span><span>Shift + ↵ para nova linha</span><ShieldCheck size={11} /></div>
          </section>

          {details && <aside className="contact-panel"><div className="details-heading"><h2>Detalhes do contato</h2><button className="icon-button" aria-label="Fechar detalhes" onClick={() => setDetails(false)}><X size={15} /></button></div><ContactDetails conversation={selected} onOpenOrder={() => setModal("order")} /></aside>}
        </div>
      </>}
    </main>
    <nav className="mobile-nav" aria-label="Navegação mobile">
      <button aria-label="Caixa de entrada" aria-current={view === "inbox" ? "page" : undefined} onClick={() => changeView("inbox")}><InboxIcon size={21} /><span>Conversas</span>{waiting > 0 && <i aria-label={`${waiting} aguardando`}>{waiting}</i>}</button>
      <button aria-label="Visão geral" aria-current={view === "metrics" ? "page" : undefined} onClick={() => changeView("metrics")}><BarChart3 size={21} /><span>Visão geral</span></button>
      <button aria-label="Assistente IA" aria-current={view === "automation" ? "page" : undefined} onClick={() => changeView("automation")}><Sparkles size={21} /><span>Assistente</span></button>
      <button aria-label="Base de conhecimento" aria-current={view === "knowledge" ? "page" : undefined} onClick={() => changeView("knowledge")}><BookOpen size={21} /><span>Base</span></button>
      <button aria-label="Mais opções" aria-expanded={modal === "menu"} onClick={() => setModal("menu")}><MoreHorizontal size={21} /><span>Mais</span></button>
    </nav>
    {toast && <div className="toast" role="status"><CheckCheck size={17} />{toast}</div>}
    {modal && <Modal title={modal === "help" ? "Uma demo. Duas perspectivas." : modal === "settings" ? "Seu workspace" : modal === "notifications" ? "Central de notificações" : modal === "contact" ? "Detalhes da conversa" : modal === "menu" ? "Seu workspace" : modal === "indicators" ? "Indicadores do piloto" : `Pedido #${selected.order?.id}`} className={modal === "contact" ? "contact-dialog" : modal === "menu" ? "workspace-menu-dialog" : ""} onClose={() => setModal(null)}>
      {modal === "notifications" && <SentimentDashboard monitor={sentimentMonitor} onOpen={openAlertConversation} compact />}
      {modal === "indicators" && <div className="inbox-stats-dialog"><PilotStats /></div>}
      {modal === "contact" && <ContactDetails conversation={selected} onOpenOrder={() => setModal("order")} />}
      {modal === "menu" && <div className="workspace-mobile-menu"><div className="mobile-account"><Avatar name="AC" color="portrait" /><span><strong>Ana Carvalho</strong><small>Administradora · Sabor Express</small></span></div><button onClick={() => setModal("settings")}><Settings2 size={19} /><span>Configurações do workspace</span><ChevronRight size={16} /></button><button onClick={() => { changeView("crm"); setModal(null); }}><Plug size={19} /><span>RD Station CRM</span><ChevronRight size={16} /></button><button onClick={() => setModal("help")}><CircleHelp size={19} /><span>Guia da demonstração</span><ChevronRight size={16} /></button><Link href="/whatsapp"><MessageCircle size={19} /><span>Abrir visão do cliente</span><ArrowUpRight size={16} /></Link></div>}
      {modal === "help" && <><div className="modal-hero-icon"><MessageCircle size={27} /></div><p>Experimente o atendimento da Sabor Express do primeiro “oi” ao pedido confirmado.</p><ol className="demo-steps"><li><b>Seja o cliente.</b> Abra a visão do cliente e escolha um combo ou envie uma mensagem.</li><li><b>Conheça a recepção.</b> Diga “aniversário amanhã às sete da noite”, informe a quantidade e confirme o resumo. A agenda fictícia valida e registra.</li><li><b>Teste o toque humano.</b> Envie “Meu pedido está atrasado”, volte ao inbox e assuma a conversa.</li><li><b>Mostre o resultado.</b> Confira no inbox os dados e as validações feitas pelo sistema.</li></ol><div className="info-callout">As telas sincronizam neste navegador, inclusive em abas diferentes. O indicador informa o modo ativo. No CrewAI, a IA usa agenda, pedidos e estoque fictícios com persistência. Não há envio ao WhatsApp ou cobrança real.</div><Link href="/whatsapp" className="primary-button full-width">Experimentar como cliente <ArrowUpRight size={16} /></Link></>}
      {modal === "settings" && <><div className="settings-account"><Brand /><span className="demo-badge">Workspace demonstrativo</span></div><div className="settings-row"><span>Equipe<strong>Ana Carvalho · Administradora</strong></span><Users size={19} /></div><div className="settings-row"><span>Unidades do piloto<strong>Pinheiros, Vila Mariana e Moema</strong></span><MapPin size={19} /></div><div className="settings-row"><span>Respostas automáticas<strong>{state.automation ? "Ativadas" : "Pausadas globalmente"}</strong></span><button className={`toggle ${state.automation ? "on" : ""}`} role="switch" aria-checked={state.automation} aria-label="Respostas automáticas" onClick={demoActions.toggleAutomation}><span /></button></div><div className="info-callout">O histórico desta sessão fica neste navegador. A limpeza remove conversas, pedidos e dados de reservas, inclusive nas outras abas abertas.</div><button className="danger-button" onClick={() => { if (window.confirm("Limpar o histórico desta sessão? As conversas, pedidos e dados de reservas deste navegador serão apagados.")) { demoActions.clearSession(); setDraft(""); setFilter("all"); setQuery(""); setStore("all"); setModal(null); notify("Sessão limpa. Você pode iniciar uma nova conversa."); } }}>Limpar histórico da sessão</button></>}
      {modal === "notifications" && <>{state.conversations.filter((c) => c.status === "waiting").map((c) => <button className="notification-item" key={c.id} onClick={() => { changeConversation(c.id); setView("inbox"); setModal(null); }}><Avatar name={c.initials} color={c.color} /><span><strong>{c.name} precisa da equipe</strong><small>{c.topic} · {c.store.split(" · ")[1]}</small></span><ChevronRight size={16} /></button>)}{!waiting && <div className="empty-state"><CheckCheck size={32} /><strong>Tudo em dia!</strong><p>Nenhuma conversa aguardando a equipe.</p></div>}</>}
      {modal === "order" && selected.order && <>
        <div className="order-modal-art"><FoodArt variant={products.find((p) => p.name === selected.order?.product)?.id} /></div>
        <div className="order-modal-title"><h3>{selected.order.quantity || 1}× {selected.order.product}</h3><strong>{currency(selected.order.price)}</strong></div>
        <div className="settings-row"><span>Status<strong>{selected.order.status}</strong></span><ShoppingBag size={19} /></div>
        <div className="settings-row"><span>Cliente<strong>{selected.name}</strong></span><Users size={19} /></div>
        <OrderBreakdown order={selected.order} store={selected.store} />
        <div className="info-callout">Pedido demonstrativo. Entrega, frete e prazos são fictícios; nenhuma cobrança ou entrega real é realizada. Confirme o resumo na visão do cliente.</div>
        <Link href="/whatsapp" className="primary-button full-width">Abrir visão do cliente<ExternalLink size={14} /></Link>
      </>}
    </Modal>}
  </div>;
}

function MiniStat({ icon, value, label, change }: { icon: React.ReactNode; value: string; label: string; change: string }) {
  return <div className="mini-stat"><span className="stat-icon">{icon}</span><div><span className="stat-label">{label}</span><div className="stat-value">{value}<span>{change.startsWith("−") ? <ArrowDown size={10} /> : <ArrowUpRight size={10} />}{change}</span></div></div></div>;
}

function PilotStats() {
  return <><div className="stats-cards"><MiniStat icon={<MessageCircle size={17} />} value="148" label="Conversas hoje" change="+12%" /><MiniStat icon={<Sparkles size={17} />} value="76%" label="Resolvidas pela IA" change="+8%" /><MiniStat icon={<Clock3 size={17} />} value="8s" label="Primeira resposta" change="−98%" /><MiniStat icon={<ShoppingBag size={17} />} value="R$ 2.870" label="Pedidos assistidos" change="+18%" /></div><span className="stats-demo">Dados ilustrativos <CircleHelp size={11} /></span></>;
}

function ConversationItem({ conversation: c, active, onClick }: { conversation: Conversation; active: boolean; onClick: () => void }) {
  const last = c.messages.filter((m) => m.author !== "event" && m.author !== "note").at(-1);
  return <button className={`conversation-item ${active ? "active" : ""}`} disabled={c.id === "session-start"} onClick={onClick}>
    <div className="conversation-avatar"><Avatar name={c.initials} color={c.color} /><span><MessageCircle size={10} /></span></div>
    <div className="conversation-preview"><div className="conversation-name"><strong>{c.name}</strong><time>{last?.time}</time></div>
      <p>{last?.author === "ai" && <Sparkles size={11} />}{last?.text}</p>
      {c.sentiment && c.sentiment.status !== "resolved" && <span className="sentiment-priority"><Bell size={10} />{c.sentiment.level === "high" ? "Prioridade alta" : "Atenção"} · {c.sentiment.category === "human_request" ? "Humano solicitado" : "Possível insatisfação"}</span>}
      <div className="conversation-meta"><span className={`tiny-status ${c.status}`}>{c.status === "ai" ? <Sparkles size={10} /> : c.status === "waiting" ? <Clock3 size={10} /> : c.status === "human" ? <Headphones size={10} /> : <Check size={10} />}{statusLabels[c.status]}</span><span className="conversation-store">{c.store.split(" · ")[1]}</span>{c.unread > 0 && <b className="unread-count">{c.unread}</b>}</div>
    </div>
  </button>;
}
