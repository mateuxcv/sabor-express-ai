"use client";

import type { Conversation } from "./demo-data";
import { demoActions } from "./demo-store";
import { callConnectionSchema, callSnapshotSchema } from "./realtime-contract";
import { clientId } from "./client-id";

export type CallView = { phase: "idle" | "connecting" | "active" | "ended" | "error"; activity: "listening" | "speaking" | "thinking"; seconds: number; caption: string; muted: boolean; soundMuted: boolean; needsPlayback: boolean; error: string; reason?: string; maxSeconds: number };
export const initialCallView: CallView = { phase: "idle", activity: "listening", seconds: 0, caption: "", muted: false, soundMuted: false, needsPlayback: false, error: "", maxSeconds: 300 };

export class RealtimeClient {
  id = clientId();
  private state: CallView = { ...initialCallView };
  private peer: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private media: MediaStream | null = null;
  private remote: { id: string; token: string } | null = null;
  private abort = new AbortController();
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private tick: ReturnType<typeof setInterval> | null = null;
  private connectionTimer: ReturnType<typeof setTimeout> | null = null;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectedAt = 0;
  private stopped = false;
  private captionItem = "";
  private pollFailures = 0;
  private greetingSent = false;

  constructor(private conversation: Conversation, private audio: HTMLAudioElement, private onChange: (state: CallView) => void) {}

  private update(next: Partial<CallView>) { this.state = { ...this.state, ...next }; this.onChange(this.state); }

  async start() {
    if (!demoActions.beginCall(this.conversation.id, this.id)) {
      this.update({ phase: "error", error: "Esta conversa não está disponível para uma nova ligação." });
      return;
    }
    this.update({ phase: "connecting" });
    this.connectionTimer = setTimeout(() => void this.fail("A ligação demorou demais para conectar. Tente novamente."), 55000);
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error("Para ligar, abra por HTTPS ou localhost e permita o microfone.");
      if (!window.RTCPeerConnection) throw new Error("Este navegador não oferece suporte a ligações WebRTC.");
      const configResponse = await fetch(`/api/realtime?conversationId=${encodeURIComponent(this.conversation.id)}`, { cache: "no-store", signal: this.abort.signal });
      const config = await configResponse.json();
      if (!configResponse.ok || !config.ready) throw new Error(config.message || config.error || "Configure o deployment Realtime no .env.");
      if (config.busy) throw new Error("Esta conversa já tem uma ligação em andamento. Aguarde o encerramento.");
      this.update({ maxSeconds: config.maxSeconds || 300 });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (this.stopped) { stream.getTracks().forEach((track) => track.stop()); return; }
      this.media = stream;
      const peer = new RTCPeerConnection();
      this.peer = peer;
      for (const track of stream.getAudioTracks()) peer.addTrack(track, stream);
      peer.ontrack = (event) => {
        if (this.stopped) return;
        this.audio.srcObject = event.streams[0] || new MediaStream([event.track]);
        this.audio.autoplay = true;
        this.audio.setAttribute("playsinline", "");
        void this.audio.play().catch(() => { if (!this.stopped) this.update({ needsPlayback: true }); });
      };
      peer.onconnectionstatechange = () => {
        if (this.stopped) return;
        if (peer.connectionState === "connected") {
          if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
          if (this.connectionTimer) clearTimeout(this.connectionTimer);
          if (!this.connectedAt) {
            this.connectedAt = Date.now();
            this.tick = setInterval(() => {
              const seconds = Math.floor((Date.now() - this.connectedAt) / 1000);
              this.update({ seconds });
              if (seconds >= this.state.maxSeconds) void this.stop("time_limit");
            }, 1000);
          }
          this.update({ phase: "active" });
        } else if (peer.connectionState === "failed") {
          void this.fail("Não foi possível manter a conexão de áudio. Tente novamente.");
        } else if (peer.connectionState === "disconnected") {
          this.disconnectTimer = setTimeout(() => { if (peer.connectionState !== "connected") void this.stop("disconnected"); }, 6000);
        }
      };
      const channel = peer.createDataChannel("realtime-channel");
      this.channel = channel;
      channel.onopen = () => {
        if (this.stopped || this.greetingSent) return;
        this.greetingSent = true;
        channel.send(JSON.stringify({ type: "response.create", response: { tool_choice: "none", metadata: { purpose: "greeting" }, instructions: "Diga uma única vez: Olá! Sou a Lia, assistente virtual da Sabor Express. Como posso ajudar? Depois pare e aguarde o cliente. Não repita a saudação." } }));
      };
      channel.onmessage = (event) => this.event(event.data);
      channel.onclose = () => { if (!this.stopped) void this.stop("disconnected"); };
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const response = await fetch("/api/realtime", { method: "POST", headers: { "Content-Type": "application/json" }, signal: this.abort.signal, body: JSON.stringify({ sdp: offer.sdp, conversation: { id: this.conversation.id, name: this.conversation.name, customerId: this.conversation.customerId, store: this.conversation.store, status: "ai", messages: this.conversation.messages.filter((m) => ["customer", "ai", "agent"].includes(m.author)).slice(-30).map(({ id, author, text }) => ({ id, author, text })) } }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível iniciar a ligação.");
      const session = callConnectionSchema.parse(data);
      if (this.stopped) { await this.closeRemote(session, "cancelled"); return; }
      const attemptId = this.id;
      this.remote = { id: session.id, token: session.token };
      this.id = session.id;
      if (!demoActions.connectCall(this.conversation.id, attemptId, session.id)) { await this.stop("cancelled"); return; }
      await peer.setRemoteDescription({ type: "answer", sdp: session.answer });
      void this.poll();
    } catch (error) {
      if (this.stopped) return;
      const name = error instanceof Error ? error.name : "";
      await this.fail(name === "NotAllowedError" ? "Permita o microfone no navegador para iniciar a ligação." : name === "NotFoundError" ? "Nenhum microfone foi encontrado neste dispositivo." : error instanceof Error ? error.message : "Não foi possível iniciar a ligação.");
    }
  }

  private event(raw: string) {
    if (this.stopped) return;
    let event;
    try { event = JSON.parse(raw); } catch { return; }
    if (event.type === "input_audio_buffer.speech_started") this.update({ activity: "listening" });
    if (event.type === "input_audio_buffer.speech_stopped") this.update({ activity: "thinking" });
    if (event.type === "output_audio_buffer.started") this.update({ activity: "speaking" });
    if (event.type === "output_audio_buffer.stopped") this.update({ activity: "listening" });
    if (event.type === "response.output_audio_transcript.delta" && typeof event.delta === "string") {
      const item = event.item_id || event.response_id || "";
      const caption = item === this.captionItem ? this.state.caption + event.delta : event.delta;
      this.captionItem = item;
      this.update({ caption: caption.slice(-1500) });
    }
    if (event.type === "response.output_audio_transcript.done" && typeof event.transcript === "string") this.update({ caption: event.transcript.slice(-1500) });
  }

  private async poll() {
    if (this.stopped || !this.remote) return;
    try {
      const response = await fetch(`/api/realtime/${this.remote.id}`, { headers: { "x-call-token": this.remote.token }, cache: "no-store", signal: this.abort.signal });
      if (!response.ok) throw new Error("state_unavailable");
      const snapshot = callSnapshotSchema.parse(await response.json());
      if (this.stopped) return;
      this.pollFailures = 0;
      demoActions.syncCall(this.conversation.id, snapshot);
      if (["ended", "failed", "transferred"].includes(snapshot.status)) {
        await this.stop(snapshot.status === "transferred" ? "human" : snapshot.status === "failed" ? "error" : snapshot.reason || "ended");
        return;
      }
    } catch {
      if (this.stopped) return;
      if (++this.pollFailures >= 3) { await this.fail("A conexão com o atendimento foi perdida. Você pode continuar pelo chat."); return; }
    }
    if (!this.stopped) this.pollTimer = setTimeout(() => void this.poll(), 1000);
  }

  toggleMicrophone() {
    const muted = !this.state.muted;
    this.media?.getAudioTracks().forEach((track) => { track.enabled = !muted; });
    this.update({ muted });
  }

  toggleSound() {
    this.audio.muted = !this.state.soundMuted;
    this.update({ soundMuted: this.audio.muted });
  }

  async enablePlayback() {
    try { await this.audio.play(); this.update({ needsPlayback: false }); } catch { this.update({ needsPlayback: true }); }
  }

  private async fail(error: string) { this.update({ error }); await this.stop("error"); }

  private async closeRemote(remote: { id: string; token: string }, reason: string) {
    try {
      const safeReason = ["ended", "cancelled", "human", "disconnected", "time_limit"].includes(reason) ? reason : "disconnected";
      const response = await fetch(`/api/realtime/${remote.id}?reason=${safeReason}`, { method: "DELETE", headers: { "x-call-token": remote.token }, keepalive: true });
      if (response.ok) {
        const result = callSnapshotSchema.safeParse(await response.json());
        if (result.success) demoActions.syncCall(this.conversation.id, result.data);
      }
    } catch { /* O controlador encerra sessões sem heartbeat em até 25 segundos. */ }
  }

  async stop(reason = "ended") {
    if (this.stopped) return;
    this.stopped = true;
    this.abort.abort();
    if (this.tick) clearInterval(this.tick);
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (this.connectionTimer) clearTimeout(this.connectionTimer);
    if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
    this.media?.getTracks().forEach((track) => track.stop());
    this.channel?.close(); this.peer?.close();
    this.audio.pause(); this.audio.srcObject = null;
    this.update({ phase: reason === "error" ? "error" : "ended", reason });
    if (this.remote) await this.closeRemote(this.remote, reason);
    demoActions.endCall(this.conversation.id, this.id, reason, this.state.seconds);
    this.remote = null;
  }
}
