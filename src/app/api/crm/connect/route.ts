import { crmBackend } from "@/lib/server/crm-proxy";
import { newOAuthState, oauthCookie, oauthResult } from "@/lib/server/crm-oauth";

export const runtime = "nodejs";

export async function GET() {
  const state = newOAuthState();
  try {
    const response = await crmBackend("/oauth/start", "POST", { state });
    if (!response.ok) return oauthResult("configuration_error");
    const data = await response.json();
    const url = new URL(data.url);
    if (url.origin !== "https://accounts.rdstation.com" || url.pathname !== "/oauth/authorize" || url.searchParams.get("state") !== state) return oauthResult("configuration_error");
    return new Response(null, { status: 302, headers: { Location: url.toString(), "Set-Cookie": oauthCookie(state), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch { return oauthResult("service_unavailable"); }
}
