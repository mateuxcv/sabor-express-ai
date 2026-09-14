import { randomBytes, timingSafeEqual } from "node:crypto";

export const OAUTH_COOKIE = "sabor_rd_oauth_state";
export const newOAuthState = () => randomBytes(32).toString("hex");

export function validOAuthState(expected: string | undefined, received: string | null) {
  return !!expected && !!received && /^[a-f0-9]{64}$/.test(expected) && /^[a-f0-9]{64}$/.test(received) && timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

export function readOAuthCookie(request: Request) {
  return request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${OAUTH_COOKIE}=`))?.slice(OAUTH_COOKIE.length + 1);
}

export function oauthCookie(value: string, clear = false) {
  const secure = process.env.RD_CRM_REDIRECT_URI?.startsWith("https://") ? "; Secure" : "";
  return `${OAUTH_COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/api/crm; Max-Age=${clear ? 0 : 600}${secure}`;
}

export function oauthResult(result: string) {
  return new Response(null, { status: 303, headers: { Location: `/crm?connection=${encodeURIComponent(result)}`, "Set-Cookie": oauthCookie("", true), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
