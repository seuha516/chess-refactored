import type { Redis } from 'ioredis';
import type { Presence, RoomRecord, SessionRecord } from './model.ts';
import { PRESENCE_RETENTION_MS, type RoomUpdate, type Store, type UpdatedRoom } from './store.ts';

const SESSION_TTL_S = 30 * 24 * 3600;
/** Rooms nobody touched for a day expire even if the lobby never cleaned them up. */
const ROOM_TTL_S = 24 * 3600;
const MAX_UPDATE_ATTEMPTS = 20;

// Adds a room unless the limit is reached. KEYS: room set, room hash.
// ARGV: id, data, limit, ttl.
const CREATE_ROOM = `
if redis.call('SCARD', KEYS[1]) >= tonumber(ARGV[3]) then return 0 end
redis.call('SADD', KEYS[1], ARGV[1])
redis.call('HSET', KEYS[2], 'v', '1', 'data', ARGV[2])
redis.call('EXPIRE', KEYS[2], ARGV[4])
return 1`;

// Compare-and-set on the room version. KEYS: room hash.
// ARGV: expected version, new version, data, ttl.
const UPDATE_ROOM = `
if redis.call('HGET', KEYS[1], 'v') ~= ARGV[1] then return 0 end
redis.call('HSET', KEYS[1], 'v', ARGV[2], 'data', ARGV[3])
redis.call('EXPIRE', KEYS[1], ARGV[4])
return 1`;

/**
 * Store shared by all server instances (Vercel functions) through Redis.
 * Rooms are hashes { v: version, data: JSON }; updates use a version check
 * in a Lua script, so concurrent writers never overwrite each other.
 */
export class RedisStore implements Store {
  readonly #redis: Redis;
  readonly #prefix: string;

  constructor(redis: Redis, prefix = 'chess:') {
    this.#redis = redis;
    this.#prefix = prefix;
  }

  #key(...parts: string[]): string {
    return this.#prefix + parts.join(':');
  }

  async getSession(token: string): Promise<SessionRecord | null> {
    const json = await this.#redis.get(this.#key('session', token));
    return json ? (JSON.parse(json) as SessionRecord) : null;
  }

  async putSession(session: SessionRecord): Promise<void> {
    await this.#redis.set(
      this.#key('session', session.token),
      JSON.stringify(session),
      'EX',
      SESSION_TTL_S,
    );
  }

  async listRooms(): Promise<RoomRecord[]> {
    const ids = await this.#redis.smembers(this.#key('rooms'));
    if (ids.length === 0) return [];
    const pipeline = this.#redis.pipeline();
    for (const id of ids) pipeline.hget(this.#key('room', id), 'data');
    const results = (await pipeline.exec()) ?? [];
    const rooms: RoomRecord[] = [];
    const expired: string[] = [];
    results.forEach(([error, data], index) => {
      const id = ids[index];
      if (error || typeof data !== 'string') {
        if (id !== undefined) expired.push(id);
        return;
      }
      rooms.push(JSON.parse(data) as RoomRecord);
    });
    if (expired.length) await this.#redis.srem(this.#key('rooms'), ...expired);
    return rooms;
  }

  async getRoom(id: string): Promise<RoomRecord | null> {
    const data = await this.#redis.hget(this.#key('room', id), 'data');
    return data ? (JSON.parse(data) as RoomRecord) : null;
  }

  async createRoom(room: RoomRecord, limit: number): Promise<boolean> {
    const created = await this.#redis.eval(
      CREATE_ROOM,
      2,
      this.#key('rooms'),
      this.#key('room', room.id),
      room.id,
      JSON.stringify(room),
      String(limit),
      String(ROOM_TTL_S),
    );
    return created === 1;
  }

  async updateRoom<T>(
    id: string,
    update: (room: RoomRecord) => RoomUpdate<T>,
  ): Promise<UpdatedRoom<T> | null> {
    const key = this.#key('room', id);
    for (let attempt = 0; attempt < MAX_UPDATE_ATTEMPTS; attempt++) {
      const [version, data] = await this.#redis.hmget(key, 'v', 'data');
      if (!version || !data) return null;
      const before = JSON.parse(data) as RoomRecord;
      const { room, result } = update(before);
      if (!room) return { room: before, before, changed: false, result };
      const written = await this.#redis.eval(
        UPDATE_ROOM,
        1,
        key,
        version,
        String(Number(version) + 1),
        JSON.stringify(room),
        String(ROOM_TTL_S),
      );
      if (written === 1) return { room, before, changed: true, result };
      // Another instance changed the room meanwhile: recompute on the new state.
    }
    throw new Error(`room ${id}: too many concurrent updates`);
  }

  async deleteRoom(id: string): Promise<void> {
    await this.#redis
      .multi()
      .del(this.#key('room', id), this.#key('presence', id))
      .srem(this.#key('rooms'), id)
      .exec();
  }

  async getPresence(roomId: string): Promise<Presence> {
    const fields = await this.#redis.hgetall(this.#key('presence', roomId));
    const connections: Record<string, { playerId: string; seenAt: number }> = {};
    const leftAt: Record<string, number> = {};
    for (const [field, value] of Object.entries(fields)) {
      if (field.startsWith('c:')) {
        connections[field.slice(2)] = JSON.parse(value) as { playerId: string; seenAt: number };
      } else if (field.startsWith('l:')) {
        leftAt[field.slice(2)] = Number(value);
      }
    }
    return { connections, leftAt };
  }

  async touchPresence(
    roomId: string,
    connectionId: string,
    playerId: string,
    now: number,
  ): Promise<void> {
    const key = this.#key('presence', roomId);
    await this.#redis
      .multi()
      .hset(key, `c:${connectionId}`, JSON.stringify({ playerId, seenAt: now }))
      .expire(key, ROOM_TTL_S)
      .exec();
  }

  async removePresence(
    roomId: string,
    connectionId: string,
    playerId: string,
    now: number,
  ): Promise<void> {
    const key = this.#key('presence', roomId);
    await this.#redis.hdel(key, `c:${connectionId}`);
    const presence = await this.getPresence(roomId);
    const stale = [
      ...Object.entries(presence.connections)
        .filter(([, connection]) => now - connection.seenAt >= PRESENCE_RETENTION_MS)
        .map(([id]) => `c:${id}`),
      ...Object.entries(presence.leftAt)
        .filter(([, at]) => now - at >= PRESENCE_RETENTION_MS)
        .map(([id]) => `l:${id}`),
    ];
    const stillHere = Object.values(presence.connections).some(
      (connection) => connection.playerId === playerId,
    );
    const multi = this.#redis.multi();
    if (stale.length) multi.hdel(key, ...stale);
    if (!stillHere) multi.hset(key, `l:${playerId}`, String(now));
    await multi.exec();
  }

  async close(): Promise<void> {
    await this.#redis.quit();
  }
}
