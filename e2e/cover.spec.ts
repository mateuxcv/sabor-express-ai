import { test, expect, type Page } from "@playwright/test";

test.use({ reducedMotion: "no-preference" });
test.setTimeout(60_000);

async function enter(page: Page) {
  await page.goto("/");
  await expect(page.locator("#cover-experience")).toHaveAttribute("data-renderer", "webgl", { timeout: 40_000 });
  await expect(page.getByTestId("restaurant-renderer")).toHaveAttribute("data-flight", "false", { timeout: 15_000 });
}
async function select(page: Page, name: RegExp) {
  await page.getByRole("navigation", { name: "Explore o restaurante" }).getByRole("button", { name }).click();
}

test("o restaurante ocupa todo o viewport, anima e responde a arraste e zoom", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await enter(page);
  const renderer = page.getByTestId("restaurant-renderer");
  const bounds = await renderer.boundingBox();
  const viewport = page.viewportSize()!;
  expect(bounds?.width).toBe(viewport.width);
  expect(bounds?.height).toBe(viewport.height);
  expect(bounds?.x).toBe(0); expect(bounds?.y).toBe(0);
  const t = await renderer.getAttribute("data-time");
  await expect(renderer).not.toHaveAttribute("data-time", t!);
  await page.getByRole("button", { name: "Pausar animações" }).click();
  const before = await renderer.getAttribute("data-camera");
  await page.mouse.move(550, 420); await page.mouse.down(); await page.mouse.move(710, 440, { steps: 12 }); await page.mouse.up();
  await expect(renderer).not.toHaveAttribute("data-camera", before!);
  await expect(page.locator("#cover-experience")).toHaveAttribute("data-selected", "none");
  const rotated = await renderer.getAttribute("data-camera");
  await page.getByRole("button", { name: "Aproximar", exact: true }).click();
  await expect(renderer).not.toHaveAttribute("data-camera", rotated!);
  expect(errors).toEqual([]);
});

test("clicar na mesa muda os lugares e registra a reserva na comanda local", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", request => { if (new URL(request.url()).pathname.startsWith("/api/")) requests.push(request.url()); });
  await enter(page);
  await page.getByRole("button", { name: "Escolha sua mesa", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Escolha sua mesa" })).toBeFocused();
  await page.getByRole("button", { name: "4 pessoas", exact: true }).click();
  await page.getByRole("button", { name: "Reservar na demonstração" }).click();
  await expect(page.getByRole("button", { name: "Sua mesa está marcada" })).toBeDisabled();
  await select(page, /Sua comanda/);
  await expect(page.getByRole("article", { name: "Comanda demonstrativa" })).toContainText("Mesa para 4 · reserva demonstrativa");
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});

test("combo vegetariano é preparado, chega ao balcão e acompanha a comanda", async ({ page }) => {
  await enter(page);
  await select(page, /Um pedido/);
  await page.getByRole("button", { name: "Vegetariano", exact: true }).click();
  await page.getByRole("button", { name: "Preparar meu combo" }).click();
  await expect(page.getByText("Preparando seu combo…", { exact: true })).toBeVisible();
  await expect(page.getByText("Pronto para retirada no balcão.", { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Ver na minha comanda" }).click();
  await expect(page.getByRole("article")).toContainText("Combo vegetariano");
  await expect(page.getByRole("article")).toContainText("Pronto para retirada");
});

test("trocar de combo cancela o preparo anterior e recomeçar limpa a visita", async ({ page }) => {
  await enter(page);
  await select(page, /Um pedido/);
  await page.getByRole("button", { name: "Preparar meu combo" }).click();
  await page.getByRole("button", { name: "Vegetariano", exact: true }).click();
  await page.waitForTimeout(3100);
  await expect(page.getByRole("button", { name: "Preparar meu combo" })).toBeEnabled();
  await expect(page.getByText("Pronto para retirada no balcão.", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Preparar meu combo" }).click();
  await page.getByRole("button", { name: "Recomeçar a visita" }).click();
  await select(page, /Sua comanda/);
  await page.waitForTimeout(3000);
  await expect(page.getByRole("article")).toContainText("Ainda não começou");
  await expect(page.getByRole("article")).toContainText("ainda não reservada");
});

test("a equipe assume o contexto e pode devolver a conversa à Lia", async ({ page }) => {
  await enter(page);
  await select(page, /Uma conversa/);
  await page.getByRole("button", { name: "Chamar a equipe", exact: true }).click();
  await expect(page.getByText("Ana assumiu · automação pausada na prévia")).toBeVisible();
  await select(page, /Sua comanda/);
  await expect(page.getByRole("article")).toContainText("Ana · equipe humana");
  await select(page, /Uma conversa/);
  await page.getByRole("button", { name: "Devolver à Lia" }).click();
  await select(page, /Sua comanda/);
  await expect(page.getByRole("article")).toContainText("Lia · recepção");
});

test("a noite muda a atmosfera e pausar realmente interrompe a animação", async ({ page }) => {
  await enter(page);
  await page.getByRole("button", { name: "Acender a noite" }).click();
  await expect(page.locator("#cover-experience")).toHaveAttribute("data-mood", "night");
  await page.getByRole("button", { name: "Pausar animações" }).click();
  await expect(page.getByTestId("restaurant-renderer")).toHaveAttribute("data-motion", "false");
  const time = await page.getByTestId("restaurant-renderer").getAttribute("data-time");
  await page.waitForTimeout(500);
  await expect(page.getByTestId("restaurant-renderer")).toHaveAttribute("data-time", time!);
  await page.getByRole("button", { name: "Retomar animações" }).click();
  await expect(page.getByTestId("restaurant-renderer")).not.toHaveAttribute("data-time", time!);
});

test("movimento reduzido conserva as ações e câmera acessível por teclado", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await enter(page);
  await expect(page.getByTestId("restaurant-renderer")).toHaveAttribute("data-motion", "false");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Pular para os controles do restaurante" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("navigation", { name: "Explore o restaurante" })).toBeFocused();
  await page.keyboard.press("Tab"); await page.keyboard.press("Enter");
  await expect(page.getByRole("complementary")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("navigation", { name: "Explore o restaurante" }).getByRole("button", { name: /Uma mesa/ })).toBeFocused();
  const renderer = page.getByTestId("restaurant-renderer");
  await renderer.focus();
  const before = await renderer.getAttribute("data-camera");
  await page.keyboard.press("ArrowLeft");
  await expect(renderer).not.toHaveAttribute("data-camera", before!);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(renderer).toHaveAttribute("data-motion", "true");
});

test("a aba oculta interrompe o loop e volta a animar quando visível", async ({ page }) => {
  await enter(page);
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new Event("visibilitychange")); });
  const time = await page.getByTestId("restaurant-renderer").getAttribute("data-time");
  await page.waitForTimeout(400);
  await expect(page.getByTestId("restaurant-renderer")).toHaveAttribute("data-time", time!);
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: false }); document.dispatchEvent(new Event("visibilitychange")); });
  await expect(page.getByTestId("restaurant-renderer")).not.toHaveAttribute("data-time", time!);
});

test("toque arrasta o salão sem abrir uma ação por engano", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce", baseURL: `http://localhost:${process.env.PLAYWRIGHT_PORT || "3100"}` });
  const page = await context.newPage();
  await enter(page);
  const client = await context.newCDPSession(page);
  const before = await page.getByTestId("restaurant-renderer").getAttribute("data-camera");
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 155, y: 390 }] });
  await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 250, y: 420 }] });
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page.getByTestId("restaurant-renderer")).not.toHaveAttribute("data-camera", before!);
  await expect(page.locator("#cover-experience")).toHaveAttribute("data-selected", "none");
  await page.getByRole("navigation", { name: "Explore o restaurante" }).getByRole("button", { name: /Uma mesa/ }).tap();
  await page.getByRole("button", { name: "4 pessoas" }).tap();
  await expect(page.getByRole("button", { name: "4 pessoas" })).toHaveAttribute("aria-pressed", "true");
  await context.close();
});

test("falha e perda de WebGL preservam controles e escolhas", async ({ page }) => {
  await enter(page);
  await select(page, /Uma mesa/);
  await page.getByRole("button", { name: "4 pessoas" }).click();
  await page.getByRole("button", { name: "Reservar na demonstração" }).click();
  await page.locator("canvas").evaluate(canvas => canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true })));
  await expect(page.locator("#cover-experience")).toHaveAttribute("data-renderer", "illustration");
  await select(page, /Sua comanda/);
  await expect(page.getByRole("article")).toContainText("Mesa para 4 · reserva demonstrativa");
  await page.getByRole("button", { name: "Ativar versão 3D" }).click();
  await expect(page.locator("#cover-experience")).toHaveAttribute("data-renderer", "webgl", { timeout: 30_000 });
  await expect(page.getByRole("article")).toContainText("Mesa para 4 · reserva demonstrativa");
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof original>) {
      if (String(args[0]).includes("webgl")) return null;
      return original.apply(this, args);
    } as typeof original;
  });
  await page.reload();
  await expect(page.locator("#cover-experience")).toHaveAttribute("data-renderer", "illustration", { timeout: 30_000 });
  await select(page, /Uma conversa/);
  await expect(page.getByRole("button", { name: "Chamar a equipe" })).toBeVisible();
});

test("menu abre as aplicações e funciona também sem JavaScript", async ({ page, browser }) => {
  await page.goto("/");
  await page.locator("summary").click();
  const routes = page.getByRole("navigation", { name: "Abrir experiências do projeto" });
  for (const [label, href] of [["WhatsApp", "/whatsapp"], ["Dashboard", "/dashboard"], ["CRM", "/crm"], ["Apresentação", "/apresentacao"]]) await expect(routes.getByRole("link", { name: new RegExp(label) })).toHaveAttribute("href", href);
  await page.route("**/api/**", route => route.fulfill({ status: 503, json: { error: "Teste isolado" } }));
  await routes.getByRole("link", { name: /Dashboard/ }).click();
  await expect(page.getByRole("heading", { name: "Caixa de entrada." })).toBeVisible();
  await page.getByRole("link", { name: "Sabor Express início" }).first().click();
  await expect(page.getByRole("navigation", { name: "Explore o restaurante" })).toBeVisible();
  const context = await browser.newContext({ javaScriptEnabled: false });
  const staticPage = await context.newPage();
  await staticPage.goto(`http://localhost:${process.env.PLAYWRIGHT_PORT || "3100"}/`);
  await staticPage.locator("summary").click();
  await expect(staticPage.getByRole("navigation", { name: "Abrir experiências do projeto" }).getByRole("link")).toHaveCount(4);
  await expect(staticPage.locator('img[src*="restaurant-editorial"]')).toBeVisible();
  await context.close();
});

for (const size of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 768, height: 900 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }, { width: 667, height: 375 }]) {
  test(`salão em tela inteira e ações em ${size.width}x${size.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(size); await enter(page);
    await page.getByRole("button", { name: "Pausar animações" }).click();
    expect(await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }))).toEqual({ width: size.width, height: size.height });
    await page.screenshot({ path: testInfo.outputPath("salon.png") });
    await select(page, /Uma mesa/);
    await page.getByRole("button", { name: "4 pessoas" }).click();
    await page.getByRole("button", { name: "Reservar na demonstração" }).click();
    await expect(page.getByRole("button", { name: "Sua mesa está marcada" })).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath("table.png") });
    await page.getByRole("button", { name: "Voltar a explorar" }).click();
    await page.getByRole("button", { name: "Acender a noite" }).click();
    await page.screenshot({ path: testInfo.outputPath("night.png") });
    await page.getByRole("button", { name: "Ativar versão ilustrada" }).click();
    await expect(page.locator("#cover-experience")).toHaveAttribute("data-renderer", "illustration");
    await page.screenshot({ path: testInfo.outputPath("illustrated.png") });
  });
}
