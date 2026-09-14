import { realtimeHeaders, realtimeServiceUrl, sameRealtimeOrigin } from "./realtime-proxy";

export { sameRealtimeOrigin as sameCrmOrigin };
export const crmJson = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function crmBackend(path: string, method = "GET", body?: unknown, timeoutMs = 45000) {
  return fetch(`${realtimeServiceUrl()}/crm${path}`, { method, headers: realtimeHeaders(), body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
}

export async function crmFailure(response: Response) {
  let result;
  try { result = await response.json(); } catch { result = null; }
  return crmJson({ error: typeof result?.error === "string" && result.error.length < 500 ? result.error : "Não foi possível concluir esta operação no CRM. Confira os dados informados." }, response.status >= 400 && response.status < 600 ? response.status : 502);
}
