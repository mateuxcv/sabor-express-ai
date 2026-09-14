"use client";

import { useSyncExternalStore } from "react";
import { initialSession, createSession, agentLabels, type DemoState, type Message, type Status, type AgentId, type AudioAttachment, type CustomerProfile } from "./demo-data";
import { chatReplySchema, unavailableReply } from "./assistant-contract";
import { removeAudioClips } from "./audio-storage";
import { clientId } from "./client-id";
import type { CallSnapshot } from "./realtime-contract";
import { csatAction, csatQuestion, type CsatSurvey } from "./csat-contract";
import { humanRequestHandoff, needsHandoff, sentimentAction, sentimentHandoff, sentimentResultSchema, type SentimentAlert } from "./sentiment-contract";
import catalog from "./catalog.json";
import { deliveryAddressSchema, needsOrderSetup, type DeliveryAddress } from "./ordering";

const KEY = "sabor-express-demo-v1";
const SESSION_REVISION = 2;
let state: DemoState = initialSession;
let initialized = false;
const listeners = new Set<() => void>();
const pending = new Map<string, ReturnType<typeof setTimeout>>();
const requests = new Map<string, AbortController>();
const closing = new Map<string, Promise<void>>();
const analysisJobs = new Map<string, Promise<void>>();
const analyzingMessages = new Set<string>();
const emit = () => listeners.forEach((listener) => listener());
const time = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const message = (author: Message["author"], text: string, kind?: Message["kind"], agentId?: AgentId): Message => ({ id: clientId(), author, text, time: time(), kind, agentId });
const publicMessages = (messages: Message[]) => messages.filter((m) => m.author !== "note" && m.author !== "event" && !m.csatSurveyId && !m.csatResponse);

function cancelReply(id: string) {
  clearTimeout(pending.get(id));
  pending.delete(id);
  requests.get(id)?.abort();
  requests.delete(id);
}

function parseState(value: string | null): DemoState | null {
  try {
    const data = JSON.parse(value || "null");
    if (data && data.sessionRevision === SESSION_REVISION && typeof data.automation === "boolean" && typeof data.activeId === "string" && Array.isArray(data.conversations) && data.conversations.length && data.conversations.every((c: Record<string, unknown>) => typeof c.id === "string" && typeof c.name === "string" && typeof c.store === "string" && Array.isArray(c.messages) && ["ai", "waiting", "human", "resolved"].includes(String(c.status)))) return data;
  } catch { /* Armazenamento inválido inicia uma sessão limpa. */ }
  return null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!initialized) {
    initialized = true;
    try {
      const saved = parseState(localStorage.getItem(KEY));
      state = saved || createSession(clientId());
      if (state.conversations.some((c) => c.id === "session-start")) {
        const id = clientId();
        state = { ...state, activeId: state.activeId === "session-start" ? id : state.activeId, conversations: state.conversations.map((c) => c.id === "session-start" ? { ...c, id } : c) };
      }
      // Substitui uma única vez o histórico da versão antiga que continha os mocks.
      if (state !== saved) localStorage.setItem(KEY, JSON.stringify({ ...state, sessionRevision: SESSION_REVISION }));
    } catch { state = createSession(clientId()); }
    window.addEventListener("storage", (event) => {
      if (event.key === KEY) {
        state = parseState(event.newValue) || initialSession;
        for (const id of new Set([...pending.keys(), ...requests.keys()])) {
          if (!state.conversations.some((c) => c.id === id && c.status === "ai")) cancelReply(id);
        }
        emit();
      }
    });
    state.conversations.forEach((conversation) => {
      conversation.messages.filter((m) => m.sentimentPending).forEach((m) => analyzeCustomer(conversation.id, m.id));
      if (conversation.status === "ai" && publicMessages(conversation.messages).at(-1)?.author === "customer" && publicMessages(conversation.messages).at(-1)?.channel !== "call") scheduleReply(conversation.id);
    });
    emit();
  }
  return () => { listeners.delete(listener); };
}

function update(next: DemoState) {
  state = next;
  try { localStorage.setItem(KEY, JSON.stringify({ ...state, sessionRevision: SESSION_REVISION })); } catch { /* O estado em memória continua disponível. */ }
  emit();
}

function edit(id: string, transform: (c: DemoState["conversations"][number]) => DemoState["conversations"][number]) {
  update({ ...state, conversations: state.conversations.map((c) => c.id === id ? transform(c) : c) });
}

function analyzeCustomer(id: string, messageId: string) {
  const key = `${id}:${messageId}`;
  if (analyzingMessages.has(key)) return;
  analyzingMessages.add(key);
  const previous = analysisJobs.get(id) || Promise.resolve();
  const job = previous.then(async () => {
    const current = state.conversations.find((c) => c.id === id);
    const index = current?.messages.findIndex((m) => m.id === messageId) ?? -1;
    if (!current || index < 0) return;
    try {
      const response = await fetch("/api/sentiment", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(20000), body: JSON.stringify({
        action: "analyze", requestId: messageId, conversation: { id, name: current.name, store: current.store, status: current.status,
          messages: publicMessages(current.messages.slice(0, index + 1)).slice(-30).map(({ id, author, text }) => ({ id, author, text })) },
      }) });
      if (!response.ok) throw new Error("analysis_unavailable");
      const result = sentimentResultSchema.parse(await response.json());
      edit(id, (c) => ({ ...c, sentimentError: undefined, messages: c.messages.map((m) => m.id === messageId ? { ...m, sentimentPending: false } : m) }));
      if (result.alert) demoActions.syncSentiment(result.alert);
      const latest = state.conversations.find((c) => c.id === id);
      if (latest?.status === "ai" && publicMessages(latest.messages).at(-1)?.id === messageId) scheduleReply(id);
    } catch {
      cancelReply(id);
      edit(id, (c) => ({ ...c, sentimentError: "Análise não registrada. Verifique o serviço Python e tente novamente.",
        status: c.status === "ai" ? "waiting" : c.status,
        messages: c.status === "ai" ? [...c.messages, message("ai", "Não consegui continuar o atendimento automático agora. Encaminhei sua conversa à equipe, com o histórico.", undefined, "human")] : c.messages,
      }));
    }
  }).finally(() => {
    analyzingMessages.delete(key);
    if (analysisJobs.get(id) === job) analysisJobs.delete(id);
  });
  analysisJobs.set(id, job);
}

async function acknowledgeSentiment(id: string) {
  await analysisJobs.get(id);
  const alert = state.conversations.find((c) => c.id === id)?.sentiment;
  if (!alert || alert.status !== "open") return;
  try {
    demoActions.syncSentiment(await sentimentAction(alert.id, "acknowledge"));
    edit(id, (c) => ({ ...c, sentimentError: undefined }));
  }
  catch { edit(id, (c) => ({ ...c, sentimentError: "Atendimento assumido localmente; não foi possível registrar o aceite do alerta. Tente novamente." })); }
}

function scheduleReply(id: string) {
  cancelReply(id);
  const conversation = state.conversations.find((c) => c.id === id);
  if (conversation?.call?.status === "connecting" || conversation?.call?.status === "active") return;
  const request = conversation && publicMessages(conversation.messages).at(-1);
  if (!request || request.author !== "customer" || !state.automation) return;
  pending.set(id, setTimeout(async () => {
    pending.delete(id);
    const current = state.conversations.find((c) => c.id === id);
    if (!current || current.status !== "ai" || !state.automation || publicMessages(current.messages).at(-1)?.id !== request.id || current.messages.some((m) => m.sentimentPending)) return;
    const controller = new AbortController();
    requests.set(id, controller);
    const timeout = setTimeout(() => controller.abort("timeout"), 38000);
    let reply = unavailableReply();
    try {
      const response = await fetch("/api/assistant", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ requestId: request.id, confirmationId: request.confirmationId !== undefined ? request.confirmationId || undefined : current.pendingAction?.id, conversation: { id: current.id, name: current.name, customerId: current.customerId, store: current.store, status: current.status, order: current.order, orderPreferences: current.orderPreferences, booking: current.booking, pendingAction: current.pendingAction, clarificationCount: current.clarificationCount || 0, messages: publicMessages(current.messages).slice(-30).map(({ id, author, text }) => ({ id, author, text })) } }),
      });
      if (response.ok) reply = chatReplySchema.parse(await response.json());
    } catch {
      if (controller.signal.aborted && controller.signal.reason !== "timeout") return;
    } finally {
      clearTimeout(timeout);
      if (requests.get(id) === controller) requests.delete(id);
    }
    const latest = state.conversations.find((c) => c.id === id);
    // Uma tomada humana, outra mensagem ou um reset invalida respostas em trânsito.
    if (!latest || latest.status !== "ai" || !state.automation || latest.call?.status === "active" || latest.call?.status === "connecting" || publicMessages(latest.messages).at(-1)?.id !== request.id) return;
    edit(id, (c) => ({ ...c, status: reply.status || c.status, topic: reply.topic || c.topic, order: reply.order || c.order, booking: reply.booking || c.booking, pendingAction: reply.pendingAction, routing: reply.routing, clarificationCount: reply.clarificationCount ?? 0,
      orderPreferences: reply.orderPreferences || c.orderPreferences,
      orderSetupActive: reply.kind === "order_setup",
      orderSetupMessage: reply.kind === "order_setup" ? request.text : undefined,
      messages: [...c.messages,
        ...(reply.routing.agent !== c.routing?.agent ? [message("event", `Recepção → ${agentLabels[reply.routing.agent]} · ${reply.routing.reason}`)] : []),
        message("ai", reply.text, reply.kind, reply.routing.agent),
        ...(reply.status === "waiting" ? [message("event", "Transferência para a equipe · Contexto preservado")] : []),
      ],
    }));
  }, 700));
}

export function useDemo() {
  return useSyncExternalStore(subscribe, () => state, () => initialSession);
}

export const demoActions = {
  chooseOrderStore(id: string, store: string) {
    const c = state.conversations.find((c) => c.id === id);
    if (!c || c.status !== "ai" || !catalog.stores.some((s) => s.name === store) ||
      (store !== c.store && (c.order || c.booking || c.orderPreferences?.storeSelected))) return;
    cancelReply(id);
    edit(id, (c) => ({ ...c, store, orderPreferences: { storeSelected: true }, orderSetupActive: true }));
  },
  chooseOrderFulfillment(id: string, fulfillment: "pickup" | "delivery") {
    const c = state.conversations.find((c) => c.id === id);
    if (!c || c.status !== "ai" || !c.orderPreferences?.storeSelected || c.order?.confirmed) return;
    cancelReply(id);
    edit(id, (c) => ({ ...c, order: undefined, pendingAction: undefined, orderPreferences: { storeSelected: true, fulfillment }, orderSetupActive: true }));
    if (fulfillment === "pickup") demoActions.finishOrderSetup(id);
  },
  saveDeliveryAddress(id: string, address: DeliveryAddress) {
    const c = state.conversations.find((c) => c.id === id);
    const parsed = deliveryAddressSchema.safeParse(address);
    if (!c || c.status !== "ai" || c.orderPreferences?.fulfillment !== "delivery" || !parsed.success) return;
    edit(id, (c) => ({ ...c, orderPreferences: { storeSelected: true, fulfillment: "delivery", address: parsed.data } }));
    demoActions.finishOrderSetup(id);
  },
  finishOrderSetup(id: string) {
    const c = state.conversations.find((c) => c.id === id);
    if (!c || c.status !== "ai" || !c.orderPreferences || needsOrderSetup(c.orderPreferences)) return;
    const resume = c.orderSetupMessage && c.orderSetupMessage.length < 3800 ? c.orderSetupMessage : "Quero ver o cardápio";
    edit(id, (c) => ({ ...c, orderSetupActive: false, orderSetupMessage: undefined }));
    demoActions.sendCustomer(id, `${c.orderPreferences.fulfillment === "delivery" ? "Entrega" : "Retirada"} escolhida em ${c.store.split(" · ")[1]}. ${resume}`);
  },
  editOrderPreferences(id: string) {
    const c = state.conversations.find((c) => c.id === id);
    if (!c || c.status !== "ai" || c.order?.confirmed || c.call?.status === "active" || c.call?.status === "connecting") return;
    cancelReply(id);
    edit(id, (c) => ({ ...c, orderSetupMessage: c.order ? `Quero pedir o ${c.order.product}` : "Quero ver o cardápio", orderSetupActive: true,
      orderPreferences: { storeSelected: true }, order: undefined, pendingAction: undefined }));
  },
  syncSentiment(alert: SentimentAlert) {
    const current = state.conversations.find((c) => c.id === alert.conversationId);
    if (!current || (current.sentiment && current.sentiment.updatedAt > alert.updatedAt)) return;
    if (JSON.stringify(current.sentiment) === JSON.stringify(alert) && !(needsHandoff(alert) && current.status === "ai")) return;
    const transfer = needsHandoff(alert) && current.status === "ai";
    if (transfer) cancelReply(current.id);
    const noticeId = `sentiment-handoff-${alert.id}`;
    edit(current.id, (c) => ({ ...c, sentiment: alert,
      ...(transfer ? { status: "waiting" as const, pendingAction: undefined, topic: alert.category === "human_request" ? "Atendimento humano solicitado" : "Possível insatisfação · Prioridade alta",
        routing: { agent: "human" as const, source: alert.source === "model" ? "crewai" as const : alert.source === "rules_fallback" ? "fallback" as const : "demo" as const, reason: alert.reason, summary: `Prioridade alta. ${alert.reason} Trecho: ${alert.evidence}`.slice(0, 800), missingFields: [] },
        messages: c.messages.some((m) => m.id === noticeId) ? c.messages : [...c.messages, { ...message("ai", alert.category === "human_request" ? humanRequestHandoff : sentimentHandoff, undefined, "human"), id: noticeId }],
      } : {}),
    }));
  },
  retrySentiment(id: string) {
    const current = state.conversations.find((c) => c.id === id);
    current?.messages.filter((m) => m.sentimentPending).forEach((m) => analyzeCustomer(id, m.id));
    if (current?.status === "human") void acknowledgeSentiment(id);
  },
  async resolveSentiment(id: string) {
    await analysisJobs.get(id);
    const alert = state.conversations.find((c) => c.id === id)?.sentiment;
    if (alert && alert.status !== "resolved") {
      demoActions.syncSentiment(await sentimentAction(alert.id, "resolve"));
      edit(id, (c) => ({ ...c, sentimentError: undefined }));
    }
  },
  finalizeConversation(id: string): Promise<void> {
    const inFlight = closing.get(id);
    if (inFlight) return inFlight;
    const current = state.conversations.find((c) => c.id === id);
    if (!current) return Promise.reject(new Error("Conversa não encontrada."));
    if (current.status === "resolved" && current.csat) return Promise.resolve();
    cancelReply(id);
    const job = (async () => {
      await analysisJobs.get(id);
      await demoActions.resolveSentiment(id);
      const survey = current.csat || await csatAction({ action: "issue", conversationId: id, store: current.store, customerName: current.name });
      cancelReply(id);
      edit(id, (c) => ({ ...c, status: "resolved", unread: 0, pendingAction: undefined, csat: survey,
        messages: [...c.messages, message("event", "Conversa finalizada por Ana · Pesquisa CSAT"),
          ...(!c.messages.some((m) => m.csatSurveyId === survey.id) ? [{ ...message("ai", csatQuestion), id: `csat-${survey.id}`, csatSurveyId: survey.id }] : [])],
      }));
    })().catch((error) => {
      if (state.conversations.find((c) => c.id === id)?.status === "ai") scheduleReply(id);
      throw error;
    }).finally(() => closing.delete(id));
    closing.set(id, job);
    return job;
  },
  syncCsat(survey: CsatSurvey) {
    const current = state.conversations.find((c) => c.id === survey.conversationId);
    if (!current || (current.csat?.answeredAt && !survey.answeredAt) || JSON.stringify(current.csat) === JSON.stringify(survey)) return;
    edit(survey.conversationId, (c) => ({ ...c, csat: survey,
      messages: survey.answeredAt && !c.messages.some((m) => m.id === `csat-answer-${survey.id}`) ? [...c.messages,
        { ...message("customer", `Avaliação do atendimento: ${survey.score}/5${survey.comment ? `\n${survey.comment}` : ""}`), id: `csat-answer-${survey.id}`, csatResponse: true },
        { ...message("ai", "Obrigada pela avaliação! Sua opinião ajuda a melhorar nosso atendimento. 💚"), id: `csat-thanks-${survey.id}`, csatResponse: true },
      ] : c.messages,
    }));
  },
  saveCustomer(conversationId: string, customer: CustomerProfile) {
    update({ ...state, customer, conversations: state.conversations.map((c) => c.id === conversationId || c.customerId === customer.id ? { ...c, customerId: customer.id, name: customer.name, phone: customer.phone, email: customer.email, initials: customer.name.split(" ").filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase() } : c) });
  },
  beginCall(id: string, attemptId: string) {
    const current = state.conversations.find((c) => c.id === id);
    if (!current || current.status !== "ai" || !state.automation || current.call?.status === "active" || current.call?.status === "connecting") return false;
    cancelReply(id);
    edit(id, (c) => ({ ...c, call: { id: attemptId, status: "connecting", startedAt: new Date().toISOString(), durationSeconds: 0 } }));
    return true;
  },
  connectCall(id: string, attemptId: string, callId: string) {
    const current = state.conversations.find((c) => c.id === id);
    if (!current || current.call?.id !== attemptId || current.status !== "ai" || !state.automation) return false;
    edit(id, (c) => ({ ...c, call: { ...c.call!, id: callId, status: "active" } }));
    return true;
  },
  syncCall(id: string, snapshot: CallSnapshot) {
    edit(id, (c) => {
      if (c.call?.id !== snapshot.id) return c;
      const incoming: Message[] = snapshot.transcripts.map((m) => ({ ...m, id: `call-${snapshot.id}-${m.id}`, channel: "call", callId: snapshot.id, ...(m.author === "ai" ? { agentId: "reception" as const } : {}) }));
      const existing = new Set(c.messages.map((m) => m.id));
      const business = snapshot.business;
      return { ...c, messages: [...c.messages, ...incoming.filter((m) => !existing.has(m.id))],
        call: { id: snapshot.id, status: snapshot.status, startedAt: snapshot.startedAt, durationSeconds: snapshot.durationSeconds, reason: snapshot.reason },
        ...(business ? { order: business.order || c.order, booking: business.booking || c.booking, pendingAction: business.pendingAction, routing: business.routing, topic: business.topic || c.topic, status: c.status === "human" || c.status === "resolved" ? c.status : business.status || c.status } : {}),
      };
    });
  },
  endCall(id: string, callId: string, reason: string, duration = 0) {
    edit(id, (c) => {
      if (c.call?.id !== callId) return c;
      const summaryId = `call-${callId}-summary`;
      const text = reason === "human" ? "Ligação encaminhada à equipe. O atendimento continua pelo chat." : reason === "error" ? "A ligação foi interrompida. Você pode tentar novamente ou continuar pelo chat." : `Ligação encerrada · ${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, "0")}.`;
      return { ...c, call: { ...c.call, status: reason === "human" ? "transferred" : reason === "error" ? "failed" : "ended", durationSeconds: duration, reason }, messages: c.messages.some((m) => m.id === summaryId) ? c.messages : [...c.messages, { ...message("ai", text), id: summaryId, channel: "call", callId }] };
    });
  },
  select(id: string) { update({ ...state, activeId: id }); edit(id, (c) => ({ ...c, unread: 0 })); },
  sendCustomer(id: string, text: string, options?: { audio?: AudioAttachment; confirmationId?: string | null }) {
    if (!text.trim()) return false;
    const before = state.conversations.find((c) => c.id === id);
    if (!before) return false;
    const status = before.status === "resolved" ? (state.automation ? "ai" : "waiting") : before.status;
    cancelReply(id);
    const incoming = { ...message("customer", text.trim()), ...options, sentimentPending: true };
    edit(id, (c) => ({ ...c, status: !state.automation && status === "ai" ? "waiting" : status, unread: c.unread + 1, messages: [...c.messages, incoming] }));
    analyzeCustomer(id, incoming.id);
    return true;
  },
  sendAgent(id: string, text: string, note = false) {
    if (!text.trim()) return;
    if (!note) cancelReply(id);
    edit(id, (c) => ({ ...c, status: note ? c.status : "human", messages: [...c.messages, message(note ? "note" : "agent", text.trim())] }));
    if (!note) void acknowledgeSentiment(id);
  },
  setStatus(id: string, status: Status) {
    if (status === "resolved") return demoActions.finalizeConversation(id);
    if (status === "ai" && needsHandoff(state.conversations.find((c) => c.id === id)?.sentiment)) return;
    cancelReply(id);
    const labels = { human: "Ana assumiu a conversa · IA pausada", ai: "Conversa devolvida à assistente virtual", resolved: "Conversa resolvida por Ana", waiting: "Conversa encaminhada à equipe" };
    edit(id, (c) => ({ ...c, status, unread: 0, messages: [...c.messages, message("event", labels[status])] }));
    if (status === "human") void acknowledgeSentiment(id);
  },
  toggleAutomation() {
    const enabled = !state.automation;
    if (!enabled) { state.conversations.forEach((c) => cancelReply(c.id)); }
    update({ ...state, automation: enabled, conversations: state.conversations.map((c) => !enabled && c.status === "ai" ? { ...c, status: "waiting", messages: [...c.messages, message("event", "Assistente pausada globalmente · Encaminhada à equipe")] } : c) });
  },
  clearSession() {
    const clips = state.conversations.flatMap((c) => c.messages.flatMap((m) => m.audio ? [m.audio.id] : []));
    state.conversations.forEach((c) => cancelReply(c.id));
    update(createSession(clientId(), state.automation, state.customer));
    void removeAudioClips(clips).catch(() => console.warn("Não foi possível remover os arquivos locais de áudio."));
  },
  newConversation() {
    const id = clientId();
    update({ ...state, activeId: id, conversations: [...createSession(id, state.automation, state.customer).conversations, ...state.conversations.filter((c) => c.messages.length > 0)] });
    return id;
  },
};
