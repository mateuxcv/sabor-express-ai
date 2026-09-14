import assert from "node:assert/strict";
import { test } from "node:test";
import { GET, POST } from "../src/app/api/csat/route";

const survey = { id: "10000000-0000-4000-8000-000000000001", conversationId: "conversation", customerName: "Teste", store: "São Paulo · Pinheiros", createdAt: 100, score: 4, comment: "Ótimo", answeredAt: 101, crmStatus: "pending", crmError: null, dealUrl: null };

test("CSAT rejeita notas inválidas e origem externa antes de acessar o backend", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch");
  for (const score of [0, 6, 1.5, "5", true]) {
    const response = await POST(new Request("http://localhost/api/csat", { method: "POST", body: JSON.stringify({ action: "answer", surveyId: survey.id, conversationId: "conversation", score }) }));
    assert.equal(response.status, 400);
  }
  const response = await POST(new Request("http://localhost/api/csat", { method: "POST", headers: { Origin: "https://other.example" }, body: JSON.stringify({ action: "issue", conversationId: "conversation", store: survey.store, customerName: "Teste" }) }));
  assert.equal(response.status, 403);
  assert.equal(fetch.mock.callCount(), 0);
});

test("CSAT envia apenas a resposta validada e retorna o registro sem dados internos", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    assert.ok(url.endsWith("/crm/csat/answer"));
    assert.deepEqual(JSON.parse(String(options.body)), { surveyId: survey.id, conversationId: "conversation", score: 4, comment: "Ótimo" });
    return Response.json({ ...survey, tokens: "private" });
  });
  const response = await POST(new Request("http://localhost/api/csat", { method: "POST", body: JSON.stringify({ action: "answer", surveyId: survey.id, conversationId: "conversation", score: 4, comment: " Ótimo ", dealId: "untrusted" }) }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), survey);
});

test("CSAT não transforma falha do backend em resposta salva", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ error: "Pesquisa já respondida." }, { status: 409 }));
  const response = await POST(new Request("http://localhost/api/csat", { method: "POST", body: JSON.stringify({ action: "answer", surveyId: survey.id, conversationId: "conversation", score: 5 }) }));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, "Pesquisa já respondida.");
});

test("consulta CSAT codifica o identificador e valida o contrato público", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: string) => {
    assert.equal(new URL(url).searchParams.get("conversation_id"), "conversation&store=other");
    return Response.json({ survey: { ...survey, private: true } });
  });
  const response = await GET(new Request("http://localhost/api/csat?conversationId=conversation%26store%3Dother"));
  assert.deepEqual(await response.json(), { survey });
});
