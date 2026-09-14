import { callSnapshotSchema } from "@/lib/realtime-contract";
import { realtimeFailure, realtimeHeaders, realtimeJson, realtimeServiceUrl, sameRealtimeOrigin } from "@/lib/server/realtime-proxy";

export const runtime = "nodejs";

async function proxy(request: Request, params: Promise<{ id: string }>, method: "GET" | "DELETE") {
  if (!sameRealtimeOrigin(request)) return realtimeJson({ error: "Origem não permitida." }, 403);
  const { id } = await params;
  if (!/^[a-zA-Z0-9-]{1,120}$/.test(id) || !request.headers.get("x-call-token")) return realtimeJson({ error: "Ligação inválida." }, 400);
  const reason = new URL(request.url).searchParams.get("reason") || "ended";
  if (method === "DELETE" && !["ended", "cancelled", "human", "disconnected", "time_limit"].includes(reason)) return realtimeJson({ error: "Motivo inválido." }, 400);
  try {
    const response = await fetch(`${realtimeServiceUrl()}/realtime/calls/${id}${method === "DELETE" ? `?reason=${reason}` : ""}`, { method, headers: realtimeHeaders(request), signal: AbortSignal.timeout(10000), cache: "no-store" });
    if (!response.ok) return realtimeFailure(response);
    const snapshot = callSnapshotSchema.safeParse(await response.json());
    if (!snapshot.success) return realtimeJson({ error: "Estado da ligação inválido." }, 502);
    return realtimeJson(snapshot.data);
  } catch { return realtimeJson({ error: "Não foi possível atualizar a ligação." }, 503); }
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return proxy(request, context.params, "GET"); }
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) { return proxy(request, context.params, "DELETE"); }
