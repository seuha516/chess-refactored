// Pure room transitions: (room record, input, time) -> new room record.
// No I/O and no timers, so the same code runs in every server instance and
// is easy to test; the service layer loads and stores the records.
import {
  ChessGame,
  opposite,
  parseSquare,
  squareName,
  toFen,
  type Color,
  type EndReason,
  type Outcome,
  type PromotionPiece,
} from '../shared/chess/index.ts';
import {
  flagTime,
  pressClock,
  remainingMs,
  startClock,
  stopClock,
  TIME_CONTROL,
  type TimeControl,
} from '../shared/clock.ts';
import {
  CHAT_HISTORY_SIZE,
  DISCONNECT_FORFEIT_MS,
  SEAT_GRACE_MS,
  type ChatMessage,
  type ErrorCode,
  type GameSnapshot,
  type PlayerInfo,
  type RoomSnapshot,
  type RoomSummary,
} from '../shared/protocol.ts';
import {
  PRESENCE_TTL_MS,
  type GameRecord,
  type PlayerRef,
  type Presence,
  type RoomRecord,
} from './model.ts';
import type { ParsedMove } from './validation.ts';

export type Transition =
  | { readonly ok: true; readonly room: RoomRecord }
  | { readonly ok: false; readonly error: ErrorCode };

export interface Context {
  readonly now: number;
  readonly random?: () => number;
  readonly newId?: () => string;
  readonly timeControl?: TimeControl;
}

const fail = (error: ErrorCode): Transition => ({ ok: false, error });
const ok = (room: RoomRecord): Transition => ({ ok: true, room });

const REASON_TEXT: Record<EndReason, string> = {
  checkmate: '체크메이트',
  stalemate: '스테일메이트',
  'dead-position': '기물 부족',
  'threefold-repetition': '3회 동형 반복',
  'fifty-move-rule': '50수 규칙',
  resignation: '기권',
  agreement: '무승부 합의',
  timeout: '시간 초과',
  'timeout-vs-insufficient-material': '시간 초과 및 기물 부족',
  disconnection: '연결 끊김',
  'disconnection-vs-insufficient-material': '연결 끊김 및 기물 부족',
};

// ------------------------------------------------------------------ replay

const replayCache = new Map<string, ChessGame>();
const REPLAY_CACHE_SIZE = 200;

function parseUci(uci: string) {
  const from = parseSquare(uci.slice(0, 2));
  const to = parseSquare(uci.slice(2, 4));
  const promotion = (uci.charAt(4) || null) as PromotionPiece | null;
  if (from === null || to === null) throw new Error(`bad stored move ${uci}`);
  return { from, to, promotion };
}

/** Rebuilds the position of a stored game by replaying its moves. */
function replayFresh(game: GameRecord): ChessGame {
  const chess = new ChessGame();
  for (const uci of game.moves) {
    const { from, to, promotion } = parseUci(uci);
    if (!chess.play(from, to, promotion).ok) throw new Error(`corrupt game ${game.id} at ${uci}`);
  }
  return chess;
}

/** Read-only replay, cached by game and move count. Callers must not mutate it. */
export function replay(game: GameRecord): ChessGame {
  const key = `${game.id}:${String(game.moves.length)}`;
  let chess = replayCache.get(key);
  if (!chess) {
    chess = replayFresh(game);
    remember(key, chess);
  }
  return chess;
}

function remember(key: string, chess: ChessGame): void {
  replayCache.set(key, chess);
  if (replayCache.size > REPLAY_CACHE_SIZE) {
    const oldest = replayCache.keys().next().value;
    if (oldest !== undefined) replayCache.delete(oldest);
  }
}

// ---------------------------------------------------------------- presence

export function isConnected(presence: Presence, playerId: string, now: number): boolean {
  return Object.values(presence.connections).some(
    (connection) => connection.playerId === playerId && now - connection.seenAt < PRESENCE_TTL_MS,
  );
}

/** Since when a player has been gone, or null while connected (or never seen). */
export function disconnectedSince(
  presence: Presence,
  playerId: string,
  now: number,
): number | null {
  if (isConnected(presence, playerId, now)) return null;
  let since = presence.leftAt[playerId] ?? null;
  for (const connection of Object.values(presence.connections)) {
    // A stale entry: the server instance holding it stopped refreshing it.
    if (connection.playerId === playerId) since = Math.max(since ?? 0, connection.seenAt);
  }
  return since;
}

function onlineCount(presence: Presence, now: number): number {
  const players = new Set<string>();
  for (const connection of Object.values(presence.connections)) {
    if (now - connection.seenAt < PRESENCE_TTL_MS) players.add(connection.playerId);
  }
  return players.size;
}

// ------------------------------------------------------------------- rooms

export function createRoom(id: string, name: string, now: number): RoomRecord {
  return {
    id,
    name,
    createdAt: now,
    updatedAt: now,
    seats: [],
    game: null,
    chat: [],
    nextChatId: 1,
  };
}

export const isPlaying = (room: RoomRecord): boolean =>
  room.game !== null && room.game.outcome === null;

function colorOf(room: RoomRecord, playerId: string): Color | null {
  const game = room.game;
  if (!game || game.outcome) return null;
  if (game.white.id === playerId) return 'w';
  if (game.black.id === playerId) return 'b';
  return null;
}

function withChat(room: RoomRecord, message: Omit<ChatMessage, 'id'>): RoomRecord {
  const chat = [...room.chat, { ...message, id: room.nextChatId }].slice(-CHAT_HISTORY_SIZE);
  return { ...room, chat, nextChatId: room.nextChatId + 1 };
}

const system = (room: RoomRecord, text: string, now: number): RoomRecord =>
  withChat(room, { kind: 'system', author: null, text, at: now });

function touch(room: RoomRecord, now: number): RoomRecord {
  return { ...room, updatedAt: now };
}

function finishGame(room: RoomRecord, outcome: Outcome, at: number): RoomRecord {
  const game = room.game;
  if (!game) return room;
  const finished: GameRecord = {
    ...game,
    outcome,
    drawOffer: null,
    clock: stopClock(game.clock, at),
  };
  const winner = outcome.winner && (outcome.winner === 'w' ? game.white : game.black);
  const reason = REASON_TEXT[outcome.reason];
  return system(
    { ...room, game: finished },
    winner
      ? `${reason}에 의해 ${winner.name}의 승리로 경기를 종료합니다.`
      : `${reason}에 의해 무승부로 경기를 종료합니다.`,
    at,
  );
}

/**
 * Applies everything that happens by the passage of time: a flag fall, a
 * player who stayed disconnected too long (FIDE Online Regulations 11.4.2),
 * and waiting seats of players who left. Returns the same object when
 * nothing changed. Called before every transition and whenever a room is
 * read, so no single server's timer is required for these rules.
 */
export function resolve(room: RoomRecord, presence: Presence, now: number): RoomRecord {
  let next = room;
  const seats = room.seats.filter((seat) => {
    const since = disconnectedSince(presence, seat.id, now);
    return since === null || now - since < SEAT_GRACE_MS;
  });
  if (seats.length !== room.seats.length) next = { ...next, seats };

  const game = next.game;
  if (game && !game.outcome) {
    // Whichever rule fired first decides the game.
    const events: { at: number; apply: () => Outcome | null }[] = [];
    const flagAt = flagTime(game.clock);
    const running = game.clock.running;
    if (flagAt !== null && running) {
      events.push({ at: flagAt, apply: () => replayFresh(game).timeout(running) });
    }
    for (const color of ['w', 'b'] as const) {
      const player = color === 'w' ? game.white : game.black;
      const since = disconnectedSince(presence, player.id, now);
      if (since !== null) {
        events.push({
          at: since + DISCONNECT_FORFEIT_MS,
          apply: () => replayFresh(game).forfeitByDisconnection(color),
        });
      }
    }
    const due = events.filter((event) => event.at <= now).sort((a, b) => a.at - b.at)[0];
    const outcome = due?.apply();
    if (due && outcome) next = finishGame(next, outcome, Math.min(due.at, now));
  }
  return next === room ? room : touch(next, now);
}

/** The next moment at which {@link resolve} would change the room. */
export function nextDeadline(room: RoomRecord, presence: Presence, now: number): number | null {
  const times: number[] = [];
  for (const seat of room.seats) {
    const since = disconnectedSince(presence, seat.id, now);
    if (since !== null) times.push(since + SEAT_GRACE_MS);
  }
  const game = room.game;
  if (game && !game.outcome) {
    const flagAt = flagTime(game.clock);
    if (flagAt !== null) times.push(flagAt);
    for (const player of [game.white, game.black]) {
      const since = disconnectedSince(presence, player.id, now);
      if (since !== null) times.push(since + DISCONNECT_FORFEIT_MS);
    }
  }
  return times.length ? Math.min(...times) : null;
}

/** Announces a player entering the room, unless they were just here (reconnects). */
export function announceJoin(
  room: RoomRecord,
  player: PlayerRef,
  presence: Presence,
  now: number,
): RoomRecord | null {
  const since = disconnectedSince(presence, player.id, now);
  const recentlyHere =
    isConnected(presence, player.id, now) || (since !== null && now - since < 120_000);
  if (recentlyHere) return null;
  return touch(system(room, `${player.name}님이 입장하였습니다.`, now), now);
}

// ------------------------------------------------------------------- seats

export function takeSeat(room: RoomRecord, player: PlayerRef, ctx: Context): Transition {
  if (isPlaying(room)) return fail('game-in-progress');
  if (room.seats.some((seat) => seat.id === player.id)) return fail('already-seated');
  if (room.seats.length >= 2) return fail('seats-full');
  const seats = [...room.seats, player];
  if (seats.length < 2) return ok(touch({ ...room, seats }, ctx.now));

  const [first, second] = seats as [PlayerRef, PlayerRef];
  const random = ctx.random ?? Math.random;
  const [white, black] = random() < 0.5 ? [first, second] : [second, first];
  const timeControl = ctx.timeControl ?? TIME_CONTROL;
  const game: GameRecord = {
    id: ctx.newId?.() ?? `${room.id}-${String(ctx.now)}`,
    white,
    black,
    moves: [],
    clock: startClock(timeControl, ctx.now),
    timeControl,
    drawOffer: null,
    lastOfferPly: { w: null, b: null },
    outcome: null,
    startedAt: ctx.now,
  };
  return ok(
    touch(
      system(
        { ...room, seats: [], game },
        `${white.name}(백)와 ${black.name}(흑)의 대결을 시작합니다.`,
        ctx.now,
      ),
      ctx.now,
    ),
  );
}

export function leaveSeat(room: RoomRecord, player: PlayerRef, ctx: Context): Transition {
  if (!room.seats.some((seat) => seat.id === player.id)) return fail('not-seated');
  return ok(touch({ ...room, seats: room.seats.filter((seat) => seat.id !== player.id) }, ctx.now));
}

// -------------------------------------------------------------------- game

function playerGame(
  room: RoomRecord,
  player: PlayerRef,
): { game: GameRecord; color: Color } | ErrorCode {
  const game = room.game;
  if (!game || game.outcome) return 'no-game';
  const color = colorOf(room, player.id);
  if (color === null) return 'not-a-player';
  return { game, color };
}

export function move(
  room: RoomRecord,
  player: PlayerRef,
  request: ParsedMove,
  ctx: Context,
): Transition {
  const found = playerGame(room, player);
  if (typeof found === 'string') return fail(found);
  const { game, color } = found;
  if (game.clock.running !== color) return fail('not-your-turn');
  if (request.ply !== game.moves.length) return fail('stale-move');
  const flagAt = flagTime(game.clock);
  if (flagAt !== null && ctx.now >= flagAt) return fail('no-game'); // resolve() will record it

  const chess = replayFresh(game);
  const result = chess.play(request.from, request.to, request.promotion);
  if (!result.ok) return fail('illegal-move');
  const { move: played } = result.record;
  const uci = `${squareName(played.from)}${squareName(played.to)}${played.promotion ?? ''}`;
  const moves = [...game.moves, uci];
  remember(`${game.id}:${String(moves.length)}`, chess);

  // Playing a move rejects the opponent's offer (Online Regulations 5.3).
  const rejectsOffer = game.drawOffer === opposite(color);
  let next: RoomRecord = {
    ...room,
    game: {
      ...game,
      moves,
      clock: pressClock(game.clock, game.timeControl, ctx.now),
      drawOffer: rejectsOffer ? null : game.drawOffer,
    },
  };
  if (rejectsOffer) next = system(next, '무승부 제안이 거절되었습니다.', ctx.now);
  if (chess.outcome) next = finishGame(next, chess.outcome, ctx.now);
  return ok(touch(next, ctx.now));
}

export function resign(room: RoomRecord, player: PlayerRef, ctx: Context): Transition {
  const found = playerGame(room, player);
  if (typeof found === 'string') return fail(found);
  return ok(
    touch(
      finishGame(room, { winner: opposite(found.color), reason: 'resignation' }, ctx.now),
      ctx.now,
    ),
  );
}

export function offerDraw(room: RoomRecord, player: PlayerRef, ctx: Context): Transition {
  const found = playerGame(room, player);
  if (typeof found === 'string') return fail(found);
  const { game, color } = found;
  // Both players offering amounts to an agreement.
  if (game.drawOffer === opposite(color)) return acceptDraw(room, player, ctx);
  if (game.drawOffer === color) return fail('draw-offer-pending');
  const ply = game.moves.length;
  if (game.lastOfferPly[color] === ply) return fail('draw-offer-limit');
  const next: RoomRecord = {
    ...room,
    game: { ...game, drawOffer: color, lastOfferPly: { ...game.lastOfferPly, [color]: ply } },
  };
  return ok(touch(system(next, `${player.name}님이 무승부를 제안했습니다.`, ctx.now), ctx.now));
}

export function acceptDraw(room: RoomRecord, player: PlayerRef, ctx: Context): Transition {
  const found = playerGame(room, player);
  if (typeof found === 'string') return fail(found);
  if (found.game.drawOffer !== opposite(found.color)) return fail('no-draw-offer');
  return ok(touch(finishGame(room, { winner: null, reason: 'agreement' }, ctx.now), ctx.now));
}

export function declineDraw(room: RoomRecord, player: PlayerRef, ctx: Context): Transition {
  const found = playerGame(room, player);
  if (typeof found === 'string') return fail(found);
  if (found.game.drawOffer !== opposite(found.color)) return fail('no-draw-offer');
  const next: RoomRecord = { ...room, game: { ...found.game, drawOffer: null } };
  return ok(touch(system(next, '무승부 제안이 거절되었습니다.', ctx.now), ctx.now));
}

export function chat(room: RoomRecord, player: PlayerRef, text: string, ctx: Context): Transition {
  return ok(
    touch(
      withChat(room, {
        kind: 'user',
        author: { id: player.id, name: player.name },
        text,
        at: ctx.now,
      }),
      ctx.now,
    ),
  );
}

// --------------------------------------------------------------- snapshots

function playerInfo(player: PlayerRef, presence: Presence, now: number): PlayerInfo {
  const since = disconnectedSince(presence, player.id, now);
  return {
    id: player.id,
    name: player.name,
    connected: isConnected(presence, player.id, now),
    disconnectedAt: since,
  };
}

function gameSnapshot(game: GameRecord, presence: Presence, now: number): GameSnapshot {
  const chess = replay(game);
  return {
    id: game.id,
    white: playerInfo(game.white, presence, now),
    black: playerInfo(game.black, presence, now),
    fen: toFen(chess.position),
    moves: chess.history.map(({ move: played, san }) => ({
      san,
      uci: `${squareName(played.from)}${squareName(played.to)}${played.promotion ?? ''}`,
      color: played.color,
      captured: played.captured,
    })),
    status: game.outcome ? 'finished' : 'playing',
    outcome: game.outcome,
    clock: {
      whiteMs: remainingMs(game.clock, 'w', now),
      blackMs: remainingMs(game.clock, 'b', now),
      running: game.clock.running,
    },
    timeControl: game.timeControl,
    drawOffer: game.drawOffer,
  };
}

export function toSnapshot(room: RoomRecord, presence: Presence, now: number): RoomSnapshot {
  return {
    id: room.id,
    name: room.name,
    seats: room.seats.map((seat) => playerInfo(seat, presence, now)),
    game: room.game && gameSnapshot(room.game, presence, now),
    online: onlineCount(presence, now),
    chat: room.chat,
    at: now,
  };
}

export function toSummary(room: RoomRecord): RoomSummary {
  const game = room.game;
  const playing = game !== null && game.outcome === null;
  return {
    id: room.id,
    name: room.name,
    status: playing ? 'playing' : 'waiting',
    players: playing ? [game.white.name, game.black.name] : room.seats.map((seat) => seat.name),
    createdAt: room.createdAt,
  };
}
