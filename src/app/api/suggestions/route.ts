import { suggestionRequestSchema, suggestionResultSchema } from "@/lib/suggestion-contract";
import { realtimeHeaders, realtimeJson, realtimeServiceUrl, sameRealtimeOrigin } from "@/lib/server/realtime-proxy";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  if (!sameRealtimeOrigin(request)) return realtimeJson({ error: "Origem não permitida." }, 403);
  let payload;
  try {
    const text = await request.text();
    if (text.length > 160000) return realtimeJson({ error: "O contexto excede o limite de envio." }, 413);
    payload = suggestionRequestSchema.parse(JSON.parse(text));
  } catch { return realtimeJson({ error: "Não foi possível identificar a última mensagem do cliente. Atualize a conversa." }, 400); }
  if (payload.conversation.status === "resolved") return realtimeJson({ error: "Reabra a conversa para preparar uma resposta." }, 409);
  try {
    const response = await fetch(`${realtimeServiceUrl()}/suggestions`, { method: "POST", headers: realtimeHeaders(),
      body: JSON.stringify(payload), cache: "no-store", signal: AbortSignal.timeout(23000) });
    if (!response.ok) {
      // Mensagens públicas controladas; nunca repassar erro bruto do provedor ou segredos.
      const errors: Record<number, string> = { 401: "Confira a autenticação do serviço de atendimento.",
        409: "O contexto da conversa mudou. Atualize antes de gerar novamente.",
        429: "A IA está ocupada. Tente novamente em instantes.",
        503: "As sugestões estão indisponíveis. Confira o serviço Python e a configuração do modelo Azure.",
        504: "A IA demorou para responder. Tente novamente; seu rascunho foi preservado." };
      return realtimeJson({ error: errors[response.status] || "Não foi possível gerar sugestões válidas. Tente novamente." }, response.status >= 400 && response.status < 600 ? response.status : 502);
    }
    const result = suggestionResultSchema.parse(await response.json());
    if (result.requestId !== payload.requestId || result.lastCustomerMessageId !== payload.lastCustomerMessageId) return realtimeJson({ error: "A sugestão não corresponde à mensagem selecionada. Gere novamente." }, 502);
    return realtimeJson(result);
  } catch { return realtimeJson({ error: "Não foi possível consultar a IA. Tente novamente; seu rascunho foi preservado." }, 503); }
}
