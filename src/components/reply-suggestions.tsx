"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Sparkles, X } from "lucide-react";
import { clientId } from "@/lib/client-id";
import { suggestionContext, suggestionResultSchema, type SuggestedReply } from "@/lib/suggestion-contract";
import type { Conversation } from "@/lib/demo-data";
import "@/app/suggestions.css";

type Props = { conversation: Conversation; enabled: boolean; draft: string; setDraft: (text: string) => void; getDraftRevision: () => number };

export function useReplySuggestions({ conversation, enabled, draft, setDraft, getDraftRevision }: Props) {
  const context = suggestionContext(conversation);
  const key = context ? JSON.stringify(context) : "";
  const available = enabled && Boolean(context) && conversation.status !== "resolved" && conversation.id !== "session-start" && !["active", "connecting"].includes(conversation.call?.status || "");
  const active = useRef<AbortController | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [result, setResult] = useState<{ key: string; suggestions: SuggestedReply[]; applied?: string; preserved: boolean } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  useEffect(() => () => { active.current?.abort(); }, [key, available]);
  const currentResult = available && result?.key === key ? result : null;
  const loading = available && pending === key;
  const currentError = available && error?.key === key ? error.message : "";

  async function generate() {
    if (!available || !context || (active.current && !active.current.signal.aborted)) return;
    const controller = new AbortController();
    active.current = controller;
    const revision = getDraftRevision();
    const requestId = clientId();
    setPending(key); setError(null); setResult(null);
    const timer = setTimeout(() => controller.abort("timeout"), 26000);
    try {
      const response = await fetch("/api/suggestions", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...context, requestId }), signal: controller.signal });
      const body = await response.json();
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Não foi possível gerar a resposta. Tente novamente.");
      const parsed = suggestionResultSchema.safeParse(body);
      if (!parsed.success) throw new Error("A IA não retornou respostas válidas. Tente novamente.");
      const data = parsed.data;
      if (data.requestId !== requestId || data.lastCustomerMessageId !== context.lastCustomerMessageId) throw new Error("A sugestão não corresponde ao contexto atual. Gere novamente.");
      if (controller.signal.aborted || active.current !== controller) return;
      const insert = !draft.trim() && getDraftRevision() === revision;
      if (insert) setDraft(data.suggestions[0].text);
      setResult({ key, suggestions: data.suggestions, applied: insert ? data.suggestions[0].id : undefined, preserved: !insert });
    } catch (cause) {
      if (active.current !== controller || (controller.signal.aborted && controller.signal.reason !== "timeout")) return;
      setError({ key, message: controller.signal.reason === "timeout" ? "A geração demorou. Tente novamente; seu rascunho foi preservado." : cause instanceof Error ? cause.message : "Não foi possível gerar uma sugestão." });
    } finally {
      clearTimeout(timer);
      if (active.current === controller) { active.current = null; setPending(null); }
    }
  }

  function apply(suggestion: SuggestedReply) {
    if (!currentResult) return;
    setDraft(suggestion.text);
    setResult({ ...currentResult, applied: suggestion.id, preserved: false });
  }

  function dismiss() {
    active.current?.abort(); setResult(null); setError(null);
  }

  return { available, loading, result: currentResult, error: currentError, generate, apply, dismiss };
}

export function ReplySuggestionButton({ control }: { control: ReturnType<typeof useReplySuggestions> }) {
  return <button type="button" className="suggestion-button" aria-label="Sugerir resposta" aria-busy={control.loading} disabled={!control.available || control.loading}
    title={control.available ? "Gerar três respostas com base no histórico e na última mensagem do cliente" : "Selecione uma conversa aberta com mensagem do cliente, no modo Responder"}
    onClick={() => void control.generate()}>{control.loading ? <LoaderCircle size={13} className="suggestion-spinner" /> : <Sparkles size={13} />}{control.loading ? "Gerando respostas…" : "Sugerir resposta"}</button>;
}

export function ReplySuggestionPanel({ control }: { control: ReturnType<typeof useReplySuggestions> }) {
  if (!control.loading && !control.result && !control.error) return null;
  return <section className="reply-suggestion-panel" aria-label="Sugestões de resposta">
    <header><strong><Sparkles size={13} />{control.loading ? "Analisando a conversa" : "Respostas prontas · IA"}</strong><button type="button" className="icon-button" onClick={control.dismiss} aria-label={control.loading ? "Cancelar geração de respostas" : "Fechar sugestões"}><X size={13} /></button></header>
    {control.loading && <p role="status">Lendo o histórico e a última mensagem do cliente…</p>}
    {control.error && <p className="reply-suggestion-error" role="alert">{control.error}</p>}
    {control.result && <>
      <div className="reply-suggestion-options" role="group" aria-label="Escolher versão da resposta">{control.result.suggestions.map((suggestion) => <button type="button" key={suggestion.id} aria-label={`Usar resposta: ${suggestion.label}`} aria-pressed={control.result?.applied === suggestion.id} onClick={() => control.apply(suggestion)}>{suggestion.label}</button>)}</div>
      <p role="status">{control.result.preserved ? "Seu rascunho foi preservado. Escolha uma versão para colocá-la no campo." : "Resposta inserida no campo. Revise e ajuste antes de enviar."}</p>
    </>}
  </section>;
}
