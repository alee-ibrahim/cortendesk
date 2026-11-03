import { expect, test } from '@playwright/test';
import { TYPE, clearCmds, clientFor, cmds, connect, mouse, touch } from './helpers';

test.beforeEach(({}, info) => {
  test.skip(info.project.name === 'desktop', 'phone / tablet only');
});

test('phone layout: floating controls replace the top bar and dock', async ({ page }, info) => {
  await connect(page);
  await expect(page.locator('#rd-root')).toHaveClass(/rd-mobile/);
  await expect(page.locator('#rd-pill')).toBeVisible();
  await expect(page.locator('#rd-toolbar')).toBeHidden();
  await expect(page.locator('#rd-dock')).toBeHidden();
  const overscroll = await page.evaluate(() => getComputedStyle(document.body).overscrollBehaviorY);
  if (overscroll !== undefined) expect(overscroll).toBe('none'); // not exposed by every WebKit build
  await page.screenshot({ path: info.outputPath('portrait.png') });
  const vp = page.viewportSize()!;
  await page.setViewportSize({ width: vp.height, height: vp.width });
  await page.waitForTimeout(300);
  await expect(page.locator('#rd-pill')).toBeInViewport();
  await page.screenshot({ path: info.outputPath('landscape.png') });
});

test('real tap clicks where the finger is (MOVE before DOWN)', async ({ page }) => {
  await connect(page);
  const p = await clientFor(page, 960, 540);
  await page.touchscreen.tap(p.x, p.y);
  await expect.poll(() => mouse(page)).toHaveLength(3);
  const m = await mouse(page);
  expect(m.map((c) => [c[0], c[1]])).toEqual([[TYPE.MOVE, 0], [TYPE.DOWN, 1], [TYPE.UP, 1]]);
  expect(Math.abs(m[1]![2]! - 960)).toBeLessThanOrEqual(4);
  expect(Math.abs(m[1]![3]! - 540)).toBeLessThanOrEqual(4);
});

test('two-finger tap and long press right-click', async ({ page }) => {
  await connect(page);
  const a = await clientFor(page, 400, 400);
  const b = await clientFor(page, 600, 400);
  await touch(page, [['pointerdown', 1, a.x, a.y], ['pointerdown', 2, b.x, b.y], ['pointerup', 2, b.x, b.y], ['pointerup', 1, a.x, a.y]]);
  let m = await mouse(page);
  expect(m.map((c) => [c[0], c[1]])).toEqual([[TYPE.MOVE, 0], [TYPE.DOWN, 2], [TYPE.UP, 2]]);
  await clearCmds(page);
  await touch(page, [['pointerdown', 3, a.x, a.y]]);
  await page.waitForTimeout(650);
  await touch(page, [['pointerup', 3, a.x, a.y]]);
  m = await mouse(page);
  expect(m.map((c) => [c[0], c[1]])).toEqual([[TYPE.MOVE, 0], [TYPE.DOWN, 2], [TYPE.UP, 2]]);
});

test('drag, and a cancelled drag releases the button; the next tap still works', async ({ page }) => {
  await connect(page);
  const a = await clientFor(page, 200, 200);
  const b = await clientFor(page, 800, 600);
  await touch(page, [['pointerdown', 1, a.x, a.y], ['pointermove', 1, a.x + 30, a.y + 30], ['pointermove', 1, b.x, b.y], ['pointercancel', 1, b.x, b.y]]);
  const m = await mouse(page);
  expect(m[1]!.slice(0, 2)).toEqual([TYPE.DOWN, 1]);
  expect(m.at(-1)!.slice(0, 2)).toEqual([TYPE.UP, 1]);
  await clearCmds(page);
  await touch(page, [['pointerdown', 2, a.x, a.y], ['pointerup', 2, a.x, a.y]]);
  expect((await mouse(page)).map((c) => c[0])).toEqual([TYPE.MOVE, TYPE.DOWN, TYPE.UP]);
});

test('two-finger drag scrolls', async ({ page }) => {
  await connect(page);
  const a = await clientFor(page, 800, 300);
  const b = await clientFor(page, 1100, 300);
  const steps: [string, number, number, number][] = [['pointerdown', 1, a.x, a.y], ['pointerdown', 2, b.x, b.y]];
  for (let dy = 10; dy <= 160; dy += 10) steps.push(['pointermove', 1, a.x, a.y + dy], ['pointermove', 2, b.x, b.y + dy]);
  steps.push(['pointerup', 1, a.x, a.y + 160], ['pointerup', 2, b.x, b.y + 160]);
  await touch(page, steps, 0);
  const wheels = (await mouse(page)).filter((c) => c[0] === TYPE.WHEEL);
  expect(wheels.length).toBeGreaterThanOrEqual(3);
  expect(wheels.every((w) => w[3]! > 0)).toBe(true); // fingers down = scroll up
});

test('pinch zooms the remote screen, not the page; taps still map exactly', async ({ page }) => {
  await connect(page);
  const c = await clientFor(page, 960, 540);
  const steps: [string, number, number, number][] = [['pointerdown', 1, c.x - 30, c.y], ['pointerdown', 2, c.x + 30, c.y]];
  for (let d = 40; d <= 150; d += 10) steps.push(['pointermove', 1, c.x - d, c.y], ['pointermove', 2, c.x + d, c.y]);
  steps.push(['pointerup', 1, c.x - 150, c.y], ['pointerup', 2, c.x + 150, c.y]);
  await touch(page, steps, 0);
  const transform = await page.evaluate(() => document.querySelector<HTMLElement>('#rd-viewport canvas')!.style.transform);
  expect(transform).toMatch(/scale\((\d+(\.\d+)?)\)/);
  expect(Number(/scale\(([\d.]+)\)/.exec(transform)![1])).toBeGreaterThan(2);
  expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
  await clearCmds(page);
  const p = await clientFor(page, 1000, 560);
  await touch(page, [['pointerdown', 5, p.x, p.y], ['pointerup', 5, p.x, p.y]]);
  const m = await mouse(page);
  expect(Math.abs(m[1]![2]! - 1000)).toBeLessThanOrEqual(2);
  expect(Math.abs(m[1]![3]! - 560)).toBeLessThanOrEqual(2);
});

test('on-screen keyboard: Android-style 229 + input sends Thaana and emoji as text', async ({ page }) => {
  await connect(page);
  await page.locator('#rd-pill [data-pill="kbd"]').click();
  await expect(page.locator('#rd-kbd-sink')).toBeFocused();
  await page.evaluate(() => {
    const sink = document.querySelector<HTMLTextAreaElement>('#rd-kbd-sink')!;
    const type = (value: string, data: string) => {
      const kd = new KeyboardEvent('keydown', { key: 'Unidentified', bubbles: true, cancelable: true });
      Object.defineProperty(kd, 'keyCode', { value: 229 });
      sink.dispatchEvent(kd);
      sink.value = value;
      sink.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data, bubbles: true }));
    };
    const base = sink.value;
    type(base + 'ދ', 'ދ');
    type(base + 'ދި', 'ި');
    type(base + 'ދި👍', '👍');
    // Backspace (Gboard edits the field)
    sink.value = base + 'ދި';
    sink.dispatchEvent(new InputEvent('input', { inputType: 'deleteContentBackward', bubbles: true }));
  });
  const c = (await cmds(page)).filter((x) => x.c === 'text' || x.c === 'key');
  expect(c.slice(0, 3)).toEqual([{ c: 'text', text: 'ދ' }, { c: 'text', text: 'ި' }, { c: 'text', text: '👍' }]);
  expect(c[3]).toMatchObject({ c: 'key', keyKind: 'control', press: true }); // Backspace
  // Tapping the remote screen keeps the keyboard open.
  const p = await clientFor(page, 500, 500);
  await touch(page, [['pointerdown', 9, p.x, p.y], ['pointerup', 9, p.x, p.y]]);
  await expect(page.locator('#rd-kbd-sink')).toBeFocused();
});

test('extra keys: Win+R reaches the host as Map-mode key down/up', async ({ page }) => {
  await connect(page);
  await page.locator('#rd-pill [data-pill="xkeys"]').click();
  await expect(page.locator('#rd-xkeys')).toBeVisible();
  await page.locator('#rd-xkeys .rd-xk-page').click(); // F-keys
  await page.locator('#rd-xkeys .rd-xk-page').click(); // combos
  await page.locator('#rd-xkeys [data-xk="win-r"]').click();
  const keys = (await cmds(page)).filter((c) => c.c === 'key').map((c) => [c.keyKind, c.value, c.down]);
  expect(keys).toEqual([['map', 0xe05b, true], ['map', 0x13, true], ['map', 0x13, false], ['map', 0xe05b, false]]);
  await clearCmds(page);
  await page.locator('#rd-xkeys [data-xk="cad"]').click();
  expect(await cmds(page)).toEqual([{ c: 'ctrlAltDel' }]);
});

test('sticky Ctrl applies to the next click only', async ({ page }) => {
  await connect(page);
  await page.locator('#rd-pill [data-pill="xkeys"]').click();
  await page.locator('#rd-xkeys [data-xk="ctrl"]').click();
  await expect(page.locator('#rd-xkeys [data-xk="ctrl"]')).toHaveAttribute('data-latch', 'once');
  const p = await clientFor(page, 300, 300);
  await touch(page, [['pointerdown', 1, p.x, p.y], ['pointerup', 1, p.x, p.y]]);
  const down = (await cmds(page)).find((c) => c.c === 'mouse' && ((c.mask as number) & 7) === TYPE.DOWN)!;
  expect(down.modifiers).toEqual([4]); // ControlKey.Control
  await expect(page.locator('#rd-xkeys [data-xk="ctrl"]')).toHaveAttribute('data-latch', 'off');
});

test('trackpad mode: slide moves a local cursor, tap clicks there', async ({ page }) => {
  await connect(page);
  await page.locator('#rd-pill [data-pill="mode"]').click();
  await page.locator('.rd-pop [data-action="input:trackpad"]').click();
  await expect(page.locator('#rd-tp-cursor')).toBeVisible();
  const a = await clientFor(page, 960, 540);
  await touch(page, [['pointerdown', 1, a.x, a.y], ['pointermove', 1, a.x + 15, a.y], ['pointermove', 1, a.x + 30, a.y], ['pointerup', 1, a.x + 30, a.y]]);
  const moves = (await mouse(page)).filter((c) => c[0] === TYPE.MOVE);
  expect(moves.at(-1)![2]).toBeGreaterThan(960);
  await clearCmds(page);
  await touch(page, [['pointerdown', 2, 10, 10], ['pointerup', 2, 10, 10]]);
  await page.waitForTimeout(400);
  const m = await mouse(page);
  expect(m.map((c) => [c[0], c[1]])).toEqual([[TYPE.MOVE, 0], [TYPE.DOWN, 1], [TYPE.UP, 1]]);
  expect(m[1]![2]).toBeGreaterThan(960); // at the cursor, not at the finger (top-left)
});

test('pill position and input mode survive a reload', async ({ page }) => {
  await connect(page);
  const handle = page.locator('#rd-pill .rd-pill-handle');
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await handle.dispatchEvent('pointerdown', { pointerId: 1, clientX: box.x + 20, clientY: box.y + 10 });
  await handle.dispatchEvent('pointermove', { pointerId: 1, clientX: 30, clientY: box.y + 120 });
  await handle.dispatchEvent('pointerup', { pointerId: 1, clientX: 30, clientY: box.y + 120 });
  await expect(page.locator('#rd-pill')).toHaveAttribute('data-side', 'left');
  await page.locator('#rd-pill [data-pill="mode"]').click();
  await page.locator('.rd-pop [data-action="input:trackpad"]').click();
  await connect(page);
  await expect(page.locator('#rd-pill')).toHaveAttribute('data-side', 'left');
  await expect(page.locator('#rd-tp-cursor')).toBeVisible();
});
