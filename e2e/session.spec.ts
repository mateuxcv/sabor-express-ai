import { expect, test } from "@playwright/test";
import { mockSentiment } from "./sentiment-fixture";
test.beforeEach(async ({ context }) => { await mockSentiment(context); });
import { initialState } from "../src/lib/demo-data";

test("remove histórico legado, preserva novas mensagens e limpa todas as abas", async ({ page, context }) => {
  await context.addInitScript((legacy) => {
    if (!localStorage.getItem("session-test-seeded")) {
      localStorage.setItem("sabor-express-demo-v1", JSON.stringify(legacy));
      localStorage.setItem("session-test-seeded", "1");
      localStorage.setItem("unrelated-preference", "preservar");
    }
  }, initialState);
  // Verificação de armazenamento: não fazer chamadas pagas ao modelo neste teste.
  await context.route("**/api/assistant", (route) => route.fulfill({ json: route.request().method() === "GET"
    ? { provider: "crewai", ready: true, label: "CrewAI · teste controlado" }
    : { text: "Resposta da sessão nova", status: "ai", routing: { agent: "reception", source: "crewai", reason: "Teste", summary: "Sessão nova", missingFields: [] } },
  }));

  await page.goto("/whatsapp");
  await expect(page.locator(".customer-thread .chat-welcome")).toBeVisible();
  await expect(page.locator(".message-bubble")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("sabor-express-demo-v1")!).sessionRevision)).toBe(2);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("sabor-express-demo-v1")!).conversations.length)).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem("unrelated-preference"))).toBe("preservar");

  await page.getByRole("textbox", { name: "Mensagem do cliente" }).fill("Mensagem da sessão nova");
  await page.getByRole("button", { name: "Enviar mensagem", exact: true }).click();
  await expect(page.locator(".message-bubble").last()).toContainText("Resposta da sessão nova");
  await page.reload();
  await expect(page.locator(".customer-thread")).toContainText("Mensagem da sessão nova");

  const inbox = await context.newPage();
  await inbox.goto("/dashboard");
  await expect(inbox.locator(".chat-panel")).toContainText("Resposta da sessão nova");
  await expect(inbox.locator(".conversation-item")).toHaveCount(1);
  await expect(inbox.locator(".conversation-list")).not.toContainText("Mariana Costa");
  await expect(inbox.locator(".order-card")).toHaveCount(0);

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Opções da conversa" }).click();
  await page.getByRole("button", { name: "Limpar histórico da sessão" }).click();
  await expect(page.locator(".customer-thread .chat-welcome")).toBeVisible();
  await expect(inbox.locator(".chat-panel .message-bubble")).toHaveCount(0);
  await expect(inbox.locator(".chat-panel .chat-welcome")).toBeVisible();
  await inbox.reload();
  await expect(inbox.locator(".chat-panel .message-bubble")).toHaveCount(0);
  await expect(inbox.locator(".conversation-item")).toHaveCount(1);
});
