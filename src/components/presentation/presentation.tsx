'use client';

/* Static, locally optimized images keep the exact same URL in preloads and slides. */
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, Expand, EyeOff, Grid2X2, Maximize, Minimize, NotebookPen, X } from 'lucide-react';
import { agenda, cadence, closing, demoLinks, demoSteps, englishPitch, facts, media, metrics, owners, phases, pilotDecision, pilotProtocol, risks, scope, slides, topics, trustActions } from './content';
import { MeasurementGuide } from './measurement-guide';

function readSlide() {
  const match = window.location.hash.match(/^#slide=(\d+)$/);
  return match ? Math.min(slides.length - 1, Math.max(0, Number(match[1]) - 1)) : 0;
}
function subscribeSlide(callback: () => void) {
  window.addEventListener('hashchange', callback);
  window.addEventListener('popstate', callback);
  return () => {
    window.removeEventListener('hashchange', callback);
    window.removeEventListener('popstate', callback);
  };
}
function Brand() {
  return <div className="deck-brand"><span aria-hidden="true"><svg width="32" height="32" viewBox="0 0 32 32" fill="none"><path d="M6 18h22c-1 7-5 10-11 10S7 25 6 18Z" fill="currentColor" /><path d="M3 13h17M7 8h15M22 13h7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg></span><b>sabor<br /><small>express.</small></b></div>;
}

function Photo({ src, alt, className = '' }: { src: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? <div className={`deck-missing ${className}`} role="img" aria-label={alt}>Mídia indisponível<br /><small>{alt}</small></div>
    : <img className={className} src={src} alt={alt} draggable={false} decoding="async" onError={() => setFailed(true)} />;
}

function Dialog({ title, children, onClose, className = '' }: { title: string; children: ReactNode; onClose: () => void; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className={`deck-dialog ${className}`} aria-label={title} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="deck-dialog-inner"><header><h2>{title}</h2><button autoFocus aria-label="Fechar painel" onClick={onClose}><X /></button></header>{children}</div>
  </dialog>;
}

function Commercial({ active, onReveal, preview = false }: { active: boolean; onReveal: () => void; preview?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [localSource, setLocalSource] = useState<string>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    // A cached 404 can fire before React hydrates the server-rendered video.
    const video = ref.current;
    if (!video) return;
    const check = requestAnimationFrame(() => { if (video.error) setFailed(true); });
    return () => cancelAnimationFrame(check);
  }, [localSource]);
  useEffect(() => { if (!active) ref.current?.pause(); }, [active]);
  useEffect(() => {
    const pause = () => { if (document.hidden) ref.current?.pause(); };
    document.addEventListener('visibilitychange', pause);
    return () => document.removeEventListener('visibilitychange', pause);
  }, []);
  useEffect(() => () => { if (localSource) URL.revokeObjectURL(localSource); }, [localSource]);
  if (preview) return <Photo src={media.poster} alt="Capa do comercial" className="deck-video" />;
  return <div className="deck-player" data-interactive>
    <video ref={ref} className="deck-video" controls muted playsInline preload="auto" poster={media.poster} src={localSource || media.video} onError={() => setFailed(true)} aria-label="Comercial Sabor Express, 12 segundos">
      <track kind="captions" src={media.captions} srcLang="pt-BR" label="Português" />
    </video>
    {failed && <div className="deck-video-error"><strong>Comercial indisponível</strong><p>Selecione um vídeo local ou continue pela captura real.</p><button className="deck-button" onClick={() => fileRef.current?.click()}>Selecionar vídeo</button><button className="deck-button" onClick={onReveal}>Ver central</button></div>}
    <input ref={fileRef} type="file" accept="video/*" hidden aria-label="Selecionar vídeo local" onChange={event => { const file = event.target.files?.[0]; if (file) { setLocalSource(URL.createObjectURL(file)); setFailed(false); } }} />
  </div>;
}

type Zoom = { src: string; alt: string };
type SlideProps = { index: number; active?: boolean; preview?: boolean; onZoom?: (image: Zoom) => void };

function PhaseJourney() {
  return <div className="deck-phase-overview">
      <div className="deck-phase-cards">{phases.map((item, i) => <article key={item.days} aria-label={`Fase ${i + 1}: ${item.title}`}>
        <Photo src={item.image} alt={item.imageAlt} className="deck-phase-thumb" />
        <div className="deck-phase-rail" aria-hidden="true"><span /></div>
        <span className="deck-phase-days">{item.days}</span><h2>{item.title}</h2><p>{item.summary}</p>
      </article>)}</div>
  </div>;
}

function PilotDesign() {
  return <section className="deck-pilot" aria-label="Como fazer um piloto controlado">
    <figure><div className="deck-pilot-photo"><Photo src={media.operations} alt="Cena ilustrativa gerada por IA: equipe de uma hamburgueria preparando pedidos" /><span className="deck-pilot-badge" aria-hidden="true">3<small>lojas</small></span></div><figcaption>Perfis diferentes · um franqueado cético desde o início.</figcaption></figure>
    <div><ol className="deck-pilot-protocol">{pilotProtocol.map(step => <li key={step.title}><h2>{step.label}</h2><p>{step.summary}</p></li>)}</ol><p className="deck-pilot-decision">Se houver falhas, pausar e corrigir.</p></div>
  </section>;
}

function RiskPlan() {
  return <section className="deck-risk-plan" aria-label="Riscos, mitigação e confiança">
    <h2>Risco <span>→</span> proteção</h2>
    <dl className="deck-risk-matrix">{risks.map(item => <div key={item.risk}><dt>{item.label}</dt><dd>{item.protection}</dd></div>)}</dl>
    <p className="deck-trust-plan"><strong>Após o bot anterior:</strong> ouvir os franqueados, testar juntos e permitir pausa.</p>
  </section>;
}

function DetailNotes({ index }: { index: number }) {
  if (index === 2) return <div className="deck-detail-notes"><h4>Escopo completo</h4><p>Piloto: {scope.pilot}</p><p>Fora do piloto: {scope.outside}</p>{phases.map(phase => <div key={phase.days}><h4>{phase.days} · {phase.title}</h4><p>{phase.detail} {phase.actions.join(' ')}</p><p>Participantes: {phase.people}. Avançar quando: {phase.gate}</p></div>)}</div>;
  if (index === 3) return <div className="deck-detail-notes"><h4>Responsáveis e governança</h4>{owners.map(([name, role]) => <p key={name}><strong>{name}:</strong> {role}.</p>)}{cadence.map(([when, what]) => <p key={when}><strong>{when}:</strong> {what}</p>)}<h4>Método do piloto</h4>{pilotProtocol.map(step => <p key={step.title}><strong>{step.title}:</strong> {step.detail}</p>)}<h4>{pilotDecision.title}</h4><p>{pilotDecision.gate}</p><p>{pilotDecision.fallback}</p></div>;
  if (index === 4) return <MeasurementGuide />;
  if (index === 5) return <div className="deck-detail-notes"><h4>Roteiro da demonstração</h4>{demoSteps.map((step, i) => <p key={step}>{i + 1}. {step}</p>)}<h4>Riscos e mitigações completos</h4>{risks.map(item => <p key={item.risk}><strong>{item.risk}:</strong> {item.mitigation}</p>)}<h4>Reconstruir a confiança</h4>{trustActions.map(action => <p key={action}>{action}</p>)}</div>;
  return null;
}

function SlideTitle({ title }: { title: string }) {
  const split = title.lastIndexOf(' ');
  return <h1>{title.slice(0, split + 1)}<span className="deck-title-accent">{title.slice(split + 1)}</span></h1>;
}

function SlideContent({ index, active = false, preview = false, onZoom }: SlideProps) {
  const slide = slides[index];
  const [central, setCentral] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [demoStep, setDemoStep] = useState(1);
  const [topic, setTopic] = useState<number | null>(null);
  const [kpiGuide, setKpiGuide] = useState(false);
  const showCentral = preview || central;
  const demoImage = demoStep === 0 ? media.order : demoStep === 1 ? media.dashboard : media.handoff;
  const demoImageAlt = demoStep === 0 ? 'Captura real: confirmação do pedido no simulador de WhatsApp' : demoStep === 1 ? 'Captura real: conversa e pedido na central' : 'Captura real: reclamação assumida pela atendente';
  const zoom = (src: string, alt: string) => onZoom?.({ src, alt });

  return <>
    <div className="deck-masthead"><Brand /><span>HeadOffice.ai</span></div>
    {index !== 0 && index !== 6 && <header className="deck-heading"><SlideTitle title={slide.title} /><p className="deck-cue">{slide.cue}</p></header>}

    {index === 0 && <div className="deck-opening">
      <Photo src={media.opening} alt="Cena ilustrativa gerada por IA: hambúrguer e atendimento em uma hamburgueria" className="deck-opening-photo" />
      <div className="deck-opening-copy"><p className="deck-eyebrow">Customer Success & IA Solutions</p><h1>O desafio da<br />Sabor Express<span>.</span></h1><p className="deck-cue">{slide.cue}</p>
        <div className="deck-facts">{facts.map(fact => <div key={fact.label}><strong>{fact.value}</strong><span>{fact.label}</span></div>)}</div>
        <div className="deck-agenda" aria-label="Agenda">{agenda.map((item, i) => <span key={item}>{item}{i < agenda.length - 1 && <ArrowRight size={18} />}</span>)}</div>
      </div><span className="deck-photo-credit">Cena ilustrativa · IA</span>
    </div>}

    {index === 1 && <div className="deck-experience">
      <div className="deck-experience-media">
        {showCentral ? <button className="deck-shot-button" onClick={() => zoom(media.dashboard, 'Captura real da central: pedido confirmado e controle humano')} aria-label="Ampliar captura da central">
          <span className="deck-capture-frame"><Photo src={media.dashboard} alt="Captura real da central: conversa, unidade, pedido e botão Assumir" /><span className={`deck-focus-ring focus-${highlight}`} aria-hidden="true" /></span><span className="deck-zoom-hint"><Expand size={16} /> Ampliar captura</span>
        </button> : <Commercial active={active} onReveal={() => setCentral(true)} preview={preview} />}
        <div className="deck-media-caption"><span>Demonstração · {showCentral ? 'Captura real' : '12 segundos'}</span><button aria-expanded={showCentral} onClick={() => setCentral(!central)}>{showCentral ? 'Voltar ao vídeo' : 'Revelar central'}<ArrowRight size={18} /></button></div>
      </div>
      {showCentral && <div className="deck-highlights">{['Conversas centralizadas', 'Unidade e pedido', 'Equipe no controle'].map((label, i) => <button key={label} aria-pressed={highlight === i} onClick={() => setHighlight(i)}>{label}</button>)}</div>}
    </div>}

    {index === 2 && <div className="deck-plan">
      <p className="deck-board"><strong>Até 3 semanas</strong><ArrowRight size={20} />Proposta ao conselho.</p>
      <div id={preview ? undefined : 'deployment-phases'} className="deck-phases"><PhaseJourney /></div>
      <div className="deck-scope"><p><strong>Piloto</strong> Loja, cardápio, retirada, CRM e apoio humano.</p><p><strong>Fora</strong> Pagamento online, entrega e reembolsos autônomos.</p></div>
      <p className="deck-premise">{scope.premise}</p>
    </div>}

    {index === 3 && <div className="deck-governance">
      <PilotDesign />
      <p className="deck-owner-line">Operações decide · CS coordena · lojas e TI validam · conselho aprova.</p>
    </div>}

    {index === 4 && <div className="deck-results">
      <div className="deck-metrics">{metrics.map(item => <article key={item.id} data-kpi={item.id} className={item.featured ? 'deck-metric-featured' : undefined}><h2>{item.name}</h2><strong className="deck-metric-label">{item.label}</strong><p>{item.summary}</p></article>)}</div>
      <div className="deck-kpi-footer"><p className="deck-targets">Metas alinhadas com a operação no diagnóstico.</p><button aria-haspopup="dialog" onClick={() => setKpiGuide(true)}>Guia de fala dos KPIs<ArrowUpRight size={18} /></button></div>
      {kpiGuide && !preview && <Dialog title="Guia de fala dos KPIs" onClose={() => setKpiGuide(false)} className="deck-kpi-dialog"><MeasurementGuide /></Dialog>}
    </div>}

    {index === 5 && <div className="deck-demo">
      <div className="deck-demo-main"><div className="deck-demo-links"><a href={demoLinks.customer} target="_blank" rel="noopener noreferrer" aria-label="Abrir visão do cliente">Visão do cliente<ArrowUpRight size={19} /></a><a href={demoLinks.inbox} target="_blank" rel="noopener noreferrer" aria-label="Abrir central de atendimento">Central de atendimento<ArrowUpRight size={19} /></a></div>
        <button className="deck-demo-shot" aria-label="Ampliar captura de apoio" onClick={() => zoom(demoImage, demoImageAlt)}><Photo src={demoImage} alt={demoImageAlt} /><span className="deck-zoom-hint"><Expand size={16} /> Captura real · demonstração</span></button>
        <div className="deck-demo-steps" aria-label="Capturas da demonstração">{['Pedido', 'Central', 'Transferência'].map((step, i) => <button key={step} onClick={() => setDemoStep(i)} aria-pressed={demoStep === i}>{step}</button>)}</div>
      </div>
      <div><RiskPlan /><div className="deck-topic-links" aria-label="Detalhes de implementação">{topics.map((item, i) => <button key={item.title} aria-haspopup="dialog" onClick={() => setTopic(i)}>{item.title}</button>)}</div></div>
      {topic !== null && !preview && <Dialog title={topics[topic].title} onClose={() => setTopic(null)} className="deck-topic-dialog"><div className="deck-topic-content"><h3>{topics[topic].headline}</h3><p>{topics[topic].detail}</p><div className="deck-topic-flow">{topics[topic].flow.map((label, j) => <span key={label}>{label}{j < 2 && <ArrowRight size={18} />}</span>)}</div></div></Dialog>}
    </div>}

    {index === 6 && <div className="deck-closing" lang="en"><div className="deck-closing-copy"><h1>Faster service.<br />Teams in control<span>.</span></h1><p className="deck-cue">{slide.cue}</p><div className="deck-closing-points">{closing.map(([label, text]) => <div key={label}><b>{label}</b><p>{text}</p></div>)}</div></div><div className="deck-closing-photo"><Photo src={media.customer} alt="AI-generated illustrative scene of a customer using her phone in a burger restaurant" /><span>Illustrative scene · AI</span></div></div>}

    <footer className="deck-slide-footer"><span>{index === 0 ? 'Case Sabor Express' : index === 2 ? 'Ilustrações conceituais · IA' : index === 3 ? 'Cena ilustrativa · IA' : ''}</span><b>{String(index + 1).padStart(2, '0')} / 07</b></footer>
  </>;
}

function SlideThumbnail({ index }: { index: number }) {
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.2);
  useEffect(() => {
    if (!frame.current) return;
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / 1600));
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, []);
  return <div ref={frame} className="deck-thumbnail" aria-hidden="true" inert><div className={`deck-mini-render deck-slide deck-slide-${index + 1}`} style={{ transform: `scale(${scale})` }}><SlideContent index={index} preview /></div></div>;
}

export function Presentation() {
  const index = useSyncExternalStore(subscribeSlide, readSlide, () => 0);
  const root = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [controls, setControls] = useState(true);
  const [panel, setPanel] = useState<'notes' | 'overview' | null>(null);
  const [zoom, setZoom] = useState<Zoom | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [notice, setNotice] = useState('');

  const go = useCallback((next: number) => {
    const target = Math.max(0, Math.min(slides.length - 1, next));
    if (target === readSlide()) return;
    window.history.pushState(null, '', `${window.location.pathname}${window.location.search}#slide=${target + 1}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }, []);
  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (root.current?.requestFullscreen) await root.current.requestFullscreen();
      else setNotice('Tela cheia indisponível neste navegador. Use a opção de tela cheia do navegador.');
    } catch { setNotice('Não foi possível ativar a tela cheia. Use a opção de tela cheia do navegador.'); }
  }, []);

  useEffect(() => {
    root.current?.querySelector<HTMLElement>('main.deck-stage > section:not([hidden])')?.scrollTo({ top: 0 });
  }, [index]);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setScale(Math.min(entry.contentRect.width / 1600, entry.contentRect.height / 900)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const images = [media.opening, media.customer, media.operations, media.poster, media.dashboard, media.order, media.handoff, ...phases.map(phase => phase.image)].map(src => {
      const image = new window.Image(); image.src = src; return image;
    });
    return () => { images.forEach(image => { image.onload = null; }); };
  }, []);
  useEffect(() => {
    const change = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', change);
    return () => document.removeEventListener('fullscreenchange', change);
  }, []);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.isComposing || panel || zoom || root.current?.querySelector('dialog[open]')) return;
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, video, audio, a, [contenteditable]:not([contenteditable="false"]), [data-interactive], [role="slider"], [role="tab"], button:not([data-deck-control])')) return;
      const key = event.key.toLowerCase();
      const currentSlide = root.current?.querySelector<HTMLElement>('main.deck-stage > section:not([hidden])');
      if (['arrowup', 'arrowdown', 'pageup', 'pagedown', 'home', 'end'].includes(key) && currentSlide && currentSlide.scrollHeight > currentSlide.clientHeight + 1) return;
      if (['arrowright', 'arrowdown', 'pagedown'].includes(key)) go(index + 1);
      else if (['arrowleft', 'arrowup', 'pageup'].includes(key)) go(index - 1);
      else if (key === 'home') go(0);
      else if (key === 'end') go(slides.length - 1);
      else if (/^[1-7]$/.test(key)) go(Number(key) - 1);
      else if (key === 'f') void toggleFullscreen();
      else if (key === 'n') setPanel('notes');
      else if (key === 'g') setPanel('overview');
      else if (key === 'h') setControls(value => !value);
      else return;
      event.preventDefault();
    };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [go, index, panel, zoom, toggleFullscreen]);

  return <div className="presentation-root" ref={root}>
    <div ref={viewport} className="deck-viewport">
      <main className="deck-stage" aria-label="Apresentação Customer Success & IA Solutions" aria-roledescription="apresentação de slides" style={{ transform: `translate(-50%, -50%) scale(${scale || 0.01})`, visibility: scale ? 'visible' : 'hidden' }}>
        {slides.map((slide, i) => <section key={slide.title} tabIndex={index === i ? 0 : -1} hidden={index !== i} inert={index !== i} lang={i === 6 ? 'en' : 'pt-BR'} className={`deck-slide deck-slide-${i + 1}`} aria-label={`${i + 1} / 7: ${slide.title}`} aria-roledescription="slide"><SlideContent index={i} active={index === i && !panel && !zoom} onZoom={setZoom} /></section>)}
      </main>
    </div>
    <div className="deck-announcement" role="status" aria-live="polite">Slide {index + 1} de 7: {slides[index].title}</div>
    {controls ? <nav className="deck-controls" aria-label="Controles da apresentação">
      <button data-deck-control aria-label="Slide anterior" title="Anterior (←)" disabled={index === 0} onClick={() => go(index - 1)}><ChevronLeft size={20} /></button>
      <span className="deck-count">{String(index + 1).padStart(2, '0')} <span>/ 07</span></span>
      <div className="deck-progress" role="progressbar" aria-label="Progresso da apresentação" aria-valuemin={1} aria-valuemax={7} aria-valuenow={index + 1}><span style={{ width: `${((index + 1) / slides.length) * 100}%` }} /></div>
      <button data-deck-control aria-label="Próximo slide" title="Próximo (→)" disabled={index === slides.length - 1} onClick={() => go(index + 1)}><ChevronRight size={20} /></button>
      <i /><button data-deck-control aria-label="Visão geral" title="Visão geral (G)" onClick={() => setPanel('overview')}><Grid2X2 size={19} /></button>
      <button data-deck-control aria-label="Notas do apresentador" title="Notas (N)" onClick={() => setPanel('notes')}><NotebookPen size={19} /></button>
      <button data-deck-control aria-label={fullscreen ? 'Sair da tela cheia' : 'Tela cheia'} title="Tela cheia (F)" onClick={() => void toggleFullscreen()}>{fullscreen ? <Minimize size={19} /> : <Maximize size={19} />}</button>
      <button data-deck-control aria-label="Ocultar controles" title="Ocultar controles (H)" onClick={() => setControls(false)}><EyeOff size={19} /></button>
    </nav> : <button data-deck-control className="deck-show-controls" aria-label="Mostrar controles" title="Mostrar controles (H)" onClick={() => setControls(true)}><Grid2X2 size={16} /></button>}
    {notice && <div className="deck-notice" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Fechar aviso"><X size={18} /></button></div>}
    {panel === 'overview' && <Dialog title="Visão geral · 7 slides · 19 minutos" onClose={() => setPanel(null)} className="deck-overview"><div className="deck-thumbnail-grid">{slides.map((slide, i) => <div className="deck-thumbnail-card" key={slide.title}><SlideThumbnail index={i} /><div className="deck-thumbnail-label"><b>0{i + 1}</b><span>{slide.title}</span><small>{slide.duration}</small></div><button aria-label={`Ir para slide ${i + 1}: ${slide.title}`} aria-current={i === index ? 'step' : undefined} onClick={() => { go(i); setPanel(null); }} /></div>)}</div><p className="deck-key-help">← → Navegar · 1–7 Saltar · F Tela cheia · G Visão geral · N Notas · H Controles · Esc Fechar painel</p></Dialog>}
    {panel === 'notes' && <Dialog title="Notas do apresentador" onClose={() => setPanel(null)} className="deck-notes"><div className="deck-notes-body"><div className="deck-notes-meta"><span>Slide {index + 1} / 7</span><span>{slides[index].duration} · Total: 19min</span></div><h3>{slides[index].title}</h3><blockquote>{slides[index].guide}</blockquote>{slides[index].notes.map(note => <p key={note}>{note}</p>)}<DetailNotes index={index} />{index === 6 && <div className="deck-pitch" lang="en"><h4>English pitch · {englishPitch.trim().split(/\s+/).length} words</h4>{englishPitch.split('\n\n').map(paragraph => <p key={paragraph}>{paragraph}</p>)}</div>}<p className="deck-notes-warning">Este painel aparece nesta tela. Feche antes de voltar à apresentação compartilhada.</p></div><footer className="deck-notes-nav"><button disabled={index === 0} onClick={() => go(index - 1)}><ArrowLeft size={18} />Anterior</button><button onClick={() => setPanel(null)}>Voltar à apresentação</button><button disabled={index === 6} onClick={() => go(index + 1)}>Próximo<ArrowRight size={18} /></button></footer></Dialog>}
    {zoom && <Dialog title="Captura real do protótipo · demonstração" onClose={() => setZoom(null)} className="deck-lightbox"><Photo src={zoom.src} alt={zoom.alt} /><p>{zoom.alt}</p></Dialog>}
  </div>;
}
