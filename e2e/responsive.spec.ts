import { test, expect, type Page } from "@playwright/test";
import { mockSentiment } from "./sentiment-fixture";
test.beforeEach(async ({ context }) => { await mockSentiment(context); });
import { initialState } from "../src/lib/demo-data";
import { mockCsat } from "./csat-fixture";

async function seedWorkspace(page: Page) {
  await mockCsat(page.context());
  const fixture = structuredClone(initialState);
  fixture.activeId = "rafael";
  fixture.conversations[1].name = "Rafael Almeida de Albuquerque";
  fixture.conversations[1].booking = { kind: "birthday", date: "24/10", time: "19:30", guests: 15, stage: "pending_human", attempts: 2 };
  await page.addInitScript((data) => {
    if (!localStorage.getItem("responsive-test-ready")) {
      localStorage.setItem("sabor-express-demo-v1", JSON.stringify({ ...data, sessionRevision: 2 }));
      localStorage.setItem("responsive-test-ready", "true");
    }
  }, fixture);
  await page.route("**/api/assistant", (route) => route.fulfill({ json: { provider: "crewai", ready: true, label: "CrewAI · Azure Foundry configurado" } }));
  await page.goto("/dashboard");
  await expect(page.locator(".conversation-item").filter({ hasText: "Rafael Almeida" })).toBeVisible();
}

async function expectNoPageOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".workspace-view, .chat-panel, .modal-body, .conversation-list")].filter((el) => el.getClientRects().length).every((el) => el.scrollWidth <= el.clientWidth + 1))).toBe(true);
}

for (const [width, height] of [[320, 740], [390, 844], [430, 932], [768, 1024], [1024, 768], [1280, 800], [1440, 1000]]) {
  test(`dashboard responsivo ${width}x${height}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await seedWorkspace(page);
    await expect(page.locator(".conversation-item").filter({ hasText: "Rafael Almeida" })).toBeVisible();
    await expectNoPageOverflow(page);
    if (width < 768) {
      await expect(page.getByRole("navigation", { name: "Navegação mobile" })).toBeInViewport();
      await expect(page.getByRole("combobox", { name: "Filtrar por unidade" })).toBeVisible();
      const target = await page.getByRole("button", { name: "Mais opções" }).boundingBox();
      expect(target!.height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({ path: testInfo.outputPath("inbox.png"), caret: "initial" });

    for (const [label, slug] of [["Visão geral", "metrics"], ["Assistente IA", "assistant"], ["Base de conhecimento", "knowledge"]]) {
      await page.getByRole("button", { name: label, exact: true }).click();
      await expect(page.locator(".workspace-view h1")).toBeInViewport();
      await expectNoPageOverflow(page);
      if (width < 1280) {
        const fontSizes = await page.locator(".workspace-view p").evaluateAll((elements) => elements.map((el) => parseFloat(getComputedStyle(el).fontSize)));
        expect(Math.min(...fontSizes)).toBeGreaterThanOrEqual(12);
      }
      await page.screenshot({ path: testInfo.outputPath(`${slug}.png`), caret: "initial" });
      await page.locator(".workspace-view").evaluate((el) => { el.scrollTop = el.scrollHeight; });
      await expectNoPageOverflow(page);
    }

    if (width < 768) {
      await page.getByRole("button", { name: "Mais opções" }).click();
      await page.getByRole("button", { name: "Configurações do workspace", exact: true }).click();
    } else {
      await page.getByRole("button", { name: "Configurações do workspace" }).click();
    }
    const settings = page.getByRole("dialog");
    await expect(settings).toBeVisible();
    await settings.getByRole("button", { name: "Limpar histórico da sessão" }).scrollIntoViewIfNeeded();
    await expectNoPageOverflow(page);
    await page.screenshot({ path: testInfo.outputPath("settings.png"), caret: "initial" });
    await settings.getByRole("button", { name: "Fechar", exact: true }).click();

    await page.getByRole("button", { name: "Caixa de entrada", exact: true }).click();
    await page.locator(".conversation-item").filter({ hasText: "Rafael Almeida" }).click();
    await expect(page.getByRole("textbox", { name: "Escrever resposta" })).toBeInViewport();
    await expectNoPageOverflow(page);
    await page.screenshot({ path: testInfo.outputPath("conversation.png"), caret: "initial" });

    if (width < 1280) {
      await page.getByRole("button", { name: "Alternar detalhes da conversa" }).click();
      const details = page.getByRole("dialog", { name: "Detalhes da conversa" });
      await expect(details).toBeVisible();
      await expect(details.locator(".booking-details")).toContainText("19:30");
      await details.locator(".booking-details").scrollIntoViewIfNeeded();
      await expectNoPageOverflow(page);
      await page.screenshot({ path: testInfo.outputPath("contact.png"), caret: "initial" });
      await details.getByRole("button", { name: "Ver pedido completo" }).click();
      await expect(page.getByRole("dialog")).toContainText("Combo Crispy");
      await expectNoPageOverflow(page);
      await page.getByRole("dialog").getByRole("button", { name: "Fechar", exact: true }).click();
    }
  });
}

test("atendimento mobile com filtros e altura reduzida pelo teclado", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedWorkspace(page);
  await page.getByRole("combobox", { name: "Filtrar por unidade" }).selectOption("Vila Mariana");
  await expect(page.locator(".conversation-item")).toHaveCount(1);
  await page.locator(".conversation-item").click();
  await page.getByRole("button", { name: "Assumir", exact: true }).click();
  await page.getByRole("textbox", { name: "Escrever resposta" }).fill("Vou verificar seu pedido com a loja.");
  await page.setViewportSize({ width: 390, height: 440 });
  await expect(page.getByRole("button", { name: "Enviar", exact: true })).toBeInViewport();
  await expect(page.getByRole("textbox", { name: "Escrever resposta" })).toBeInViewport();
  await expectNoPageOverflow(page);
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.locator(".message-bubble").last()).toContainText("Vou verificar seu pedido");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Resolver", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reabrir", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Voltar às conversas" }).click();
  await page.getByRole("button", { name: "Resolvidas", exact: true }).click();
  await expect(page.locator(".conversation-item")).toHaveCount(1);
  await expect(page.locator(".conversation-item")).toContainText("Rafael Almeida");
});

test("celular em paisagem mantém a conversa e os controles utilizáveis", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await seedWorkspace(page);
  await expect(page.getByRole("navigation", { name: "Navegação mobile" })).toBeInViewport();
  await page.locator(".conversation-item").filter({ hasText: "Rafael Almeida" }).click();
  await expect(page.getByRole("textbox", { name: "Escrever resposta" })).toBeInViewport();
  await page.getByRole("button", { name: "Alternar detalhes da conversa" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expectNoPageOverflow(page);
  await page.getByRole("dialog").getByRole("button", { name: "Fechar", exact: true }).click();
  await page.getByRole("button", { name: "Voltar às conversas" }).click();
  await expect(page.getByRole("navigation", { name: "Navegação mobile" })).toBeInViewport();
});
