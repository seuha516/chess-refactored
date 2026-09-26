import type { Presence, RoomRecord, SessionRecord } from './model.ts';

export interface UpdatedRoom<T> {
  /** The stored room after the update. */
  readonly room: RoomRecord;
  /** The room before the update (from the attempt that was applied). */
  readonly before: RoomRecord;
  readonly changed: boolean;
  readonly result: T;
}

export interface RoomUpdate<T> {
  /** The new room, or null to leave it unchanged. */
  readonly room: RoomRecord | null;
  readonly result: T;
}

/**
 * Persistence for sessions, rooms and presence. MemoryStore keeps everything
 * in this process (development, tests, a single server); RedisStore shares it
 * between server instances (Vercel).
 */
export interface Store {
  getSession(token: string): Promise<SessionRecord | null>;
  putSession(session: SessionRecord): Promise<void>;

  listRooms(): Promise<RoomRecord[]>;
  getRoom(id: string): Promise<RoomRecord | null>;
  /** Adds a room; returns false when `limit` rooms already exist. */
  createRoom(room: RoomRecord, limit: number): Promise<boolean>;
  /**
   * Atomically replaces a room with the result of `update`, retrying if the
   * room was changed concurrently (so `update` must be free of side effects).
   * Resolves to null when the room does not exist.
   */
  updateRoom<T>(
    id: string,
    update: (room: RoomRecord) => RoomUpdate<T>,
  ): Promise<UpdatedRoom<T> | null>;
  deleteRoom(id: string): Promise<void>;

  getPresence(roomId: string): Promise<Presence>;
  /** Records that a connection is (still) in the room. */
  touchPresence(roomId: string, connectionId: string, playerId: string, now: number): Promise<void>;
  /** Removes a connection; if it was the player's last one, records when they left. */
  removePresence(
    roomId: string,
    connectionId: string,
    playerId: string,
    now: number,
  ): Promise<void>;

  close(): Promise<void>;
}

/** Presence entries older than this are dropped when the room is written. */
export const PRESENCE_RETENTION_MS = 30 * 60_000;

export function prunePresence(presence: Presence, now: number): Presence {
  const connections = Object.fromEntries(
    Object.entries(presence.connections).filter(
      ([, connection]) => now - connection.seenAt < PRESENCE_RETENTION_MS,
    ),
  );
  const leftAt = Object.fromEntries(
    Object.entries(presence.leftAt).filter(([, at]) => now - at < PRESENCE_RETENTION_MS),
  );
  return { connections, leftAt };
}

export class MemoryStore implements Store {
  readonly #sessions = new Map<string, SessionRecord>();
  readonly #rooms = new Map<string, RoomRecord>();
  readonly #presence = new Map<string, Presence>();

  getSession(token: string): Promise<SessionRecord | null> {
    return Promise.resolve(this.#sessions.get(token) ?? null);
  }

  putSession(session: SessionRecord): Promise<void> {
    this.#sessions.set(session.token, session);
    return Promise.resolve();
  }

  listRooms(): Promise<RoomRecord[]> {
    return Promise.resolve([...this.#rooms.values()]);
  }

  getRoom(id: string): Promise<RoomRecord | null> {
    return Promise.resolve(this.#rooms.get(id) ?? null);
  }

  createRoom(room: RoomRecord, limit: number): Promise<boolean> {
    if (this.#rooms.size >= limit) return Promise.resolve(false);
    this.#rooms.set(room.id, room);
    return Promise.resolve(true);
  }

  updateRoom<T>(
    id: string,
    update: (room: RoomRecord) => RoomUpdate<T>,
  ): Promise<UpdatedRoom<T> | null> {
    const current = this.#rooms.get(id);
    if (!current) return Promise.resolve(null);
    const { room, result } = update(current);
    if (room) this.#rooms.set(id, room);
    return Promise.resolve({
      room: room ?? current,
      before: current,
      changed: room !== null,
      result,
    });
  }

  deleteRoom(id: string): Promise<void> {
    this.#rooms.delete(id);
    this.#presence.delete(id);
    return Promise.resolve();
  }

  getPresence(roomId: string): Promise<Presence> {
    return Promise.resolve(this.#presence.get(roomId) ?? { connections: {}, leftAt: {} });
  }

  async touchPresence(
    roomId: string,
    connectionId: string,
    playerId: string,
    now: number,
  ): Promise<void> {
    const presence = await this.getPresence(roomId);
    this.#presence.set(
      roomId,
      prunePresence(
        {
          ...presence,
          connections: { ...presence.connections, [connectionId]: { playerId, seenAt: now } },
        },
        now,
      ),
    );
  }

  async removePresence(
    roomId: string,
    connectionId: string,
    playerId: string,
    now: number,
  ): Promise<void> {
    const presence = await this.getPresence(roomId);
    const connections = Object.fromEntries(
      Object.entries(presence.connections).filter(([id]) => id !== connectionId),
    );
    const stillHere = Object.values(connections).some(
      (connection) => connection.playerId === playerId,
    );
    const leftAt = stillHere ? presence.leftAt : { ...presence.leftAt, [playerId]: now };
    this.#presence.set(roomId, prunePresence({ connections, leftAt }, now));
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}
