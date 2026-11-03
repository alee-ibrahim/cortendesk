import { expect, test } from '@playwright/test';
import { clientFor, connect, touch } from './helpers';

const tx = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const m = /translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([\d.]+)\)/.exec(document.querySelector<HTMLElement>('#rd-viewport canvas')!.style.transform);
    return m ? { x: Number(m[1]), y: Number(m[2]), s: Number(m[3]) } : { x: 0, y: 0, s: 1 };
  });

test.beforeEach(({}, info) => test.skip(info.project.name !== 'pixel', 'Pixel 7 only'));

async function trackpadZoomed(page: import('@playwright/test').Page) {
  await connect(page);
  await page.locator('#rd-mbar [data-mbar="mode"]').click(); // Touch -> Trackpad
  await page.locator('#rd-mbar [data-mbar="zoom"]').click(); // 1:1
  await page.waitForTimeout(200);
}

test('trackpad + zoom: moving the cursor to the edge scrolls the view smoothly, never jumps back and forth', async ({ page }) => {
  await trackpadZoomed(page);
  const seen: number[] = [(await tx(page)).x];
  let x = 150;
  const y = 600;
  await touch(page, [['pointerdown', 1, x, y]], 0);
  for (let i = 0; i < 60; i++) {
    x += i % 2 ? 8 : 6;
    if (x > 350) {
      await touch(page, [['pointerup', 1, x, y]], 0);
      x = 150;
      await touch(page, [['pointerdown', 1, x, y]], 0);
      continue;
    }
    await touch(page, [['pointermove', 1, x, y]], 16);
    seen.push((await tx(page)).x);
  }
  await touch(page, [['pointerup', 1, x, y]], 0);
  const steps = seen.slice(1).map((v, i) => v - seen[i]!);
  // moving right only: the view may only move left (tx down), in small steps
  expect(Math.max(...steps)).toBeLessThanOrEqual(0.5);
  expect(Math.min(...steps)).toBeGreaterThanOrEqual(-60);
});

test('trackpad + zoom: a two-finger pan is not pulled back to the cursor', async ({ page }) => {
  await trackpadZoomed(page);
  const before = await tx(page);
  const steps: [string, number, number, number][] = [['pointerdown', 1, 20, 500], ['pointerdown', 2, 80, 500]];
  // spread first (decides pinch), then pan both fingers right by 260 px: the cursor ends up off-screen
  steps.push(['pointermove', 2, 110, 500]);
  for (let d = 10; d <= 260; d += 10) steps.push(['pointermove', 1, 20 + d, 500], ['pointermove', 2, 110 + d, 500]);
  steps.push(['pointerup', 1, 280, 500], ['pointerup', 2, 370, 500]);
  await touch(page, steps, 0);
  const after = await tx(page);
  await page.waitForTimeout(500);
  expect(await tx(page)).toEqual(after); // nothing re-pans afterwards
  expect(after.x).toBeGreaterThan(before.x + 150); // the pan stuck
});
