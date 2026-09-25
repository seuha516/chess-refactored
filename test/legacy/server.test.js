// Characterization tests for the original server (app.js). The server is
// started as a child process and driven with real Socket.IO clients.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { io } from 'socket.io-client';

const root = fileURLToPath(new URL('../../', import.meta.url));
const port = 39000 + Math.floor(Math.random() * 1000);
const url = `http://localhost:${port}`;
let server;
const clients = [];

beforeAll(async () => {
  server = spawn(process.execPath, ['app.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    server.stdout.on('data', (chunk) => {
      if (String(chunk).includes('started')) resolve();
    });
    server.on('exit', (code) => reject(new Error(`server exited with ${code}`)));
  });
});

afterEach(() => {
  while (clients.length) clients.pop().disconnect();
});

afterAll(() => {
  server.kill();
});

function once(socket, event) {
  return new Promise((resolve) => socket.once(event, resolve));
}

async function connect(name) {
  const socket = io(url, { transports: ['websocket'], forceNew: true });
  clients.push(socket);
  await once(socket, 'connect');
  if (name) {
    const joined = once(socket, 'update');
    socket.emit('newUser', name);
    await joined;
  }
  return socket;
}

/** Seats two players and starts a game the way the original client does. */
async function startGame() {
  const p1 = await connect('p1');
  const p2 = await connect('p2');
  p1.emit('readybutton', {});
  await once(p1, 'checkgame');
  const bothSeated = once(p1, 'checkgame');
  p2.emit('readybutton', {});
  await bothSeated;
  const started = once(p2, 'gamestart');
  p1.emit('gamestart', {});
  await started;
  return { p1, p2 };
}

/** Ends a running game through the (trusted) gameend event. */
async function endGame({ p1, p2 }) {
  const ended = once(p2, 'gameend');
  p1.emit('gameend', { 승자: 0, 정산결과: '106' });
  await ended;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

describe('legacy server trusts clients', () => {
  it('LEGACY BUG: a player can end the game at once and pick any winner and reason', async () => {
    const { p1, p2 } = await startGame();
    const ended = once(p2, 'gameend');
    p1.emit('gameend', { 승자: '하양', 정산결과: '101' }); // "checkmate", no move played
    expect(await ended).toEqual({ type: 'gameend', 승자: '하양', 정산결과: '101' });
  });

  it('LEGACY BUG: arbitrary move coordinates are relayed without validation', async () => {
    const game = await startGame();
    const relayed = once(game.p2, 'movefinish');
    game.p1.emit('movefinish', { nx: 7, ny: 4, tx: 0, ty: 4, 특수이동: 0, 상대색깔: '검정' }); // Ke1-e8
    expect(await relayed).toMatchObject({ nx: 7, ny: 4, tx: 0, ty: 4 });
    await endGame(game);
  });

  it('LEGACY BUG: chat payload fields are forwarded verbatim, so a client can spoof system notices and counters', async () => {
    const attacker = await connect('mallory');
    const victim = await connect('victim');
    const received = once(victim, 'update');
    attacker.emit('message', { type: 'connect', message: 'fake join', people: 999, 참가인원: 2 });
    expect(await received).toEqual({
      type: 'connect',
      message: 'fake join',
      people: 999,
      참가인원: 2,
      name: 'mallory',
    });
  });

  it('LEGACY BUG: a socket that never registered a name can still chat', async () => {
    const anonymous = await connect();
    const victim = await connect('victim');
    const received = once(victim, 'update');
    anonymous.emit('message', { type: 'message', message: 'hi' });
    expect(await received).toEqual({ type: 'message', message: 'hi' });
  });
});

describe('legacy server lifecycle', () => {
  it('LEGACY BUG: if both players leave mid-game the server is stuck "in game" and the seats are never freed', async () => {
    const spectator = await connect('spectator');
    const { p1, p2 } = await startGame();
    p1.disconnect();
    p2.disconnect();
    await settle();

    const newcomer = await connect();
    const status = once(newcomer, 'isitstart');
    newcomer.emit('isitstart', {});
    // 게임중 === 1 makes the original client alert "이미 게임이 진행중입니다"
    // and disconnect itself, so nobody can play until everyone leaves.
    expect(await status).toMatchObject({ 게임중: 1 });
    expect(spectator.connected).toBe(true);

    // Once everybody has left, 게임중 is reset but the seats are not: the two
    // departed players still occupy p1/p2, so nobody can ever sit down again
    // until the process restarts.
    newcomer.disconnect();
    spectator.disconnect();
    await settle();
    const a = await connect('a');
    const seats = once(a, 'checkgame');
    a.emit('readybutton', {});
    expect(await seats).toMatchObject({ p1: 'p1', p2: 'p2', 참가인원: 2 });
  });
});
