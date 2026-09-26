import { expect, type Browser, type Page } from '@playwright/test';

const openPages: Page[] = [];

/** Opens the app in a fresh browser context, enters the name and lands in the lobby. */
export async function join(
  browser: Browser,
  name: string,
  viewport = { width: 1000, height: 900 },
): Promise<Page> {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  openPages.push(page);
  await page.goto('/');
  await expect(page.locator('#name-dialog')).toBeVisible();
  await page.fill('#name-input', name);
  await page.click('#name-dialog button[value=ok]');
  await expect(page.locator('#my-name')).toHaveText(name);
  return page;
}

/** Creates a room from the lobby and returns its invitation URL. */
export async function openRoom(page: Page, name = 'E2E 방'): Promise<string> {
  await page.fill('#room-name', name);
  await page.click('#create-room button[type=submit]');
  await expect(page).toHaveURL(/[?]room=/);
  await expect(page.locator('#room-title')).toHaveText(name);
  await expect(page.locator('#seat-take')).toBeVisible();
  return page.url();
}

/** Opens an invitation URL (the name is remembered, so no prompt). */
export async function enterRoom(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await expect(page.locator('#room-view')).toBeVisible();
  await expect(page.locator('#status')).not.toHaveText('방에 들어가는 중…');
}

export const square = (page: Page, name: string) => page.locator(`.square[aria-label^="${name},"]`);

/**
 * Creates a room with `a`, brings `b` (and any spectators) in through the
 * invitation link, seats both players and returns them as [white, black].
 */
export async function startGame(a: Page, b: Page, ...spectators: Page[]): Promise<[Page, Page]> {
  const url = await openRoom(a);
  for (const page of [b, ...spectators]) await enterRoom(page, url);
  await a.click('#seat-take');
  await expect(a.locator('#seat-leave')).toBeVisible();
  await b.click('#seat-take');
  await expect(a.locator('#board')).toHaveAttribute('data-status', 'playing');
  await expect(b.locator('#board')).toHaveAttribute('data-status', 'playing');
  const aIsWhite = (await a.locator('#status').textContent())?.includes('당신의 차례') ?? false;
  return aIsWhite ? [a, b] : [b, a];
}

/** Plays a move by clicking source and target, and waits until the server applied it. */
export async function move(page: Page, uci: string): Promise<void> {
  const before = Number(await page.locator('#board').getAttribute('data-ply'));
  await square(page, uci.slice(0, 2)).click();
  await square(page, uci.slice(2, 4)).click();
  await expect(page.locator('#board')).toHaveAttribute('data-ply', String(before + 1));
}

/** Plays alternating moves, starting with white. */
export async function playMoves(white: Page, black: Page, moves: string[]): Promise<void> {
  for (const [index, uci] of moves.entries()) {
    const page = index % 2 === 0 ? white : black;
    await expect(page.locator('#status')).toContainText('당신의 차례');
    await move(page, uci);
  }
}

/** Ends a game still in progress so the next test finds a free table. */
export async function resign(page: Page): Promise<void> {
  await page.click('#resign');
  await expect(page.locator('#confirm-text')).toContainText('기권');
  await page.click('#confirm-yes');
  await expect(page.locator('#board')).toHaveAttribute('data-status', 'finished');
}

/** The name a page joined with. */
export async function nameOf(page: Page): Promise<string> {
  return (await page.locator('#my-name').textContent()) ?? '';
}

/**
 * Resigns a game left running by a failed test (the server has a single
 * table) and closes all contexts opened by join().
 */
export async function cleanUp(): Promise<void> {
  for (const page of openPages.splice(0)) {
    // Buttons may disappear between the check and the click when a server
    // update arrives (e.g. the test already left the seat), so never wait long.
    if (await page.locator('#resign').isVisible()) {
      await page.click('#resign', { timeout: 2000 }).catch(() => undefined);
      await page.click('#confirm-yes', { timeout: 2000 }).catch(() => undefined);
    }
    if (await page.locator('#seat-leave').isVisible()) {
      await page.click('#seat-leave', { timeout: 2000 }).catch(() => undefined);
    }
    await page.context().close();
  }
}

/** A room name that is unique per run, so retries and parallel runs do not collide. */
export const uniqueName = (base: string) => `${base} ${Math.random().toString(36).slice(2, 6)}`;
