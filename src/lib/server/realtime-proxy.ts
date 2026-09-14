export const realtimeServiceUrl = () => (process.env.CREWAI_SERVICE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
export const realtimeHeaders = (request?: Request) => ({
  "Content-Type": "application/json",
  ...(process.env.CREWAI_SERVICE_TOKEN ? { Authorization: `Bearer ${process.env.CREWAI_SERVICE_TOKEN}` } : {}),
  ...(request?.headers.get("x-call-token") ? { "x-call-token": request.headers.get("x-call-token")! } : {}),
});
export const realtimeJson = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export function sameRealtimeOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === (request.headers.get("host") || new URL(request.url).host); } catch { return false; }
}

export async function realtimeFailure(response: Response) {
  let data;
  try { data = await response.json(); } catch { data = null; }
  const message = typeof data?.error === "string" && data.error.length < 300 ? data.error : "Não foi possível concluir a ligação. Confira o serviço Realtime.";
  return realtimeJson({ error: message }, response.status >= 400 && response.status <= 599 ? response.status : 502);
}
