// Perft (performance test) counts the leaf nodes of the legal move tree to a
// fixed depth. The reference numbers are the standard positions published on
// the Chess Programming Wiki (https://www.chessprogramming.org/Perft_Results);
// they are fixed by the rules of chess and exercise castling, en passant,
// promotion and pins far more thoroughly than hand-written cases.
import { describe, expect, it } from 'vitest';
import { applyMove, legalMoves } from '../../src/shared/chess/moves.ts';
import { INITIAL_FEN, parseFen } from '../../src/shared/chess/position.ts';
import type { Position } from '../../src/shared/chess/types.ts';

function perft(position: Position, depth: number): number {
  const moves = legalMoves(position);
  if (depth === 1) return moves.length;
  let nodes = 0;
  for (const move of moves) nodes += perft(applyMove(position, move), depth - 1);
  return nodes;
}

const CASES: { name: string; fen: string; expected: number[] }[] = [
  { name: 'initial position', fen: INITIAL_FEN, expected: [20, 400, 8902, 197281] },
  {
    name: 'Kiwipete (castling, pins, en passant, promotions)',
    fen: 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
    expected: [48, 2039, 97862],
  },
  {
    name: 'position 3 (en passant discovered checks)',
    fen: '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',
    expected: [14, 191, 2812, 43238],
  },
  {
    name: 'position 4 (promotions, castling out of check)',
    fen: 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1',
    expected: [6, 264, 9467],
  },
  {
    name: 'position 5',
    fen: 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8',
    expected: [44, 1486, 62379],
  },
  {
    name: 'position 6',
    fen: 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10',
    expected: [46, 2079, 89890],
  },
];

describe('perft', () => {
  for (const { name, fen, expected } of CASES) {
    expected.forEach((nodes, index) => {
      const depth = index + 1;
      it(`${name}, depth ${depth} = ${nodes}`, () => {
        expect(perft(parseFen(fen), depth)).toBe(nodes);
      });
    });
  }
});
