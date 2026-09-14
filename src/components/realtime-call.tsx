"use client";

import { useEffect, useRef, useState } from "react";
import { AudioLines, Check, LoaderCircle, Mic, MicOff, Phone, PhoneOff, Volume2, VolumeX, X } from "lucide-react";
import type { Conversation } from "@/lib/demo-data";
import { RealtimeClient, initialCallView } from "@/lib/realtime-client";
import { demoActions } from "@/lib/demo-store";
import { audioTime } from "@/lib/audio";
import { BrandMark, Modal } from "./ui";

export function RealtimeCall({ conversation, automation }: { conversation: Conversation; automation: boolean }) {
  const [view, setView] = useState(initialCallView);
  const [visible, setVisible] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const connection = useRef<RealtimeClient | null>(null);
  const mounted = useRef(true);
  const active = conversation.call?.status === "connecting" || conversation.call?.status === "active";

  useEffect(() => {
    mounted.current = true;
    const stop = () => { void connection.current?.stop("disconnected"); };
    window.addEventListener("pagehide", stop);
    return () => { mounted.current = false; window.removeEventListener("pagehide", stop); stop(); };
  }, []);

  useEffect(() => {
    if (connection.current && (conversation.status === "human" || !automation)) void connection.current.stop("human");
    else if (connection.current && conversation.status === "resolved") void connection.current.stop("ended");
  }, [conversation.status, automation]);

  useEffect(() => {
    if (!active || connection.current) return;
    let cancelled = false;
    const check = async () => {
      if (Date.now() - Date.parse(conversation.call!.startedAt) < 30000) return;
      try {
        const response = await fetch(`/api/realtime?conversationId=${encodeURIComponent(conversation.id)}`, { cache: "no-store" });
        const result = await response.json();
        if (!cancelled && response.ok && result.busy === false) demoActions.endCall(conversation.id, conversation.call!.id, "disconnected", conversation.call!.durationSeconds);
      } catch { /* Uma nova verificação ocorre no próximo intervalo. */ }
    };
    const timer = setInterval(() => void check(), 5000);
    void check();
    return () => { cancelled = true; clearInterval(timer); };
  }, [active, conversation.id, conversation.call]);

  function start() {
    if (!audio.current || active || conversation.status !== "ai" || !automation) return;
    setView(initialCallView); setVisible(true);
    const call = new RealtimeClient(conversation, audio.current, (state) => { if (mounted.current) setView(state); });
    connection.current = call;
    void call.start();
  }

  function close() {
    void connection.current?.stop("cancelled");
    connection.current = null;
    setVisible(false);
  }

  const finished = view.phase === "ended" || view.phase === "error";
  const activity = view.activity === "speaking" ? "Lia está falando" : view.activity === "thinking" ? "Consultando seu atendimento…" : view.muted ? "Seu microfone está silenciado" : "Estou ouvindo você";

  return <>
    <button className="icon-button call-launch" aria-label="Iniciar ligação com a IA" title={active ? "Ligação em andamento" : "Ligar para a assistente"} disabled={active || !automation || conversation.status !== "ai" || conversation.id === "session-start"} onClick={start}><Phone size={18} /></button>
    <audio ref={audio} autoPlay className="realtime-remote-audio" />
    {visible && <Modal title="Ligação com a Sabor Express" className="realtime-dialog" onClose={close}><div className={`realtime-call ${view.phase}`}>
      <div className="call-top"><span><span className="live-dot" />AZURE REALTIME</span><button aria-label={finished ? "Voltar ao chat" : "Cancelar ligação"} onClick={close}><X size={20} /></button></div>
      <div className="call-identity"><div className={`call-avatar ${view.phase === "active" && view.activity === "speaking" ? "speaking" : ""}`}><BrandMark /></div><h2>Sabor Express <Check size={14} /></h2><p>Lia · sua recepcionista virtual</p><span className="call-unit">{conversation.store.split(" · ")[1]}</span></div>
      <div className="call-state" role="status">{view.phase === "connecting" ? <><LoaderCircle size={17} />Conectando sua ligação…</> : view.phase === "error" ? "Não foi possível manter a ligação" : view.phase === "ended" ? (view.reason === "human" ? "A equipe continuará pelo chat" : "Ligação encerrada") : <><AudioLines size={17} />{activity}</>}</div>
      {(view.phase === "active" || finished) && <time className="call-timer">{audioTime(view.seconds)}</time>}
      <div className="call-caption" aria-live="polite">{view.error || (finished ? "A transcrição e os dados do atendimento ficam na conversa." : view.caption || "Fale naturalmente. Você pode perguntar, pedir um combo ou organizar uma reserva.")}</div>
      {view.needsPlayback && !finished && <button className="call-enable-audio" onClick={() => void connection.current?.enablePlayback()}><Volume2 size={16} />Toque para ativar o som</button>}
      {!finished ? <div className="call-controls"><button className={view.muted ? "selected" : ""} aria-label={view.muted ? "Ativar microfone" : "Silenciar microfone"} aria-pressed={view.muted} disabled={view.phase !== "active"} onClick={() => connection.current?.toggleMicrophone()}>{view.muted ? <MicOff size={23} /> : <Mic size={23} />}<span>Microfone</span></button><button className="call-hangup" aria-label="Encerrar ligação" onClick={() => void connection.current?.stop()}><PhoneOff size={25} /><span>Encerrar</span></button><button className={view.soundMuted ? "selected" : ""} aria-label={view.soundMuted ? "Ativar som da ligação" : "Silenciar som da ligação"} aria-pressed={view.soundMuted} disabled={view.phase !== "active"} onClick={() => connection.current?.toggleSound()}>{view.soundMuted ? <VolumeX size={23} /> : <Volume2 size={23} />}<span>Som</span></button></div> : <button className="call-back" onClick={close}>Voltar para a conversa</button>}
      <small className="call-footnote">Ligação pela internet · limite {audioTime(view.maxSeconds)}</small>
    </div></Modal>}
  </>;
}
