import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { generateReply } from '../src/lib/automation';

async function main() {
  const output = 'generated-media/sabor-express';
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  // Exercise the existing demo engine in an isolated browser context.
  await context.route('**/api/assistant', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { provider: 'demo', ready: true, label: 'Demonstração local · sem LLM' } });
    } else {
      const { conversation } = route.request().postDataJSON();
      await route.fulfill({ json: generateReply(conversation.messages.at(-1).text, conversation) });
    }
  });
  const page = await context.newPage();
  await page.goto('http://localhost:3000/whatsapp');
  await page.getByRole('button', { name: /Bateu aquela fome/ }).click();
  await page.getByRole('button', { name: /Combo Clássico/ }).click();
  await expect(page.locator('.message-bubble').last()).toContainText('Posso confirmar?', { timeout: 20000 });
  await expect(page.getByRole('button', { name: 'Confirmar pedido', exact: true })).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);
  const phone = page.locator('.phone-frame');
  await phone.screenshot({ path: `${output}/cliente-antes.png` });
  const frame = await phone.boundingBox();
  const button = await page.getByRole('button', { name: 'Confirmar pedido', exact: true }).boundingBox();
  await page.getByRole('button', { name: 'Confirmar pedido', exact: true }).click();
  await expect(page.locator('.message-bubble').last()).toContainText('confirmado na demonstração', { timeout: 20000 });
  await page.waitForTimeout(600);
  await phone.screenshot({ path: `${output}/cliente-confirmado.png` });
  const inbox = await context.newPage();
  await inbox.setViewportSize({ width: 1280, height: 738 });
  await inbox.goto('http://localhost:3000/dashboard');
  await expect(inbox.locator('.order-status')).toHaveText('Em preparo');
  await expect(inbox.locator('.order-product')).toContainText('Combo Clássico');
  await inbox.locator('.order-card').scrollIntoViewIfNeeded();
  await inbox.evaluate(() => document.fonts.ready);
  await inbox.waitForTimeout(800);
  await inbox.screenshot({ path: `${output}/dashboard-confirmado.png` });
  await writeFile(`${output}/capture-info.json`, JSON.stringify({ source: 'Sabor Express local application; existing demo engine', url: 'http://localhost:3000', frame, button, order: await inbox.locator('.order-card').allTextContents(), created: new Date().toISOString() }, null, 2));
  await browser.close();
  console.log(`Captured actual app screens in ${output}`);
}
main().catch(error => { console.error(error); process.exit(1); });
