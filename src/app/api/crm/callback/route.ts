import { crmBackend } from "@/lib/server/crm-proxy";
import { oauthResult, readOAuthCookie, validOAuthState } from "@/lib/server/crm-oauth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  if (!validOAuthState(readOAuthCookie(request), query.get("state"))) return oauthResult("invalid_state");
  if (query.get("error")) return oauthResult("cancelled");
  const code = query.get("code");
  if (!code || code.length > 2000) return oauthResult("invalid_code");
  try {
    const response = await crmBackend("/oauth/exchange", "POST", { code });
    return oauthResult(response.ok ? "connected" : "authorization_failed");
  } catch { return oauthResult("service_unavailable"); }
}
