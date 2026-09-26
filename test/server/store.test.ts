// The same contract for every Store implementation: MemoryStore and
// RedisStore (against ioredis-mock, which runs the Lua scripts).
import RedisMock from 'ioredis-mock';
import { afterEach, describe, expect, it } from 'vitest';
import { createRoom } from '../../src/server/logic.ts';
import { RedisStore } from '../../src/server/redis-store.ts';
import { MemoryStore, type Store } from '../../src/server/store.ts';

const T0 = 1_000_000;
const stores: Store[] = [];
let prefixCounter = 0;

afterEach(async () => {
  while (stores.length) await stores.pop()?.close();
});

const implementations: [string, () => Store][] = [
  ['MemoryStore', () => new MemoryStore()],
  ['RedisStore', () => new RedisStore(new RedisMock(), `test${String(prefixCounter++)}:`)],
];

describe.each(implementations)('%s', (_name, make) => {
  const store = () => {
    const created = make();
    stores.push(created);
    return created;
  };

  it('stores and resumes sessions', async () => {
    const s = store();
    expect(await s.getSession('token-1234567890abc')).toBeNull();
    const session = { token: 'token-1234567890abc', id: 'p1', name: 'Alice' };
    await s.putSession(session);
    expect(await s.getSession(session.token)).toEqual(session);
  });

  it('creates, lists, reads and deletes rooms within a limit', async () => {
    const s = store();
    expect(await s.createRoom(createRoom('a', 'A', T0), 2)).toBe(true);
    expect(await s.createRoom(createRoom('b', 'B', T0), 2)).toBe(true);
    expect(await s.createRoom(createRoom('c', 'C', T0), 2)).toBe(false);
    expect((await s.listRooms()).map((room) => room.id).sort()).toEqual(['a', 'b']);
    expect(await s.getRoom('a')).toEqual(createRoom('a', 'A', T0));
    await s.deleteRoom('a');
    expect(await s.getRoom('a')).toBeNull();
    expect((await s.listRooms()).map((room) => room.id)).toEqual(['b']);
  });

  it('updates rooms and reports whether they changed', async () => {
    const s = store();
    await s.createRoom(createRoom('a', 'A', T0), 10);
    const unchanged = await s.updateRoom('a', () => ({ room: null, result: 'kept' }));
    expect(unchanged).toMatchObject({ changed: false, result: 'kept' });
    const changed = await s.updateRoom('a', (room) => ({
      room: { ...room, name: 'Renamed' },
      result: 42,
    }));
    expect(changed).toMatchObject({ changed: true, result: 42, room: { name: 'Renamed' } });
    expect(changed?.before.name).toBe('A');
    expect((await s.getRoom('a'))?.name).toBe('Renamed');
    expect(await s.updateRoom('missing', () => ({ room: null, result: 0 }))).toBeNull();
  });

  it('tracks presence per connection and when a player left', async () => {
    const s = store();
    await s.touchPresence('a', 'c1', 'alice', T0);
    await s.touchPresence('a', 'c2', 'alice', T0 + 1);
    await s.touchPresence('a', 'c3', 'bob', T0 + 2);
    await s.removePresence('a', 'c1', 'alice', T0 + 10);
    let presence = await s.getPresence('a');
    expect(Object.keys(presence.connections).sort()).toEqual(['c2', 'c3']);
    expect(presence.leftAt).toEqual({}); // alice still has c2
    await s.removePresence('a', 'c2', 'alice', T0 + 20);
    presence = await s.getPresence('a');
    expect(presence.leftAt).toEqual({ alice: T0 + 20 });
    expect(presence.connections).toEqual({ c3: { playerId: 'bob', seenAt: T0 + 2 } });
  });
});

describe('RedisStore concurrency', () => {
  it('re-runs an update when another writer changed the room in between', async () => {
    const redis = new RedisMock();
    const s = new RedisStore(redis, 'race:');
    stores.push(s);
    const other = new RedisStore(redis, 'race:');
    await s.createRoom(createRoom('a', 'A', T0), 10);

    let attempts = 0;
    const result = await s.updateRoom('a', (room) => {
      attempts += 1;
      return { room: { ...room, name: `${room.name}+mine` }, result: attempts };
    });
    expect(result?.room.name).toBe('A+mine');

    // Interleave: the first attempt reads, then another instance writes.
    attempts = 0;
    const racing = s.updateRoom('a', (room) => {
      attempts += 1;
      return { room: { ...room, name: `${room.name}+first` }, result: attempts };
    });
    await other.updateRoom('a', (room) => ({
      room: { ...room, name: `${room.name}+other` },
      result: 0,
    }));
    const settled = await racing;
    const final = await s.getRoom('a');
    // Neither change is lost, whatever the interleaving was.
    expect(final?.name).toContain('+other');
    expect(final?.name).toContain('+first');
    expect(settled?.result).toBeGreaterThanOrEqual(1);
  });
});
