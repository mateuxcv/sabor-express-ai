import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { GET, POST } from "../src/app/api/realtime/route";
import { DELETE } from "../src/app/api/realtime/[id]/route";

const id = "10000000-0000-4000-8000-000000000001";
const sdp = "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n";
const payload = { sdp, conversation: { id: "test", name: "Cliente", store: "São Paulo · Pinheiros", status: "ai", messages: [] } };

function config(t: TestContext) {
  const old = process.env.CREWAI_SERVICE_TOKEN;
  process.env.CREWAI_SERVICE_TOKEN = "server-private-key";
  t.after(() => { if (old === undefined) delete process.env.CREWAI_SERVICE_TOKEN; else process.env.CREWAI_SERVICE_TOKEN = old; });
}

test("negociação Realtime devolve SDP e credencial local, sem chaves do Azure", async (t) => {
  config(t);
  t.mock.method(globalThis, "fetch", async (_url: string, options: RequestInit) => {
    assert.equal(new Headers(options.headers).get("Authorization"), "Bearer server-private-key");
    return Response.json({ id, token: "local-call-capability-123456789", answer: sdp, maxSeconds: 300, azureKey: "do-not-return", ephemeral: "also-private" });
  });
  const response = await POST(new Request("http://localhost/api/realtime", { method: "POST", body: JSON.stringify(payload) }));
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.answer, sdp);
  assert.equal(result.azureKey, undefined);
  assert.equal(result.ephemeral, undefined);
});

test("notas internas e conversa humana não iniciam ligação", async () => {
  for (const conversation of [{ ...payload.conversation, status: "human" }, { ...payload.conversation, messages: [{ id: "note", author: "note", text: "Nota interna" }] }]) {
    assert.equal((await POST(new Request("http://localhost/api/realtime", { method: "POST", body: JSON.stringify({ ...payload, conversation }) }))).status, 400);
  }
});

test("encerramento exige credencial e bloqueia outra origem", async () => {
  assert.equal((await DELETE(new Request(`http://localhost/api/realtime/${id}`, { method: "DELETE" }), { params: Promise.resolve({ id }) })).status, 400);
  assert.equal((await DELETE(new Request(`http://localhost/api/realtime/${id}`, { method: "DELETE", headers: { Origin: "https://other.example", "x-call-token": "not-valid" } }), { params: Promise.resolve({ id }) })).status, 403);
});

test("estado público de configuração não expõe credenciais", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ ready: true, model: "gpt-realtime-2.1", busy: false, maxSeconds: 300, key: "private-key" }));
  const result = await (await GET(new Request("http://localhost/api/realtime?conversationId=test"))).json();
  assert.equal(result.ready, true);
  assert.equal(result.model, "gpt-realtime-2.1");
  assert.equal(result.key, undefined);
});
