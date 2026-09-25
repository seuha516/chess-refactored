import {
  ChessGame,
  legalMoves,
  parseFen,
  parseSquare,
  squareName,
  type Position,
  type PromotionPiece,
  type Square,
} from '../../src/shared/chess/index.ts';

export function sq(name: string): Square {
  const square = parseSquare(name);
  if (square === null) throw new Error(`bad square ${name}`);
  return square;
}

/** Legal moves as "e2e4"-style strings (with promotion letter), sorted. */
export function uciMoves(position: Position | string): string[] {
  const pos = typeof position === 'string' ? parseFen(position) : position;
  return legalMoves(pos)
    .map((m) => `${squareName(m.from)}${squareName(m.to)}${m.promotion ?? ''}`)
    .sort();
}

/** Plays moves given as "e2e4" / "e7e8q" and fails loudly on an illegal one. */
export function playAll(game: ChessGame, moves: string[]): void {
  for (const uci of moves) {
    const promotion = (uci[4] ?? null) as PromotionPiece | null;
    const result = game.play(sq(uci.slice(0, 2)), sq(uci.slice(2, 4)), promotion);
    if (!result.ok) throw new Error(`${uci}: ${result.error}`);
  }
}

export const gameFrom = (fen: string): ChessGame => new ChessGame(parseFen(fen));
