import { test, expect } from "@playwright/test";
import { mockSentiment } from "./sentiment-fixture";
import { mockCsat } from "./csat-fixture";
import { generateReply } from "../src/lib/automation";
test.beforeEach(async ({ context }) => {
  await mockSentiment(context);
  await context.route("**/api/assistant", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { provider: "demo", ready: true, label: "Demo controlada" } });
    const { conversation } = route.request().postDataJSON();
    return route.fulfill({ json: generateReply(conversation.messages.at(-1).text, conversation) });
  });
});

test("pedido e transferência sincronizam entre abas sem vazar notas internas", async ({ page, context }) => {
  await mockCsat(context);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/whatsapp");
  await page.getByRole("button", { name: /Bateu aquela fome/ }).click();
  await page.getByRole("region", { name: "Escolhas do pedido" }).getByRole("button", { name: /Pinheiros/ }).click();
  await page.getByRole("button", { name: /Retirar na loja/ }).click();
  await page.getByRole("button", { name: /Combo Crispy/ }).click();
  await expect(page.locator(".message-bubble").last()).toContainText("Posso confirmar?");
  await page.getByRole("button", { name: "Confirmar pedido" }).click();
  await expect(page.locator(".message-bubble").last()).toContainText("confirmado na demonstração");

  const inbox = await context.newPage();
  await inbox.goto("/dashboard");
  await expect(inbox.locator(".chat-contact h2")).toHaveText("Você");
  await expect(inbox.locator(".order-status")).toHaveText("Em preparo");
  await expect(inbox.locator(".order-product")).toContainText("Combo Crispy");

  await page.getByRole("button", { name: /Quando precisa de uma pessoa/ }).click();
  await expect(page.locator(".human-handoff")).toContainText("A equipe já recebeu sua conversa");
  await expect(inbox.locator(".ai-status-bar")).toContainText("precisa do seu toque humano");
  await inbox.getByRole("button", { name: "Assumir", exact: true }).click();
  await expect(page.locator(".human-handoff")).toContainText("Ana está cuidando de você");
  await inbox.getByRole("button", { name: "Nota interna", exact: true }).click();
  await inbox.getByRole("textbox", { name: "Escrever nota interna" }).fill("Verificar atraso com o gerente da unidade.");
  await inbox.getByRole("button", { name: "Adicionar", exact: true }).click();
  await expect(inbox.locator(".internal-note")).toContainText("Verificar atraso");
  await expect(page.locator(".customer-thread")).not.toContainText("Verificar atraso");
  await inbox.getByRole("button", { name: "Responder", exact: true }).click();
  await inbox.getByRole("textbox", { name: "Escrever resposta" }).fill("Oi! Sou a Ana, vou verificar seu pedido com a loja.");
  await inbox.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.locator(".message-bubble").last()).toContainText("Sou a Ana");
  await inbox.getByRole("button", { name: "Resolver", exact: true }).click();
  await expect(inbox.getByRole("button", { name: "Reabrir", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("recarregar durante a digitação recupera a resposta pendente", async ({ page }) => {
  await page.goto("/whatsapp");
  await page.getByRole("button", { name: /Só uma dúvida rapidinha/ }).click();
  await expect(page.locator(".typing-bubble")).toBeVisible();
  await page.reload();
  await expect(page.locator(".message-bubble").last()).toContainText("primeira hora gratuita");
  await expect(page.locator(".typing-bubble")).toHaveCount(0);
});

test("pausa global encaminha a equipe e impede respostas automáticas", async ({ page, context }) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Assistente IA", exact: true }).click();
  await page.getByRole("switch", { name: "Ativar assistente" }).click();
  await expect(page.getByRole("switch")).not.toBeChecked();
  const customer = await context.newPage();
  await customer.goto("/whatsapp");
  await customer.getByRole("button", { name: /Bateu aquela fome/ }).click();
  await expect(customer.locator(".human-handoff")).toContainText("A equipe já recebeu");
  await expect(customer.locator(".typing-bubble")).toHaveCount(0);
  await expect(customer.locator(".message-bubble").last()).toHaveText(/Quero ver o cardápio/);
});

test("desktop e mobile mantêm navegação e conteúdo dentro da tela", async ({ page }, testInfo) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Caixa de entrada." })).toBeVisible();
  await expect(page.locator(".contact-panel")).toBeVisible();
  await expect(page.locator(".chat-panel .chat-welcome")).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath("inbox-desktop.png"), fullPage: true, caret: "initial" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.goto("/whatsapp");
  await expect(page.locator(".phone-frame")).toBeVisible();
  await expect(page.locator(".customer-thread .chat-welcome")).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath("whatsapp-desktop.png"), fullPage: true, caret: "initial" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath("whatsapp-mobile.png"), fullPage: true, caret: "initial" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.goto("/dashboard");
  await expect(page.locator(".conversation-list")).toBeVisible();
  await page.locator(".conversation-item").filter({ hasText: "Você" }).click();
  await expect(page.locator(".chat-panel")).toBeVisible();
  await expect(page.locator(".conversation-list")).not.toBeVisible();
  await expect(page.getByRole("textbox", { name: "Escrever resposta" })).toBeVisible();
  await expect(page.locator(".chat-panel .chat-welcome")).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath("inbox-mobile.png"), fullPage: true, caret: "initial" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.getByRole("button", { name: "Voltar às conversas" }).click();
  await expect(page.locator(".conversation-list")).toBeVisible();
});
