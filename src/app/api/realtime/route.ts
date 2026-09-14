import { callConnectionSchema, callStartSchema } from "@/lib/realtime-contract";
import { realtimeFailure, realtimeHeaders, realtimeJson, realtimeServiceUrl, sameRealtimeOrigin } from "@/lib/server/realtime-proxy";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("conversationId") || "";
  if (id.length > 120) return realtimeJson({ error: "Conversa inválida." }, 400);
  try {
    const response = await fetch(`${realtimeServiceUrl()}/realtime/config?conversation_id=${encodeURIComponent(id)}`, { headers: realtimeHeaders(), signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!response.ok) return realtimeFailure(response);
    const data = await response.json();
    return realtimeJson({ ready: data.ready === true, provider: "azure", model: typeof data.model === "string" ? data.model : undefined, maxSeconds: data.maxSeconds, busy: data.busy === true, message: typeof data.message === "string" ? data.message : undefined });
  } catch { return realtimeJson({ ready: false, message: "O serviço de ligações está indisponível. Inicie npm run dev:crew." }, 503); }
}

export async function POST(request: Request) {
  if (!sameRealtimeOrigin(request)) return realtimeJson({ error: "Origem não permitida." }, 403);
  let body;
  try {
    const text = await request.text();
    if (text.length > 100000) return realtimeJson({ error: "Solicitação muito grande." }, 413);
    body = callStartSchema.safeParse(JSON.parse(text));
  } catch { return realtimeJson({ error: "Dados de ligação inválidos." }, 400); }
  if (!body.success) return realtimeJson({ error: "Dados de ligação inválidos ou conversa fora do atendimento da IA." }, 400);
  try {
    const response = await fetch(`${realtimeServiceUrl()}/realtime/connect`, { method: "POST", headers: realtimeHeaders(), body: JSON.stringify(body.data), signal: AbortSignal.any([request.signal, AbortSignal.timeout(50000)]), cache: "no-store" });
    if (!response.ok) return realtimeFailure(response);
    const result = callConnectionSchema.safeParse(await response.json());
    if (!result.success) return realtimeJson({ error: "O serviço retornou uma conexão de áudio inválida." }, 502);
    return realtimeJson(result.data);
  } catch { return realtimeJson({ error: "A conexão da ligação não foi concluída. Tente novamente." }, 503); }
}
