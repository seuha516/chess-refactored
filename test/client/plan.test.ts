import { describe, expect, it } from 'vitest';
import { parseFen, parseSquare, type Board } from '../../src/shared/chess/index.ts';
import { impactOf, planMove } from '../../src/client/scene/plan.ts';

const sq = (name: string) => parseSquare(name) ?? -1;
const board = (fen: string): Board => parseFen(fen).board;
const move = (uci: string) => ({ from: sq(uci.slice(0, 2)), to: sq(uci.slice(2, 4)) });

describe('planMove', () => {
  it('describes a quiet move', () => {
    const plan = planMove(
      board('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'),
      board('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'),
      move('e2e4'),
    );
    expect(plan).toEqual({
      from: sq('e2'),
      to: sq('e4'),
      piece: { color: 'w', type: 'p' },
      capture: null,
      rook: null,
      promotion: null,
    });
  });

  it('finds the taken piece, also en passant', () => {
    const capture = planMove(
      board('4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1'),
      board('4k3/8/8/3P4/8/8/8/4K3 b - - 0 1'),
      move('e4d5'),
    );
    expect(capture?.capture).toEqual({ square: sq('d5'), piece: { color: 'b', type: 'p' } });
    const passant = planMove(
      board('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1'),
      board('4k3/8/3P4/8/8/8/8/4K3 b - - 0 1'),
      move('e5d6'),
    );
    expect(passant?.capture).toEqual({ square: sq('d5'), piece: { color: 'b', type: 'p' } });
  });

  it('moves the rook with a castling king', () => {
    const plan = planMove(
      board('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1'),
      board('4k3/8/8/8/8/8/8/R4RK1 b - - 1 1'),
      move('e1g1'),
    );
    expect(plan?.rook).toEqual({ from: sq('h1'), to: sq('f1') });
    const long = planMove(
      board('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1'),
      board('4k3/8/8/8/8/8/8/2KR3R b - - 1 1'),
      move('e1c1'),
    );
    expect(long?.rook).toEqual({ from: sq('a1'), to: sq('d1') });
  });

  it('notices a promotion', () => {
    const plan = planMove(
      board('1r2k3/P7/8/8/8/8/8/4K3 w - - 0 1'),
      board('1N2k3/8/8/8/8/8/8/4K3 b - - 0 1'),
      move('a7b8'),
    );
    expect(plan?.promotion).toBe('n');
    expect(plan?.capture?.piece).toEqual({ color: 'b', type: 'r' });
  });

  it('refuses boards that do not follow from the move', () => {
    const start = board('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(planMove(start, start, move('e2e4'))).toBeNull();
    expect(
      planMove(
        start,
        board('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'),
        move('e7e5'),
      ),
    ).toBeNull();
  });
});

describe('impactOf', () => {
  it('escalates from a quiet move to a mate', () => {
    const quiet = planMove(
      board('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1'),
      board('4k3/8/8/8/4P3/8/8/4K3 b - - 0 1'),
      move('e2e4'),
    );
    const queen = planMove(
      board('4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1'),
      board('4k3/8/8/3P4/8/8/8/4K3 b - - 0 1'),
      move('e4d5'),
    );
    if (!quiet || !queen) throw new Error('plans expected');
    const values = [
      impactOf(quiet, false, false),
      impactOf(queen, false, false),
      impactOf(quiet, true, false),
      impactOf(quiet, false, true),
    ];
    expect(values[0]).toBeLessThan(values[1] ?? 0);
    expect(values[1]).toBeGreaterThan(0.5);
    expect(values[3]).toBe(1);
  });
});
