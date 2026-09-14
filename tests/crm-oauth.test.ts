import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { GET as connect } from "../src/app/api/crm/connect/route";
import { GET as callback } from "../src/app/api/crm/callback/route";
import { GET as status, POST } from "../src/app/api/crm/route";
import { OAUTH_COOKIE } from "../src/lib/server/crm-oauth";

function setup(t: TestContext) {
  const old = process.env.CREWAI_SERVICE_TOKEN;
  process.env.CREWAI_SERVICE_TOKEN = "private-service-key";
  t.after(() => { if (old === undefined) delete process.env.CREWAI_SERVICE_TOKEN; else process.env.CREWAI_SERVICE_TOKEN = old; });
}

test("OAuth cria state em cookie HttpOnly e valida callback antes de trocar código", async (t) => {
  setup(t);
  const codes: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    assert.equal(new Headers(options.headers).get("Authorization"), "Bearer private-service-key");
    const data = JSON.parse(String(options.body));
    if (url.endsWith("/oauth/start")) return Response.json({ url: `https://accounts.rdstation.com/oauth/authorize?client_id=public-id&state=${data.state}` });
    codes.push(data.code);
    return Response.json({ connected: true, access_token: "never-expose" });
  });
  const start = await connect();
  const cookie = start.headers.get("set-cookie")!;
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
  const bad = await callback(new Request("http://localhost/api/crm/callback?code=code&state=bad", { headers: { Cookie: cookie.split(";")[0] } }));
  assert.equal(bad.headers.get("location"), "/crm?connection=invalid_state");
  assert.deepEqual(codes, []);
  const success = await callback(new Request(`http://localhost/api/crm/callback?code=code&state=${state}`, { headers: { Cookie: `${OAUTH_COOKIE}=${state}` } }));
  assert.equal(success.headers.get("location"), "/crm?connection=connected");
  assert.match(success.headers.get("set-cookie")!, /Max-Age=0/);
  assert.deepEqual(codes, ["code"]);
  assert.equal((await success.text()).includes("never-expose"), false);
});

test("callback sem cookie é recusado e não inicia troca de tokens", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch");
  const response = await callback(new Request(`http://localhost/api/crm/callback?code=code&state=${"a".repeat(64)}`));
  assert.equal(response.headers.get("location"), "/crm?connection=invalid_state");
  assert.equal(fetch.mock.callCount(), 0);
});

test("perfil passa por contrato público e não retorna campos secretos do backend", async (t) => {
  setup(t);
  t.mock.method(globalThis, "fetch", async () => Response.json({ id: "customer-id", name: "Mariana", phone: "+5511999990000", email: null, token: "private" }));
  const response = await POST(new Request("http://0.0.0.0:3000/api/crm", { method: "POST", headers: { Host: "localhost:3000", Origin: "http://localhost:3000" }, body: JSON.stringify({ action: "customer", conversationId: "conversation", name: "Mariana", phone: "11999990000" }) }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.token, undefined);
  assert.equal(result.id, "customer-id");
});

test("proxy não permite trocar tokens por ação pública nem aceitar origem externa", async () => {
  assert.equal((await POST(new Request("http://localhost/api/crm", { method: "POST", body: JSON.stringify({ action: "oauth/exchange", code: "x" }) }))).status, 400);
  assert.equal((await POST(new Request("http://localhost/api/crm", { method: "POST", headers: { Origin: "https://other.example" }, body: JSON.stringify({ action: "disconnect" }) }))).status, 403);
});

test("status público remove credenciais e dados internos", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ configured: true, connected: true, connectionStatus: "connected", configurationMessage: null, connectedAt: "2026-09-13", mappings: [], events: [], customer: null, tokens: { access_token: "private", refresh_token: "private" } }));
  const result = await (await status(new Request("http://localhost/api/crm"))).json();
  assert.equal(result.tokens, undefined);
  assert.equal(result.connected, true);
});
