"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { Component, useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Check, ChevronLeft, ChevronRight, Coffee, Hand, MessageCircle, Minus, Moon, Move, Pause, Play, Plus, ReceiptText, RotateCcw, ShoppingBag, Sparkles, Sun, Users, Utensils, X } from "lucide-react";
import { initialRestaurant, spots, summary, type RestaurantState, type Spot } from "./restaurant-state";
import type { CameraCommand } from "./restaurant-scene";
import styles from "./cover.module.css";

const RestaurantScene = dynamic(() => import("./restaurant-scene"), { ssr: false });
function subscribeMotion(callback: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
const icons = { table: Utensils, counter: ShoppingBag, lia: MessageCircle, record: ReceiptText };

class SceneBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? null : this.props.children; }
}

export function CoverExperience({ children }: { children: ReactNode }) {
  const reduced = useSyncExternalStore(subscribeMotion, () => window.matchMedia("(prefers-reduced-motion: reduce)").matches, () => false);
  const [paused, setPaused] = useState(false);
  const [state, setState] = useState<RestaurantState>(initialRestaurant);
  const [selected, setSelected] = useState<Spot | null>(null);
  const [command, setCommand] = useState<CameraCommand>({ action: "home", key: 0 });
  const [ready, setReady] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [explored, setExplored] = useState(false);
  const [notice, setNotice] = useState("");
  const [visited, setVisited] = useState<Spot[]>([]);
  const anchors = useRef<Partial<Record<Spot, HTMLButtonElement | null>>>({});
  const dock = useRef<Partial<Record<Spot, HTMLButtonElement | null>>>({});
  const panel = useRef<HTMLElement>(null);
  const motion = !paused && !reduced;
  const details = summary(state);
  const active = spots.find(spot => spot.id === selected);
  const onReady = useCallback(() => setReady(true), []);
  const onFailure = useCallback(() => { setFallback(true); setReady(false); }, []);
  const onExplore = useCallback(() => setExplored(true), []);

  const select = useCallback((spot: Spot) => {
    setSelected(spot); setExplored(true);
    setVisited(previous => previous.includes(spot) ? previous : [...previous, spot]);
    setCommand(previous => ({ action: "focus", spot, key: previous.key + 1 }));
    window.requestAnimationFrame(() => panel.current?.focus({ preventScroll: true }));
  }, []);
  function camera(action: CameraCommand["action"]) {
    setExplored(true);
    setCommand(previous => ({ action, key: previous.key + 1 }));
  }
  function close() {
    if (selected) dock.current[selected]?.focus({ preventScroll: true });
    setSelected(null); camera("home");
  }
  function reset() {
    setState(initialRestaurant); setSelected(null); setVisited([]); setNotice(""); camera("home");
  }
  function reserve() {
    setState(previous => ({ ...previous, reserved: true }));
    setNotice(`Mesa para ${state.people} reservada nesta demonstração.`);
  }
  function prepare() {
    setState(previous => ({ ...previous, order: "preparing" }));
    setNotice("Seu combo está sendo preparado. Olhe o balcão.");
  }
  useEffect(() => {
    if (state.order !== "preparing") return;
    const timer = window.setTimeout(() => {
      setState(previous => previous.order === "preparing" ? { ...previous, order: "ready" } : previous);
      setNotice("Pronto! Seu pedido demonstrativo chegou ao balcão.");
    }, 2800);
    return () => window.clearTimeout(timer);
  }, [state.order, state.dish]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  return <main id="cover-experience" tabIndex={-1} className={styles.cover} data-mood={state.mood} data-motion={motion} data-selected={selected ?? "none"} data-renderer={fallback ? "illustration" : ready ? "webgl" : "loading"}>
    {children}
    <div className={styles.world}>
      <div className={styles.fallbackArt} data-visible={fallback || !ready} aria-hidden="true"><Image src="/cover/restaurant-editorial.webp" alt="" fill sizes="100vw" loading="eager" fetchPriority="high" /></div>
      {!fallback && <SceneBoundary onFailure={onFailure}><RestaurantScene state={state} selected={selected} command={command} motion={motion} anchors={anchors} onReady={onReady} onFailure={onFailure} onSelect={select} onExplore={onExplore} /></SceneBoundary>}
    </div>
    <div className={styles.atmosphere} aria-hidden="true" />

    <div className={styles.worldStatus}><span className={styles.liveDot} /><span>UM RESTAURANTE PARA EXPLORAR</span><i /><span>{state.mood === "day" ? "FIM DE TARDE" : "À LUZ DO JANTAR"}</span></div>
    <div className={styles.moodControls}>
      <button type="button" onClick={() => setState(previous => ({ ...previous, mood: previous.mood === "day" ? "night" : "day" }))} aria-label={state.mood === "day" ? "Acender a noite" : "Voltar ao fim de tarde"} title="Mude a luz do restaurante">{state.mood === "day" ? <Moon size={17} /> : <Sun size={17} />}<span>{state.mood === "day" ? "Acender a noite" : "Fim de tarde"}</span></button>
      <button type="button" onClick={() => setPaused(!paused)} aria-label={paused ? "Retomar animações" : "Pausar animações"} aria-pressed={!motion} disabled={reduced} title={reduced ? "Movimento reduzido pelo sistema" : "Pausar o movimento do salão"}>{motion ? <Pause size={15} /> : <Play size={15} />}</button>
    </div>

    <div className={styles.hotspots} aria-label="Objetos interativos do restaurante">
      {spots.map(spot => {
        const Icon = icons[spot.id];
        return <button ref={element => { anchors.current[spot.id] = element; }} key={spot.id} type="button" className={styles.hotspot} data-spot={spot.id} data-active={selected === spot.id} hidden={spot.id === "record" && selected !== "record"} aria-label={spot.label} onClick={() => select(spot.id)}><span className={styles.hotspotDot}><Icon size={17} strokeWidth={1.6} /></span><span className={styles.hotspotLabel}>{spot.label}<ArrowUpRight size={12} /></span></button>;
      })}
    </div>

    <div className={styles.cameraTools} role="group" aria-label="Controles da câmera" hidden={fallback}>
      <button type="button" aria-label="Girar para a esquerda" onClick={() => camera("left")} title="Girar para a esquerda"><ChevronLeft size={19} /></button>
      <button type="button" aria-label="Aproximar" onClick={() => camera("in")} title="Aproximar"><Plus size={18} /></button>
      <button type="button" aria-label="Afastar" onClick={() => camera("out")} title="Afastar"><Minus size={18} /></button>
      <button type="button" aria-label="Girar para a direita" onClick={() => camera("right")} title="Girar para a direita"><ChevronRight size={19} /></button>
      <span />
      <button type="button" aria-label="Ver o salão inteiro" onClick={() => { setSelected(null); camera("home"); }} title="Ver o salão inteiro"><Move size={17} /></button>
    </div>

    {notice && <div className={styles.toast} role="status"><Check size={16} /><span>{notice}</span></div>}

    {!selected && <div className={styles.welcome}>
      <span className={styles.welcomeEyebrow}>A CASA ESTÁ ABERTA.</span>
      <h2>Sinta-se <em>em casa.</em></h2>
      <p>{explored ? "Cada detalhe abre uma nova possibilidade." : "Um lugar para entrar, mexer e descobrir."}</p>
    </div>}
    {!selected && !explored && <div className={styles.dragHint}><Hand size={18} strokeWidth={1.4} /><span>Arraste para olhar ao redor</span><span className={styles.dragHintLine} /></div>}

    {selected && active && <aside ref={panel} tabIndex={-1} className={styles.panel} aria-label={active.label} onKeyDown={event => { if (event.key === "Escape") close(); }}>
      <div className={styles.panelTop}><span>{active.number} / VOCÊ ESTÁ AQUI</span><button type="button" aria-label="Voltar a explorar" onClick={close}><X size={18} /></button></div>
      {selected === "table" && <>
        <div className={styles.panelIcon}><Utensils size={22} strokeWidth={1.4} /></div>
        <h2>Puxe uma cadeira.</h2><p>Quantas pessoas vêm com você? Veja a mesa se transformar.</p>
        <div className={styles.choices} role="group" aria-label="Número de pessoas">{([2, 4] as const).map(people => <button type="button" key={people} aria-pressed={state.people === people} onClick={() => { setState(previous => ({ ...previous, people, reserved: false })); setNotice(""); }}><Users size={15} />{people} pessoas</button>)}</div>
        <div className={styles.detailRow}><span>Pinheiros</span><span>Amanhã, às 20h</span></div>
        <button type="button" className={styles.primaryAction} disabled={state.reserved} onClick={reserve}>{state.reserved ? <Check size={17} /> : <ArrowRight size={17} />}{state.reserved ? "Sua mesa está marcada" : "Reservar na demonstração"}</button>
        <p className={styles.smallPrint}>Reserva ilustrativa. Experimente o atendimento completo no WhatsApp.</p>
        <Link href="/whatsapp" prefetch={false} className={styles.panelLink}>Conversar com a Lia <ArrowUpRight size={14} /></Link>
      </>}
      {selected === "counter" && <>
        <div className={styles.panelIcon}><Coffee size={24} strokeWidth={1.4} /></div>
        <h2>Saindo um caprichado.</h2><p>Escolha seu combo. A cozinha e o balcão entram em movimento.</p>
        <div className={styles.choices} role="group" aria-label="Escolha seu combo">{([['classic', 'Clássico'], ['veggie', 'Vegetariano']] as const).map(([dish, label]) => <button type="button" key={dish} aria-pressed={state.dish === dish} onClick={() => { setState(previous => ({ ...previous, dish, order: "idle" })); setNotice(""); }}>{state.dish === dish && <Check size={13} />}{label}</button>)}</div>
        <div className={styles.orderProgress} data-status={state.order}><span /><p>{state.order === "idle" ? "Você escolhe. A gente prepara." : state.order === "preparing" ? "Preparando seu combo…" : "Pronto para retirada no balcão."}</p></div>
        <button type="button" className={styles.primaryAction} disabled={state.order === "preparing"} onClick={prepare}><ShoppingBag size={16} />{state.order === "preparing" ? "A cozinha está cuidando" : state.order === "ready" ? "Preparar outro combo" : "Preparar meu combo"}</button>
        <p className={styles.smallPrint}>Preparo simulado nesta experiência. Nenhum pedido real é enviado.</p>
        <button type="button" className={styles.panelLink} onClick={() => select("record")}>Ver na minha comanda <ArrowUpRight size={14} /></button>
      </>}
      {selected === "lia" && <>
        <div className={styles.avatar}>{state.human ? "A" : "L"}<i /></div>
        <h2>{state.human ? "Pode deixar com a Ana." : "Oi, eu sou a Lia."}</h2><p>{state.human ? "A equipe recebe o histórico e continua de onde a conversa parou." : "Eu recebo, organizo e conecto. E quando você precisa de uma pessoa, ela está por perto."}</p>
        <div className={styles.chatBubble}><Sparkles size={14} /><p>{state.human ? "Já estou com seu contexto. Vamos resolver isso juntos?" : state.reserved ? `Sua mesa para ${state.people} está marcada nesta demonstração. Mais alguma coisa?` : "Uma mesa, um pedido ou uma ajuda? Sinta-se à vontade."}</p></div>
        <button type="button" className={styles.primaryAction} onClick={() => { setState(previous => ({ ...previous, human: !previous.human })); setNotice(state.human ? "A Lia voltou a acompanhar a conversa." : "A Ana vem até você. O contexto vai junto."); }}><Users size={16} />{state.human ? "Devolver à Lia" : "Chamar a equipe"}</button>
        {state.human && <div className={styles.handoffStatus}><Check size={13} />Ana assumiu · automação pausada na prévia</div>}
        <Link href="/dashboard" prefetch={false} className={styles.panelLink}>Abrir a central de atendimento <ArrowUpRight size={14} /></Link>
      </>}
      {selected === "record" && <>
        <div className={styles.panelIcon}><ReceiptText size={23} strokeWidth={1.4} /></div>
        <h2>Fica tudo por aqui.</h2><p>As escolhas desta visita, conectadas na mesma história.</p>
        <article className={styles.receipt} aria-label="Comanda demonstrativa"><header>SABOR EXPRESS <span>VISITA / 001</span></header><dl><div><dt>Sua mesa</dt><dd>{details.reservation}</dd></div><div><dt>Seu pedido</dt><dd>{state.order === "idle" ? "Ainda não começou" : details.dish}<small>{details.order}</small></dd></div><div><dt>Com você</dt><dd>{details.owner}</dd></div></dl><footer>MEMÓRIA LOCAL · SEM ENVIO AO CRM</footer></article>
        <Link href="/crm" prefetch={false} className={styles.panelLink}>Conhecer a integração CRM <ArrowUpRight size={14} /></Link>
      </>}
    </aside>}

    <nav id="restaurant-dock" tabIndex={-1} className={styles.dock} aria-label="Explore o restaurante">
      {spots.map(spot => { const Icon = icons[spot.id]; return <button ref={element => { dock.current[spot.id] = element; }} type="button" key={spot.id} aria-pressed={selected === spot.id} onClick={() => select(spot.id)}><Icon size={18} strokeWidth={1.6} /><span>{spot.short}</span><i>{visited.includes(spot.id) ? <Check size={9} /> : spot.number}</i></button>; })}
    </nav>
    <div className={styles.utility}><span><span className={styles.tinyDot} />{fallback ? "MODO ILUSTRADO" : "EXPLORE EM 3D"}</span><button type="button" onClick={() => { setReady(false); setFallback(!fallback); }} aria-label={fallback ? "Ativar versão 3D" : "Ativar versão ilustrada"}>{fallback ? "Tentar 3D" : "Versão leve"}<ArrowDownLeft size={11} /></button><button type="button" aria-label="Recomeçar a visita" onClick={reset}><RotateCcw size={12} /></button></div>
    <span className={styles.demoNote}>UMA EXPERIÊNCIA DEMONSTRATIVA / HEAD OFFICE.AI</span>
    <noscript><div className={styles.noScript}>Ative JavaScript para explorar o salão. Os acessos às aplicações estão em “O projeto”, no canto superior.</div></noscript>
  </main>;
}
