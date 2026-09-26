import { describe, expect, it } from 'vitest';
import { INITIAL_FEN, parseSquare } from '../../src/shared/chess/index.ts';
import type { GameSnapshot, PlayerInfo, RoomSnapshot } from '../../src/shared/protocol.ts';
import {
  buildView,
  formatClock,
  lobbyRows,
  moveRowText,
  type ClientState,
} from '../../src/client/view-model.ts';

const alice: PlayerInfo = { id: 'alice', name: 'Alice', connected: true, disconnectedAt: null };
const bob: PlayerInfo = { id: 'bob', name: 'Bob', connected: true, disconnectedAt: null };
const AT = 5_000_000;

function game(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
  return {
    id: 'g1',
    white: alice,
    black: bob,
    fen: INITIAL_FEN,
    moves: [],
    status: 'playing',
    outcome: null,
    clock: { whiteMs: 910_000, blackMs: 900_000, running: 'w' },
    timeControl: { initialMs: 900_000, incrementMs: 10_000 },
    drawOffer: null,
    ...overrides,
  };
}

function state(me: string | null, room: Partial<RoomSnapshot>, extra: Partial<ClientState> = {}) {
  const snapshot: RoomSnapshot = {
    id: 'r1',
    name: 'Test',
    seats: [],
    game: null,
    online: 2,
    chat: [],
    at: AT,
    ...room,
  };
  const base: ClientState = {
    session: me ? { token: 'x'.repeat(16), playerId: me, name: me } : null,
    room: snapshot,
    selected: null,
    pending: false,
    flipped: false,
    dismissedResult: null,
  };
  return { ...base, ...extra };
}

const sq = (name: string) => parseSquare(name) ?? -1;

describe('buildView', () => {
  it('invites a visitor to join the player who is waiting', () => {
    const view = buildView(state('carol', { seats: [alice] }));
    // The free seat faces the viewer.
    expect(view.seats).toEqual({
      top: {
        player: { text: 'Alice', connected: true, me: false, forfeitInMs: null },
        color: null,
      },
      bottom: { player: null, color: null },
    });
    expect(view.controls).toMatchObject({ seatTake: true, seatLeave: false, draw: 'hidden' });
    expect(view.status).toBe('Alice님이 기다리고 있어요');
    expect(view.invitation).toMatchObject({ kind: 'join', title: 'Alice님이 기다리고 있어요' });
    expect(view.clock).toBeNull();
    expect(buildView(state('carol', {})).invitation?.kind).toBe('empty');
  });

  it('lets a seated player wait for a friend, or stand up', () => {
    const view = buildView(state('alice', { seats: [alice] }));
    expect(view.controls).toMatchObject({ seatTake: false, seatLeave: true });
    expect(view.seats.bottom).toMatchObject({ player: { text: 'Alice', me: true } });
    expect(view.seats.top.player).toBeNull();
    expect(view.status).toBe('상대를 기다리는 중');
    expect(view.invitation?.kind).toBe('waiting');
  });

  it('shows a full table to a spectator without a join button', () => {
    const view = buildView(state('carol', { seats: [alice, bob] }));
    expect(view.seats.bottom).toMatchObject({ player: { text: 'Alice' } });
    expect(view.seats.top).toMatchObject({ player: { text: 'Bob' } });
    expect(view.controls.seatTake).toBe(false);
  });

  it('seats each player on their colour side, following the board orientation', () => {
    const black = buildView(state('bob', { game: game() }));
    expect(black.seats.bottom).toMatchObject({ player: { text: 'Bob', me: true }, color: 'b' });
    expect(black.seats.top).toMatchObject({ player: { text: 'Alice', me: false }, color: 'w' });
    const flipped = buildView(state('carol', { game: game() }, { flipped: true }));
    expect(flipped.seats.bottom.color).toBe('b');
  });

  it('only offers moves to the player whose turn it is', () => {
    const white = buildView(state('alice', { game: game() }));
    expect(white.myColor).toBe('w');
    expect(white.legalMoves).toHaveLength(20);
    expect(white.status).toBe('내 차례');
    const black = buildView(state('bob', { game: game() }));
    expect(black.legalMoves).toHaveLength(0);
    expect(black.status).toBe('상대 차례');
    const spectator = buildView(state('carol', { game: game() }));
    expect(spectator.status).toBe('Alice(백) 차례');
    expect(spectator.invitation).toBeNull();
    expect(spectator.legalMoves).toHaveLength(0);
    expect(spectator.controls).toMatchObject({ resign: false, draw: 'hidden', seatTake: false });
  });

  it('does not allow moving while a move request is pending', () => {
    expect(buildView(state('alice', { game: game() }, { pending: true })).legalMoves).toEqual([]);
  });

  it('shows the legal targets of the selected piece', () => {
    const view = buildView(state('alice', { game: game() }, { selected: sq('g1') }));
    expect([...view.board.targets].sort()).toEqual([sq('f3'), sq('h3')].sort());
  });

  it('orients the board for each player and lets anyone flip it', () => {
    expect(buildView(state('bob', { game: game() })).board.orientation).toBe('b');
    expect(buildView(state('carol', { game: game() })).board.orientation).toBe('w');
    expect(buildView(state('carol', { game: game() }, { flipped: true })).board.orientation).toBe(
      'b',
    );
  });

  it('highlights the last move and a king in check', () => {
    const view = buildView(
      state('alice', {
        game: game({
          fen: 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3',
          moves: [
            { san: 'f3', uci: 'f2f3', color: 'w', captured: null },
            { san: 'e5', uci: 'e7e5', color: 'b', captured: null },
            { san: 'g4', uci: 'g2g4', color: 'w', captured: null },
            { san: 'Qh4#', uci: 'd8h4', color: 'b', captured: null },
          ],
          status: 'finished',
          outcome: { winner: 'b', reason: 'checkmate' },
          clock: { whiteMs: 800_000, blackMs: 850_000, running: null },
        }),
      }),
    );
    expect(view.board.lastMove).toEqual({ from: sq('d8'), to: sq('h4') });
    expect(view.board.check).toBe(sq('e1'));
    expect(view.moveRows.map(moveRowText)).toEqual(['1. f3 e5', '2. g4 Qh4#']);
    expect(view.moveRows[1]).toEqual({ number: 2, white: 'g4', black: 'Qh4#' });
    expect(view.result).toEqual({ title: '패배', reason: '체크메이트', tone: 'loss' });
  });

  it('describes results for spectators and draws', () => {
    const finished = (winner: 'w' | 'b' | null) =>
      game({
        status: 'finished',
        outcome: { winner, reason: winner ? 'timeout' : 'agreement' },
        clock: { whiteMs: 1, blackMs: 2, running: null },
      });
    expect(buildView(state('carol', { game: finished('w') })).result).toEqual({
      title: '백 승리',
      reason: '시간 초과',
      tone: 'neutral',
    });
    expect(buildView(state('bob', { game: finished(null) })).result?.title).toBe('무승부');
    // The referee line leads with the result while it is shown.
    expect(buildView(state('carol', { game: finished('w') })).status).toBe('백 승리 · 시간 초과');
    // The invitation waits until the result is put away.
    expect(buildView(state('carol', { game: finished('w') })).invitation).toBeNull();
    const dismissed = buildView(state('carol', { game: finished('w') }, { dismissedResult: 'g1' }));
    expect(dismissed.status).toBe('아직 아무도 앉지 않았어요');
    expect(dismissed.invitation?.kind).toBe('empty');
    expect(
      buildView(state('bob', { game: finished('b') }, { dismissedResult: 'g1' })).result,
    ).toBeNull();
    // The players stay at the table while the result is shown, until someone sits down again.
    const shown = buildView(state('carol', { game: finished('w') }));
    expect(shown.seats.bottom).toMatchObject({ player: { text: 'Alice' }, color: 'w' });
    expect(shown.clock).toBeNull();
    expect(dismissed.seats.bottom.player).toBeNull();
    const again = buildView(state('carol', { game: finished('w'), seats: [bob] }));
    expect(again.seats.top).toMatchObject({ player: { text: 'Bob' }, color: null });
  });

  it('lists captured pieces by colour in the original order', () => {
    const view = buildView(
      state('alice', {
        game: game({
          moves: [
            { san: 'x', uci: 'a1a2', color: 'w', captured: 'q' },
            { san: 'x', uci: 'a1a2', color: 'w', captured: 'p' },
            { san: 'x', uci: 'a1a2', color: 'b', captured: 'n' },
          ],
        }),
      }),
    );
    expect(view.captured).toEqual({ w: ['n'], b: ['p', 'q'] });
    // White took a queen and a pawn (10), black a knight (3).
    expect(view.material).toEqual({ w: 7, b: 0 });
  });

  it('shows the draw controls for each side of an offer', () => {
    const offered = game({ drawOffer: 'w' });
    expect(buildView(state('alice', { game: offered })).controls.draw).toBe('offered');
    expect(buildView(state('bob', { game: offered })).controls.draw).toBe('respond');
    expect(buildView(state('bob', { game: offered })).notes).toEqual([
      '상대가 무승부를 제안했어요.',
    ]);
    expect(buildView(state('carol', { game: offered })).notes).toEqual([
      '백이 무승부를 제안했어요.',
    ]);
    expect(buildView(state('carol', { game: game() })).notes).toEqual([]);
  });
});

describe('formatClock', () => {
  it('formats minutes and seconds, rounding up', () => {
    expect(formatClock(910_000)).toBe('15:10');
    expect(formatClock(179_001)).toBe('3:00');
    expect(formatClock(179_000)).toBe('2:59');
    expect(formatClock(10_000)).toBe('0:10');
  });

  it('shows tenths of a second below 10 seconds', () => {
    expect(formatClock(9_999)).toBe('0:10');
    expect(formatClock(9_900)).toBe('0:09.9');
    expect(formatClock(9_400)).toBe('0:09.4');
    expect(formatClock(9_401)).toBe('0:09.5');
    expect(formatClock(50)).toBe('0:00.1');
    expect(formatClock(0)).toBe('0:00.0');
    expect(formatClock(-50)).toBe('0:00.0');
  });
});

describe('time rules in the view', () => {
  it('counts down a disconnected player and asks for a sync when due', () => {
    const away = game({ black: { ...bob, connected: false, disconnectedAt: AT - 20_000 } });
    const view = buildView(state('alice', { game: away }), AT);
    expect(view.notes).toEqual([
      'Bob님의 연결이 끊겼어요.',
      '1분 안에 돌아오지 않으면 기권패예요.',
    ]);
    // Both gone: named together, the warning once.
    const both = game({
      white: { ...alice, connected: false, disconnectedAt: AT - 5_000 },
      black: { ...bob, connected: false, disconnectedAt: AT - 20_000 },
    });
    expect(buildView(state('carol', { game: both }), AT).notes).toEqual([
      'Alice님과 Bob님의 연결이 끊겼어요.',
      '1분 안에 돌아오지 않으면 기권패예요.',
    ]);
    // The seconds left count down on the seat, not in the (announced) status line.
    expect(view.seats.top.player?.forfeitInMs).toBe(40_000);
    expect(view.syncAt).toBe(AT + 40_000);
  });

  it('asks for a sync when the running clock runs out', () => {
    const view = buildView(state('alice', { game: game() }), AT);
    expect(view.syncAt).toBe(AT + 910_000);
    expect(buildView(state('alice', { game: null }), AT).syncAt).toBeNull();
  });
});

describe('lobbyRows', () => {
  it('describes waiting and running rooms', () => {
    expect(
      lobbyRows(
        {
          rooms: [
            {
              id: 'a',
              name: 'A',
              status: 'waiting',
              players: ['Alice'],
              playerIds: ['alice'],
              createdAt: 1,
            },
            { id: 'b', name: 'B', status: 'waiting', players: [], playerIds: [], createdAt: 1 },
            {
              id: 'c',
              name: 'C',
              status: 'playing',
              players: ['Alice', 'Bob'],
              playerIds: ['alice', 'bob'],
              createdAt: 1,
            },
          ],
        },
        'bob',
      ).map(({ status, seats, mine }) => ({ status, seats, mine })),
    ).toEqual([
      { status: '1명 대기', seats: [null, 'Alice'], mine: false },
      { status: '빈 테이블', seats: [null, null], mine: false },
      // White sits at the near edge.
      { status: '대국 중', seats: ['Bob', 'Alice'], mine: true },
    ]);
  });
});
