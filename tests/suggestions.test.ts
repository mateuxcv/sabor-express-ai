import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "../src/app/api/suggestions/route";
import { createSession } from "../src/lib/demo-data";
import { suggestionContext, suggestionRequestSchema } from "../src/lib/suggestion-contract";

const conversation = { ...createSession("c1").conversations[0], messages: [
  { id: "m1", author: "customer" as const, text: "O pedido está atrasado", time: "12:00" },
  { id: "m2", author: "ai" as const, text: "Vou chamar a equipe", time: "12:01" },
] };
const context = suggestionContext(conversation)!;
const payload = { ...context, requestId: "request-1" };
const responseBody = { requestId: "request-1", lastCustomerMessageId: "m1", provider: "azure_foundry", suggestions: [
  { id: "empathetic", label: "Empática", text: "Sinto muito pela espera. Vou verificar o andamento com a unidade." },
  { id: "concise", label: "Direta", text: "Vou conferir o andamento do seu pedido com a unidade." },
  { id: "nextStep", label: "Próximo passo", text: "Vou consultar a unidade e te orientar sobre o próximo passo por aqui." },
] };
const request = (body: unknown = payload, origin = "http://localhost") => new Request("http://localhost/api/suggestions", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("contexto seleciona última mensagem do cliente e exclui notas, eventos e CSAT", () => {
  const result = suggestionContext({ ...conversation, messages: [...conversation.messages,
    { id: "private", author: "note", text: "Nota interna privada", time: "12:01" },
    { id: "event", author: "event", text: "Conversa encaminhada", time: "12:01" },
    { id: "survey", author: "ai", text: "Pesquisa", time: "12:01", csatSurveyId: "survey-1" },
    { id: "csat", author: "customer", text: "Nota: 1/5", time: "12:02", csatResponse: true },
  ] });
  assert.equal(result?.lastCustomerMessageId, "m1");
  assert.equal(result?.conversation.messages.length, 2);
  assert.ok(!JSON.stringify(result).includes("privada"));
  assert.equal(suggestionContext(createSession("empty").conversations[0]), null);
});

test("contexto longo mantém o último cliente e limita a 30 mensagens", () => {
  const messages = [...conversation.messages, ...Array.from({ length: 35 }, (_, index) => ({ id: `a${index}`, author: "agent" as const, text: "Acompanhando o atendimento", time: "12:03" }))];
  const result = suggestionContext({ ...conversation, messages });
  assert.equal(result?.conversation.messages.length, 30);
  assert.equal(result?.conversation.messages[0].id, "m1");
});

test("origem externa, notas internas e alvo incorreto são rejeitados antes do provedor", async (t) => {
  const backend = t.mock.method(globalThis, "fetch", async () => { throw new Error("unexpected"); });
  assert.equal((await POST(request(payload, "http://other.test"))).status, 403);
  assert.equal((await POST(request({ ...payload, lastCustomerMessageId: "m2" }))).status, 400);
  assert.equal(suggestionRequestSchema.safeParse({ ...payload, conversation: { ...payload.conversation, messages: [{ id: "m1", author: "note", text: "segredo" }] } }).success, false);
  assert.equal(backend.mock.calls.length, 0);
});

test("proxy usa token interno, valida as três respostas e não retorna dados extras", async (t) => {
  const original = process.env.CREWAI_SERVICE_TOKEN;
  process.env.CREWAI_SERVICE_TOKEN = "secret-test";
  t.after(() => { if (original === undefined) delete process.env.CREWAI_SERVICE_TOKEN; else process.env.CREWAI_SERVICE_TOKEN = original; });
  t.mock.method(globalThis, "fetch", async (url: string, options?: RequestInit) => {
    assert.ok(url.endsWith("/suggestions"));
    assert.equal(new Headers(options?.headers).get("Authorization"), "Bearer secret-test");
    assert.equal(JSON.parse(String(options?.body)).conversation.messages.at(-1).author, "ai");
    return Response.json({ ...responseBody, secret: "private" });
  });
  const response = await POST(request());
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.suggestions.length, 3);
  assert.equal(result.secret, undefined);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("resposta de outro contexto ou alternativas repetidas não viram rascunho", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ ...responseBody, lastCustomerMessageId: "other" }));
  assert.equal((await POST(request())).status, 502);
  t.mock.restoreAll();
  t.mock.method(globalThis, "fetch", async () => Response.json({ ...responseBody, suggestions: Array(3).fill(responseBody.suggestions[0]) }));
  assert.equal((await POST(request())).status, 503);
});

test("falha do modelo é explícita e não expõe o erro bruto", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ error: "PRIVATE PROVIDER KEY" }, { status: 503 }));
  const response = await POST(request());
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes("PRIVATE"));
});
