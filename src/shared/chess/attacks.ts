import { fileOf, makeSquare, rankOf } from './square.ts';
import type { Board, Color, Square } from './types.ts';

export type Direction = readonly [fileStep: number, rankStep: number];

export const ROOK_DIRECTIONS: readonly Direction[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
export const BISHOP_DIRECTIONS: readonly Direction[] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
export const KING_STEPS: readonly Direction[] = [...ROOK_DIRECTIONS, ...BISHOP_DIRECTIONS];
export const KNIGHT_JUMPS: readonly Direction[] = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];

export const offset = (square: Square, [df, dr]: Direction): Square | null =>
  makeSquare(fileOf(square) + df, rankOf(square) + dr);

/** Rank direction in which pawns of `color` advance. */
export const pawnDirection = (color: Color): 1 | -1 => (color === 'w' ? 1 : -1);

/**
 * Whether `square` is attacked by any piece of `by` (FIDE 3.9.1): pieces
 * attack a square even if moving there would be illegal for them.
 *
 * The legacy client answered this question by asking its move validator
 * whether each enemy piece could *move* to the square. That treats pawn
 * pushes as attacks and misses pawn attacks on empty squares, so castling
 * through or onto a pawn-attacked square was allowed. This function checks
 * attack patterns directly, outward from the target square.
 */
export function isSquareAttacked(board: Board, square: Square, by: Color): boolean {
  // A pawn of `by` attacks diagonally forward, so look diagonally backwards.
  for (const df of [-1, 1]) {
    const from = offset(square, [df, -pawnDirection(by)]);
    const piece = from === null ? null : board[from];
    if (piece?.color === by && piece.type === 'p') return true;
  }
  for (const jump of KNIGHT_JUMPS) {
    const from = offset(square, jump);
    const piece = from === null ? null : board[from];
    if (piece?.color === by && piece.type === 'n') return true;
  }
  for (const step of KING_STEPS) {
    const from = offset(square, step);
    const piece = from === null ? null : board[from];
    if (piece?.color === by && piece.type === 'k') return true;
  }
  return (
    rayHits(board, square, by, ROOK_DIRECTIONS, 'r') ||
    rayHits(board, square, by, BISHOP_DIRECTIONS, 'b')
  );
}

function rayHits(
  board: Board,
  square: Square,
  by: Color,
  directions: readonly Direction[],
  slider: 'r' | 'b',
): boolean {
  for (const direction of directions) {
    for (let at = offset(square, direction); at !== null; at = offset(at, direction)) {
      const piece = board[at];
      if (!piece) continue;
      if (piece.color === by && (piece.type === slider || piece.type === 'q')) return true;
      break;
    }
  }
  return false;
}
