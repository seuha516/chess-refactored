// Socket.IO protocol shared by server and client. The server owns all game
// state; clients send requests (acknowledged with an AckResult) and render the
// RoomSnapshot the server broadcasts after every change.
import type { Color, EndReason, PromotionPiece } from './chess/index.ts';

/** Per-move time limit, kept from the original game ("3:00" per move). */
export const MOVE_TIME_LIMIT_MS = 180_000;
/** A seated player who disconnects before the game starts keeps the seat this long. */
export const SEAT_RECONNECT_GRACE_MS = 15_000;
export const MAX_NAME_LENGTH = 16;
export const MAX_CHAT_LENGTH = 200;
export const CHAT_HISTORY_SIZE = 50;

export interface PlayerInfo {
  /** Public identifier; the session token that proves identity is never shared. */
  readonly id: string;
  readonly name: string;
  readonly connected: boolean;
}

export interface MoveInfo {
  readonly san: string;
  /** Long algebraic, e.g. "e2e4", "e7e8q". */
  readonly uci: string;
  readonly color: Color;
  readonly captured: string | null;
}

export interface GameSnapshot {
  /** Increments for every new game; lets clients detect a new game. */
  readonly id: number;
  readonly white: PlayerInfo;
  readonly black: PlayerInfo;
  readonly fen: string;
  readonly moves: readonly MoveInfo[];
  readonly status: 'playing' | 'finished';
  readonly outcome: { readonly winner: Color | null; readonly reason: EndReason } | null;
  /** Milliseconds left for the side to move when the snapshot was sent. */
  readonly remainingMs: number | null;
  /** Colour of the player whose draw offer is pending. */
  readonly drawOffer: Color | null;
}

export interface RoomSnapshot {
  /** Players waiting for a game (0–2). Empty while a game is being played. */
  readonly seats: readonly PlayerInfo[];
  /** The game in progress, or the last finished one. */
  readonly game: GameSnapshot | null;
  readonly online: number;
}

export interface ChatMessage {
  readonly id: number;
  readonly kind: 'user' | 'system';
  readonly author: { readonly id: string; readonly name: string } | null;
  readonly text: string;
  readonly at: number;
}

export interface SessionInfo {
  readonly token: string;
  readonly playerId: string;
  readonly name: string;
}

export type ErrorCode =
  | 'invalid-payload'
  | 'rate-limited'
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
  | 'draw-offer-limit';

export type AckResult = { readonly ok: true } | { readonly ok: false; readonly error: ErrorCode };
export type Ack = (result: AckResult) => void;

export interface MoveRequest {
  readonly from: string;
  readonly to: string;
  readonly promotion?: PromotionPiece;
  /** Number of moves already played that the client based this move on. */
  readonly ply: number;
}

export interface ClientToServerEvents {
  'profile:set-name': (name: string, ack: Ack) => void;
  'seat:take': (ack: Ack) => void;
  'seat:leave': (ack: Ack) => void;
  'game:move': (move: MoveRequest, ack: Ack) => void;
  'game:resign': (ack: Ack) => void;
  'game:offer-draw': (ack: Ack) => void;
  'game:accept-draw': (ack: Ack) => void;
  'game:decline-draw': (ack: Ack) => void;
  'chat:send': (text: string, ack: Ack) => void;
}

export interface ServerToClientEvents {
  session: (session: SessionInfo) => void;
  room: (snapshot: RoomSnapshot) => void;
  chat: (message: ChatMessage) => void;
  'chat:history': (messages: readonly ChatMessage[]) => void;
}

/** Sent in the Socket.IO handshake (`auth`). */
export interface HandshakeAuth {
  readonly token?: string;
  readonly name?: string;
}
