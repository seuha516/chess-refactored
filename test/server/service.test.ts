import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_CONTROL } from '../../src/shared/clock.ts';
import {
  DISCONNECT_FORFEIT_MS,
  type LobbySnapshot,
  type RoomSnapshot,
} from '../../src/shared/protocol.ts';
import * as logic from '../../src/server/logic.ts';
import { HEARTBEAT_MS, PRESENCE_TTL_MS, type SessionRecord } from '../../src/server/model.ts';
import { ChessService } from '../../src/server/service.ts';
import { MemoryStore } from '../../src/server/store.ts';

let store: MemoryStore;
let service: ChessService;
let rooms: Map<string, RoomSnapshot[]>;
let lobbies: LobbySnapshot[];

beforeEach(() => {
  vi.useFakeTimers();
  store = new MemoryStore();
  rooms = new Map();
  lobbies = [];
  service = new ChessService(
    store,
    {
      room: (roomId, snapshot) => {
        rooms.set(roomId, [...(rooms.get(roomId) ?? []), snapshot]);
      },
      lobby: (snapshot) => lobbies.push(snapshot),
    },
    { random: () => 0.25 },
  );
});

afterEach(() => {
  service.dispose();
  vi.useRealTimers();
});

const last = (roomId: string) => rooms.get(roomId)?.at(-1);

async function player(name: string, connectionId = `${name}-socket`): Promise<SessionRecord> {
  const session = await service.connect({ name });
  service.attach(connectionId, session);
  return session;
}

async function createAndJoin(owner: SessionRecord, connectionId: string): Promise<string> {
  const created = await service.createRoom(owner, 'Test');
  if (!created.ok) throw new Error(created.error);
  expect(await service.join(connectionId, created.roomId)).toEqual({ ok: true });
  return created.roomId;
}

/** Alice (white) and Bob in a new room with a game started. */
async function startedRoom() {
  const alice = await player('Alice');
  const bob = await player('Bob');
  const roomId = await createAndJoin(alice, 'Alice-socket');
  await service.join('Bob-socket', roomId);
  await service.act('Alice-socket', logic.takeSeat);
  await service.act('Bob-socket', logic.takeSeat);
  return { alice, bob, roomId };
}

describe('sessions', () => {
  it('creates sessions and resumes them by token', async () => {
    const created = await service.connect({ name: 'Alice' });
    expect(created).toMatchObject({ name: 'Alice' });
    expect(await service.connect({ token: created.token, name: 'ignored' })).toEqual(created);
    expect((await service.connect({})).name).toMatch(/^익명\d{4}$/);
  });

  it('renames a session', async () => {
    const alice = await player('Alice');
    const renamed = await service.rename(alice, 'Alicia');
    expect(await service.connect({ token: alice.token })).toEqual(renamed);
  });
});

describe('lobby and rooms', () => {
  it('creates rooms, lists them newest first and announces changes to the lobby', async () => {
    const alice = await player('Alice');
    await service.createRoom(alice, null);
    vi.advanceTimersByTime(1000);
    await service.createRoom(alice, 'Second');
    const lobby = await service.lobby();
    expect(lobby.rooms.map((room) => room.name)).toEqual(['Second', 'Alice님의 방']);
    expect(lobbies.at(-1)).toEqual(lobby);
  });

  it('enforces the room limit', async () => {
    const small = new ChessService(
      store,
      { room: () => undefined, lobby: () => undefined },
      { maxRooms: 1 },
    );
    const alice = await player('Alice');
    expect((await small.createRoom(alice, null)).ok).toBe(true);
    expect(await small.createRoom(alice, null)).toEqual({ ok: false, error: 'room-limit' });
    small.dispose();
  });

  it('rejects joining an unknown room and actions outside a room', async () => {
    await player('Alice');
    expect(await service.join('Alice-socket', 'nope')).toEqual({ ok: false, error: 'no-room' });
    expect(await service.act('Alice-socket', logic.takeSeat)).toEqual({
      ok: false,
      error: 'not-in-room',
    });
  });

  it('keeps rooms separate', async () => {
    const alice = await player('Alice');
    const carol = await player('Carol');
    const first = await createAndJoin(alice, 'Alice-socket');
    const second = await createAndJoin(carol, 'Carol-socket');
    await service.act('Alice-socket', logic.takeSeat);
    expect(last(first)?.seats.map((seat) => seat.name)).toEqual(['Alice']);
    expect(last(second)?.seats).toEqual([]);
  });

  it('tracks who is in a room and announces newcomers once', async () => {
    const alice = await player('Alice');
    await player('Bob');
    const roomId = await createAndJoin(alice, 'Alice-socket');
    await service.join('Bob-socket', roomId);
    expect(last(roomId)?.online).toBe(2);
    expect(last(roomId)?.chat.map((message) => message.text)).toEqual([
      'Alice님이 입장하였습니다.',
      'Bob님이 입장하였습니다.',
    ]);
    await service.leave('Bob-socket');
    expect(last(roomId)?.online).toBe(1);
    // Reconnecting shortly after (e.g. the 5-minute function limit) is silent.
    await service.join('Bob-socket', roomId);
    expect(last(roomId)?.chat).toHaveLength(2);
  });

  it('removes idle empty rooms without a game', async () => {
    const alice = await player('Alice');
    await createAndJoin(alice, 'Alice-socket');
    await service.leave('Alice-socket');
    vi.advanceTimersByTime(11 * 60_000);
    expect((await service.lobby()).rooms).toEqual([]);
  });
});

describe('games through the service', () => {
  it('applies actions and reports errors from the rules', async () => {
    const { roomId } = await startedRoom();
    expect(last(roomId)?.game?.status).toBe('playing');
    expect(await service.act('Bob-socket', logic.resign)).toEqual({ ok: true });
    expect(last(roomId)?.game?.outcome).toEqual({ winner: 'w', reason: 'resignation' });
    expect(await service.act('Bob-socket', logic.resign)).toEqual({ ok: false, error: 'no-game' });
  });

  it('ends the game on time through a local timer', async () => {
    const { roomId } = await startedRoom();
    await vi.advanceTimersByTimeAsync(TIME_CONTROL.initialMs + TIME_CONTROL.incrementMs + 10);
    expect(last(roomId)?.game?.outcome).toEqual({ winner: 'b', reason: 'timeout' });
  });

  it('ends the game on time when a client asks for a sync, even without a timer', async () => {
    const { roomId } = await startedRoom();
    service.dispose(); // simulate another instance: no local timers here
    vi.setSystemTime(Date.now() + TIME_CONTROL.initialMs + TIME_CONTROL.incrementMs);
    // Both players are still connected (another instance keeps their presence fresh),
    // so only the clock decides.
    const presence = await store.getPresence(roomId);
    for (const [id, connection] of Object.entries(presence.connections)) {
      await store.touchPresence(roomId, id, connection.playerId, Date.now());
    }
    await service.sync(roomId);
    expect(last(roomId)?.game?.outcome).toEqual({ winner: 'b', reason: 'timeout' });
  });

  it('keeps players present with heartbeats while they are connected', async () => {
    const { roomId } = await startedRoom();
    await vi.advanceTimersByTimeAsync(PRESENCE_TTL_MS * 3);
    await service.sync(roomId);
    expect(last(roomId)?.game?.status).toBe('playing');
    expect(last(roomId)?.online).toBe(2);
    expect(HEARTBEAT_MS).toBeLessThan(PRESENCE_TTL_MS);
  });

  it('forfeits a player who stays away for 60 seconds (Online Regulations 11.4.2)', async () => {
    const { roomId } = await startedRoom();
    await service.detach('Bob-socket');
    expect(last(roomId)?.game?.black).toMatchObject({ connected: false });
    await vi.advanceTimersByTimeAsync(DISCONNECT_FORFEIT_MS + 10);
    expect(last(roomId)?.game?.outcome).toEqual({ winner: 'w', reason: 'disconnection' });
  });

  it('lets a player come back within 60 seconds and keep playing', async () => {
    const { roomId, bob } = await startedRoom();
    await service.detach('Bob-socket');
    await vi.advanceTimersByTimeAsync(30_000);
    service.attach('Bob-socket-2', bob);
    await service.join('Bob-socket-2', roomId);
    await vi.advanceTimersByTimeAsync(DISCONNECT_FORFEIT_MS);
    expect(last(roomId)?.game?.status).toBe('playing');
    expect(last(roomId)?.game?.black).toMatchObject({ connected: true });
  });
});
