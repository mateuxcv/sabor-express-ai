import { expect, test } from "@playwright/test";
import { mockSentiment } from "./sentiment-fixture";
test.beforeEach(async ({ context }) => { await mockSentiment(context); });

test("aniversário coleta detalhes e encaminha sem prometer confirmação", async ({ page, context }) => {
  await page.goto("/whatsapp");
  await page.getByRole("button", { name: "Planejar aniversário" }).click();
  await expect(page.locator(".message-bubble").last()).toContainText("dia/mês");
  await expect(page.locator(".phone-store")).toContainText("Aniversários");
  await page.getByRole("textbox", { name: "Mensagem do cliente" }).fill("24/10");
  await page.getByRole("button", { name: "Enviar mensagem", exact: true }).click();
  await expect(page.locator(".message-bubble").last()).toContainText("Qual horário");
  await page.getByRole("textbox", { name: "Mensagem do cliente" }).fill("19h30");
  await page.getByRole("button", { name: "Enviar mensagem", exact: true }).click();
  await expect(page.locator(".message-bubble").last()).toContainText("ainda não é uma confirmação");
  await expect(page.locator(".human-handoff")).toBeVisible();

  const inbox = await context.newPage();
  await inbox.goto("/dashboard");
  await expect(inbox.locator(".chat-routing")).toContainText("Aniversários");
  await expect(inbox.locator(".booking-details")).toContainText("24/10");
  await expect(inbox.locator(".booking-details")).toContainText("19:30");
  await expect(inbox.locator(".booking-details")).toContainText("15");
  await expect(inbox.locator(".booking-details")).toContainText("Aguardando validação da loja");
});

test("uma falha da API encaminha para a equipe e encerra a digitação", async ({ page }) => {
  await page.route("**/api/assistant", (route) => route.request().method() === "POST" ? route.abort() : route.continue());
  await page.goto("/whatsapp");
  await page.getByRole("button", { name: "Reservar uma mesa" }).click();
  await expect(page.locator(".human-handoff")).toBeVisible();
  await expect(page.locator(".typing-bubble")).toHaveCount(0);
  await expect(page.locator(".message-bubble").last()).toContainText("Não consegui continuar");
});

test("resposta atrasada não interrompe um atendente que assumiu", async ({ page, context }) => {
  let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  let entered!: () => void;
  const received = new Promise<void>((resolve) => { entered = resolve; });
  await page.route("**/api/assistant", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    entered();
    await hold;
    await route.fulfill({ json: { text: "Resposta antiga que não deve aparecer", status: "ai", routing: { agent: "reception", source: "crewai", reason: "Teste", summary: "Teste", missingFields: [] } } });
  });
  await page.goto("/whatsapp");
  await page.getByRole("button", { name: "Reservar uma mesa" }).click();
  await received;
  const inbox = await context.newPage();
  await inbox.goto("/dashboard");
  await inbox.getByRole("button", { name: "Assumir", exact: true }).click();
  await expect(page.locator(".human-handoff")).toContainText("Ana está cuidando");
  release();
  await inbox.getByRole("textbox", { name: "Escrever resposta" }).fill("Olá, vou ajudar com sua reserva.");
  await inbox.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.locator(".message-bubble").last()).toContainText("vou ajudar com sua reserva");
  await expect(page.locator(".customer-thread")).not.toContainText("Resposta antiga");
});
