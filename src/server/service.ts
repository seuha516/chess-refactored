import { randomBytes } from 'node:crypto';
import type { TimeControl } from '../shared/clock.ts';
import {
  MAX_ROOMS,
  type AckResult,
  type CreateRoomResult,
  type ErrorCode,
  type LobbySnapshot,
  type RoomSnapshot,
} from '../shared/protocol.ts';
import {
  announceJoin,
  createRoom,
  isPlaying,
  nextDeadline,
  resolve,
  toSnapshot,
  toSummary,
  type Context,
  type Transition,
} from './logic.ts';
import {
  HEARTBEAT_MS,
  type PlayerRef,
  type Presence,
  type RoomRecord,
  type SessionRecord,
} from './model.ts';
import { RateLimiter } from './rate-limit.ts';
import type { Store } from './store.ts';
import { parseName, parseToken } from './validation.ts';

export interface Broadcaster {
  /** Sends a room snapshot to everybody in the room. */
  room(roomId: string, snapshot: RoomSnapshot): void;
  /** Sends the room list to everybody in the lobby. */
  lobby(snapshot: LobbySnapshot): void;
}

export interface ServiceOptions {
  readonly random?: () => number;
  readonly timeControl?: TimeControl;
  readonly maxRooms?: number;
  /** Rooms without a game and without visitors are removed after this long. */
  readonly roomIdleMs?: number;
  readonly heartbeatMs?: number;
}

export type RoomAction = (room: RoomRecord, player: PlayerRef, ctx: Context) => Transition;

const newId = (bytes: number) => randomBytes(bytes).toString('base64url');
const ok: AckResult = { ok: true };
const fail = (error: ErrorCode): { ok: false; error: ErrorCode } => ({ ok: false, error });

/**
 * Coordinates sessions, the lobby and rooms on top of a Store. It holds no
 * game state itself, only this instance's connections and timers, so any
 * number of server instances can serve the same rooms.
 */
export class ChessService {
  readonly #store: Store;
  readonly #broadcast: Broadcaster;
  readonly #random: () => number;
  readonly #timeControl: TimeControl | undefined;
  readonly #maxRooms: number;
  readonly #roomIdleMs: number;

  /** This instance's connections and the room each one is in. */
  readonly #connections = new Map<string, { roomId: string | null; player: PlayerRef }>();
  readonly #timers = new Map<string, ReturnType<typeof setTimeout>>();
  readonly #limiters = new Map<string, RateLimiter>();
  readonly #heartbeat: ReturnType<typeof setInterval>;

  constructor(store: Store, broadcast: Broadcaster, options: ServiceOptions = {}) {
    this.#store = store;
    this.#broadcast = broadcast;
    this.#random = options.random ?? Math.random;
    this.#timeControl = options.timeControl;
    this.#maxRooms = options.maxRooms ?? MAX_ROOMS;
    this.#roomIdleMs = options.roomIdleMs ?? 10 * 60_000;
    this.#heartbeat = setInterval(() => {
      void this.#beat();
    }, options.heartbeatMs ?? HEARTBEAT_MS);
  }

  // ---------------------------------------------------------------- sessions

  /** Resumes the session of a known token, or creates a new one. */
  async connect(auth: { token?: unknown; name?: unknown }): Promise<SessionRecord> {
    const token = parseToken(auth.token);
    const existing = token === null ? null : await this.#store.getSession(token);
    if (existing) return existing;
    const session: SessionRecord = {
      token: token ?? newId(24),
      id: newId(9),
      name: parseName(auth.name) ?? `익명${String(Math.floor(this.#random() * 9000) + 1000)}`,
    };
    await this.#store.putSession(session);
    return session;
  }

  async rename(session: SessionRecord, name: string): Promise<SessionRecord> {
    const renamed = { ...session, name };
    await this.#store.putSession(renamed);
    for (const connection of this.#connections.values()) {
      if (connection.player.id === session.id) connection.player = { id: session.id, name };
    }
    return renamed;
  }

  /** Registers a new connection (in the lobby, no room yet). */
  attach(connectionId: string, session: SessionRecord): void {
    this.#connections.set(connectionId, {
      roomId: null,
      player: { id: session.id, name: session.name },
    });
  }

  async detach(connectionId: string): Promise<void> {
    await this.leave(connectionId);
    this.#connections.delete(connectionId);
  }

  allow(key: string, capacity: number, intervalMs: number): boolean {
    let limiter = this.#limiters.get(key);
    if (!limiter) {
      if (this.#limiters.size > 10_000) this.#limiters.clear();
      limiter = new RateLimiter(capacity, intervalMs);
      this.#limiters.set(key, limiter);
    }
    return limiter.tryTake();
  }

  // ------------------------------------------------------------------- lobby

  /**
   * The room list. Also applies due time rules to each room and removes idle
   * empty rooms, so rooms nobody visits any more do not accumulate.
   */
  async lobby(): Promise<LobbySnapshot> {
    const now = Date.now();
    const rooms = await this.#store.listRooms();
    const listed: RoomRecord[] = [];
    for (const room of rooms) {
      const presence = await this.#store.getPresence(room.id);
      const empty = !Object.values(presence.connections).some(
        (connection) => now - connection.seenAt < 60_000,
      );
      if (empty && !isPlaying(room) && now - room.updatedAt > this.#roomIdleMs) {
        await this.#store.deleteRoom(room.id);
        continue;
      }
      const resolved = resolve(room, presence, now);
      if (resolved !== room) {
        const updated = await this.#store.updateRoom(room.id, (current) => {
          const next = resolve(current, presence, now);
          return { room: next === current ? null : next, result: undefined };
        });
        if (updated?.changed)
          this.#broadcast.room(room.id, toSnapshot(updated.room, presence, now));
      }
      listed.push(resolved);
    }
    listed.sort((a, b) => b.createdAt - a.createdAt);
    return { rooms: listed.map(toSummary) };
  }

  async #publishLobby(): Promise<void> {
    this.#broadcast.lobby(await this.lobby());
  }

  // ------------------------------------------------------------------- rooms

  async createRoom(session: SessionRecord, name: string | null): Promise<CreateRoomResult> {
    const now = Date.now();
    const room = createRoom(newId(6), name ?? `${session.name}님의 방`, now);
    if (!(await this.#store.createRoom(room, this.#maxRooms))) return fail('room-limit');
    await this.#publishLobby();
    return { ok: true, roomId: room.id };
  }

  /** Moves a connection into a room (as a spectator until it takes a seat). */
  async join(connectionId: string, roomId: string): Promise<AckResult> {
    const connection = this.#connections.get(connectionId);
    if (!connection) return fail('not-in-room');
    if (connection.roomId === roomId) return ok;
    const now = Date.now();
    const presence = await this.#store.getPresence(roomId);
    const updated = await this.#store.updateRoom(roomId, (room) => {
      const resolved = resolve(room, presence, now);
      const announced = announceJoin(resolved, connection.player, presence, now);
      const next = announced ?? resolved;
      return { room: next === room ? null : next, result: undefined };
    });
    if (!updated) return fail('no-room');

    await this.leave(connectionId);
    connection.roomId = roomId;
    await this.#store.touchPresence(roomId, connectionId, connection.player.id, now);
    await this.#publish(updated.room);
    return ok;
  }

  /** Takes a connection out of its room (entering the lobby, disconnecting). */
  async leave(connectionId: string): Promise<void> {
    const connection = this.#connections.get(connectionId);
    const roomId = connection?.roomId;
    if (!connection || !roomId) return;
    connection.roomId = null;
    await this.#store.removePresence(roomId, connectionId, connection.player.id, Date.now());
    const room = await this.#store.getRoom(roomId);
    if (room) await this.#publish(room);
  }

  roomOf(connectionId: string): string | null {
    return this.#connections.get(connectionId)?.roomId ?? null;
  }

  /** Applies a player's action to the connection's room. */
  async act(connectionId: string, action: RoomAction): Promise<AckResult> {
    const connection = this.#connections.get(connectionId);
    const roomId = connection?.roomId;
    if (!connection || !roomId) return fail('not-in-room');
    const now = Date.now();
    const presence = await this.#store.getPresence(roomId);
    const ctx: Context = {
      now,
      random: this.#random,
      newId: () => newId(9),
      ...(this.#timeControl ? { timeControl: this.#timeControl } : {}),
    };
    const updated = await this.#store.updateRoom(roomId, (room) => {
      const resolved = resolve(room, presence, now);
      const transition = action(resolved, connection.player, ctx);
      const next = transition.ok ? transition.room : resolved;
      return { room: next === room ? null : next, result: transition };
    });
    if (!updated) return fail('no-room');
    if (updated.changed) await this.#publish(updated.room, updated.before, presence);
    return updated.result.ok ? ok : fail(updated.result.error);
  }

  /** Applies due time rules to a room (timer, or a client whose clock hit zero). */
  async sync(roomId: string): Promise<void> {
    const now = Date.now();
    const presence = await this.#store.getPresence(roomId);
    const updated = await this.#store.updateRoom(roomId, (room) => {
      const next = resolve(room, presence, now);
      return { room: next === room ? null : next, result: undefined };
    });
    if (updated?.changed) await this.#publish(updated.room, updated.before, presence);
    else if (updated) this.#schedule(updated.room, presence);
  }

  /** Stops timers (shutdown, tests). */
  dispose(): void {
    clearInterval(this.#heartbeat);
    for (const timer of this.#timers.values()) clearTimeout(timer);
    this.#timers.clear();
  }

  // ---------------------------------------------------------------- private

  async #publish(
    room: RoomRecord,
    before?: RoomRecord | null,
    knownPresence?: Presence,
  ): Promise<void> {
    const now = Date.now();
    const presence = knownPresence ?? (await this.#store.getPresence(room.id));
    this.#broadcast.room(room.id, toSnapshot(room, presence, now));
    this.#schedule(room, presence);
    const summaryChanged =
      !before || JSON.stringify(toSummary(before)) !== JSON.stringify(toSummary(room));
    if (summaryChanged) await this.#publishLobby();
  }

  /** Arms a local timer for the next time-based rule (flag fall, disconnection). */
  #schedule(room: RoomRecord, presence: Presence): void {
    const existing = this.#timers.get(room.id);
    if (existing) clearTimeout(existing);
    this.#timers.delete(room.id);
    const deadline = nextDeadline(room, presence, Date.now());
    if (deadline === null) return;
    const timer = setTimeout(
      () => {
        this.#timers.delete(room.id);
        void this.sync(room.id);
      },
      Math.max(0, deadline - Date.now()) + 5,
    );
    this.#timers.set(room.id, timer);
  }

  /** Refreshes this instance's connections in the shared presence records. */
  async #beat(): Promise<void> {
    const now = Date.now();
    for (const [connectionId, connection] of this.#connections) {
      if (connection.roomId) {
        await this.#store.touchPresence(connection.roomId, connectionId, connection.player.id, now);
      }
    }
  }
}
