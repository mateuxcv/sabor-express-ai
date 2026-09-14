import { z } from "zod";
import { crmActionSchema, crmStatusSchema, customerProfileSchema, crmMappingSchema } from "@/lib/crm-contract";
import { crmBackend, crmFailure, crmJson, sameCrmOrigin } from "@/lib/server/crm-proxy";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const conversationId = query.get("conversationId");
  const pipelineId = query.get("pipelineId");
  if ((conversationId?.length || 0) > 120 || (pipelineId && !/^[a-f0-9]{24}$/.test(pipelineId))) return crmJson({ error: "Filtro inválido." }, 400);
  try {
    if (query.get("options") === "true") {
      const response = await crmBackend(`/options${pipelineId ? `?pipeline_id=${pipelineId}` : ""}`);
      if (!response.ok) return crmFailure(response);
      const option = z.object({ id: z.string(), name: z.string() });
      const schema = z.object({ pipelines: z.array(option).optional(), users: z.array(option).optional(), stages: z.array(option).optional() });
      return crmJson(schema.parse(await response.json()));
    }
    const response = await crmBackend(`/status${conversationId ? `?conversation_id=${encodeURIComponent(conversationId)}` : ""}`);
    if (!response.ok) return crmFailure(response);
    return crmJson(crmStatusSchema.parse(await response.json()));
  } catch { return crmJson({ error: "O serviço de integração está indisponível. Confira npm run dev:crew." }, 503); }
}

export async function POST(request: Request) {
  if (!sameCrmOrigin(request)) return crmJson({ error: "Origem não permitida." }, 403);
  let parsed;
  try { const text = await request.text(); if (text.length > 6000) return crmJson({ error: "Solicitação muito grande." }, 413); parsed = crmActionSchema.safeParse(JSON.parse(text)); } catch { return crmJson({ error: "Dados inválidos." }, 400); }
  if (!parsed.success) return crmJson({ error: "Confira os campos informados." }, 400);
  const data = parsed.data;
  try {
    let response: Response;
    if (data.action === "customer") {
      response = await crmBackend("/customer", "PUT", { conversationId: data.conversationId, name: data.name, phone: data.phone, email: data.email });
      if (!response.ok) return crmFailure(response);
      return crmJson(customerProfileSchema.parse(await response.json()));
    }
    if (data.action === "mapping") {
      response = await crmBackend("/mapping", "PUT", { store: data.store, pipelineId: data.pipelineId, stageId: data.stageId, ownerId: data.ownerId });
      if (!response.ok) return crmFailure(response);
      return crmJson(crmMappingSchema.parse(await response.json()));
    }
    if (data.action === "enqueue") response = await crmBackend(`/conversations/${encodeURIComponent(data.conversationId)}/enqueue`, "POST");
    else if (data.action === "retry") response = await crmBackend(`/events/${data.eventId}/retry`, "POST");
    else response = await crmBackend("/disconnect", "POST");
    if (!response.ok) return crmFailure(response);
    return crmJson({ ok: true });
  } catch { return crmJson({ error: "Não foi possível concluir a operação. Tente novamente." }, 503); }
}
