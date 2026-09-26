// Socket.IO protocol shared by server and client. The server owns all game
// state; clients send requests (acknowledged with an AckResult) and render the
// snapshots the server sends: the lobby (list of rooms) and the room they are in.
import type { Color, EndReason, PromotionPiece } from './chess/index.ts';
import type { TimeControl } from './clock.ts';

export const MAX_NAME_LENGTH = 16;
export const MAX_ROOM_NAME_LENGTH = 24;
export const MAX_CHAT_LENGTH = 200;
export const CHAT_HISTORY_SIZE = 50;
export const MAX_ROOMS = 50;
/**
 * A player who stays disconnected this long during their game loses it
 * (FIDE Online Chess Regulations 11.4.2 lets the competition regulations set
 * the reconnection window); a waiting seat is released after SEAT_GRACE_MS.
 */
export const DISCONNECT_FORFEIT_MS = 60_000;
export const SEAT_GRACE_MS = 15_000;

export interface PlayerInfo {
  /** Public identifier; the session token that proves identity is never shared. */
  readonly id: string;
  readonly name: string;
  readonly connected: boolean;
  /** When the player lost the connection (null while connected). */
  readonly disconnectedAt: number | null;
}

export interface MoveInfo {
  readonly san: string;
  /** Long algebraic, e.g. "e2e4", "e7e8q". */
  readonly uci: string;
  readonly color: Color;
  readonly captured: string | null;
}

export interface GameSnapshot {
  /** Unique per game; lets clients detect a new game. */
  readonly id: string;
  readonly white: PlayerInfo;
  readonly black: PlayerInfo;
  readonly fen: string;
  readonly moves: readonly MoveInfo[];
  readonly status: 'playing' | 'finished';
  readonly outcome: { readonly winner: Color | null; readonly reason: EndReason } | null;
  /** Time left for each side when the snapshot was made; `running` is ticking. */
  readonly clock: {
    readonly whiteMs: number;
    readonly blackMs: number;
    readonly running: Color | null;
  };
  readonly timeControl: TimeControl;
  /** Colour of the player whose draw offer is pending. */
  readonly drawOffer: Color | null;
}

export interface ChatMessage {
  readonly id: number;
  readonly kind: 'user' | 'system';
  readonly author: { readonly id: string; readonly name: string } | null;
  readonly text: string;
  readonly at: number;
}

export interface RoomSnapshot {
  readonly id: string;
  readonly name: string;
  /** Players waiting for a game (0–2). Empty while a game is being played. */
  readonly seats: readonly PlayerInfo[];
  /** The game in progress, or the last finished one. */
  readonly game: GameSnapshot | null;
  /** Connected people in the room (players and spectators). */
  readonly online: number;
  readonly chat: readonly ChatMessage[];
  /** Server time of the snapshot, so clients can count down from it. */
  readonly at: number;
}

export interface RoomSummary {
  readonly id: string;
  readonly name: string;
  readonly status: 'waiting' | 'playing';
  /** Waiting players, or white and black while playing. */
  readonly players: readonly string[];
  /** Public ids of the same players, so a visitor can find their own game. */
  readonly playerIds: readonly string[];
  readonly createdAt: number;
}

export interface LobbySnapshot {
  readonly rooms: readonly RoomSummary[];
}

export interface SessionInfo {
  readonly token: string;
  readonly playerId: string;
  readonly name: string;
}

export type ErrorCode =
  | 'invalid-payload'
  | 'rate-limited'
  | 'no-room'
  | 'not-in-room'
  | 'room-limit'
  | 'not-a-player'
  | 'not-your-turn'
  | 'no-game'
  | 'game-in-progress'
  | 'illegal-move'
  | 'stale-move'
  | 'already-seated'
  | 'seats-full'
  | 'not-seated'
  | 'no-draw-offer'
  | 'draw-offer-pending'
  | 'draw-offer-limit'
  | 'server-error';

export type AckResult = { readonly ok: true } | { readonly ok: false; readonly error: ErrorCode };
export type Ack = (result: AckResult) => void;
export type CreateRoomResult =
  | { readonly ok: true; readonly roomId: string }
  | { readonly ok: false; readonly error: ErrorCode };

export interface MoveRequest {
  readonly from: string;
  readonly to: string;
  readonly promotion?: PromotionPiece;
  /** Number of moves already played that the client based this move on. */
  readonly ply: number;
}

/**
 * A player pulling their 몽돌이 (the pebble at their corner of the 3D table),
 * sent a few times a second while they pull and once when they let go, so
 * the others see it stretch and spring back. Purely for fun: no game effect.
 */
export interface MascotTug {
  /** Where it was taken hold of, in the pebble's own frame. */
  readonly grab: readonly [number, number, number];
  /** How far that point is pulled, in the same frame. */
  readonly pull: readonly [number, number, number];
  /** Let go: it springs back. */
  readonly release: boolean;
}

export interface ClientToServerEvents {
  'profile:set-name': (name: string, ack: Ack) => void;
  /** Subscribe to the room list (leaves the current room). */
  'lobby:enter': (ack: Ack) => void;
  'room:create': (name: string, ack: (result: CreateRoomResult) => void) => void;
  /** Enter a room as a spectator (leaves the lobby and any other room). */
  'room:join': (roomId: string, ack: Ack) => void;
  /** Ask the server to apply due clock/disconnection rules (e.g. when a clock hits zero). */
  'room:sync': (ack: Ack) => void;
  'seat:take': (ack: Ack) => void;
  'seat:leave': (ack: Ack) => void;
  'game:move': (move: MoveRequest, ack: Ack) => void;
  'game:resign': (ack: Ack) => void;
  'game:offer-draw': (ack: Ack) => void;
  'game:accept-draw': (ack: Ack) => void;
  'game:decline-draw': (ack: Ack) => void;
  'chat:send': (text: string, ack: Ack) => void;
  /** Fire and forget (no acknowledgement); relayed to the rest of the room. */
  'mascot:tug': (tug: MascotTug) => void;
}

export interface ServerToClientEvents {
  session: (session: SessionInfo) => void;
  lobby: (lobby: LobbySnapshot) => void;
  room: (snapshot: RoomSnapshot) => void;
  /** Someone else in the room pulled their 몽돌이. */
  mascot: (tug: MascotTug & { readonly playerId: string }) => void;
}

/** Sent in the Socket.IO handshake (`auth`). */
export interface HandshakeAuth {
  readonly token?: string;
  readonly name?: string;
}

/**
 * Socket.IO endpoint, identical in development and on Vercel, where it is the
 * path of the function (api/socket). Used without a trailing slash so the
 * request path matches the function exactly.
 */
export const SOCKET_PATH = '/api/socket';
