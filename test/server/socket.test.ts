// Integration tests: a real HTTP + Socket.IO server on an ephemeral port,
// driven by socket.io-client — the same stack the browser uses.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io as connectClient, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createChessServer,
  type ChessServer,
  type ChessServerOptions,
} from '../../src/server/app.ts';
import {
  SOCKET_PATH,
  type AckResult,
  type ClientToServerEvents,
  type CreateRoomResult,
  type LobbySnapshot,
  type RoomSnapshot,
  type ServerToClientEvents,
  type SessionInfo,
} from '../../src/shared/protocol.ts';

const socketOptions = { path: SOCKET_PATH, addTrailingSlash: false, transports: ['websocket'] };

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let server: ChessServer;
let url: string;
const clients: Client[] = [];

async function start(options: ChessServerOptions = {}) {
  server = createChessServer({ ...options, service: { random: () => 0.25, ...options.service } });
  const address = await server.listen(0, '127.0.0.1');
  url = `http://127.0.0.1:${String(address.port)}`;
}

beforeEach(async () => {
  await start();
});

afterEach(async () => {
  while (clients.length) clients.pop()?.disconnect();
  await server.close();
});

interface Connected {
  socket: Client;
  session: SessionInfo;
  rooms: RoomSnapshot[];
  lobbies: LobbySnapshot[];
}

async function connect(auth: { token?: string; name?: string } = {}): Promise<Connected> {
  const socket: Client = connectClient(url, { ...socketOptions, auth, forceNew: true });
  clients.push(socket);
  const connected: Connected = { socket, session: undefined as never, rooms: [], lobbies: [] };
  socket.on('room', (snapshot) => connected.rooms.push(snapshot));
  socket.on('lobby', (lobby) => connected.lobbies.push(lobby));
  connected.session = await new Promise<SessionInfo>((resolve) => socket.once('session', resolve));
  return connected;
}

/** Emits an event and resolves with its acknowledgement. */
function request<T = AckResult>(socket: Client, event: string, ...args: unknown[]): Promise<T> {
  return new Promise((resolve) => {
    (socket.emit as (event: string, ...rest: unknown[]) => void)(event, ...args, resolve);
  });
}

/** Resolves with the first (already received or future) snapshot matching `check`. */
async function waitForRoom(
  client: Connected,
  check: (room: RoomSnapshot) => boolean,
): Promise<RoomSnapshot> {
  for (let i = 0; i < 100; i++) {
    const found = client.rooms.findLast(check);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('expected room snapshot did not arrive');
}

async function createRoom(client: Connected, name = 'Test'): Promise<string> {
  const result = await request<CreateRoomResult>(client.socket, 'room:create', name);
  if (!result.ok) throw new Error(result.error);
  return result.roomId;
}

async function joinRoom(client: Connected, roomId: string): Promise<void> {
  expect(await request(client.socket, 'room:join', roomId)).toEqual({ ok: true });
}

async function startGame() {
  const white = await connect({ name: 'white' });
  const black = await connect({ name: 'black' });
  const roomId = await createRoom(white);
  await joinRoom(white, roomId);
  await joinRoom(black, roomId);
  expect(await request(white.socket, 'seat:take')).toEqual({ ok: true });
  expect(await request(black.socket, 'seat:take')).toEqual({ ok: true });
  await waitForRoom(white, (room) => room.game?.status === 'playing');
  return { white, black, roomId };
}

describe('connection and session', () => {
  it('sends a session on connect and resumes it with the token', async () => {
    const first = await connect({ name: 'alice' });
    expect(first.session.name).toBe('alice');
    expect(first.session.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    first.socket.disconnect();
    const again = await connect({ token: first.session.token, name: 'ignored' });
    expect(again.session).toEqual(first.session);
  });

  it('never reveals session tokens in broadcasts', async () => {
    const { white, black } = await startGame();
    const snapshot = await waitForRoom(black, (room) => room.game !== null);
    expect(JSON.stringify(snapshot)).not.toContain(white.session.token);
    expect(JSON.stringify(snapshot)).toContain(white.session.playerId);
  });
});

describe('lobby and rooms', () => {
  it('lists rooms in the lobby and updates it when rooms change', async () => {
    const watcher = await connect({ name: 'watcher' });
    expect(await request(watcher.socket, 'lobby:enter')).toEqual({ ok: true });
    expect(watcher.lobbies.at(-1)).toEqual({ rooms: [] });
    const host = await connect({ name: 'host' });
    const roomId = await createRoom(host, 'Friday game');
    await joinRoom(host, roomId);
    await request(host.socket, 'seat:take');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(watcher.lobbies.at(-1)?.rooms).toEqual([
      expect.objectContaining({
        id: roomId,
        name: 'Friday game',
        status: 'waiting',
        players: ['host'],
      }),
    ]);
  });

  it('keeps rooms isolated from each other', async () => {
    const { white } = await startGame();
    const other = await connect({ name: 'other' });
    const otherRoom = await createRoom(other);
    await joinRoom(other, otherRoom);
    const before = other.rooms.length;
    expect(await request(white.socket, 'game:move', { from: 'e2', to: 'e4', ply: 0 })).toEqual({
      ok: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(other.rooms.slice(before).every((room) => room.id === otherRoom)).toBe(true);
    expect(await request(other.socket, 'game:move', { from: 'e7', to: 'e5', ply: 1 })).toEqual({
      ok: false,
      error: 'no-game',
    });
  });

  it('rejects unknown rooms, bad room ids and actions outside a room', async () => {
    const alice = await connect({ name: 'alice' });
    expect(await request(alice.socket, 'room:join', 'doesnotexist')).toEqual({
      ok: false,
      error: 'no-room',
    });
    expect(await request(alice.socket, 'room:join', '../../etc')).toEqual({
      ok: false,
      error: 'invalid-payload',
    });
    expect(await request(alice.socket, 'seat:take')).toEqual({ ok: false, error: 'not-in-room' });
  });

  it('lets a late joiner watch the game in progress', async () => {
    const { white, roomId } = await startGame();
    await request(white.socket, 'game:move', { from: 'e2', to: 'e4', ply: 0 });
    const late = await connect({ name: 'late' });
    await joinRoom(late, roomId);
    const snapshot = await waitForRoom(late, (room) => room.game?.moves.length === 1);
    expect(snapshot.game).toMatchObject({ status: 'playing', moves: [{ san: 'e4' }] });
  });
});

describe('playing through sockets', () => {
  it('validates and applies moves on the server', async () => {
    const { white, black } = await startGame();
    expect(await request(white.socket, 'game:move', { from: 'e2', to: 'e4', ply: 0 })).toEqual({
      ok: true,
    });
    const afterMove = await waitForRoom(black, (room) => room.game?.moves.length === 1);
    expect(afterMove.game?.moves.map((m) => m.san)).toEqual(['e4']);
    expect(await request(white.socket, 'game:move', { from: 'd2', to: 'd4', ply: 1 })).toEqual({
      ok: false,
      error: 'not-your-turn',
    });
    expect(await request(black.socket, 'game:move', { from: 'e8', to: 'e1', ply: 1 })).toEqual({
      ok: false,
      error: 'illegal-move',
    });
  });

  it('rejects malformed payloads', async () => {
    const { white } = await startGame();
    for (const payload of [
      null,
      'e2e4',
      { from: 'e2', to: 'e4' },
      { nx: 6, ny: 4, tx: 4, ty: 4 },
    ]) {
      expect(await request(white.socket, 'game:move', payload)).toEqual({
        ok: false,
        error: 'invalid-payload',
      });
    }
    expect(await request(white.socket, 'chat:send', { type: 'connect', message: 'x' })).toEqual({
      ok: false,
      error: 'invalid-payload',
    });
  });

  it('legacy: the old trusted events have no effect', async () => {
    const { white, black } = await startGame();
    const raw = white.socket as unknown as { emit: (event: string, data: unknown) => void };
    raw.emit('gameend', { 승자: '하양', 정산결과: '101' });
    raw.emit('movefinish', { nx: 7, ny: 4, tx: 0, ty: 4 });
    expect(await request(white.socket, 'game:move', { from: 'e2', to: 'e4', ply: 0 })).toEqual({
      ok: true,
    });
    expect((await waitForRoom(black, (room) => room.game?.moves.length === 1)).game?.status).toBe(
      'playing',
    );
  });

  it('works without an acknowledgement callback', async () => {
    const { white, black } = await startGame();
    white.socket.emit('game:move', { from: 'e2', to: 'e4', ply: 0 }, undefined as never);
    expect(
      (await waitForRoom(black, (room) => room.game?.moves.length === 1)).game?.moves,
    ).toHaveLength(1);
  });

  it('broadcasts a finished game and chat in the room snapshot', async () => {
    const { white, black } = await startGame();
    expect(await request(black.socket, 'chat:send', '<b>hi</b>')).toEqual({ ok: true });
    await request(white.socket, 'game:resign');
    const finished = await waitForRoom(black, (room) => room.game?.status === 'finished');
    expect(finished.game?.outcome).toEqual({ winner: 'b', reason: 'resignation' });
    expect(finished.chat.map((message) => message.text)).toContain('<b>hi</b>');
  });
});

describe('몽돌이 (mascot) pulls', () => {
  it('passes a pull on to the rest of the room, marked with the puller, and nowhere else', async () => {
    const { white, black, roomId } = await startGame();
    const watcher = await connect({ name: 'watcher' });
    await joinRoom(watcher, roomId);
    const outsider = await connect({ name: 'outsider' });
    await joinRoom(outsider, await createRoom(outsider));
    const seen: { black: unknown[]; watcher: unknown[]; white: unknown[]; outsider: unknown[] } = {
      black: [],
      watcher: [],
      white: [],
      outsider: [],
    };
    black.socket.on('mascot', (tug) => seen.black.push(tug));
    watcher.socket.on('mascot', (tug) => seen.watcher.push(tug));
    white.socket.on('mascot', (tug) => seen.white.push(tug));
    outsider.socket.on('mascot', (tug) => seen.outsider.push(tug));

    const tug = { grab: [0.1, 0.5, 0.2], pull: [0.3, 0.4, -0.2], release: true };
    expect(await request(white.socket, 'mascot:tug', tug)).toEqual({ ok: true });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const expected = { ...tug, playerId: white.session.playerId };
    expect(seen.black).toEqual([expected]);
    expect(seen.watcher).toEqual([expected]);
    expect(seen.white).toEqual([]);
    expect(seen.outsider).toEqual([]);
  });

  it('refuses malformed pulls and pulls from outside a room', async () => {
    const { white } = await startGame();
    const bad = [
      null,
      { grab: [0, 0], pull: [0, 0, 0], release: false },
      { grab: [0, 0, 5], pull: [0, 0, 0], release: false },
      { grab: [0, 0, 0], pull: [0, Number.NaN, 0], release: false },
      { grab: [0, 0, 0], pull: [0, 0, 0], release: 'yes' },
    ];
    for (const payload of bad) {
      expect(await request(white.socket, 'mascot:tug', payload)).toEqual({
        ok: false,
        error: 'invalid-payload',
      });
    }
    const lonely = await connect({ name: 'lonely' });
    const tug = { grab: [0, 0.4, 0], pull: [0.2, 0, 0], release: false };
    expect(await request(lonely.socket, 'mascot:tug', tug)).toEqual({
      ok: false,
      error: 'not-in-room',
    });
    // Its own limit: a dozen a second is plenty for eight updates while pulling.
    const answers = await Promise.all(
      Array.from({ length: 14 }, () => request(white.socket, 'mascot:tug', tug)),
    );
    expect(answers).toContainEqual({ ok: false, error: 'rate-limited' });
  });
});

describe('abuse protection', () => {
  it('rate-limits event floods per socket', async () => {
    await server.close();
    await start({ eventsPerSecond: 5 });
    const alice = await connect({ name: 'alice' });
    const results = await Promise.all(
      Array.from({ length: 8 }, () => request(alice.socket, 'seat:leave')),
    );
    expect(results.filter((r) => !r.ok && r.error === 'rate-limited')).toHaveLength(3);
  });

  it('rate-limits room creation per player', async () => {
    const alice = await connect({ name: 'alice' });
    const results = await Promise.all(
      Array.from({ length: 4 }, () => request<CreateRoomResult>(alice.socket, 'room:create', '')),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(results.at(-1)).toEqual({ ok: false, error: 'rate-limited' });
  });

  it('disconnects clients that send oversized messages', async () => {
    const alice = await connect({ name: 'alice' });
    const closed = new Promise((resolve) => alice.socket.once('disconnect', resolve));
    alice.socket.emit('chat:send', 'x'.repeat(64 * 1024), () => undefined);
    expect(await closed).toBe('transport close');
  });

  it('refuses too many new connections from one address', async () => {
    await server.close();
    await start({ connectionsPerMinute: 2 });
    await connect({ name: 'a' });
    await connect({ name: 'b' });
    const socket: Client = connectClient(url, { ...socketOptions, forceNew: true });
    clients.push(socket);
    const error = await new Promise<Error>((resolve) => socket.once('connect_error', resolve));
    expect(error.message).toBe('rate-limited');
  });
});

describe('HTTP', () => {
  it('serves the static client with security headers', async () => {
    await server.close();
    const dir = mkdtempSync(join(tmpdir(), 'chess-static-'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>t</title>');
    await start({ staticDir: dir });
    const response = await fetch(`${url}/`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-powered-by')).toBeNull();
  });

  it('does not grant cross-origin access to the Socket.IO endpoint', async () => {
    const response = await fetch(`${url}${SOCKET_PATH}?EIO=4&transport=polling`, {
      headers: { Origin: 'https://evil.example' },
    });
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });
});
