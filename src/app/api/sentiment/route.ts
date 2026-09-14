import { z } from "zod";
import { chatRequestSchema } from "@/lib/assistant-contract";
import { sentimentActionSchema, sentimentAlertSchema, sentimentDashboardSchema, sentimentResultSchema } from "@/lib/sentiment-contract";
import { crmBackend, crmFailure, crmJson, sameCrmOrigin } from "@/lib/server/crm-proxy";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const conversationId = query.get("conversationId"), store = query.get("store");
  if ((conversationId !== null && (!conversationId || conversationId.length > 120)) || (store?.length || 0) > 100) return crmJson({ error: "Filtro inválido." }, 400);
  const params = new URLSearchParams();
  if (conversationId) params.set("conversation_id", conversationId);
  if (store) params.set("store", store);
  try {
    const response = await crmBackend(`/sentiment?${params}`);
    if (!response.ok) return crmFailure(response);
    return crmJson((conversationId ? z.object({ alert: sentimentAlertSchema.nullable() }) : sentimentDashboardSchema).parse(await response.json()));
  } catch { return crmJson({ error: "Monitor de atendimento indisponível. Confira o serviço Python." }, 503); }
}

export async function POST(request: Request) {
  if (!sameCrmOrigin(request)) return crmJson({ error: "Origem não permitida." }, 403);
  let payload;
  try {
    const text = await request.text();
    if (text.length > 80000) return crmJson({ error: "Solicitação muito grande." }, 413);
    payload = JSON.parse(text);
  } catch { return crmJson({ error: "Solicitação inválida." }, 400); }
  const analyzing = payload?.action === "analyze";
  const parsed = (analyzing ? chatRequestSchema : sentimentActionSchema).safeParse(payload);
  if (!parsed.success) return crmJson({ error: "Dados de atendimento inválidos." }, 400);
  try {
    const response = await crmBackend(`/sentiment/${analyzing ? "analyze" : "action"}`, "POST", parsed.data, 12000);
    if (!response.ok) return crmFailure(response);
    return crmJson((analyzing ? sentimentResultSchema : sentimentAlertSchema).parse(await response.json()));
  } catch { return crmJson({ error: "Não foi possível registrar a análise. Confira o serviço Python e tente novamente." }, 503); }
}
