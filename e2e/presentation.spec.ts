import { test, expect, type Page } from '@playwright/test';
import { englishPitch, phases, pilotDecision, pilotProtocol, risks, trustActions } from '../src/components/presentation/content';

const active = (page: Page) => page.locator('main.deck-stage > section:not([hidden])');
async function blur(page: Page) { await page.evaluate(() => (document.activeElement as HTMLElement)?.blur()); }

test('slide deck: URL, keyboard, notes, overview, fullscreen and focus boundaries', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/apresentacao');
  await expect(active(page)).toHaveCount(1);
  await expect(active(page).getByRole('heading', { level: 1 })).toContainText('O desafio');
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/#slide=2$/);
  await page.getByRole('button', { name: 'Próximo slide', exact: true }).click();
  await expect(page).toHaveURL(/#slide=3$/);
  await page.keyboard.press('ArrowLeft');
  await expect(page).toHaveURL(/#slide=2$/);
  await page.goBack();
  await expect(page).toHaveURL(/#slide=3$/);
  await page.reload();
  await expect(active(page)).toHaveAttribute('aria-label', /3 \/ 7/);
  await expect(page.locator('#deployment-phases')).toContainText('Dias 26–40');
  await expect(page.locator('#deployment-phases button')).toHaveCount(0);
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/#slide=4$/);
  await page.keyboard.press('ArrowLeft');
  await expect(page).toHaveURL(/#slide=3$/);
  await blur(page);
  await page.keyboard.press('n');
  await expect(page.getByRole('dialog', { name: 'Notas do apresentador' })).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('estimativa de custos');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await blur(page);
  await page.keyboard.press('g');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: /Ir para slide/ })).toHaveCount(7);
  await page.getByRole('button', { name: /Ir para slide 7:/ }).click();
  await expect(page).toHaveURL(/#slide=7$/);
  await expect(active(page)).toHaveAttribute('lang', 'en');
  expect(englishPitch.split(/\s+/).length).toBeGreaterThanOrEqual(260);
  expect(englishPitch.split(/\s+/).length).toBeLessThanOrEqual(330);
  await page.getByRole('button', { name: 'Ocultar controles' }).click();
  await expect(page.getByRole('navigation', { name: 'Controles da apresentação' })).toHaveCount(0);
  await page.keyboard.press('h');
  await expect(page.getByRole('navigation', { name: 'Controles da apresentação' })).toBeVisible();
  await page.getByRole('button', { name: 'Tela cheia', exact: true }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await page.getByRole('button', { name: 'Sair da tela cheia' }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  expect(errors).toEqual([]);
});

test('commercial plays, pauses, respects focus and stops on navigation', async ({ page }) => {
  await page.goto('/apresentacao#slide=2');
  const video = page.locator('video');
  await expect(video).toBeVisible();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThanOrEqual(2);
  expect(await video.evaluate((v: HTMLVideoElement) => ({ paused: v.paused, muted: v.muted, duration: v.duration }))).toMatchObject({ paused: true, muted: true, duration: 12 });
  await video.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/#slide=2$/);
  await video.evaluate((v: HTMLVideoElement) => v.play());
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0);
  await video.evaluate((v: HTMLVideoElement) => v.pause());
  expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await video.evaluate((v: HTMLVideoElement) => v.play());
  await page.getByRole('button', { name: 'Próximo slide', exact: true }).click();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await page.getByRole('button', { name: 'Slide anterior' }).click();
  await page.getByRole('button', { name: 'Revelar central' }).click();
  await expect(page.getByRole('button', { name: 'Ampliar captura da central' })).toBeVisible();
  await page.getByRole('button', { name: 'Ampliar captura da central' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('missing video offers recovery instead of a dead player', async ({ page }) => {
  await page.route('**/comercial-12s.mp4', route => route.abort());
  await page.goto('/apresentacao#slide=2');
  await expect(page.getByText('Comercial indisponível')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Selecionar vídeo', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ver central', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ampliar captura da central' })).toBeVisible();
});

test('familiar KPIs have a simple speaking guide without calculations', async ({ page }) => {
  await page.goto('/apresentacao#slide=5');
  await expect(active(page)).toContainText('Clientes satisfeitos. Equipe mais eficiente.');
  await expect(active(page)).not.toContainText('+10%');
  await expect(active(page)).not.toContainText('≥ 60%');
  await expect(active(page)).not.toContainText('≥ 85%');
  await expect(active(page)).not.toContainText('reabertura em 24h');
  await expect(page.locator('.deck-metrics > article')).toHaveCount(5);
  await expect(page.locator('[data-kpi=resolution]')).toContainText('FCR');
  await expect(page.locator('[data-kpi=conversion]')).toContainText('Mais conversas virando pedidos.');
  await expect(page.locator('.deck-metric-featured')).toContainText('CSAT');
  await expect(page.locator('.deck-kpi-footer')).toContainText('Metas alinhadas com a operação no diagnóstico.');
  await page.getByRole('button', { name: 'Guia de fala dos KPIs', exact: true }).click();
  const guide = page.getByRole('dialog', { name: 'Guia de fala dos KPIs', exact: true });
  await expect(guide).toBeVisible();
  await expect(guide.locator('section[aria-label^="Guia:"]')).toHaveCount(5);
  await expect(guide).toContainText('Um novo pedido é um novo atendimento.');
  await expect(guide).toContainText('Uma consulta legítima de status não é automaticamente falha.');
  await expect(guide).toContainText('CSAT mede satisfação');
  await expect(guide).toContainText('onde acompanhar', { ignoreCase: true });
  await expect(guide).toContainText('primeiro atendimento');
  expect(await guide.innerText()).not.toMatch(/÷|×|P90|mediana|denominador|min\/caso|Como calcular/);
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/#slide=5$/);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Notas do apresentador' }).click();
  await expect(page.getByRole('dialog')).toContainText('Como abrir a fala');
  await expect(page.getByRole('dialog')).toContainText('Como fechar a fala');
  expect(await page.getByRole('dialog').innerText()).not.toMatch(/÷|×|P90|mediana|denominador|min\/caso|Como calcular/);
});

test('demo links work, risks stay visible and supporting dialogs preserve the slide', async ({ page, context }) => {
  // Opening product screens must not cause external writes during this test.
  await context.route('**/api/**', route => route.fulfill({ status: 503, json: { error: 'Teste de navegação isolado' } }));
  await page.goto('/apresentacao#slide=6');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  for (const item of risks) {
    await expect(page.locator('.deck-risk-matrix')).toContainText(item.label);
    await expect(page.locator('.deck-risk-matrix')).toContainText(item.protection);
  }
  await expect(page.locator('.deck-trust-plan')).toContainText('ouvir os franqueados, testar juntos e permitir pausa');
  await expect(page.locator('.deck-risk-plan')).toBeInViewport();
  const clientOpened = context.waitForEvent('page');
  await page.getByRole('link', { name: 'Abrir visão do cliente' }).click();
  const client = await clientOpened;
  await expect(client).toHaveURL(/\/whatsapp$/);
  await expect(client.locator('.phone-frame')).toBeVisible();
  const inboxOpened = context.waitForEvent('page');
  await page.getByRole('link', { name: 'Abrir central de atendimento' }).click();
  const inbox = await inboxOpened;
  await expect(inbox.locator('.inbox-layout')).toBeVisible();
  await expect(page).toHaveURL(/#slide=6$/);
  for (const name of ['Integrações', 'Vibe coding']) {
    await page.getByRole('button', { name: new RegExp(name) }).click();
    await expect(page.locator('.deck-topic-content')).toHaveCount(1);
    await expect(page.getByRole('dialog', { name, exact: true })).toBeVisible();
    if (name === 'Vibe coding') await expect(page.locator('.deck-topic-content')).toContainText('proposta no n8n');
    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(/#slide=6$/);
    await page.keyboard.press('Escape');
  }
  await page.getByRole('button', { name: 'Transferência', exact: true }).click();
  await expect.poll(() => page.locator('.deck-demo-shot img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await page.getByRole('button', { name: 'Notas do apresentador' }).click();
  const notes = page.getByRole('dialog', { name: 'Notas do apresentador' });
  for (const item of risks) {
    await expect(notes).toContainText(item.risk);
    await expect(notes).toContainText(item.mitigation);
  }
  for (const action of trustActions) await expect(notes).toContainText(action);
});

for (const size of [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
  test(`phases and controlled pilot are explicit at ${size.width}×${size.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(size);
    await page.goto('/apresentacao#slide=3');
    await expect(active(page)).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.getByRole('button', { name: 'Ocultar controles' }).click();
    await expect(page.locator('.deck-phase-cards > article')).toHaveCount(4);
    await expect(page.locator('.deck-plan button')).toHaveCount(0);
    for (const [i, phase] of phases.entries()) {
      const detail = page.getByRole('article', { name: `Fase ${i + 1}: ${phase.title}` });
      await expect(detail).toContainText(phase.summary);
      await expect.poll(() => detail.locator('img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
      await expect(detail).toBeInViewport();
    }
    await page.screenshot({ path: testInfo.outputPath('plano-fases-visiveis.png') });
    await page.getByRole('button', { name: 'Mostrar controles' }).click();
    await page.getByRole('button', { name: 'Notas do apresentador' }).click();
    for (const phase of phases) {
      await expect(page.getByRole('dialog')).toContainText(phase.gate);
      await expect(page.getByRole('dialog')).toContainText(phase.detail);
    }
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Ocultar controles' }).click();
    await blur(page);
    await page.keyboard.press('4');
    await expect(page.locator('.deck-pilot button')).toHaveCount(0);
    for (const step of pilotProtocol) {
      await expect(page.locator('.deck-pilot-protocol')).toContainText(step.label);
      await expect(page.locator('.deck-pilot-protocol')).toContainText(step.summary);
    }
    await expect(page.locator('.deck-pilot-decision')).toContainText('Se houver falhas, pausar e corrigir.');
    await expect(page.locator('.deck-pilot')).toContainText('franqueado cético');
    await page.screenshot({ path: testInfo.outputPath('piloto-controlado.png') });
    await page.getByRole('button', { name: 'Mostrar controles' }).click();
    await page.getByRole('button', { name: 'Notas do apresentador' }).click();
    await expect(page.getByRole('dialog')).toContainText(pilotDecision.gate);
    await expect(page.getByRole('dialog')).toContainText(pilotDecision.fallback);
    await expect(page.getByRole('dialog')).toContainText('TI e responsável pelo CRM');
  });

  test(`all slides fit and media load at ${size.width}×${size.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(size);
    await page.goto('/apresentacao');
    await page.evaluate(() => document.fonts.ready);
    await page.getByRole('button', { name: 'Ocultar controles' }).click();
    for (let i = 0; i < 7; i++) {
      await blur(page);
      await page.keyboard.press(String(i + 1));
      if (i === 1) await page.getByRole('button', { name: 'Revelar central' }).click();
      await expect(active(page)).toHaveCount(1);
      // Slides guide the talk; detailed reports belong in the notes.
      expect((await active(page).innerText()).trim().split(/\s+/).length).toBeLessThanOrEqual(130);
      const outside = await active(page).evaluate(section => {
        const bounds = section.getBoundingClientRect();
        return [...section.querySelectorAll('h1,h2,h3,p,button,a,.deck-facts,.deck-agenda,.deck-risk-matrix,.deck-trust-plan,.deck-pilot-decision')].filter(el => {
          const box = el.getBoundingClientRect();
          return box.width > 0 && box.height > 0 && (box.left < bounds.left - 1 || box.right > bounds.right + 1 || box.top < bounds.top - 1 || box.bottom > bounds.bottom + 1);
        }).map(el => el.textContent?.slice(0, 100));
      });
      expect(outside).toEqual([]);
      const textOverflow = await active(page).evaluate(section => [...section.querySelectorAll('h1,h2,h3,p')].filter(el => el.scrollWidth > el.clientWidth + 2).map(el => el.textContent));
      expect(textOverflow).toEqual([]);
      const footerOverlap = await active(page).evaluate(section => {
        const footerTop = section.querySelector('.deck-slide-footer')!.getBoundingClientRect().top;
        return [...section.querySelectorAll('.deck-experience,.deck-plan,.deck-governance,.deck-results,.deck-demo')].filter(el => el.getBoundingClientRect().bottom > footerTop - 8).map(el => el.className);
      });
      expect(footerOverlap).toEqual([]);
      for (const image of await active(page).locator('img').all()) await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`slide-${i + 1}.png`) });
    }
    await expect(active(page).locator('.deck-closing')).toHaveCSS('animation-name', 'none');
  });
}

test('standard motion uses a brief transition without advancing automatically', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/apresentacao');
  await expect(active(page).locator('.deck-opening')).toHaveCSS('animation-duration', '0.45s');
  await page.waitForTimeout(1000);
  await expect(active(page)).toHaveAttribute('aria-label', /1 \/ 7/);
});
