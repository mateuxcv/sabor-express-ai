import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { generateReply } from '../src/lib/automation';

async function main() {
  const output = 'generated-media/sabor-express-conversa';
  const voiceFile = process.argv[2];
  if (!voiceFile) throw new Error('Provide the voice-message WAV extracted from the generated opening.');
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
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
  await page.getByRole('button', { name: 'Opções da conversa' }).click();
  await page.getByRole('button', { name: 'Nova conversa', exact: true }).click();
  await page.getByLabel('Selecionar arquivo de áudio').setInputFiles(voiceFile);
  const transcript = page.getByRole('textbox', { name: 'Transcrição do áudio' });
  await expect(transcript).toBeVisible({ timeout: 50000 });
  await expect(transcript).toHaveValue(/combo/i);
  const recognized = await transcript.inputValue();
  // Use the product's native transcription-review feature for exact punctuation.
  await transcript.fill('Oi! Quero um combo pra retirar.');
  await page.getByRole('button', { name: 'Enviar áudio', exact: true }).click();
  const phone = page.locator('.phone-frame');
  await expect(page.getByRole('button', { name: /Combo Clássico/ })).toBeVisible({ timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await page.locator('.whatsapp-messages').evaluate(el => { el.scrollTop = 0; });
  await page.waitForTimeout(300);
  await phone.screenshot({ path: `${output}/01-conversa-audio.png` });
  await page.getByRole('button', { name: /Combo Clássico/ }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await phone.screenshot({ path: `${output}/02-cardapio.png` });
  const phoneBox = await phone.boundingBox();
  const menuBox = await page.getByRole('button', { name: /Combo Clássico/ }).boundingBox();
  await page.getByRole('button', { name: /Combo Clássico/ }).click();
  await expect(page.locator('.message-bubble').last()).toContainText('Posso confirmar?', { timeout: 20000 });
  await expect(page.getByRole('button', { name: 'Confirmar pedido', exact: true })).toBeEnabled();
  await page.waitForTimeout(400);
  await phone.screenshot({ path: `${output}/03-resumo-pedido.png` });
  const confirmBox = await page.getByRole('button', { name: 'Confirmar pedido', exact: true }).boundingBox();
  await page.getByRole('button', { name: 'Confirmar pedido', exact: true }).click();
  await expect(page.locator('.message-bubble').last()).toContainText('confirmado na demonstração', { timeout: 20000 });
  await page.waitForTimeout(600);
  await phone.screenshot({ path: `${output}/04-pedido-confirmado.png` });
  const inbox = await context.newPage();
  await inbox.setViewportSize({ width: 1280, height: 738 });
  await inbox.goto('http://localhost:3000/dashboard');
  await expect(inbox.locator('.order-status')).toHaveText('Em preparo');
  await expect(inbox.locator('.order-product')).toContainText('Combo Clássico');
  await inbox.locator('.order-card').scrollIntoViewIfNeeded();
  await inbox.evaluate(() => document.fonts.ready);
  await inbox.waitForTimeout(600);
  await inbox.screenshot({ path: `${output}/05-dashboard.png` });
  await writeFile(`${output}/capture-info.json`, JSON.stringify({ source: 'Actual local Sabor Express app with its existing deterministic demo engine', initialVoiceRecognition: recognized, spokenLine: 'Oi! Quero um combo pra retirar.', phoneBox, menuBox, confirmBox, customer: await inbox.locator('.chat-contact h2').textContent(), order: await inbox.locator('.order-card').allTextContents(), created: new Date().toISOString() }, null, 2));
  await browser.close();
  console.log(`Captured five states of the same actual demo conversation in ${output}`);
}
main().catch(error => { console.error(error); process.exit(1); });
