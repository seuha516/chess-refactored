import { isLightSquare } from './square.ts';
import { opposite, type Board, type Color } from './types.ts';

interface Material {
  pawns: number;
  knights: number;
  rooks: number;
  queens: number;
  lightBishops: number;
  darkBishops: number;
}

function materialOf(board: Board, color: Color): Material {
  const material: Material = {
    pawns: 0,
    knights: 0,
    rooks: 0,
    queens: 0,
    lightBishops: 0,
    darkBishops: 0,
  };
  board.forEach((piece, square) => {
    if (piece?.color !== color) return;
    switch (piece.type) {
      case 'p':
        material.pawns += 1;
        break;
      case 'n':
        material.knights += 1;
        break;
      case 'b':
        if (isLightSquare(square)) material.lightBishops += 1;
        else material.darkBishops += 1;
        break;
      case 'r':
        material.rooks += 1;
        break;
      case 'q':
        material.queens += 1;
        break;
      case 'k':
        break;
    }
  });
  return material;
}

/**
 * Whether `color` could still checkmate the opponent with *some* series of
 * legal moves, i.e. with the opponent's cooperation. Used for FIDE 6.9 /
 * Online Regulations 4.4 (a player who runs out of time only loses if the
 * opponent can still mate) and, for both colours, for dead positions (5.2.2).
 *
 * The decision is made from material, which covers the standard cases:
 * - a bare king can never mate;
 * - king + one knight mates only if the opponent has a pawn, knight, bishop
 *   or rook that can be used to block its own king;
 * - king + bishops that all stand on one square colour mate only if the
 *   opponent has a pawn, a knight or a bishop on the other colour;
 * - anything else (pawns, rooks, queens, two minor pieces able to cover both
 *   colours) is sufficient.
 * Positions that are dead only because of their pawn structure are not
 * detected (see docs/rules.md).
 */
export function canCheckmate(board: Board, color: Color): boolean {
  const own = materialOf(board, color);
  if (own.pawns > 0 || own.rooks > 0 || own.queens > 0) return true;
  const bishops = own.lightBishops + own.darkBishops;
  if (own.knights === 0 && bishops === 0) return false;

  const other = materialOf(board, opposite(color));
  if (own.knights === 1 && bishops === 0) {
    return other.pawns + other.knights + other.lightBishops + other.darkBishops + other.rooks > 0;
  }
  if (own.knights === 0 && (own.lightBishops === 0 || own.darkBishops === 0)) {
    const otherColourBishops = own.lightBishops > 0 ? other.darkBishops : other.lightBishops;
    return other.pawns + other.knights + otherColourBishops > 0;
  }
  return true;
}

/** Neither side can checkmate by any series of legal moves (FIDE 5.2.2). */
export function isDeadPositionByMaterial(board: Board): boolean {
  return !canCheckmate(board, 'w') && !canCheckmate(board, 'b');
}
