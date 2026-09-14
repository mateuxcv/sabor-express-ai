import { expect, test } from "@playwright/test";
import { generateReply } from "../src/lib/automation";
import { mockSentiment } from "./sentiment-fixture";

test.beforeEach(async ({ context }) => {
  await mockSentiment(context);
  await context.route("**/api/assistant", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { provider: "demo", ready: true, label: "Demo controlada" } });
    const { conversation } = route.request().postDataJSON();
    return route.fulfill({ json: generateReply(conversation.messages.at(-1).text, conversation) });
  });
});

test("cards escolhem Moema, entrega e endereço; frete entra no pedido e no inbox", async ({ page, context }, testInfo) => {
  await page.goto("/whatsapp");
  const setup = page.getByRole("region", { name: "Escolhas do pedido" });
  await expect(setup.getByRole("button")).toHaveCount(3);
  await setup.getByRole("button", { name: /Moema/ }).click();
  await expect(setup).toContainText("Como você prefere receber?");
  await page.reload();
  await expect(setup).toContainText("São Paulo · Moema");
  await setup.getByRole("button", { name: /Receber por entrega/ }).click();
  await expect(setup).toContainText("R$ 8,90");
  await setup.getByLabel("Rua / avenida").fill("Avenida de Teste");
  await setup.getByLabel("Número", { exact: true }).fill("123");
  await setup.getByLabel("Bairro", { exact: true }).fill("Moema");
  await setup.getByLabel("Complemento (opcional)").fill("Apto 4");
  await setup.getByRole("button", { name: "Usar este endereço" }).click();
  await expect(page.locator(".product-card")).toHaveCount(7);
  await page.screenshot({ path: testInfo.outputPath("expanded-menu.png") });
  await page.getByRole("button", { name: /Combo Bacon/ }).click();
  await expect(page.locator(".message-bubble").last()).toContainText("Total: R$ 48,80");
  await expect(page.locator(".message-bubble").last()).toContainText("Avenida de Teste, 123");
  await page.getByRole("button", { name: "Confirmar pedido", exact: true }).click();
  await expect(page.locator(".message-bubble").last()).toContainText("confirmado na demonstração");
  const inbox = await context.newPage(); await inbox.goto("/dashboard");
  await expect(inbox.locator(".order-breakdown")).toContainText("Moema");
  await expect(inbox.locator(".order-breakdown")).toContainText("R$ 48,80");
  await inbox.getByRole("button", { name: "Ver pedido completo" }).click();
  await expect(inbox.getByRole("dialog")).toContainText("Entrega");
  await expect(inbox.getByRole("dialog")).toContainText("Apto 4");
  await expect(inbox.getByRole("dialog")).not.toContainText("Novos pedidos são para retirada");
});

for (const unit of ["Pinheiros", "Vila Mariana", "Moema"]) {
  test(`retirada em ${unit} não cobra frete`, async ({ page }) => {
    await page.goto("/whatsapp");
    await page.getByRole("region", { name: "Escolhas do pedido" }).getByRole("button", { name: new RegExp(unit) }).click();
    await page.getByRole("button", { name: /Retirar na loja/ }).click();
    await page.getByRole("button", { name: /Brownie de Chocolate/ }).click();
    await expect(page.locator(".message-bubble").last()).toContainText(`Unidade: ${unit}`);
    await expect(page.locator(".message-bubble").last()).toContainText("Frete fictício: R$ 0,00");
    await expect(page.locator(".message-bubble").last()).toContainText("Total: R$ 12,90");
  });
}

test("alterar recebimento descarta resumo antigo e coleta endereço no celular", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/whatsapp");
  await page.getByRole("region", { name: "Escolhas do pedido" }).getByRole("button", { name: /Vila Mariana/ }).click();
  await page.getByRole("button", { name: /Retirar na loja/ }).click();
  await page.getByRole("button", { name: /Milkshake de Chocolate/ }).click();
  await expect(page.locator(".message-bubble").last()).toContainText("Total: R$ 18,90");
  const oldId = await page.evaluate(() => JSON.parse(localStorage.getItem("sabor-express-demo-v1")!).conversations[0].order.id);
  await page.getByRole("button", { name: "Alterar recebimento" }).click();
  await expect(page.getByRole("button", { name: "Confirmar pedido", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /Receber por entrega/ }).click();
  await page.getByRole("button", { name: "Usar este endereço" }).click();
  await expect(page.getByLabel("Rua / avenida")).toBeVisible();
  await page.getByLabel("Rua / avenida").fill("Rua de Teste");
  await page.getByLabel("Número", { exact: true }).fill("50");
  await page.getByLabel("Bairro", { exact: true }).fill("Vila Mariana");
  await page.screenshot({ path: testInfo.outputPath("delivery-mobile.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Usar este endereço" }).click();
  await expect(page.locator(".message-bubble").last()).toContainText("Total: R$ 26,80");
  const newId = await page.evaluate(() => JSON.parse(localStorage.getItem("sabor-express-demo-v1")!).conversations[0].order.id);
  expect(newId).not.toBe(oldId);
});

test("produto pedido antes dos cards é preservado ao concluir as escolhas", async ({ page }) => {
  await page.goto("/whatsapp");
  await page.getByRole("textbox", { name: "Mensagem do cliente" }).fill("Quero pedir o Batata Cheddar");
  await page.getByRole("button", { name: "Enviar mensagem", exact: true }).click();
  await expect(page.locator(".message-bubble").last()).toContainText("Escolha a unidade");
  await page.getByRole("region", { name: "Escolhas do pedido" }).getByRole("button", { name: /Pinheiros/ }).click();
  await page.getByRole("button", { name: /Retirar na loja/ }).click();
  await expect(page.locator(".message-bubble").last()).toContainText("Batata Cheddar");
  await expect(page.locator(".message-bubble").last()).toContainText("Total: R$ 16,90");
});
