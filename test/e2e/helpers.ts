import { expect, type Browser, type Page } from '@playwright/test';

const openPages: Page[] = [];

/** Opens the app in a fresh browser context and joins with the given name. */
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
  await expect(page.locator('#my-name')).toHaveText(`내 이름: ${name}`);
  return page;
}

export const square = (page: Page, name: string) => page.locator(`.square[aria-label^="${name},"]`);

/** Seats both players and returns them ordered as [white, black]. */
export async function startGame(a: Page, b: Page): Promise<[Page, Page]> {
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
  page.once('dialog', (dialog) => void dialog.accept());
  await page.click('#resign');
  await expect(page.locator('#board')).toHaveAttribute('data-status', 'finished');
}

/** The name a page joined with. */
export async function nameOf(page: Page): Promise<string> {
  const text = (await page.locator('#my-name').textContent()) ?? '';
  return text.replace('내 이름: ', '');
}

/**
 * Resigns a game left running by a failed test (the server has a single
 * table) and closes all contexts opened by join().
 */
export async function cleanUp(): Promise<void> {
  for (const page of openPages.splice(0)) {
    if (await page.locator('#resign').isVisible()) {
      page.once('dialog', (dialog) => void dialog.accept());
      await page.click('#resign');
    }
    if (await page.locator('#seat-leave').isVisible()) await page.click('#seat-leave');
    await page.context().close();
  }
}
