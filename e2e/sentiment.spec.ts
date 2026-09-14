import { expect, test } from "@playwright/test";
import { mockSentiment } from "./sentiment-fixture";
import { mockCsat } from "./csat-fixture";

test("primeira reclamação pausa IA, atualiza a ocorrência e permite assumir e resolver", async ({ page, context }, testInfo) => {
  const monitor = await mockSentiment(context, true);
  await mockCsat(context);
  let assistantPosts = 0;
  await context.route("**/api/assistant", (route) => {
    if (route.request().method() === "POST") assistantPosts++;
    return route.fulfill({ json: { provider: "demo", ready: true, label: "Teste" } });
  });
  await page.goto("/dashboard");
  const customer = await context.newPage();
  await customer.goto("/whatsapp");
  await customer.getByRole("textbox", { name: "Mensagem do cliente" }).fill("Você não está me entendendo");
  await customer.getByRole("button", { name: "Enviar mensagem", exact: true }).click();
  await expect(page.locator(".sentiment-banner")).toContainText("Possível insatisfação");
  await expect(customer.locator(".customer-thread")).toContainText("Encaminhei sua conversa");
  expect(assistantPosts).toBe(0);
  await customer.getByRole("textbox", { name: "Mensagem do cliente" }).fill("Já expliquei isso três vezes");
  await customer.getByRole("button", { name: "Enviar mensagem", exact: true }).click();
  await expect(page.locator(".sentiment-banner")).toContainText("Já expliquei isso três vezes");
  expect(monitor.alerts.size).toBe(1);
  await expect(customer.locator(".message-bubble").filter({ hasText: "Encaminhei sua conversa" })).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".sentiment-banner")).toContainText("Prioridade alta");
  await page.getByRole("button", { name: "Visão geral", exact: true }).click();
  const dashboard = page.getByRole("region", { name: "Clientes que precisam de atenção" });
  await expect(dashboard).toContainText("1 aguardando humano");
  await expect(dashboard.getByRole("link", { name: "Ver no RD" })).toHaveAttribute("href", /crm.rdstation.com/);
  await dashboard.getByLabel("Unidade dos alertas").selectOption("São Paulo · Moema");
  await expect(dashboard).toContainText("Nenhum alerta ativo nesta unidade");
  await dashboard.getByLabel("Unidade dos alertas").selectOption("");
  await page.screenshot({ path: testInfo.outputPath("sentiment-dashboard.png") });
  await dashboard.getByRole("button", { name: "Assumir atendimento" }).click();
  await expect(page.locator(".sentiment-banner")).toContainText("Em acompanhamento · Ana Carvalho");
  await expect(page.getByRole("button", { name: "Devolver à IA" })).toBeDisabled();
  await page.getByRole("button", { name: "Marcar alerta como resolvido" }).click();
  await expect(page.locator(".sentiment-banner")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Devolver à IA" })).toBeEnabled();
});

test("falha de análise fica visível e retentativa não perde a mensagem", async ({ page, context }) => {
  const monitor = await mockSentiment(context, true);
  monitor.behavior.fail = true;
  await context.route("**/api/assistant", (route) => route.fulfill({ json: { provider: "demo", ready: true, label: "Teste" } }));
  await page.goto("/whatsapp");
  await page.getByRole("textbox", { name: "Mensagem do cliente" }).fill("Quero falar com um humano");
  await page.getByRole("button", { name: "Enviar mensagem", exact: true }).click();
  await expect(page.locator(".customer-thread")).toContainText("Não consegui continuar");
  await page.goto("/dashboard");
  await expect(page.locator(".sentiment-error")).toContainText("Análise não registrada");
  monitor.behavior.fail = false;
  await page.getByRole("button", { name: "Tentar análise novamente" }).click();
  await expect(page.locator(".sentiment-banner")).toContainText("Pedido de atendimento humano");
  await expect(page.locator(".chat-panel .sentiment-error")).toHaveCount(0);
});

test("áudio transcrito gera alerta no celular antes da resposta operacional", async ({ page, context }, testInfo) => {
  await mockSentiment(context, true);
  await context.route("**/api/assistant", (route) => route.fulfill({ json: { provider: "demo", ready: true, label: "Teste" } }));
  await context.route("**/api/audio/transcribe", (route) => route.fulfill({ json: route.request().method() === "GET" ? { ready: true } : { text: "Você não está me entendendo", provider: "azure", mimeType: "audio/wav" } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/whatsapp");
  const wav = Buffer.alloc(32044);
  wav.write("RIFF"); wav.writeUInt32LE(32036, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(32000, 40);
  await expect(page.getByLabel("Selecionar arquivo de áudio")).toBeEnabled();
  await page.getByLabel("Selecionar arquivo de áudio").setInputFiles({ name: "voz.wav", mimeType: "audio/wav", buffer: wav });
  await expect(page.getByRole("textbox", { name: "Transcrição do áudio" })).toHaveValue("Você não está me entendendo");
  await page.getByRole("button", { name: "Enviar áudio", exact: true }).click();
  await expect(page.locator(".customer-thread")).toContainText("Encaminhei sua conversa");
  await page.goto("/dashboard");
  await page.locator(".conversation-item").click();
  await expect(page.locator(".sentiment-banner")).toContainText("Prioridade alta");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("sentiment-mobile.png") });
});

test("mensagem chegada durante a análise e tomada humana preservam a pausa", async ({ page, context }) => {
  const monitor = await mockSentiment(context, true);
  let release!: () => void;
  monitor.behavior.hold = new Promise<void>((resolve) => { release = resolve; });
  let assistantPosts = 0;
  await context.route("**/api/assistant", (route) => {
    if (route.request().method() === "POST") assistantPosts++;
    return route.fulfill({ json: { provider: "demo", ready: true, label: "Teste" } });
  });
  await page.goto("/dashboard");
  const customer = await context.newPage(); await customer.goto("/whatsapp");
  for (const text of ["Você não está me entendendo", "Quero falar com um humano"]) {
    await customer.getByRole("textbox", { name: "Mensagem do cliente" }).fill(text);
    await customer.getByRole("button", { name: "Enviar mensagem", exact: true }).click();
  }
  await page.getByRole("button", { name: "Assumir", exact: true }).click();
  release(); monitor.behavior.hold = null;
  await expect.poll(() => monitor.requests.filter((r) => r.action === "analyze").length).toBe(2);
  await expect(page.locator(".ai-status-bar")).toContainText("Você está no controle");
  expect(assistantPosts).toBe(0);
});
