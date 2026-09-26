// Server-side records. Everything here is plain JSON so it can be kept in
// process memory (development, tests) or in Redis (Vercel, several instances).
import type { Color, Outcome } from '../shared/chess/index.ts';
import type { ClockState, TimeControl } from '../shared/clock.ts';
import type { ChatMessage } from '../shared/protocol.ts';

export interface PlayerRef {
  /** Public player id (never the session token). */
  readonly id: string;
  readonly name: string;
}

export interface SessionRecord {
  /** Secret that proves the identity; only ever sent to its owner. */
  readonly token: string;
  readonly id: string;
  readonly name: string;
}

export interface GameRecord {
  readonly id: string;
  readonly white: PlayerRef;
  readonly black: PlayerRef;
  /** Moves in long algebraic notation; the position is rebuilt by replaying them. */
  readonly moves: readonly string[];
  readonly clock: ClockState;
  readonly timeControl: TimeControl;
  readonly drawOffer: Color | null;
  /** Ply at which each colour last offered a draw (one offer per move). */
  readonly lastOfferPly: Readonly<Record<Color, number | null>>;
  readonly outcome: Outcome | null;
  readonly startedAt: number;
}

export interface RoomRecord {
  readonly id: string;
  readonly name: string;
  readonly createdAt: number;
  /** Last change; idle rooms without visitors are removed after a while. */
  readonly updatedAt: number;
  /** Players waiting for a game; the game starts when there are two. */
  readonly seats: readonly PlayerRef[];
  /** The game in progress, or the last finished one. */
  readonly game: GameRecord | null;
  readonly chat: readonly ChatMessage[];
  readonly nextChatId: number;
}

/**
 * Who is connected to a room. Each connection (socket) refreshes its entry
 * periodically; entries not refreshed for PRESENCE_TTL_MS count as gone, so
 * a crashed server instance cannot keep players "online" forever.
 */
export interface Presence {
  readonly connections: Readonly<
    Record<string, { readonly playerId: string; readonly seenAt: number }>
  >;
  /** When each player's last connection to the room closed. */
  readonly leftAt: Readonly<Record<string, number>>;
}

export const EMPTY_PRESENCE: Presence = { connections: {}, leftAt: {} };
export const HEARTBEAT_MS = 15_000;
export const PRESENCE_TTL_MS = 40_000;
/**
 * A room without a game in progress is removed once nobody has been in it
 * for this long (long enough to survive a page reload).
 */
export const EMPTY_ROOM_GRACE_MS = 15_000;
