import { test, expect, type BrowserContext } from "@playwright/test";
import { mockSentiment } from "./sentiment-fixture";
test.beforeEach(async ({ context }) => { await mockSentiment(context); });

const pipelineId = "1".repeat(24), stageId = "2".repeat(24), ownerId = "3".repeat(24), dealId = "4".repeat(24);
const eventId = "e".repeat(64);

async function mockCrm(context: BrowserContext, connected = true) {
  const state = {
    configured: connected, connected, connectionStatus: connected ? "connected" : "disconnected", configurationMessage: connected ? null : "Preencha as credenciais no .env.", connectedAt: connected ? "2026-09-13T12:00:00Z" : null,
    mappings: [] as Array<Record<string, string>>, customer: null as { id: string; name: string; phone: string; email: string | null } | null,
    events: [{ id: eventId, type: "reservation.confirmed", reference: "RS-DEMO", conversationId: "demo", status: "blocked", attempts: 1, error: "Configure o funil e o responsável.", code: "missing_mapping", syncedAt: null as number | null, createdAt: 1789300800, contactId: null as string | null, dealId: null as string | null, dealUrl: null as string | null }],
  };
  const actions: Array<Record<string, string>> = [];
  await context.route("**/api/crm**", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "GET") {
      if (url.searchParams.get("options") === "true") return route.fulfill({ json: url.searchParams.get("pipelineId") ? { stages: [{ id: stageId, name: "Reserva confirmada" }] } : { pipelines: [{ id: pipelineId, name: "Reservas e aniversários" }], users: [{ id: ownerId, name: "Ana Carvalho" }] } });
      return route.fulfill({ json: state });
    }
    const body = route.request().postDataJSON(); actions.push(body);
    if (body.action === "customer") {
      state.customer = { id: "customer-demo", name: body.name, phone: "+5511999990000", email: body.email || null };
      return route.fulfill({ json: state.customer });
    }
    if (body.action === "mapping") {
      const mapping = { ...body, pipelineName: "Reservas e aniversários", stageName: "Reserva confirmada", ownerName: "Ana Carvalho" };
      state.mappings = [mapping];
      state.events[0] = { ...state.events[0], status: "synced", error: "", code: "", contactId: "5".repeat(24), dealId, dealUrl: `https://crm.rdstation.com/app/deals/${dealId}`, syncedAt: 1789300801 };
      return route.fulfill({ json: mapping });
    }
    if (body.action === "retry") state.events[0].status = "pending";
    if (body.action === "disconnect") { state.connected = false; state.connectionStatus = "disconnected"; }
    return route.fulfill({ json: { ok: true } });
  });
  return { state, actions };
}

test("perfil identifica o cliente e é reutilizado nas próximas conversas", async ({ page, context }) => {
  const crm = await mockCrm(context, false);
  const messages: Array<{ conversation: { customerId?: string; phone?: string } }> = [];
  await context.route("**/api/assistant", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { ready: true, provider: "crewai", label: "Teste" } });
    messages.push(route.request().postDataJSON());
    return route.fulfill({ json: { text: "Como posso ajudar?", status: "ai", routing: { agent: "reception", source: "crewai", reason: "Teste", summary: "Teste", missingFields: [] } } });
  });
  await page.goto("/whatsapp");
  await page.getByRole("button", { name: "Opções da conversa" }).click();
  await page.getByRole("button", { name: "Identificar cliente", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Identificação do cliente" });
  await dialog.getByLabel("Nome", { exact: true }).fill("Mariana Costa");
  await dialog.getByLabel("Telefone", { exact: true }).fill("(11) 99999-0000");
  await dialog.getByRole("button", { name: "Salvar cliente" }).click();
  await expect(dialog).not.toBeVisible();
  expect(crm.actions[0].action).toBe("customer");
  await page.getByRole("button", { name: "Opções da conversa" }).click();
  await page.getByRole("button", { name: "Nova conversa", exact: true }).click();
  await page.getByRole("textbox", { name: "Mensagem do cliente" }).fill("Oi");
  await page.getByRole("button", { name: "Enviar mensagem", exact: true }).click();
  await expect.poll(() => messages.length).toBe(1);
  expect(messages[0].conversation.customerId).toBe("customer-demo");
  expect(messages[0].conversation.phone).toBeUndefined();
  await page.goto("/dashboard");
  await expect(page.locator(".chat-contact h2")).toHaveText("Mariana Costa");
});

for (const width of [390, 1024]) {
  test(`configuração e fila do CRM funcionam em ${width}px`, async ({ page, context }, testInfo) => {
    const crm = await mockCrm(context);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/crm");
    await expect(page.getByRole("heading", { name: "Seu CRM está conectado" })).toBeVisible();
    await page.getByRole("combobox", { name: "Funil", exact: true }).selectOption(pipelineId);
    await page.getByRole("combobox", { name: "Etapa para pedidos e reservas confirmados" }).selectOption(stageId);
    await page.getByRole("combobox", { name: "Responsável pela unidade" }).selectOption(ownerId);
    await page.getByRole("button", { name: "Salvar mapeamento" }).click();
    await expect(page.getByRole("status")).toContainText("Mapeamento salvo");
    await expect(page.locator(".crm-event .crm-badge")).toHaveText("Sincronizado");
    expect(crm.actions[0]).toMatchObject({ action: "mapping", store: "São Paulo · Pinheiros", pipelineId, stageId, ownerId });
    await expect(page.locator(".crm-event a")).toHaveAttribute("href", `https://crm.rdstation.com/app/deals/${dealId}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator(".crm-workspace").evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("crm.png"), caret: "initial" });
  });
}

test("evento com resultado incerto pode ser reenfileirado pela interface", async ({ page, context }) => {
  const crm = await mockCrm(context);
  crm.state.events[0].status = "uncertain";
  crm.state.events[0].error = "O RD não confirmou o resultado. Verifique antes de reprocessar.";
  await page.goto("/crm");
  await page.getByRole("button", { name: "Reprocessar", exact: true }).click();
  await expect(page.locator(".crm-event .crm-badge")).toHaveText("Na fila");
  expect(crm.actions[0]).toEqual({ action: "retry", eventId });
});

test("pedido confirmado aparece na fila com sua negociação", async ({ page, context }) => {
  const crm = await mockCrm(context);
  Object.assign(crm.state.events[0], { type: "order.confirmed", reference: "SE-DEMO", status: "synced", error: null, code: null, dealId, dealUrl: `https://crm.rdstation.com/app/deals/${dealId}` });
  await page.goto("/crm");
  await expect(page.locator(".crm-event h3")).toContainText("Pedido confirmado");
  await expect(page.locator(".crm-event")).toContainText("SE-DEMO");
  await expect(page.getByRole("link", { name: "Ver no RD" })).toHaveAttribute("href", `https://crm.rdstation.com/app/deals/${dealId}`);
});

test("sem credenciais, a tela mostra configuração pendente sem conexão simulada", async ({ page, context }) => {
  await mockCrm(context, false);
  await page.goto("/crm");
  await expect(page.getByRole("heading", { name: "Conecte sua conta do CRM" })).toBeVisible();
  await expect(page.locator(".crm-workspace")).toContainText("RD_CRM_CLIENT_ID");
  await expect(page.locator(".crm-connection-card")).toContainText("Aguardando conexão");
});
