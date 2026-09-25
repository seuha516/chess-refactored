// Integration tests: a real HTTP + Socket.IO server on an ephemeral port,
// driven by socket.io-client — the same stack the browser uses.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io as connectClient, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createChessServer, type ChessServer } from '../../src/server/app.ts';
import type {
  AckResult,
  ChatMessage,
  ClientToServerEvents,
  RoomSnapshot,
  ServerToClientEvents,
  SessionInfo,
} from '../../src/shared/protocol.ts';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let server: ChessServer;
let url: string;
const clients: Client[] = [];

async function start(options: Parameters<typeof createChessServer>[0] = {}) {
  server = createChessServer({ ...options, room: { random: () => 0.25, ...options.room } });
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
  /** Latest room snapshot received. */
  room: () => RoomSnapshot;
  chat: ChatMessage[];
}

async function connect(auth: { token?: string; name?: string } = {}): Promise<Connected> {
  const socket: Client = connectClient(url, { auth, transports: ['websocket'], forceNew: true });
  clients.push(socket);
  let latest: RoomSnapshot | null = null;
  const chat: ChatMessage[] = [];
  socket.on('chat', (message) => chat.push(message));
  socket.on('chat:history', (messages) => chat.push(...messages));
  // The server sends session and room in one burst; listen before awaiting.
  const ready = new Promise<void>((resolve) => {
    socket.on('room', (snapshot) => {
      latest = snapshot;
      resolve();
    });
  });
  const session = await new Promise<SessionInfo>((resolve) => socket.once('session', resolve));
  await ready;
  return {
    socket,
    session,
    room: () => {
      if (!latest) throw new Error('no snapshot yet');
      return latest;
    },
    chat,
  };
}

/** Emits an event and resolves with its acknowledgement. */
function request(socket: Client, event: string, ...args: unknown[]): Promise<AckResult> {
  return new Promise((resolve) => {
    (socket.emit as (event: string, ...rest: unknown[]) => void)(event, ...args, resolve);
  });
}

const nextRoom = (client: Connected) =>
  new Promise<RoomSnapshot>((resolve) => client.socket.once('room', resolve));

async function startGame() {
  const white = await connect({ name: 'white' });
  const black = await connect({ name: 'black' });
  expect(await request(white.socket, 'seat:take')).toEqual({ ok: true });
  const started = nextRoom(white);
  expect(await request(black.socket, 'seat:take')).toEqual({ ok: true });
  expect((await started).game?.status).toBe('playing');
  return { white, black };
}

describe('connection and session', () => {
  it('sends a session, the chat history and a snapshot on connect', async () => {
    const alice = await connect({ name: 'alice' });
    expect(alice.session.name).toBe('alice');
    expect(alice.session.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(alice.room().online).toBe(1);
    expect(alice.chat.map((m) => m.text)).toEqual(['alice님이 접속하였습니다.']);
  });

  it('resumes the same player when reconnecting with the token', async () => {
    const first = await connect({ name: 'alice' });
    first.socket.disconnect();
    const again = await connect({ token: first.session.token, name: 'ignored' });
    expect(again.session).toEqual(first.session);
  });

  it('never reveals session tokens in broadcasts', async () => {
    const alice = await connect({ name: 'alice' });
    const bob = await connect({ name: 'bob' });
    await request(alice.socket, 'seat:take');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(JSON.stringify(bob.room())).not.toContain(alice.session.token);
    expect(JSON.stringify(bob.room())).toContain(alice.session.playerId);
  });
});

describe('playing through sockets', () => {
  it('validates and applies moves on the server', async () => {
    const { white, black } = await startGame();
    const afterMove = nextRoom(black);
    expect(await request(white.socket, 'game:move', { from: 'e2', to: 'e4', ply: 0 })).toEqual({
      ok: true,
    });
    expect((await afterMove).game?.moves.map((m) => m.san)).toEqual(['e4']);

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
    // The server keeps processing normally afterwards.
    expect(await request(white.socket, 'game:move', { from: 'e2', to: 'e4', ply: 0 })).toEqual({
      ok: true,
    });
    expect(black.room().game?.status).toBe('playing');
  });

  it('works without an acknowledgement callback', async () => {
    const { white, black } = await startGame();
    const afterMove = nextRoom(black);
    white.socket.emit('game:move', { from: 'e2', to: 'e4', ply: 0 }, undefined as never);
    expect((await afterMove).game?.moves).toHaveLength(1);
  });

  it('broadcasts a finished game to spectators', async () => {
    const spectator = await connect({ name: 'spectator' });
    const { white } = await startGame();
    const finished = nextRoom(spectator);
    await request(white.socket, 'game:resign');
    expect((await finished).game).toMatchObject({
      status: 'finished',
      outcome: { winner: 'b', reason: 'resignation' },
    });
  });

  it('lets a late joiner see the game in progress', async () => {
    const { white } = await startGame();
    await request(white.socket, 'game:move', { from: 'e2', to: 'e4', ply: 0 });
    const late = await connect({ name: 'late' });
    expect(late.room().game).toMatchObject({ status: 'playing', moves: [{ san: 'e4' }] });
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

  it('disconnects clients that send oversized messages', async () => {
    const alice = await connect({ name: 'alice' });
    const closed = new Promise((resolve) => alice.socket.once('disconnect', resolve));
    alice.socket.emit('chat:send', 'x'.repeat(64 * 1024), () => undefined);
    expect(await closed).toBe('transport close');
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
    const response = await fetch(`${url}/socket.io/?EIO=4&transport=polling`, {
      headers: { Origin: 'https://evil.example' },
    });
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });
});
