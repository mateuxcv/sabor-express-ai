import { z } from "zod";
import { csatActionSchema, csatMetricsSchema, csatSurveySchema } from "@/lib/csat-contract";
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
    const response = await crmBackend(`/csat?${params}`);
    if (!response.ok) return crmFailure(response);
    const schema = conversationId ? z.object({ survey: csatSurveySchema.nullable() }) : csatMetricsSchema;
    return crmJson(schema.parse(await response.json()));
  } catch { return crmJson({ error: "O serviço de pesquisas está indisponível. Confira o serviço Python." }, 503); }
}

export async function POST(request: Request) {
  if (!sameCrmOrigin(request)) return crmJson({ error: "Origem não permitida." }, 403);
  let data;
  try {
    const text = await request.text();
    if (text.length > 6000) return crmJson({ error: "Solicitação muito grande." }, 413);
    data = csatActionSchema.parse(JSON.parse(text));
  } catch { return crmJson({ error: "Confira a pesquisa e informe uma nota inteira de 1 a 5." }, 400); }
  try {
    const { action, ...payload } = data;
    const response = await crmBackend(`/csat/${action}`, "POST", payload);
    if (!response.ok) return crmFailure(response);
    return crmJson(csatSurveySchema.parse(await response.json()));
  } catch { return crmJson({ error: "Não foi possível salvar a pesquisa. Tente novamente." }, 503); }
}
