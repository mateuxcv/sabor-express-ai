import assert from "node:assert/strict";
import { test } from "node:test";
import { GET, POST } from "../src/app/api/assistant/route";

const payload = { requestId: "m1", conversation: { id: "c1", name: "Cliente", store: "São Paulo · Pinheiros", status: "ai", messages: [{ id: "m1", author: "customer", text: "Quero reservar uma mesa para 4 pessoas" }] } };
const request = () => new Request("http://localhost/api/assistant", { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost" }, body: JSON.stringify(payload) });
const neutral = { assessment: { level: "none", category: "other", reason: "Sem sinal", evidence: "", confidence: 0, source: "rules" }, alert: null };

test("aceita Host do navegador quando Next normaliza a URL interna", async (t) => {
  const original = process.env.ASSISTANT_PROVIDER;
  process.env.ASSISTANT_PROVIDER = "demo";
  t.mock.method(globalThis, "fetch", async () => Response.json(neutral));
  t.after(() => { if (original === undefined) delete process.env.ASSISTANT_PROVIDER; else process.env.ASSISTANT_PROVIDER = original; });
  const response = await POST(new Request("http://0.0.0.0:3000/api/assistant", { method: "POST", headers: { Host: "localhost:3000", Origin: "http://localhost:3000" }, body: JSON.stringify(payload) }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).routing.agent, "reservations");
});

test("proxy CrewAI envia contexto validado e token somente ao serviço", async (t) => {
  const originalProvider = process.env.ASSISTANT_PROVIDER;
  const originalToken = process.env.CREWAI_SERVICE_TOKEN;
  process.env.ASSISTANT_PROVIDER = "crewai";
  process.env.CREWAI_SERVICE_TOKEN = "test-internal-token";
  t.after(() => {
    if (originalProvider === undefined) delete process.env.ASSISTANT_PROVIDER; else process.env.ASSISTANT_PROVIDER = originalProvider;
    if (originalToken === undefined) delete process.env.CREWAI_SERVICE_TOKEN; else process.env.CREWAI_SERVICE_TOKEN = originalToken;
  });
  t.mock.method(globalThis, "fetch", async (_url: string, options: RequestInit) => {
    assert.equal(new Headers(options.headers).get("Authorization"), "Bearer test-internal-token");
    assert.equal(JSON.parse(String(options.body)).conversation.messages[0].text, payload.conversation.messages[0].text);
    if (String(_url).endsWith("/sentiment/analyze")) return Response.json(neutral);
    return Response.json({ text: "Qual a data?", status: "ai", topic: "Reserva", routing: { agent: "reservations", source: "crewai", reason: "Coleta", summary: "4 pessoas", missingFields: ["date", "time"] } });
  });
  const response = await POST(request());
  const reply = await response.json();
  assert.equal(reply.routing.agent, "reservations");
  assert.equal(JSON.stringify(reply).includes("test-internal-token"), false);
});

test("proxy não troca para demo quando o CrewAI falha", async (t) => {
  const original = process.env.ASSISTANT_PROVIDER;
  process.env.ASSISTANT_PROVIDER = "crewai";
  t.after(() => { if (original === undefined) delete process.env.ASSISTANT_PROVIDER; else process.env.ASSISTANT_PROVIDER = original; });
  t.mock.method(globalThis, "fetch", async () => { throw new Error("connection_refused"); });
  const reply = await (await POST(request())).json();
  assert.equal(reply.status, "waiting");
  assert.equal(reply.routing.source, "fallback");
  const health = await (await GET()).json();
  assert.equal(health.provider, "crewai");
  assert.equal(health.ready, false);
});

test("status da interface identifica a configuração Azure Foundry", async (t) => {
  const original = process.env.ASSISTANT_PROVIDER;
  process.env.ASSISTANT_PROVIDER = "crewai";
  t.after(() => { if (original === undefined) delete process.env.ASSISTANT_PROVIDER; else process.env.ASSISTANT_PROVIDER = original; });
  t.mock.method(globalThis, "fetch", async () => Response.json({ service: "crewai", provider: "azure_foundry", ready: true }));
  const status = await (await GET()).json();
  assert.equal(status.label, "CrewAI · Azure Foundry configurado");
  assert.equal(status.ready, true);
});
