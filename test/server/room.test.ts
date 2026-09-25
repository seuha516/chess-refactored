import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseSquare } from '../../src/shared/chess/index.ts';
import {
  MOVE_TIME_LIMIT_MS,
  SEAT_RECONNECT_GRACE_MS,
  type ChatMessage,
  type RoomSnapshot,
} from '../../src/shared/protocol.ts';
import { GameRoom, type Player } from '../../src/server/room.ts';
import type { ParsedMove } from '../../src/server/validation.ts';

let room: GameRoom;
let snapshots: RoomSnapshot[];
let chat: ChatMessage[];

beforeEach(() => {
  vi.useFakeTimers();
  snapshots = [];
  chat = [];
  // random() < 0.5 -> the first seated player gets white.
  room = new GameRoom(
    { snapshot: (s) => snapshots.push(s), chat: (m) => chat.push(m) },
    { random: () => 0.25 },
  );
});

afterEach(() => {
  room.dispose();
  vi.useRealTimers();
});

const last = () => snapshots.at(-1) ?? room.snapshot();
const game = () => {
  const current = last().game;
  if (!current) throw new Error('no game');
  return current;
};

function move(uci: string, ply: number): ParsedMove {
  const from = parseSquare(uci.slice(0, 2));
  const to = parseSquare(uci.slice(2, 4));
  if (from === null || to === null) throw new Error(uci);
  return { from, to, promotion: null, ply };
}

function startGame(): { white: Player; black: Player; spectator: Player } {
  const white = room.connect({ name: 'white' });
  const black = room.connect({ name: 'black' });
  const spectator = room.connect({ name: 'spectator' });
  expect(room.takeSeat(white)).toEqual({ ok: true });
  expect(room.takeSeat(black)).toEqual({ ok: true });
  return { white, black, spectator };
}

describe('sessions', () => {
  it('assigns an anonymous name and a fresh token when none is given', () => {
    const player = room.connect({});
    expect(player.name).toMatch(/^익명\d{4}$/);
    expect(player.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(chat.at(-1)?.text).toBe(`${player.name}님이 접속하였습니다.`);
  });

  it('resumes the same player for a known token without announcing it again', () => {
    const player = room.connect({ name: 'alice' });
    room.disconnect(player);
    const messages = chat.length;
    expect(room.connect({ token: player.token })).toBe(player);
    expect(chat.length).toBe(messages);
  });

  it('forgets idle disconnected players after the grace period', () => {
    const player = room.connect({ name: 'alice' });
    room.disconnect(player);
    vi.advanceTimersByTime(SEAT_RECONNECT_GRACE_MS);
    expect(chat.at(-1)?.text).toBe('alice님이 나가셨습니다.');
    expect(room.connect({ token: player.token })).not.toBe(player);
  });

  it('counts online players, not sockets', () => {
    const player = room.connect({ name: 'alice' });
    room.connect({ token: player.token });
    room.connect({ name: 'bob' });
    expect(last().online).toBe(2);
  });
});

describe('seats and game start', () => {
  it('starts a game when the second player sits down', () => {
    const { white, black } = startGame();
    expect(last().seats).toEqual([]);
    expect(game()).toMatchObject({
      id: 1,
      status: 'playing',
      white: { id: white.id, name: 'white' },
      black: { id: black.id, name: 'black' },
      remainingMs: MOVE_TIME_LIMIT_MS,
      moves: [],
    });
    expect(chat.at(-1)?.text).toBe('white(백)와 black(흑)의 대결을 시작합니다.');
  });

  it('assigns colours randomly', () => {
    const other = new GameRoom(
      { snapshot: () => undefined, chat: () => undefined },
      { random: () => 0.75 },
    );
    const a = other.connect({ name: 'a' });
    const b = other.connect({ name: 'b' });
    other.takeSeat(a);
    other.takeSeat(b);
    expect(other.snapshot().game?.white.name).toBe('b');
    other.dispose();
  });

  it('rejects taking a seat twice, a third seat, or a seat during a game', () => {
    const a = room.connect({ name: 'a' });
    room.takeSeat(a);
    expect(room.takeSeat(a)).toEqual({ ok: false, error: 'already-seated' });
    const { spectator } = startGameWith(a);
    expect(room.takeSeat(spectator)).toEqual({ ok: false, error: 'game-in-progress' });
  });

  it('lets a waiting player leave the seat', () => {
    const a = room.connect({ name: 'a' });
    room.takeSeat(a);
    expect(room.leaveSeat(a)).toEqual({ ok: true });
    expect(last().seats).toEqual([]);
    expect(room.leaveSeat(a)).toEqual({ ok: false, error: 'not-seated' });
  });

  it('holds a waiting seat briefly after a disconnect (page reload), then frees it', () => {
    const a = room.connect({ name: 'a' });
    room.takeSeat(a);
    room.disconnect(a);
    expect(last().seats).toEqual([{ id: a.id, name: 'a', connected: false }]);
    vi.advanceTimersByTime(SEAT_RECONNECT_GRACE_MS - 1);
    room.connect({ token: a.token });
    vi.advanceTimersByTime(SEAT_RECONNECT_GRACE_MS);
    expect(last().seats).toEqual([{ id: a.id, name: 'a', connected: true }]);

    room.disconnect(a);
    vi.advanceTimersByTime(SEAT_RECONNECT_GRACE_MS);
    expect(last().seats).toEqual([]);
  });

  function startGameWith(first: Player) {
    const second = room.connect({ name: 'second' });
    const spectator = room.connect({ name: 'spectator' });
    room.takeSeat(second);
    return { first, second, spectator };
  }
});

describe('moves (server-authoritative)', () => {
  it('applies legal moves and publishes FEN and SAN', () => {
    const { white, black } = startGame();
    expect(room.move(white, move('e2e4', 0))).toEqual({ ok: true });
    expect(room.move(black, move('e7e5', 1))).toEqual({ ok: true });
    expect(game().moves.map((m) => m.san)).toEqual(['e4', 'e5']);
    expect(game().fen).toBe('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2');
  });

  it('rejects moves from spectators, out of turn, stale or illegal', () => {
    const { white, black, spectator } = startGame();
    expect(room.move(spectator, move('e2e4', 0))).toEqual({ ok: false, error: 'not-a-player' });
    expect(room.move(black, move('e7e5', 0))).toEqual({ ok: false, error: 'not-your-turn' });
    expect(room.move(white, move('e2e4', 3))).toEqual({ ok: false, error: 'stale-move' });
    expect(room.move(white, move('e1e8', 0))).toEqual({ ok: false, error: 'illegal-move' });
    expect(game().moves).toEqual([]);
  });

  it('ends the game on checkmate and frees the table', () => {
    const { white, black } = startGame();
    ['f2f3', 'e7e5', 'g2g4', 'd8h4'].forEach((uci, ply) => {
      expect(room.move(ply % 2 ? black : white, move(uci, ply)).ok).toBe(true);
    });
    expect(game()).toMatchObject({
      status: 'finished',
      outcome: { winner: 'b', reason: 'checkmate' },
      remainingMs: null,
    });
    expect(chat.at(-1)?.text).toBe('체크메이트에 의해 black의 승리로 경기를 종료합니다.');
    expect(room.takeSeat(white)).toEqual({ ok: true });
  });
});

describe('per-move clock', () => {
  it('loses on time when the side to move does not move within the limit', () => {
    startGame();
    vi.advanceTimersByTime(MOVE_TIME_LIMIT_MS);
    expect(game()).toMatchObject({
      status: 'finished',
      outcome: { winner: 'b', reason: 'timeout' },
    });
  });

  it('restarts the limit after each move', () => {
    const { white } = startGame();
    vi.advanceTimersByTime(MOVE_TIME_LIMIT_MS - 1000);
    room.move(white, move('e2e4', 0));
    vi.advanceTimersByTime(MOVE_TIME_LIMIT_MS - 1000);
    expect(game().status).toBe('playing');
    vi.advanceTimersByTime(1000);
    expect(game().outcome).toEqual({ winner: 'w', reason: 'timeout' });
  });

  it('rejects a move that arrives after the deadline even before the timer fires', () => {
    const { white } = startGame();
    vi.setSystemTime(Date.now() + MOVE_TIME_LIMIT_MS);
    expect(room.move(white, move('e2e4', 0))).toEqual({ ok: false, error: 'no-game' });
    expect(game().outcome).toEqual({ winner: 'b', reason: 'timeout' });
  });
});

describe('disconnection during a game (FIDE Online Regulations 11.4)', () => {
  it('keeps the game and the clock running, and lets the player resume', () => {
    const { white } = startGame();
    room.disconnect(white);
    expect(game()).toMatchObject({ status: 'playing', white: { connected: false } });
    vi.advanceTimersByTime(60_000);
    const resumed = room.connect({ token: white.token });
    expect(resumed).toBe(white);
    expect(room.move(resumed, move('e2e4', 0))).toEqual({ ok: true });
  });

  it('legacy: when both players leave, the clock still ends the game and the table is usable again', () => {
    const { white, black } = startGame();
    room.disconnect(white);
    room.disconnect(black);
    vi.advanceTimersByTime(MOVE_TIME_LIMIT_MS);
    expect(game().outcome).toEqual({ winner: 'b', reason: 'timeout' });
    const a = room.connect({ name: 'a' });
    const b = room.connect({ name: 'b' });
    room.takeSeat(a);
    room.takeSeat(b);
    expect(game()).toMatchObject({ id: 2, status: 'playing', white: { name: 'a' } });
  });
});

describe('resignation and draw offers (Online Regulations 5.2 / 5.3)', () => {
  it('resigning loses the game', () => {
    const { white } = startGame();
    expect(room.resign(white)).toEqual({ ok: true });
    expect(game().outcome).toEqual({ winner: 'b', reason: 'resignation' });
  });

  it('spectators cannot resign or offer draws', () => {
    const { spectator } = startGame();
    expect(room.resign(spectator)).toEqual({ ok: false, error: 'not-a-player' });
    expect(room.offerDraw(spectator)).toEqual({ ok: false, error: 'not-a-player' });
  });

  it('an accepted offer draws the game', () => {
    const { white, black } = startGame();
    expect(room.offerDraw(white)).toEqual({ ok: true });
    expect(game().drawOffer).toBe('w');
    expect(room.acceptDraw(white)).toEqual({ ok: false, error: 'no-draw-offer' });
    expect(room.acceptDraw(black)).toEqual({ ok: true });
    expect(game().outcome).toEqual({ winner: null, reason: 'agreement' });
  });

  it('an offer can be declined, and is rejected when the opponent moves', () => {
    const { white, black } = startGame();
    room.offerDraw(black);
    expect(room.declineDraw(white)).toEqual({ ok: true });
    expect(game().drawOffer).toBeNull();

    room.move(white, move('e2e4', 0));
    room.offerDraw(white);
    room.move(black, move('e7e5', 1));
    expect(game().drawOffer).toBeNull();
    expect(chat.at(-1)?.text).toBe('무승부 제안이 거절되었습니다.');
  });

  it('allows one offer per move and treats mutual offers as agreement', () => {
    const { white, black } = startGame();
    room.offerDraw(white);
    expect(room.offerDraw(white)).toEqual({ ok: false, error: 'draw-offer-pending' });
    room.declineDraw(black);
    expect(room.offerDraw(white)).toEqual({ ok: false, error: 'draw-offer-limit' });
    room.move(white, move('e2e4', 0));
    room.move(black, move('e7e5', 1));
    expect(room.offerDraw(white)).toEqual({ ok: true });
    expect(room.offerDraw(black)).toEqual({ ok: true });
    expect(game().outcome).toEqual({ winner: null, reason: 'agreement' });
  });
});

describe('chat and names', () => {
  it('broadcasts messages with the server-side author and rate-limits floods', () => {
    const alice = room.connect({ name: 'alice' });
    for (let i = 0; i < 5; i++) expect(room.chat(alice, `hi ${i}`).ok).toBe(true);
    expect(room.chat(alice, 'spam')).toEqual({ ok: false, error: 'rate-limited' });
    expect(chat.at(-1)).toMatchObject({ kind: 'user', author: { id: alice.id, name: 'alice' } });
    vi.advanceTimersByTime(2000);
    expect(room.chat(alice, 'later').ok).toBe(true);
  });

  it('keeps a bounded history for newcomers', () => {
    for (let i = 0; i < 60; i++) room.connect({ name: `p${i}` });
    expect(room.chatHistory()).toHaveLength(50);
  });

  it('does not allow renaming while playing', () => {
    const { white, spectator } = startGame();
    expect(room.setName(white, 'new')).toEqual({ ok: false, error: 'game-in-progress' });
    expect(room.setName(spectator, 'watcher')).toEqual({ ok: true });
    expect(chat.at(-1)?.text).toBe('spectator님의 이름이 watcher(으)로 바뀌었습니다.');
  });
});
