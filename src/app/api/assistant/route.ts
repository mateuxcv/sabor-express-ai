import { chatReplySchema, chatRequestSchema, unavailableReply } from "@/lib/assistant-contract";
import { generateReply } from "@/lib/automation";
import { crmBackend } from "@/lib/server/crm-proxy";
import { humanRequestHandoff, needsHandoff, sentimentHandoff, sentimentResultSchema } from "@/lib/sentiment-contract";

export const runtime = "nodejs";
export const maxDuration = 60;

const provider = () => process.env.ASSISTANT_PROVIDER || "demo";
const serviceUrl = () => (process.env.CREWAI_SERVICE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
const headers = () => ({ "Content-Type": "application/json", ...(process.env.CREWAI_SERVICE_TOKEN ? { Authorization: `Bearer ${process.env.CREWAI_SERVICE_TOKEN}` } : {}) });
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET() {
  if (provider() === "demo") return json({ provider: "demo", ready: true, label: "Demonstração local · sem LLM" });
  if (provider() !== "crewai") return json({ provider: "unavailable", ready: false, label: "Provedor não reconhecido" });
  try {
    const response = await fetch(`${serviceUrl()}/health`, { headers: headers(), signal: AbortSignal.timeout(3000), cache: "no-store" });
    const health = await response.json();
    const ready = response.ok && health.service === "crewai" && health.ready === true;
    const azure = health.provider === "azure_foundry";
    return json({ provider: "crewai", ready, label: ready ? (azure ? "CrewAI · Azure Foundry configurado" : "CrewAI · modelo configurado") : (azure ? "CrewAI · configurar Azure Foundry" : "CrewAI · configurar provedor") });
  } catch {
    return json({ provider: "crewai", ready: false, label: "CrewAI · serviço indisponível" });
  }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  // Next dev normaliza request.url para 0.0.0.0; Host preserva localhost ou o IP usado pelo tablet.
  if (origin) {
    try {
      if (new URL(origin).host !== (request.headers.get("host") || new URL(request.url).host)) return json({ error: "Origem não permitida." }, 403);
    } catch { return json({ error: "Origem inválida." }, 403); }
  }
  let body;
  try {
    const text = await request.text();
    if (text.length > 80000) return json({ error: "Conversa excede o limite de envio." }, 413);
    body = chatRequestSchema.safeParse(JSON.parse(text));
  } catch {
    return json({ error: "Solicitação inválida." }, 400);
  }
  if (!body.success) return json({ error: "Dados da conversa inválidos." }, 400);
  const payload = body.data;
  if (payload.conversation.status !== "ai") return json(unavailableReply("Automação pausada nesta conversa."));
  // A mesma análise é idempotente por mensagem; também protege chamadas diretas à API.
  try {
    const response = await crmBackend("/sentiment/analyze", "POST", payload, 12000);
    if (!response.ok) throw new Error("sentiment_unavailable");
    const { alert } = sentimentResultSchema.parse(await response.json());
    if (alert && needsHandoff(alert)) return json({ ...unavailableReply(alert.reason), text: alert.category === "human_request" ? humanRequestHandoff : sentimentHandoff });
  } catch { return json(unavailableReply("Monitor de atendimento indisponível. A equipe deve verificar a conversa.")); }
  if (provider() === "demo") {
    const conversation = { ...payload.conversation, initials: "", color: "mint", phone: "", topic: "", unread: 0, messages: payload.conversation.messages.map((m) => ({ ...m, time: "" })) };
    return json(generateReply(conversation.messages.at(-1)!.text, conversation));
  }
  if (provider() !== "crewai") return json(unavailableReply("Provedor de IA não reconhecido."));
  try {
    const response = await fetch(`${serviceUrl()}/chat`, { method: "POST", headers: headers(), body: JSON.stringify(payload), cache: "no-store", signal: AbortSignal.timeout(35000) });
    if (!response.ok) return json(unavailableReply("CrewAI não concluiu a solicitação."));
    const reply = chatReplySchema.safeParse(await response.json());
    if (!reply.success) return json(unavailableReply("CrewAI retornou um resultado fora do contrato."));
    return json(reply.data);
  } catch {
    return json(unavailableReply("CrewAI indisponível ou tempo limite atingido."));
  }
}
