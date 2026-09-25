// Differential test: plays seeded random games and compares every position
// with chess.js, an independent and widely used implementation. chess.js is
// only an oracle for cross-checking — where the two disagree, the FIDE rules
// decide (see docs/rules.md) — and it is a dev-only dependency.
//
// The default sample keeps `npm test` fast. For a deeper run, set
// DIFFERENTIAL_GAMES (games per start position), e.g. DIFFERENTIAL_GAMES=25.
import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import {
  ChessGame,
  isDeadPositionByMaterial,
  legalMoves,
  parseFen,
  repetitionKey,
  squareName,
  toFen,
  toSan,
  type Move,
} from '../../src/shared/chess/index.ts';

/** Small deterministic PRNG so failures are reproducible from the seed. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GAMES_PER_START = Number(process.env.DIFFERENTIAL_GAMES ?? 4);

const uci = (move: Move) => `${squareName(move.from)}${squareName(move.to)}${move.promotion ?? ''}`;

const START_FENS = [
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
  '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',
  'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1',
  // Sparse endgames reach mates, stalemates and dead positions more often.
  '4k3/8/8/8/8/8/4P3/4K2R w K - 0 1',
  '8/5k2/8/8/2b5/8/3N4/4K3 w - - 0 1',
  '8/1P4k1/8/8/8/8/6p1/K7 w - - 0 1',
];

interface Stats {
  positions: number;
  checkmates: number;
  stalemates: number;
  deadPositions: number;
  repetitions: number;
}

function playRandomGame(startFen: string, seed: number, stats: Stats): void {
  const random = mulberry32(seed);
  const game = new ChessGame(parseFen(startFen));
  const oracle = new Chess(startFen);

  for (let ply = 0; ply < 300; ply++) {
    const position = game.position;
    const context = `seed ${seed}, ply ${ply}, fen ${toFen(position)}`;
    stats.positions += 1;

    const ours = legalMoves(position);
    const theirs = oracle.moves({ verbose: true });
    expect(ours.map(uci).sort(), context).toEqual(theirs.map((m) => m.lan).sort());
    expect(ours.map((m) => toSan(position, m)).sort(), context).toEqual(
      theirs.map((m) => m.san).sort(),
    );
    // Placement, side to move, castling rights, en passant (when capturable).
    expect(repetitionKey(position), context).toBe(oracle.fen().split(' ').slice(0, 4).join(' '));
    expect(toFen(position).split(' ').slice(4), context).toEqual(oracle.fen().split(' ').slice(4));
    expect(game.isCheck(), context).toBe(oracle.isCheck());
    expect(isDeadPositionByMaterial(position.board), context).toBe(oracle.isInsufficientMaterial());

    const outcome = game.outcome;
    if (outcome) {
      switch (outcome.reason) {
        case 'checkmate':
          stats.checkmates += 1;
          expect(oracle.isCheckmate(), context).toBe(true);
          break;
        case 'stalemate':
          stats.stalemates += 1;
          expect(oracle.isStalemate(), context).toBe(true);
          break;
        case 'dead-position':
          stats.deadPositions += 1;
          expect(oracle.isInsufficientMaterial(), context).toBe(true);
          break;
        case 'threefold-repetition':
          stats.repetitions += 1;
          expect(oracle.isThreefoldRepetition(), context).toBe(true);
          break;
        case 'fifty-move-rule':
          expect(oracle.isDrawByFiftyMoves(), context).toBe(true);
          break;
        default:
          throw new Error(`unexpected automatic outcome ${outcome.reason}`);
      }
      return;
    }
    expect(oracle.isGameOver(), context).toBe(false);

    const move = ours[Math.floor(random() * ours.length)];
    if (!move) throw new Error(`no legal move although the game is not over (${context})`);
    game.play(move.from, move.to, move.promotion);
    oracle.move(uci(move));
  }
}

describe('differential test against chess.js', () => {
  it('agrees on legal moves, SAN, FEN and game end in seeded random games', () => {
    const stats: Stats = {
      positions: 0,
      checkmates: 0,
      stalemates: 0,
      deadPositions: 0,
      repetitions: 0,
    };
    START_FENS.forEach((fen, index) => {
      for (let game = 0; game < GAMES_PER_START; game++)
        playRandomGame(fen, index * 1000 + game, stats);
    });
    // Make sure the sample actually reached the interesting endings.
    expect(stats.positions).toBeGreaterThan(GAMES_PER_START * 100);
    expect(stats.checkmates + stats.stalemates).toBeGreaterThan(0);
    expect(stats.deadPositions).toBeGreaterThan(0);
  }, 600_000);
});
