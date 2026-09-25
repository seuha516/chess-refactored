import { randomBytes } from 'node:crypto';
import {
  ChessGame,
  opposite,
  squareName,
  toFen,
  type Color,
  type EndReason,
  type Outcome,
} from '../shared/chess/index.ts';
import {
  CHAT_HISTORY_SIZE,
  MOVE_TIME_LIMIT_MS,
  SEAT_RECONNECT_GRACE_MS,
  type AckResult,
  type ChatMessage,
  type ErrorCode,
  type GameSnapshot,
  type PlayerInfo,
  type RoomSnapshot,
} from '../shared/protocol.ts';
import { RateLimiter } from './rate-limit.ts';
import { parseName, parseToken, type ParsedMove } from './validation.ts';

export interface RoomListener {
  /** Called after every state change with the new public snapshot. */
  snapshot(snapshot: RoomSnapshot): void;
  chat(message: ChatMessage): void;
}

export interface RoomOptions {
  readonly moveTimeLimitMs?: number;
  readonly seatGraceMs?: number;
  /** How long a disconnected, idle player is remembered (for reloads). */
  readonly idleGraceMs?: number;
  readonly random?: () => number;
}

export interface Player {
  readonly token: string;
  readonly id: string;
  name: string;
  sockets: number;
  readonly chatLimiter: RateLimiter;
  timer: ReturnType<typeof setTimeout> | null;
}

interface ActiveGame {
  readonly id: number;
  readonly chess: ChessGame;
  readonly players: Readonly<Record<Color, Player>>;
  deadline: number | null;
  timer: ReturnType<typeof setTimeout> | null;
  drawOffer: Color | null;
  /** Ply at which each colour last offered a draw (one offer per move). */
  readonly lastOfferPly: Record<Color, number | null>;
}

const OK: AckResult = { ok: true };
const fail = (error: ErrorCode): AckResult => ({ ok: false, error });

const newId = (bytes: number) => randomBytes(bytes).toString('base64url');

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
};

/**
 * The single game table of the server: lobby seats, the authoritative game,
 * its per-move clock, draw offers, sessions and chat. It does not know about
 * Socket.IO; the transport calls these methods with already-parsed input and
 * forwards what the listener receives.
 */
export class GameRoom {
  readonly #listener: RoomListener;
  readonly #moveTimeLimitMs: number;
  readonly #seatGraceMs: number;
  readonly #idleGraceMs: number;
  readonly #random: () => number;

  readonly #players = new Map<string, Player>();
  #seats: Player[] = [];
  #game: ActiveGame | null = null;
  #nextGameId = 1;
  readonly #chat: ChatMessage[] = [];
  #nextChatId = 1;

  constructor(listener: RoomListener, options: RoomOptions = {}) {
    this.#listener = listener;
    this.#moveTimeLimitMs = options.moveTimeLimitMs ?? MOVE_TIME_LIMIT_MS;
    this.#seatGraceMs = options.seatGraceMs ?? SEAT_RECONNECT_GRACE_MS;
    this.#idleGraceMs = options.idleGraceMs ?? SEAT_RECONNECT_GRACE_MS;
    this.#random = options.random ?? Math.random;
  }

  // ---------------------------------------------------------------- sessions

  /**
   * Registers a socket. A known session token resumes the same player (page
   * reload or reconnect), keeping seat, game and name.
   */
  connect(auth: { token?: unknown; name?: unknown }): Player {
    const token = parseToken(auth.token);
    let player = token === null ? undefined : this.#players.get(token);
    const isNew = player === undefined;
    if (!player) {
      player = {
        token: token ?? newId(24),
        id: newId(9),
        name: parseName(auth.name) ?? `익명${String(Math.floor(this.#random() * 9000) + 1000)}`,
        sockets: 0,
        chatLimiter: new RateLimiter(5, 10_000),
        timer: null,
      };
      this.#players.set(player.token, player);
    }
    player.sockets += 1;
    this.#clearTimer(player);
    if (isNew) this.#system(`${player.name}님이 접속하였습니다.`);
    this.#changed();
    return player;
  }

  disconnect(player: Player): void {
    player.sockets = Math.max(0, player.sockets - 1);
    if (player.sockets === 0) {
      // A disconnected player's clock keeps running (FIDE Online Regulations
      // 11.4); a waiting seat is held briefly so a page reload keeps it.
      if (this.#seats.includes(player)) {
        this.#setTimer(player, this.#seatGraceMs, () => {
          this.#seats = this.#seats.filter((seated) => seated !== player);
          this.#forgetIfIdle(player);
          this.#changed();
        });
      } else {
        this.#forgetIfIdle(player);
      }
    }
    this.#changed();
  }

  setName(player: Player, name: string): AckResult {
    if (this.#colorOf(player) !== null) return fail('game-in-progress');
    if (name === player.name) return OK;
    const previous = player.name;
    player.name = name;
    this.#system(`${previous}님의 이름이 ${name}(으)로 바뀌었습니다.`);
    this.#changed();
    return OK;
  }

  // ------------------------------------------------------------------ seats

  takeSeat(player: Player): AckResult {
    if (this.#isPlaying()) return fail('game-in-progress');
    if (this.#seats.includes(player)) return fail('already-seated');
    if (this.#seats.length >= 2) return fail('seats-full');
    this.#seats.push(player);
    if (this.#seats.length === 2) this.#startGame();
    this.#changed();
    return OK;
  }

  leaveSeat(player: Player): AckResult {
    if (!this.#seats.includes(player)) return fail('not-seated');
    this.#seats = this.#seats.filter((seated) => seated !== player);
    this.#changed();
    return OK;
  }

  // ------------------------------------------------------------------- game

  move(player: Player, request: ParsedMove): AckResult {
    this.#enforceClock();
    const game = this.#playingGame();
    if (!game) return fail('no-game');
    const color = this.#colorOf(player);
    if (color === null) return fail('not-a-player');
    if (game.chess.turn !== color) return fail('not-your-turn');
    if (request.ply !== game.chess.history.length) return fail('stale-move');

    const result = game.chess.play(request.from, request.to, request.promotion);
    if (!result.ok) return fail('illegal-move');

    if (game.drawOffer === opposite(color)) {
      // Playing a move rejects the opponent's offer (Online Regulations 5.3).
      game.drawOffer = null;
      this.#system('무승부 제안이 거절되었습니다.');
    }
    const outcome = game.chess.outcome;
    if (outcome) this.#finish(game, outcome);
    else this.#startClock(game);
    this.#changed();
    return OK;
  }

  resign(player: Player): AckResult {
    const game = this.#playingGame();
    if (!game) return fail('no-game');
    const color = this.#colorOf(player);
    if (color === null) return fail('not-a-player');
    const outcome = game.chess.resign(color);
    if (outcome) this.#finish(game, outcome);
    this.#changed();
    return OK;
  }

  offerDraw(player: Player): AckResult {
    const game = this.#playingGame();
    if (!game) return fail('no-game');
    const color = this.#colorOf(player);
    if (color === null) return fail('not-a-player');
    // Both players offering amounts to an agreement.
    if (game.drawOffer === opposite(color)) return this.acceptDraw(player);
    if (game.drawOffer === color) return fail('draw-offer-pending');
    const ply = game.chess.history.length;
    if (game.lastOfferPly[color] === ply) return fail('draw-offer-limit');
    game.drawOffer = color;
    game.lastOfferPly[color] = ply;
    this.#system(`${player.name}님이 무승부를 제안했습니다.`);
    this.#changed();
    return OK;
  }

  acceptDraw(player: Player): AckResult {
    const game = this.#playingGame();
    if (!game) return fail('no-game');
    const color = this.#colorOf(player);
    if (color === null) return fail('not-a-player');
    if (game.drawOffer !== opposite(color)) return fail('no-draw-offer');
    const outcome = game.chess.agreeDraw();
    if (outcome) this.#finish(game, outcome);
    this.#changed();
    return OK;
  }

  declineDraw(player: Player): AckResult {
    const game = this.#playingGame();
    if (!game) return fail('no-game');
    const color = this.#colorOf(player);
    if (color === null) return fail('not-a-player');
    if (game.drawOffer !== opposite(color)) return fail('no-draw-offer');
    game.drawOffer = null;
    this.#system('무승부 제안이 거절되었습니다.');
    this.#changed();
    return OK;
  }

  // ------------------------------------------------------------------- chat

  chat(player: Player, text: string): AckResult {
    if (!player.chatLimiter.tryTake()) return fail('rate-limited');
    this.#pushChat({
      id: this.#nextChatId++,
      kind: 'user',
      author: { id: player.id, name: player.name },
      text,
      at: Date.now(),
    });
    return OK;
  }

  chatHistory(): readonly ChatMessage[] {
    return this.#chat;
  }

  // --------------------------------------------------------------- snapshot

  snapshot(): RoomSnapshot {
    let online = 0;
    for (const player of this.#players.values()) if (player.sockets > 0) online += 1;
    return {
      seats: this.#seats.map(info),
      game: this.#game && this.#gameSnapshot(this.#game),
      online,
    };
  }

  /** Stops all timers (server shutdown, tests). */
  dispose(): void {
    if (this.#game?.timer) clearTimeout(this.#game.timer);
    for (const player of this.#players.values()) this.#clearTimer(player);
  }

  // ---------------------------------------------------------------- private

  #startGame(): void {
    const [first, second] = this.#seats;
    if (!first || !second) return;
    const [white, black] = this.#random() < 0.5 ? [first, second] : [second, first];
    this.#seats = [];
    const game: ActiveGame = {
      id: this.#nextGameId++,
      chess: new ChessGame(),
      players: { w: white, b: black },
      deadline: null,
      timer: null,
      drawOffer: null,
      lastOfferPly: { w: null, b: null },
    };
    this.#game = game;
    this.#system(`${white.name}(백)와 ${black.name}(흑)의 대결을 시작합니다.`);
    this.#startClock(game);
  }

  /** Starts the per-move clock for the side to move. */
  #startClock(game: ActiveGame): void {
    if (game.timer) clearTimeout(game.timer);
    game.deadline = Date.now() + this.#moveTimeLimitMs;
    game.timer = setTimeout(() => {
      this.#timeout(game);
    }, this.#moveTimeLimitMs);
  }

  #timeout(game: ActiveGame): void {
    const outcome = game.chess.timeout(game.chess.turn);
    if (outcome) {
      this.#finish(game, outcome);
      this.#changed();
    }
  }

  /** A move arriving after the deadline loses even if the timer has not fired yet. */
  #enforceClock(): void {
    const game = this.#playingGame();
    if (game && game.deadline !== null && Date.now() >= game.deadline) this.#timeout(game);
  }

  #finish(game: ActiveGame, outcome: Outcome): void {
    if (game.timer) clearTimeout(game.timer);
    game.timer = null;
    game.deadline = null;
    game.drawOffer = null;
    const winner = outcome.winner && game.players[outcome.winner];
    const reason = REASON_TEXT[outcome.reason];
    this.#system(
      winner
        ? `${reason}에 의해 ${winner.name}의 승리로 경기를 종료합니다.`
        : `${reason}에 의해 무승부로 경기를 종료합니다.`,
    );
    for (const player of Object.values(game.players)) {
      if (player.sockets === 0) this.#forgetIfIdle(player);
    }
  }

  #playingGame(): ActiveGame | null {
    return this.#isPlaying() ? this.#game : null;
  }

  #isPlaying(): boolean {
    return this.#game !== null && this.#game.chess.outcome === null;
  }

  #colorOf(player: Player): Color | null {
    const game = this.#playingGame();
    if (!game) return null;
    if (game.players.w === player) return 'w';
    if (game.players.b === player) return 'b';
    return null;
  }

  /** Drops a player without connections once they have no seat or game. */
  #forgetIfIdle(player: Player): void {
    if (player.sockets > 0 || this.#seats.includes(player) || this.#colorOf(player)) return;
    this.#setTimer(player, this.#idleGraceMs, () => {
      this.#players.delete(player.token);
      this.#system(`${player.name}님이 나가셨습니다.`);
      this.#changed();
    });
  }

  #setTimer(player: Player, ms: number, callback: () => void): void {
    this.#clearTimer(player);
    player.timer = setTimeout(() => {
      player.timer = null;
      callback();
    }, ms);
  }

  #clearTimer(player: Player): void {
    if (player.timer) clearTimeout(player.timer);
    player.timer = null;
  }

  #gameSnapshot(game: ActiveGame): GameSnapshot {
    const { chess } = game;
    return {
      id: game.id,
      white: info(game.players.w),
      black: info(game.players.b),
      fen: toFen(chess.position),
      moves: chess.history.map(({ move, san }) => ({
        san,
        uci: `${squareName(move.from)}${squareName(move.to)}${move.promotion ?? ''}`,
        color: move.color,
        captured: move.captured,
      })),
      status: chess.outcome ? 'finished' : 'playing',
      outcome: chess.outcome,
      remainingMs: game.deadline === null ? null : Math.max(0, game.deadline - Date.now()),
      drawOffer: game.drawOffer,
    };
  }

  #system(text: string): void {
    this.#pushChat({ id: this.#nextChatId++, kind: 'system', author: null, text, at: Date.now() });
  }

  #pushChat(message: ChatMessage): void {
    this.#chat.push(message);
    if (this.#chat.length > CHAT_HISTORY_SIZE) this.#chat.shift();
    this.#listener.chat(message);
  }

  #changed(): void {
    this.#listener.snapshot(this.snapshot());
  }
}

const info = (player: Player): PlayerInfo => ({
  id: player.id,
  name: player.name,
  connected: player.sockets > 0,
});
