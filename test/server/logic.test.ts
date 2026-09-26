import { describe, expect, it } from 'vitest';
import { parseSquare } from '../../src/shared/chess/index.ts';
import { TIME_CONTROL } from '../../src/shared/clock.ts';
import { DISCONNECT_FORFEIT_MS, SEAT_GRACE_MS } from '../../src/shared/protocol.ts';
import * as logic from '../../src/server/logic.ts';
import {
  EMPTY_PRESENCE,
  PRESENCE_TTL_MS,
  type PlayerRef,
  type Presence,
  type RoomRecord,
} from '../../src/server/model.ts';
import type { ParsedMove } from '../../src/server/validation.ts';

const alice: PlayerRef = { id: 'alice', name: 'Alice' };
const bob: PlayerRef = { id: 'bob', name: 'Bob' };
const carol: PlayerRef = { id: 'carol', name: 'Carol' };
const T0 = 1_000_000;
/** White's full time at the start: initial time + the first increment. */
const WHITE_START_MS = TIME_CONTROL.initialMs + TIME_CONTROL.incrementMs;

const ctx = (now = T0) => ({ now, random: () => 0.25, newId: () => 'g1' });

function mv(uci: string, ply: number): ParsedMove {
  const from = parseSquare(uci.slice(0, 2));
  const to = parseSquare(uci.slice(2, 4));
  if (from === null || to === null) throw new Error(uci);
  return { from, to, promotion: null, ply };
}

function expectOk(transition: logic.Transition): RoomRecord {
  if (!transition.ok) throw new Error(`unexpected error ${transition.error}`);
  return transition.room;
}

/** Alice (white, random 0.25 -> first seated) vs Bob, started at T0. */
function started(): RoomRecord {
  let room = logic.createRoom('r1', 'Test', T0);
  room = expectOk(logic.takeSeat(room, alice, ctx()));
  return expectOk(logic.takeSeat(room, bob, ctx()));
}

/** Everyone listed is connected, with a heartbeat at `at`. */
const presentAt = (at: number, ...players: string[]): Presence => ({
  connections: Object.fromEntries(
    players.map((id) => [`${id}-socket`, { playerId: id, seenAt: at }]),
  ),
  leftAt: {},
});
const present = (...players: string[]): Presence => presentAt(T0, ...players);

describe('seats and game start', () => {
  it('starts a game with random colours when the second player sits down', () => {
    const room = started();
    expect(room.seats).toEqual([]);
    expect(room.game).toMatchObject({
      id: 'g1',
      white: alice,
      black: bob,
      moves: [],
      outcome: null,
    });
    expect(room.chat.at(-1)?.text).toBe('Alice(백)와 Bob(흑)의 대결을 시작합니다.');
    let other = logic.createRoom('r2', 'Other', T0);
    other = expectOk(logic.takeSeat(other, alice, { ...ctx(), random: () => 0.75 }));
    other = expectOk(logic.takeSeat(other, bob, { ...ctx(), random: () => 0.75 }));
    expect(other.game?.white).toEqual(bob);
  });

  it('rejects taking a seat twice, a third seat, or a seat during a game', () => {
    let room = logic.createRoom('r1', 'Test', T0);
    room = expectOk(logic.takeSeat(room, alice, ctx()));
    expect(logic.takeSeat(room, alice, ctx())).toEqual({ ok: false, error: 'already-seated' });
    room = expectOk(logic.takeSeat(room, bob, ctx()));
    expect(logic.takeSeat(room, carol, ctx())).toEqual({ ok: false, error: 'game-in-progress' });
  });

  it('lets a waiting player leave the seat', () => {
    let room = expectOk(logic.takeSeat(logic.createRoom('r1', 'Test', T0), alice, ctx()));
    room = expectOk(logic.leaveSeat(room, alice, ctx()));
    expect(room.seats).toEqual([]);
    expect(logic.leaveSeat(room, alice, ctx())).toEqual({ ok: false, error: 'not-seated' });
  });
});

describe('moves', () => {
  it('applies legal moves and rejects spectators, wrong turn, stale and illegal moves', () => {
    let room = started();
    expect(logic.move(room, carol, mv('e2e4', 0), ctx())).toEqual({
      ok: false,
      error: 'not-a-player',
    });
    expect(logic.move(room, bob, mv('e7e5', 0), ctx())).toEqual({
      ok: false,
      error: 'not-your-turn',
    });
    expect(logic.move(room, alice, mv('e2e4', 3), ctx())).toEqual({
      ok: false,
      error: 'stale-move',
    });
    expect(logic.move(room, alice, mv('e1e8', 0), ctx())).toEqual({
      ok: false,
      error: 'illegal-move',
    });
    room = expectOk(logic.move(room, alice, mv('e2e4', 0), ctx()));
    room = expectOk(logic.move(room, bob, mv('e7e5', 1), ctx()));
    expect(room.game?.moves).toEqual(['e2e4', 'e7e5']);
    const snapshot = logic.toSnapshot(room, present('alice', 'bob'), T0);
    expect(snapshot.game?.moves.map((m) => m.san)).toEqual(['e4', 'e5']);
    expect(snapshot.game?.fen).toBe(
      'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2',
    );
  });

  it('ends the game on checkmate and frees the table', () => {
    let room = started();
    ['f2f3', 'e7e5', 'g2g4', 'd8h4'].forEach((uci, ply) => {
      room = expectOk(logic.move(room, ply % 2 ? bob : alice, mv(uci, ply), ctx()));
    });
    expect(room.game?.outcome).toEqual({ winner: 'b', reason: 'checkmate' });
    expect(room.game?.clock.running).toBeNull();
    expect(room.chat.at(-1)?.text).toBe('체크메이트에 의해 Bob의 승리로 경기를 종료합니다.');
    expect(logic.takeSeat(room, alice, ctx()).ok).toBe(true);
  });

  it('survives a JSON round trip mid-game (as stored in Redis)', () => {
    let room = started();
    room = expectOk(logic.move(room, alice, mv('e2e4', 0), ctx()));
    const stored = JSON.parse(JSON.stringify(room)) as RoomRecord;
    expect(expectOk(logic.move(stored, bob, mv('e7e5', 1), ctx())).game?.moves).toHaveLength(2);
  });
});

describe('clock (15 min + 10 s)', () => {
  it('keeps unused time and adds the increment before each move', () => {
    let room = started();
    room = expectOk(logic.move(room, alice, mv('e2e4', 0), ctx(T0 + 30_000)));
    const snapshot = logic.toSnapshot(room, present('alice', 'bob'), T0 + 30_000);
    expect(snapshot.game?.clock).toEqual({
      whiteMs: WHITE_START_MS - 30_000,
      blackMs: TIME_CONTROL.initialMs + TIME_CONTROL.incrementMs,
      running: 'b',
    });
  });

  it('records a flag fall when the room is resolved, even without a server timer', () => {
    const room = started();
    const beforeFlag = T0 + WHITE_START_MS - 1;
    expect(logic.resolve(room, presentAt(beforeFlag, 'alice', 'bob'), beforeFlag)).toBe(room);
    const later = T0 + WHITE_START_MS + 5_000;
    const resolved = logic.resolve(room, presentAt(later, 'alice', 'bob'), later);
    expect(resolved.game?.outcome).toEqual({ winner: 'b', reason: 'timeout' });
    // The clock stops at the flag fall, not when it was noticed.
    expect(resolved.game?.clock.remainingMs.w).toBe(0);
    expect(logic.nextDeadline(room, present('alice', 'bob'), T0)).toBe(T0 + WHITE_START_MS);
  });

  it('refuses a move after the flag fall', () => {
    const room = started();
    expect(logic.move(room, alice, mv('e2e4', 0), ctx(T0 + WHITE_START_MS))).toEqual({
      ok: false,
      error: 'no-game',
    });
  });
});

describe('disconnection (FIDE Online Regulations 11.4.2)', () => {
  it('forfeits a player who stays disconnected for 60 seconds', () => {
    const room = started();
    const presence: Presence = {
      connections: { 'bob-socket': { playerId: 'bob', seenAt: T0 + 70_000 } },
      leftAt: { alice: T0 + 10_000 },
    };
    expect(logic.resolve(room, presence, T0 + 10_000 + DISCONNECT_FORFEIT_MS - 1)).toBe(room);
    const resolved = logic.resolve(room, presence, T0 + 10_000 + DISCONNECT_FORFEIT_MS);
    expect(resolved.game?.outcome).toEqual({ winner: 'b', reason: 'disconnection' });
    expect(resolved.chat.at(-1)?.text).toBe('연결 끊김에 의해 Bob의 승리로 경기를 종료합니다.');
  });

  it('treats a connection that stopped sending heartbeats as gone (crashed instance)', () => {
    const room = started();
    const presence: Presence = {
      connections: {
        'alice-socket': { playerId: 'alice', seenAt: T0 },
        'bob-socket': { playerId: 'bob', seenAt: T0 + 200_000 },
      },
      leftAt: {},
    };
    const now = T0 + DISCONNECT_FORFEIT_MS + 1;
    expect(logic.isConnected(presence, 'alice', T0 + PRESENCE_TTL_MS - 1)).toBe(true);
    expect(logic.resolve(room, presence, now).game?.outcome?.reason).toBe('disconnection');
  });

  it('lets a player who reconnects in time continue', () => {
    const room = started();
    const presence: Presence = {
      connections: {
        'alice-socket-2': { playerId: 'alice', seenAt: T0 + 100_000 },
        'bob-socket': { playerId: 'bob', seenAt: T0 + 100_000 },
      },
      leftAt: { alice: T0 + 10_000 },
    };
    expect(logic.resolve(room, presence, T0 + 100_000)).toBe(room);
  });

  it('releases a waiting seat after a short grace period', () => {
    const room = expectOk(logic.takeSeat(logic.createRoom('r1', 'Test', T0), alice, ctx()));
    const presence: Presence = { connections: {}, leftAt: { alice: T0 } };
    expect(logic.resolve(room, presence, T0 + SEAT_GRACE_MS - 1)).toBe(room);
    expect(logic.resolve(room, presence, T0 + SEAT_GRACE_MS).seats).toEqual([]);
    expect(logic.nextDeadline(room, presence, T0)).toBe(T0 + SEAT_GRACE_MS);
  });

  it('reports disconnection times in the snapshot', () => {
    const room = started();
    const presence: Presence = {
      connections: { 'bob-socket': { playerId: 'bob', seenAt: T0 } },
      leftAt: { alice: T0 - 5_000 },
    };
    const snapshot = logic.toSnapshot(room, presence, T0);
    expect(snapshot.game?.white).toMatchObject({ connected: false, disconnectedAt: T0 - 5_000 });
    expect(snapshot.game?.black).toMatchObject({ connected: true, disconnectedAt: null });
    expect(snapshot.online).toBe(1);
  });
});

describe('resignation, draw offers and chat', () => {
  it('scores a resignation', () => {
    const room = expectOk(logic.resign(started(), alice, ctx()));
    expect(room.game?.outcome).toEqual({ winner: 'b', reason: 'resignation' });
    expect(logic.resign(room, alice, ctx())).toEqual({ ok: false, error: 'no-game' });
  });

  it('handles offers, rejections by moving, one offer per move and mutual offers', () => {
    let room = started();
    room = expectOk(logic.offerDraw(room, alice, ctx()));
    expect(logic.offerDraw(room, alice, ctx())).toEqual({ ok: false, error: 'draw-offer-pending' });
    expect(logic.acceptDraw(room, alice, ctx())).toEqual({ ok: false, error: 'no-draw-offer' });
    room = expectOk(logic.declineDraw(room, bob, ctx()));
    expect(logic.offerDraw(room, alice, ctx())).toEqual({ ok: false, error: 'draw-offer-limit' });
    room = expectOk(logic.move(room, alice, mv('e2e4', 0), ctx()));
    room = expectOk(logic.offerDraw(room, alice, ctx()));
    room = expectOk(logic.move(room, bob, mv('e7e5', 1), ctx()));
    expect(room.game?.drawOffer).toBeNull();
    expect(room.chat.at(-1)?.text).toBe('무승부 제안이 거절되었습니다.');
    room = expectOk(logic.offerDraw(room, alice, ctx()));
    room = expectOk(logic.offerDraw(room, bob, ctx()));
    expect(room.game?.outcome).toEqual({ winner: null, reason: 'agreement' });
  });

  it('keeps a bounded chat history with server-set authors', () => {
    let room = logic.createRoom('r1', 'Test', T0);
    for (let i = 0; i < 60; i++) room = expectOk(logic.chat(room, carol, `hi ${String(i)}`, ctx()));
    expect(room.chat).toHaveLength(50);
    expect(room.chat.at(-1)).toMatchObject({ id: 60, kind: 'user', author: carol, text: 'hi 59' });
  });

  it('announces players entering, but not reconnects', () => {
    const room = logic.createRoom('r1', 'Test', T0);
    expect(logic.announceJoin(room, carol, EMPTY_PRESENCE, T0)?.chat.at(-1)?.text).toBe(
      'Carol님이 입장하였습니다.',
    );
    expect(logic.announceJoin(room, carol, present('carol'), T0)).toBeNull();
    expect(
      logic.announceJoin(room, carol, { connections: {}, leftAt: { carol: T0 - 5_000 } }, T0),
    ).toBeNull();
  });
});

describe('lobby summary', () => {
  it('lists waiting players or the two players of a running game', () => {
    const waiting = expectOk(logic.takeSeat(logic.createRoom('r1', 'Test', T0), alice, ctx()));
    expect(logic.toSummary(waiting)).toEqual({
      id: 'r1',
      name: 'Test',
      status: 'waiting',
      players: ['Alice'],
      createdAt: T0,
    });
    expect(logic.toSummary(started())).toMatchObject({
      status: 'playing',
      players: ['Alice', 'Bob'],
    });
  });
});
