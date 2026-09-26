import { expect, test } from '@playwright/test';
import {
  cleanUp,
  enterRoom,
  join,
  move,
  nameOf,
  openRoom,
  playMoves,
  uniqueName,
  resign,
  square,
  startGame,
} from './helpers.ts';

// Colours are assigned randomly, so tests refer to players by colour.
test.afterEach(cleanUp);

test('two players finish a game by checkmate; a spectator follows along', async ({ browser }) => {
  const spectator = await join(browser, 'Watcher');
  const [white, black] = await startGame(
    await join(browser, 'Alice'),
    await join(browser, 'Bob'),
    spectator,
  );

  // Legal targets are shown for the selected piece.
  await square(white, 'e2').click();
  await expect(square(white, 'e4')).toHaveClass(/target/);
  await expect(square(white, 'e5')).not.toHaveClass(/target/);
  await square(white, 'e2').click(); // deselect

  // Scholar's mate.
  await playMoves(white, black, ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4', 'g8f6', 'h5f7']);

  await expect(white.locator('#result-title')).toHaveText('승리');
  await expect(black.locator('#result-title')).toHaveText('패배');
  await expect(spectator.locator('#result-title')).toHaveText('백 승리');
  await expect(white.locator('#result-reason')).toHaveText('체크메이트에 의해');
  await expect(spectator.locator('#moves li')).toHaveText([
    '1. e4 e5',
    '2. Qh5 Nc6',
    '3. Bc4 Nf6',
    '4. Qxf7#',
  ]);
  await expect(square(black, 'e8')).toHaveClass(/check/);
  await expect(white.locator('#captured-black img')).toHaveCount(1);
  await expect(white.locator('#chat-log')).toContainText(
    `체크메이트에 의해 ${await nameOf(white)}의 승리로 경기를 종료합니다.`,
  );
  // The table is free again.
  await expect(white.locator('#seat-take')).toBeVisible();
});

test('moves can be made by dragging, and illegal drops are refused', async ({ browser }) => {
  const [white, black] = await startGame(await join(browser, 'Alice'), await join(browser, 'Bob'));

  async function drag(page: typeof white, from: string, to: string) {
    const start = await square(page, from).boundingBox();
    const end = await square(page, to).boundingBox();
    if (!start || !end) throw new Error('square not visible');
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(start.x + start.width / 2 + 10, start.y + start.height / 2 + 10, {
      steps: 3,
    });
    await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 8 });
    await page.mouse.up();
  }

  await drag(white, 'g1', 'g3'); // not a knight move
  await expect(white.locator('#board')).toHaveAttribute('data-ply', '0');
  await drag(white, 'g1', 'f3');
  await expect(black.locator('#board')).toHaveAttribute('data-ply', '1');
  await expect(square(black, 'f3')).toHaveAttribute('aria-label', /백 나이트/);
  await resign(black);
});

test('promotion asks for the piece; a capturing under-promotion is recorded', async ({
  browser,
}) => {
  const [white, black] = await startGame(await join(browser, 'Alice'), await join(browser, 'Bob'));
  await playMoves(white, black, ['a2a4', 'b7b5', 'a4b5', 'a7a6', 'b5a6', 'c8b7', 'a6b7', 'b8c6']);

  await square(white, 'b7').click();
  await square(white, 'a8').click();
  const dialog = white.locator('#promotion-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '나이트' }).click();
  await expect(black.locator('#board')).toHaveAttribute('data-ply', '9');
  await expect(square(black, 'a8')).toHaveAttribute('aria-label', /백 나이트/);
  await expect(black.locator('#moves li').last()).toHaveText('5. bxa8=N');
  await resign(white);
});

test('a player can reload the page mid-game and keep playing', async ({ browser }) => {
  const [white, black] = await startGame(await join(browser, 'Alice'), await join(browser, 'Bob'));
  await move(white, 'e2e4');

  await black.reload();
  // The saved name and session token are reused: no name prompt, same seat.
  await expect(black.locator('#name-dialog')).toBeHidden();
  await expect(black.locator('#status')).toContainText('당신의 차례');
  await expect(white.locator('#status')).toContainText(`${await nameOf(black)}(흑)의 차례`);
  await move(black, 'e7e5');
  await resign(white);
});

test('the board can be played with the keyboard', async ({ browser }) => {
  const [white, black] = await startGame(await join(browser, 'Alice'), await join(browser, 'Bob'));
  // Focus a1 (the board's tab stop is its first square), walk to d2 and push it to d4.
  await square(white, 'a1').focus();
  await white.keyboard.press('ArrowUp'); // a2
  for (let i = 0; i < 3; i++) await white.keyboard.press('ArrowRight'); // d2
  await expect(square(white, 'd2')).toBeFocused();
  await white.keyboard.press('Enter');
  await expect(square(white, 'd2')).toHaveAttribute('aria-selected', 'true');
  await white.keyboard.press('ArrowUp');
  await white.keyboard.press('ArrowUp'); // d4
  await white.keyboard.press('Space');
  await expect(black.locator('#board')).toHaveAttribute('data-ply', '1');
  await resign(black);
});

test('draw offers can be declined and accepted', async ({ browser }) => {
  const [white, black] = await startGame(await join(browser, 'Alice'), await join(browser, 'Bob'));
  await white.click('#draw-offer');
  // Offering takes a second press, like resigning.
  await expect(white.locator('#confirm-text')).toHaveText('상대에게 무승부를 제안할까요?');
  await white.click('#confirm-yes');
  await expect(white.locator('#draw-offer')).toBeDisabled();
  await black.click('#draw-decline');
  await expect(white.locator('#chat-log')).toContainText('무승부 제안이 거절되었습니다.');

  await move(white, 'e2e4');
  await black.click('#draw-offer');
  await black.click('#confirm-yes');
  await white.click('#draw-accept');
  await expect(black.locator('#result-title')).toHaveText('무승부');
  await expect(black.locator('#result-reason')).toHaveText('무승부 합의에 의해');
});

test('chat shows messages as text, never as HTML', async ({ browser }) => {
  const alice = await join(browser, 'Alice');
  const bob = await join(browser, 'Bob');
  await enterRoom(bob, await openRoom(alice));
  await alice.fill('#chat-input', '<img src=x onerror=alert(1)> 안녕');
  await alice.press('#chat-input', 'Enter');
  const message = bob.locator('#chat-log li.other').last();
  await expect(message).toHaveText('Alice: <img src=x onerror=alert(1)> 안녕');
  await expect(bob.locator('#chat-log img')).toHaveCount(0);
});

test('the layout fits a phone screen without horizontal scrolling', async ({ browser }) => {
  const phone = await join(browser, 'Phone', { width: 375, height: 740 });
  await openRoom(phone);
  const overflow = await phone.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(square(phone, 'h1')).toBeInViewport();
});

test('the lobby lists rooms and players can move between rooms', async ({ browser }) => {
  const alice = await join(browser, 'Alice');
  const carol = await join(browser, 'Carol');
  const roomName = uniqueName('금요 대국');
  const url = await openRoom(alice, roomName);
  await alice.click('#seat-take');

  const entry = carol.locator('.room-item', { hasText: roomName });
  await expect(entry).toContainText('대기 중 (1/2)');
  await expect(entry).toContainText('Alice');
  await entry.click();
  await expect(carol).toHaveURL(url);
  await expect(carol.locator('#room-title')).toHaveText(roomName);
  // Carol is not seated: Alice sits across the table, the free seat faces Carol.
  await expect(carol.locator('#seat-top .seat-name')).toHaveText('Alice');
  await expect(carol.locator('#seat-bottom #seat-take')).toBeVisible();

  await carol.click('#back-to-lobby');
  await expect(carol.locator('#lobby-view')).toBeVisible();
  await carol.goBack();
  await expect(carol.locator('#room-title')).toHaveText(roomName);
  await alice.click('#seat-leave');
});

test('games in different rooms are independent', async ({ browser }) => {
  const [white1, black1] = await startGame(await join(browser, 'A1'), await join(browser, 'B1'));
  const [white2, black2] = await startGame(await join(browser, 'A2'), await join(browser, 'B2'));
  await move(white1, 'e2e4');
  await move(white2, 'd2d4');
  await expect(black1.locator('#moves li')).toHaveText(['1. e4']);
  await expect(black2.locator('#moves li')).toHaveText(['1. d4']);
  await resign(black1);
  await expect(black2.locator('#board')).toHaveAttribute('data-status', 'playing');
  await resign(black2);
});

test('an unknown room link falls back to the lobby', async ({ browser }) => {
  const alice = await join(browser, 'Alice');
  await alice.goto('/?room=doesnotexist');
  await expect(alice.locator('#lobby-view')).toBeVisible();
  await expect(alice.locator('#lobby-status')).toHaveText(
    '방을 찾을 수 없습니다. 이미 닫혔을 수 있습니다.',
  );
});
