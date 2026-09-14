import { chromium, expect } from '@playwright/test';
import sharp from 'sharp';
import { generateReply } from '../src/lib/automation';

// Isolated browser; use the real local demo engine, never external services or CRM writes.
async function main() {
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5, reducedMotion: 'reduce' });
    await context.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/assistant') {
        if (route.request().method() === 'GET') return route.fulfill({ json: { provider: 'demo', ready: true, label: 'Demonstração local · sem LLM' } });
        const { conversation } = route.request().postDataJSON();
        return route.fulfill({ json: generateReply(conversation.messages.at(-1).text, conversation) });
      }
      if (url.pathname === '/api/csat') return route.fulfill({ json: { survey: null } });
      return route.fulfill({ status: 503, json: { error: 'Serviço não conectado nesta captura demonstrativa.' } });
    });
    const base = process.env.PRESENTATION_BASE_URL || 'http://localhost:3000';
    const customer = await context.newPage();
    await customer.goto(`${base}/whatsapp`);
    await customer.getByRole('button', { name: /Quando precisa de uma pessoa/ }).click();
    await expect(customer.locator('.human-handoff')).toContainText('A equipe já recebeu');
    const inbox = await context.newPage();
    await inbox.goto(`${base}/dashboard`);
    await inbox.getByRole('button', { name: 'Assumir', exact: true }).click();
    await expect(customer.locator('.human-handoff')).toContainText('Ana está cuidando');
    await inbox.getByRole('textbox', { name: 'Escrever resposta' }).fill('Oi! Sou a Ana. Vou verificar o atraso com a unidade e acompanho seu pedido por aqui.');
    await inbox.getByRole('button', { name: 'Enviar', exact: true }).click();
    await expect(customer.locator('.message-bubble').last()).toContainText('Sou a Ana');
    await inbox.evaluate(() => document.fonts.ready);
    await sharp(await inbox.screenshot()).resize({ width: 2000 }).webp({ quality: 92 }).toFile('public/apresentacao/transferencia.webp');
    console.log('Real handoff captured: public/apresentacao/transferencia.webp');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
