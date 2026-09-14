import { test, expect } from "@playwright/test";
import { mockSentiment } from "./sentiment-fixture";
test.beforeEach(async ({ context }) => { await mockSentiment(context); });
import { initialState } from "../src/lib/demo-data";

for (const [width, height] of [[1176, 608], [1100, 620], [1366, 600], [1024, 440], [390, 440]]) {
  test(`inbox preserva espaço útil em ${width}x${height}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    const fixture = structuredClone(initialState);
    fixture.conversations[0].routing = { agent: "information", source: "crewai", reason: "Teste de layout", summary: "Contexto da conversa", missingFields: [] };
    await page.addInitScript((state) => localStorage.setItem("sabor-express-demo-v1", JSON.stringify({ ...state, sessionRevision: 2 })), fixture);
    await page.route("**/api/assistant", (route) => route.fulfill({ json: { provider: "crewai", ready: true, label: "Teste de layout" } }));
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/dashboard");
    await expect(page.locator(".conversation-item").filter({ hasText: "Mariana Costa" })).toBeVisible();

    if (width >= 768) {
      const list = await page.locator(".conversation-scroll").boundingBox();
      expect(list!.height).toBeGreaterThanOrEqual(100);
      expect(await page.locator(".list-tabs").evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    }
    await page.getByRole("button", { name: "Ver indicadores do piloto" }).click();
    const indicators = page.getByRole("dialog", { name: "Indicadores do piloto" });
    await expect(indicators.locator(".mini-stat")).toHaveCount(4);
    await expect(indicators).toContainText("Dados ilustrativos");
    expect(await indicators.locator(".stats-cards").evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await indicators.getByRole("button", { name: "Fechar", exact: true }).click();
    await page.locator(".conversation-item").filter({ hasText: "Mariana Costa" }).click();
    await page.getByRole("textbox", { name: "Escrever resposta" }).fill("Mensagem de teste sem envio ao cliente.");
    await page.screenshot({ path: testInfo.outputPath("inbox-focused.png"), caret: "initial" });
    const geometry = await page.evaluate(() => {
      const chat = document.querySelector(".chat-panel")!.getBoundingClientRect();
      const messages = document.querySelector(".chat-panel .message-thread")!.getBoundingClientRect();
      const composer = document.querySelector(".composer")!.getBoundingClientRect();
      const send = document.querySelector(".send-button")!.getBoundingClientRect();
      return { messagesHeight: messages.height, composerBottom: composer.bottom, chatBottom: chat.bottom, sendBottom: send.bottom, viewportHeight: innerHeight, documentHeight: document.documentElement.scrollHeight, scrollY };
    });
    expect(geometry.messagesHeight).toBeGreaterThanOrEqual(150);
    expect(geometry.composerBottom).toBeLessThanOrEqual(geometry.chatBottom + 1);
    expect(geometry.sendBottom).toBeLessThanOrEqual(geometry.viewportHeight);
    expect(geometry.documentHeight).toBeLessThanOrEqual(geometry.viewportHeight + 1);
    expect(geometry.scrollY).toBe(0);
    await expect(page.getByRole("button", { name: "Enviar", exact: true })).toBeInViewport({ ratio: 1 });
    expect(errors).toEqual([]);
  });
}

test("atributos adicionados por corretor ao html não geram erro de hidratação", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.addInitScript(() => {
    const mark = () => {
      if (!document.documentElement) return false;
      document.documentElement.setAttribute("data-lt-installed", "true");
      document.documentElement.setAttribute("suppresshydrationwarning", "true");
      return true;
    };
    if (!mark()) {
      const observer = new MutationObserver(() => { if (mark()) observer.disconnect(); });
      observer.observe(document, { childList: true });
    }
  });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Configurações do workspace" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(errors.filter((message) => /hydrat|didn't match/i.test(message))).toEqual([]);
});
