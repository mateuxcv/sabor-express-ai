"use client";

import { useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import type { AudioAttachment } from "@/lib/demo-data";
import { loadAudioClip } from "@/lib/audio-storage";
import { audioTime } from "@/lib/audio";

export function AudioPreview({ blob }: { blob: Blob }) {
  const element = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const player = element.current;
    const url = URL.createObjectURL(blob);
    if (player) player.src = url;
    return () => { player?.pause(); URL.revokeObjectURL(url); };
  }, [blob]);
  return <audio ref={element} controls preload="metadata" controlsList="nodownload" aria-label="Ouvir áudio antes de enviar" />;
}

export function VoiceMessage({ audio, text, expanded }: { audio: AudioAttachment; text: string; expanded: boolean }) {
  const element = useRef<HTMLAudioElement>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let active = true;
    let url: string | undefined;
    const player = element.current;
    loadAudioClip(audio.id).then((blob) => {
      if (!active) return;
      if (!blob) { setMissing(true); return; }
      url = URL.createObjectURL(blob);
      if (player) player.src = url;
    }).catch(() => { if (active) setMissing(true); });
    return () => { active = false; player?.pause(); if (url) URL.revokeObjectURL(url); };
  }, [audio.id]);
  return <div className="voice-message">
    <div className="voice-message-label"><Mic size={13} /><span>Mensagem de voz</span><time>{audioTime(Math.ceil(audio.durationSeconds))}</time></div>
    {missing ? <small className="voice-missing">Arquivo de áudio indisponível neste navegador.</small> : <audio ref={element} controls preload="metadata" controlsList="nodownload" aria-label="Reproduzir mensagem de voz" />}
    <details className="voice-transcript" open={expanded}><summary>{audio.transcriptionEdited ? "Transcrição revisada" : "Transcrição Azure"}</summary><p>{text}</p></details>
  </div>;
}
