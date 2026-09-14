import { expect, test, type BrowserContext } from "@playwright/test";
import { mockSentiment } from "./sentiment-fixture";

const texts = {
  empathetic: "Sinto muito pela espera, Maria. Vou verificar o andamento com a unidade e seguir com você por aqui.",
  concise: "Maria, vou conferir o andamento do seu pedido com a unidade. Sinto muito pela demora.",
  nextStep: "Vou consultar a unidade sobre o pedido e te orientar sobre o próximo passo por aqui, Maria.",
};

async function fixture(context: BrowserContext, empty = false) {
  await mockSentiment(context);
  await context.addInitScript((empty) => {
    if (localStorage.getItem("suggestions-seeded")) return;
    localStorage.setItem("suggestions-seeded", "yes");
    const messages = empty ? [] : [
      { id: "m1", author: "customer", text: "Meu pedido é SE-TESTE", time: "12:00" },
      { id: "m2", author: "ai", text: "Como posso ajudar com o pedido?", time: "12:01" },
      { id: "m3", author: "customer", text: "Estou esperando há uma hora e ninguém resolve.", time: "12:02" },
      { id: "private", author: "note", text: "SEGREDO_NOTA: informação só da equipe", time: "12:03" },
    ];
    localStorage.setItem("sabor-express-demo-v1", JSON.stringify({ sessionRevision: 2, activeId: "maria", automation: true, conversations: [
      { id: "maria", name: "Maria", initials: "MA", color: "mint", phone: "", store: "São Paulo · Pinheiros", status: "waiting", topic: "Pedido atrasado", unread: 0, messages },
      { id: "pedro", name: "Pedro", initials: "PE", color: "peach", phone: "", store: "São Paulo · Moema", status: "human", topic: "Informações", unread: 0, messages: [{ id: "p1", author: "customer", text: "Qual é o horário de abertura?", time: "12:01" }] },
    ] }));
  }, empty);
  await context.route("**/api/assistant", (route) => route.fulfill({ json: { provider: "demo", ready: true, label: "Teste" } }));
  await context.route("**/api/crm**", (route) => route.fulfill({ json: { configured: false, connected: false, connectionStatus: "disconnected", configurationMessage: null, connectedAt: null, mappings: [], events: [], customer: null } }));
  const requests: Array<{ requestId: string; lastCustomerMessageId: string; conversation: { id: string; messages: Array<{ id: string; text: string }> } }> = [];
  const behavior = { fail: false, hold: null as Promise<void> | null };
  await context.route("**/api/suggestions", async (route) => {
    const body = route.request().postDataJSON(); requests.push(body);
    if (behavior.hold) await behavior.hold;
    if (behavior.fail) return route.fulfill({ status: 503, json: { error: "IA temporariamente indisponível. Tente novamente." } });
    return route.fulfill({ json: { requestId: body.requestId, lastCustomerMessageId: body.lastCustomerMessageId, provider: "azure_foundry", suggestions: [
      { id: "empathetic", label: "Empática", text: texts.empathetic },
      { id: "concise", label: "Direta", text: texts.concise },
      { id: "nextStep", label: "Próximo passo", text: texts.nextStep },
    ] } });
  });
  return { requests, behavior };
}

test("gera três respostas contextuais, insere rascunho e só envia após o clique humano", async ({ page, context }) => {
  const service = await fixture(context);
  await page.goto("/dashboard");
  const customer = await context.newPage(); await customer.goto("/whatsapp");
  await page.getByRole("button", { name: "Sugerir resposta", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Escrever resposta" })).toHaveValue(texts.empathetic);
  await expect(page.getByRole("region", { name: "Sugestões de resposta" })).toContainText("Revise e ajuste");
  expect(service.requests).toHaveLength(1);
  expect(service.requests[0].lastCustomerMessageId).toBe("m3");
  expect(JSON.stringify(service.requests[0])).not.toContain("SEGREDO_NOTA");
  await expect(customer.locator(".customer-thread")).not.toContainText(texts.empathetic);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("sabor-express-demo-v1")!).conversations[0].status)).toBe("waiting");
  await page.getByRole("button", { name: "Usar resposta: Direta" }).click();
  await expect(page.getByRole("textbox", { name: "Escrever resposta" })).toHaveValue(texts.concise);
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(customer.locator(".customer-thread")).toContainText(texts.concise);
  await expect(page.getByRole("textbox", { name: "Escrever resposta" })).toHaveValue("");
});

test("digitação durante geração e clique duplo não sobrescrevem o texto nem repetem a chamada", async ({ page, context }) => {
  const service = await fixture(context);
  let release!: () => void;
  service.behavior.hold = new Promise<void>((resolve) => { release = resolve; });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Sugerir resposta", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sugerir resposta", exact: true })).toBeDisabled();
  await page.getByRole("textbox", { name: "Escrever resposta" }).fill("Minha resposta em andamento");
  await expect.poll(() => service.requests.length).toBe(1);
  release();
  await expect(page.getByRole("region", { name: "Sugestões de resposta" })).toContainText("Seu rascunho foi preservado");
  await expect(page.getByRole("textbox", { name: "Escrever resposta" })).toHaveValue("Minha resposta em andamento");
  expect(service.requests).toHaveLength(1);
});

test("resposta atrasada não entra em outra conversa e rascunhos ficam separados", async ({ page, context }) => {
  const service = await fixture(context);
  let release!: () => void;
  service.behavior.hold = new Promise<void>((resolve) => { release = resolve; });
  await page.goto("/dashboard");
  await page.getByRole("textbox", { name: "Escrever resposta" }).fill("Rascunho da Maria");
  await page.getByRole("button", { name: "Sugerir resposta", exact: true }).click();
  await expect.poll(() => service.requests.length).toBe(1);
  await page.locator(".conversation-item").filter({ hasText: "Pedro" }).click();
  release();
  await expect(page.getByRole("textbox", { name: "Escrever resposta" })).toHaveValue("");
  await expect(page.getByRole("region", { name: "Sugestões de resposta" })).toHaveCount(0);
  await page.locator(".conversation-item").filter({ hasText: "Maria" }).click();
  await expect(page.getByRole("textbox", { name: "Escrever resposta" })).toHaveValue("Rascunho da Maria");
});

test("nova mensagem invalida a geração antiga", async ({ page, context }) => {
  const service = await fixture(context);
  let release!: () => void;
  service.behavior.hold = new Promise<void>((resolve) => { release = resolve; });
  await page.goto("/dashboard");
  const customer = await context.newPage(); await customer.goto("/whatsapp");
  await page.getByRole("button", { name: "Sugerir resposta", exact: true }).click();
  await expect.poll(() => service.requests.length).toBe(1);
  await customer.getByRole("textbox", { name: "Mensagem do cliente" }).fill("Agora preciso mudar o endereço de entrega.");
  await customer.getByRole("button", { name: "Enviar mensagem", exact: true }).click();
  await expect(page.locator(".message-thread")).toContainText("Agora preciso mudar o endereço");
  release();
  await expect(page.getByRole("textbox", { name: "Escrever resposta" })).toHaveValue("");
  service.behavior.hold = null;
  await page.getByRole("button", { name: "Sugerir resposta", exact: true }).click();
  await expect.poll(() => service.requests.length).toBe(2);
  expect(service.requests[1].lastCustomerMessageId).not.toBe("m3");
});

test("erro oferece retentativa, notas internas têm rascunho próprio e botão desativado", async ({ page, context }) => {
  const service = await fixture(context); service.behavior.fail = true;
  await page.goto("/dashboard");
  await page.getByRole("textbox", { name: "Escrever resposta" }).fill("Meu texto original");
  await page.getByRole("button", { name: "Sugerir resposta", exact: true }).click();
  await expect(page.locator(".reply-suggestion-error")).toContainText("temporariamente indisponível");
  await expect(page.getByRole("textbox", { name: "Escrever resposta" })).toHaveValue("Meu texto original");
  await page.getByRole("button", { name: "Nota interna", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sugerir resposta", exact: true })).toBeDisabled();
  await page.getByRole("textbox", { name: "Escrever nota interna" }).fill("Anotação interna");
  await page.getByRole("button", { name: "Responder", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Escrever resposta" })).toHaveValue("Meu texto original");
  service.behavior.fail = false;
  await page.getByRole("button", { name: "Sugerir resposta", exact: true }).click();
  await expect(page.getByRole("button", { name: "Usar resposta: Empática" })).toBeVisible();
});

test("sem mensagem do cliente não gera sugestão", async ({ page, context }) => {
  const service = await fixture(context, true);
  await page.goto("/dashboard");
  await expect(page.getByRole("button", { name: "Sugerir resposta", exact: true })).toBeDisabled();
  expect(service.requests).toHaveLength(0);
});

test("opções e campo de revisão funcionam no celular", async ({ page, context }, testInfo) => {
  await fixture(context);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  await page.locator(".conversation-item").filter({ hasText: "Maria" }).click();
  await page.getByRole("button", { name: "Sugerir resposta", exact: true }).click();
  await expect(page.getByRole("button", { name: "Usar resposta: Próximo passo" })).toBeInViewport();
  await page.getByRole("button", { name: "Usar resposta: Próximo passo" }).click();
  await expect(page.getByRole("textbox", { name: "Escrever resposta" })).toHaveValue(texts.nextStep);
  await expect(page.getByRole("button", { name: "Enviar", exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("suggestions-mobile.png") });
});
