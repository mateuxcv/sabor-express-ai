"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { AudioLines, LoaderCircle, Mic, Paperclip, RotateCcw, Send, Smile, Square, Trash2, X } from "lucide-react";
import { AUDIO_ACCEPT, MAX_AUDIO_BYTES, MAX_AUDIO_SECONDS, MAX_TRANSCRIPT_CHARS, RECORDING_MIME_TYPES, audioTime, transcriptionSchema } from "@/lib/audio";
import { saveAudioClip, removeAudioClips } from "@/lib/audio-storage";
import { demoActions } from "@/lib/demo-store";
import { AudioPreview } from "./voice-message";
import { clientId } from "@/lib/client-id";

type Clip = { blob: Blob; seconds: number; confirmationId: string | null };
type Props = { conversationId: string; confirmationId?: string; draft: string; onDraftChange: (text: string) => void; onSendText: (event: FormEvent) => void };

async function durationOf(blob: Blob): Promise<number> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    if (!Number.isFinite(decoded.duration) || decoded.duration <= 0) throw new Error("invalid_audio");
    return decoded.duration;
  } finally { await context.close(); }
}

export function VoiceComposer({ conversationId, confirmationId, draft, onDraftChange, onSendText }: Props) {
  const [phase, setPhase] = useState<"idle" | "preparing" | "recording" | "transcribing" | "preview" | "saving">("idle");
  const [clip, setClip] = useState<Clip | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [originalTranscript, setOriginalTranscript] = useState("");
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const media = useRef<MediaStream | null>(null);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);
  const pending = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const ready = conversationId !== "session-start";

  function stopTracks() {
    if (interval.current) clearInterval(interval.current);
    interval.current = null;
    media.current?.getTracks().forEach((track) => track.stop());
    media.current = null;
  }

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pending.current?.abort();
      if (recorder.current?.state === "recording") recorder.current.stop();
      stopTracks();
    };
  }, []);

  const current = (id: number) => mounted.current && generation.current === id;

  function discard() {
    generation.current++;
    pending.current?.abort();
    if (recorder.current?.state === "recording") recorder.current.stop();
    recorder.current = null;
    stopTracks();
    setClip(null); setTranscript(""); setOriginalTranscript(""); setElapsed(0); setError(""); setPhase("idle");
  }

  async function ensureConfigured() {
    const controller = new AbortController();
    pending.current = controller;
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch("/api/audio/transcribe", { cache: "no-store", signal: controller.signal });
      const data = await response.json();
      if (!response.ok || !data.ready) throw new Error(typeof data.message === "string" ? data.message : "Confira a configuração de áudio do Azure no .env.");
    } finally { clearTimeout(timer); }
  }

  async function transcribe(recording: Clip) {
    const id = ++generation.current;
    setClip(recording); setTranscript(""); setOriginalTranscript(""); setError(""); setPhase("transcribing");
    const controller = new AbortController();
    pending.current = controller;
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      const form = new FormData();
      form.set("file", recording.blob, "mensagem-audio");
      const response = await fetch("/api/audio/transcribe", { method: "POST", body: form, signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Não foi possível transcrever o áudio.");
      const result = transcriptionSchema.parse(data);
      if (!current(id)) return;
      setClip({ ...recording, blob: new Blob([recording.blob], { type: result.mimeType }) });
      setTranscript(result.text); setOriginalTranscript(result.text); setPhase("preview");
    } catch (cause) {
      if (!current(id)) return;
      setError(controller.signal.aborted ? "A transcrição demorou demais. Tente novamente ou grave um trecho menor." : cause instanceof Error ? cause.message : "Falha na transcrição. Tente novamente.");
      setPhase("preview");
    } finally { clearTimeout(timer); }
  }

  async function startRecording() {
    const id = ++generation.current;
    const capturedConfirmation = confirmationId || null;
    setError(""); setPhase("preparing");
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error("Para gravar, abra por HTTPS ou localhost. Você também pode anexar um arquivo de áudio.");
      if (!window.MediaRecorder) throw new Error("Este navegador não grava áudio. Use a opção de anexar arquivo.");
      const mimeType = RECORDING_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error("Formato de gravação incompatível. Anexe um áudio WAV, MP3 ou M4A.");
      await ensureConfigured();
      if (!current(id)) return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      if (!current(id)) { stream.getTracks().forEach((track) => track.stop()); return; }
      media.current = stream;
      const capture = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64000 });
      recorder.current = capture;
      const chunks: Blob[] = [];
      const startedAt = Date.now();
      let size = 0;
      capture.ondataavailable = (event) => {
        if (event.data.size) { chunks.push(event.data); size += event.data.size; }
        if (size > MAX_AUDIO_BYTES && capture.state === "recording") capture.stop();
      };
      capture.onerror = () => {
        if (!current(id)) return;
        generation.current++; stopTracks(); setPhase("idle"); setError("A gravação foi interrompida. Tente novamente.");
      };
      capture.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (!current(id)) return;
        stopTracks();
        recorder.current = null;
        const seconds = Math.min((Date.now() - startedAt) / 1000, MAX_AUDIO_SECONDS);
        const blob = new Blob(chunks, { type: capture.mimeType || mimeType });
        if (seconds < 0.5 || !blob.size) { setPhase("idle"); setError("Grave pelo menos meio segundo antes de enviar."); return; }
        if (blob.size > MAX_AUDIO_BYTES) { setPhase("idle"); setError("O áudio ultrapassou 4 MB. Grave um trecho menor."); return; }
        void transcribe({ blob, seconds, confirmationId: capturedConfirmation });
      };
      capture.start(250);
      setElapsed(0); setPhase("recording");
      interval.current = setInterval(() => {
        const seconds = (Date.now() - startedAt) / 1000;
        if (current(id)) setElapsed(Math.min(seconds, MAX_AUDIO_SECONDS));
        if (seconds >= MAX_AUDIO_SECONDS && capture.state === "recording") capture.stop();
      }, 250);
    } catch (cause) {
      if (!current(id)) return;
      stopTracks(); setPhase("idle");
      const name = cause instanceof Error ? cause.name : "";
      setError(name === "NotAllowedError" ? "Permita o acesso ao microfone no navegador para gravar." : name === "NotFoundError" ? "Nenhum microfone foi encontrado. Você pode anexar um arquivo de áudio." : name === "NotReadableError" ? "Não foi possível abrir o microfone. Confira se outro aplicativo está usando ele." : cause instanceof Error ? cause.message : "Não foi possível iniciar a gravação.");
    }
  }

  async function chooseFile(file?: File) {
    if (!file) return;
    const id = ++generation.current;
    const capturedConfirmation = confirmationId || null;
    setError(""); setPhase("preparing");
    try {
      if (file.size > MAX_AUDIO_BYTES) throw new Error("O áudio deve ter no máximo 4 MB.");
      if (!file.size) throw new Error("O arquivo está vazio.");
      await ensureConfigured();
      if (!current(id)) return;
      let seconds: number;
      try { seconds = await durationOf(file); } catch { throw new Error("Não foi possível ler este áudio. Use WAV, MP3, M4A ou WebM."); }
      if (seconds > MAX_AUDIO_SECONDS) throw new Error("Envie um áudio de até 2 minutos.");
      if (current(id)) void transcribe({ blob: file, seconds, confirmationId: capturedConfirmation });
    } catch (cause) {
      if (!current(id)) return;
      setPhase("idle"); setError(cause instanceof Error ? cause.message : "Não foi possível abrir o áudio.");
    }
  }

  async function sendAudio(textOnly = false) {
    if (!clip || !transcript.trim() || phase !== "preview") return;
    const id = ++generation.current;
    const clipId = clientId();
    setPhase("saving"); setError("");
    try {
      if (!textOnly) await saveAudioClip(clipId, conversationId, clip.blob);
      if (!current(id)) { if (!textOnly) void removeAudioClips([clipId]).catch(() => {}); return; }
      const sent = demoActions.sendCustomer(conversationId, transcript, {
        confirmationId: clip.confirmationId,
        ...(!textOnly ? { audio: { id: clipId, mimeType: clip.blob.type, durationSeconds: clip.seconds, transcriptionEdited: transcript.trim() !== originalTranscript } } : {}),
      });
      if (!sent && !textOnly) await removeAudioClips([clipId]);
      if (current(id)) { discard(); onDraftChange(""); }
    } catch {
      if (!current(id)) return;
      setPhase("preview"); setError("Não foi possível salvar o áudio neste navegador. Tente novamente ou envie somente a transcrição.");
    }
  }

  return <div className="voice-composer-shell" data-conversation-id={conversationId}>
    {error && <div className="voice-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="Fechar aviso de áudio"><X size={14} /></button></div>}
    <input ref={fileInput} type="file" accept={AUDIO_ACCEPT} hidden disabled={!ready} aria-label="Selecionar arquivo de áudio" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void chooseFile(file); }} />
    {phase === "idle" ? <form className="whatsapp-composer" onSubmit={onSendText}>
      <div><button type="button" aria-label="Adicionar emoji" disabled={!ready} onClick={() => onDraftChange(`${draft} 😊`)}><Smile size={22} /></button><input aria-label="Mensagem do cliente" placeholder="Mensagem" disabled={!ready} value={draft} onChange={(event) => onDraftChange(event.target.value)} autoComplete="off" maxLength={MAX_TRANSCRIPT_CHARS} /><button type="button" aria-label="Anexar áudio" title="Anexar áudio" disabled={!ready} onClick={() => fileInput.current?.click()}><Paperclip size={19} /></button></div>
      {draft.trim() ? <button className="whatsapp-send" aria-label="Enviar mensagem"><Send size={19} /></button> : <button type="button" className="whatsapp-send" aria-label="Gravar áudio" title="Gravar áudio" disabled={!ready} onClick={() => void startRecording()}><Mic size={20} /></button>}
    </form> : <div className="voice-capture-panel">
      <div className="voice-capture-heading"><span><AudioLines size={15} />{phase === "recording" ? "Gravando sua mensagem" : phase === "preparing" ? "Preparando áudio…" : "Mensagem de voz"}</span><button type="button" aria-label="Descartar áudio" onClick={discard}><Trash2 size={17} /></button></div>
      {phase === "recording" && <div className="voice-recording"><span className="recording-dot" /><time aria-label="Tempo de gravação">{audioTime(elapsed)}</time><div className="voice-wave" aria-hidden="true">{[8, 18, 12, 25, 16, 30, 20, 12, 26, 16, 22, 10].map((height, index) => <i key={index} style={{ height, animationDelay: `${index * 70}ms` }} />)}</div><button type="button" className="voice-stop" aria-label="Parar e transcrever" title="Parar e transcrever" onClick={() => { if (recorder.current?.state === "recording") recorder.current.stop(); }}><Square size={17} fill="currentColor" /></button></div>}
      {clip && <AudioPreview blob={clip.blob} />}
      {(phase === "preparing" || phase === "transcribing" || phase === "saving") && <div className="voice-progress" role="status"><LoaderCircle size={16} />{phase === "transcribing" ? "Transcrevendo com Azure…" : phase === "saving" ? "Enviando áudio…" : "Verificando arquivo ou microfone…"}</div>}
      {phase === "preview" && clip && <>
        {transcript ? <><label className="voice-review">Confira a transcrição<textarea aria-label="Transcrição do áudio" value={transcript} maxLength={MAX_TRANSCRIPT_CHARS} onChange={(event) => setTranscript(event.target.value)} /></label><div className="voice-send-actions"><button type="button" className="voice-text-only" onClick={() => void sendAudio(true)}>Só texto</button><button type="button" className="voice-send-button" disabled={!transcript.trim()} onClick={() => void sendAudio()}><Send size={14} />Enviar áudio</button></div></> : <button type="button" className="voice-retry" onClick={() => void transcribe(clip)}><RotateCcw size={14} />Tentar transcrever novamente</button>}
      </>}
      {phase === "recording" && <small className="voice-limit">Até 2 minutos · pare para transcrever</small>}
    </div>}
  </div>;
}
