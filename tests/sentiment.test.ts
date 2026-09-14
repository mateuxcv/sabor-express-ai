import assert from "node:assert/strict";
import { test } from "node:test";
import { GET, POST } from "../src/app/api/sentiment/route";
import { POST as assistant } from "../src/app/api/assistant/route";

const assessment = { level: "high", category: "automation", reason: "Cliente repetiu a dificuldade", evidence: "Você não entende", confidence: 1, source: "rules" };
const alert = { ...assessment, id: "11111111-1111-4111-8111-111111111111", conversationId: "c1", customerName: "Cliente", store: "São Paulo · Pinheiros", status: "open", createdAt: 1, updatedAt: 1, waitingSince: 1, acknowledgedAt: null, resolvedAt: null, ownerName: null, crmStatus: "pending", crmError: null, taskId: null, dealUrl: null };
const payload = { action: "analyze", requestId: "m1", conversation: { id: "c1", name: "Cliente", store: alert.store, status: "ai", messages: [{ id: "m1", author: "customer", text: assessment.evidence }] } };
const request = (body: unknown, origin = "http://localhost") => new Request("http://localhost/api/sentiment", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("monitor valida origem e mensagens antes de chamar o backend", async (t) => {
  const backend = t.mock.method(globalThis, "fetch", async () => { throw new Error("unexpected"); });
  assert.equal((await POST(request(payload, "http://other.test"))).status, 403);
  assert.equal((await POST(request({ ...payload, requestId: "different" }))).status, 400);
  assert.equal((await POST(request({ ...payload, conversation: { ...payload.conversation, messages: [{ id: "m1", author: "note", text: "Nota privada" }] } }))).status, 400);
  assert.equal(backend.mock.calls.length, 0);
});

test("monitor retorna apenas contrato público e preserva status pendente do CRM", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: string, options?: RequestInit) => {
    assert.ok(String(url).endsWith("/crm/sentiment/analyze"));
    assert.equal(JSON.parse(String(options?.body)).action, undefined);
    return Response.json({ assessment, alert, secret: "private" });
  });
  const response = await POST(request(payload));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.alert.crmStatus, "pending");
  assert.equal(body.secret, undefined);
});

test("alerta alto impede chamada ao assistente operacional", async (t) => {
  const backend = t.mock.method(globalThis, "fetch", async (url: string) => {
    assert.ok(String(url).endsWith("/sentiment/analyze"));
    return Response.json({ assessment, alert });
  });
  const body = await (await assistant(request(payload))).json();
  assert.equal(body.status, "waiting");
  assert.equal(body.routing.agent, "human");
  assert.match(body.text, /Encaminhei/);
  assert.equal(backend.mock.calls.length, 1);
});

test("consulta e ação não simulam sucesso quando a persistência falha", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ error: "Serviço indisponível" }, { status: 503 }));
  assert.equal((await GET(new Request("http://localhost/api/sentiment"))).status, 503);
  assert.equal((await POST(request({ action: "acknowledge", alertId: alert.id }))).status, 503);
});
