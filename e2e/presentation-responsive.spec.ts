import { expect, test } from '@playwright/test';

for (const size of [
  { width: 320, height: 640 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 844, height: 390 },
]) {
  test(`readable, reachable slides at ${size.width}×${size.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(size);
    await page.goto('/apresentacao#slide=1');
    await page.evaluate(() => document.fonts.ready);
    const active = page.locator('main.deck-stage > section:not([hidden])');
    for (let i = 1; i <= 7; i++) {
      if (i > 1) await page.getByRole('button', { name: 'Próximo slide', exact: true }).click();
      await expect(active).toHaveCount(1);
      await expect(active).toHaveAttribute('aria-label', new RegExp(`^${i} / 7`));
      await expect.poll(() => active.evaluate(el => el.scrollTop)).toBe(0);
      const layout = await active.evaluate(el => {
        const bounds = el.getBoundingClientRect();
        return {
          width: bounds.width,
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          cueSize: parseFloat(getComputedStyle(el.querySelector('.deck-cue')!).fontSize),
          overflowing: [...el.querySelectorAll('h1,h2,h3,p,a,button,img,dt,dd,li')].filter(child => {
            const box = child.getBoundingClientRect();
            return box.width > 0 && (box.left < bounds.left - 1 || box.right > bounds.right + 1);
          }).map(child => child.className),
        };
      });
      expect(layout.width).toBeLessThanOrEqual(size.width);
      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
      expect(layout.cueSize).toBeGreaterThanOrEqual(18);
      expect(layout.overflowing).toEqual([]);
      if (await active.evaluate(el => el.scrollHeight > el.clientHeight + 1)) {
        await active.focus();
        await page.keyboard.press('PageDown');
        await expect(page).toHaveURL(new RegExp(`#slide=${i}$`));
      }
      await active.evaluate(el => el.scrollTo(0, el.scrollHeight));
      await expect(active.locator('.deck-slide-footer')).toBeInViewport();
      await active.evaluate(el => el.scrollTo(0, 0));
      if (i === 5) {
        await page.getByRole('button', { name: 'Guia de fala dos KPIs', exact: true }).click();
        const guide = page.getByRole('dialog', { name: 'Guia de fala dos KPIs', exact: true });
        await expect(guide).toBeVisible();
        expect(await guide.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
        await page.getByRole('button', { name: 'Fechar painel' }).click();
      }
      if (i === 3 || i === 4) await page.screenshot({ path: testInfo.outputPath(`slide-${i}.png`) });
    }
    await page.getByRole('button', { name: 'Visão geral', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await page.getByRole('button', { name: /Ir para slide 3:/ }).click();
    await expect(page).toHaveURL(/#slide=3$/);
    await expect(page.locator('.deck-phase-cards > article')).toHaveCount(4);
    await page.getByRole('button', { name: 'Notas do apresentador' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Fechar painel' }).click();
  });
}

test('resizing and orientation changes reflow the current slide', async ({ page }) => {
  await page.goto('/apresentacao#slide=3');
  for (const size of [{ width: 1920, height: 1080 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1366, height: 768 }]) {
    await page.setViewportSize(size);
    const active = page.locator('main.deck-stage > section:not([hidden])');
    await expect(active).toHaveAttribute('aria-label', /^3 \/ 7/);
    await expect.poll(() => active.evaluate(el => el.getBoundingClientRect().right <= window.innerWidth + 1)).toBe(true);
    const columns = await page.locator('.deck-stage .deck-phase-cards').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    expect(columns).toBe(size.width <= 650 ? 1 : size.width <= 1100 ? 2 : 4);
  }
});
