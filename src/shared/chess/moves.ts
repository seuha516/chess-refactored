import {
  BISHOP_DIRECTIONS,
  KING_STEPS,
  KNIGHT_JUMPS,
  ROOK_DIRECTIONS,
  isSquareAttacked,
  offset,
  pawnDirection,
  type Direction,
} from './attacks.ts';
import { findKing } from './position.ts';
import { fileOf, makeSquare, rankOf } from './square.ts';
import {
  opposite,
  type CastlingRights,
  type Color,
  type Move,
  type MoveKind,
  type Piece,
  type PieceType,
  type Position,
  type PromotionPiece,
  type Square,
} from './types.ts';

export const PROMOTION_PIECES: readonly PromotionPiece[] = ['q', 'r', 'b', 'n'];

// Original squares, from white's point of view (a1 = 0).
const WHITE_KING_HOME = 4; // e1
const BLACK_KING_HOME = 60; // e8
const ROOK_HOMES = {
  whiteKingside: 7, // h1
  whiteQueenside: 0, // a1
  blackKingside: 63, // h8
  blackQueenside: 56, // a8
} as const satisfies Record<keyof CastlingRights, Square>;

export function isInCheck(position: Position, color: Color = position.turn): boolean {
  return isSquareAttacked(position.board, findKing(position.board, color), opposite(color));
}

/**
 * Moves that follow each piece's movement rules (FIDE 3.2–3.8) without yet
 * checking whether the mover's own king is left in check (3.9.2).
 */
export function pseudoLegalMoves(position: Position): Move[] {
  const moves: Move[] = [];
  position.board.forEach((piece, from) => {
    if (piece?.color !== position.turn) return;
    switch (piece.type) {
      case 'p':
        addPawnMoves(position, from, moves);
        break;
      case 'n':
        addSteps(position, from, piece, KNIGHT_JUMPS, moves);
        break;
      case 'b':
        addSlides(position, from, piece, BISHOP_DIRECTIONS, moves);
        break;
      case 'r':
        addSlides(position, from, piece, ROOK_DIRECTIONS, moves);
        break;
      case 'q':
        addSlides(position, from, piece, KING_STEPS, moves);
        break;
      case 'k':
        addSteps(position, from, piece, KING_STEPS, moves);
        addCastling(position, from, moves);
        break;
    }
  });
  return moves;
}

/** All legal moves for the side to move (FIDE 3.10.1). */
export function legalMoves(position: Position): Move[] {
  return pseudoLegalMoves(position).filter((move) => !leavesKingInCheck(position, move));
}

export function hasLegalMove(position: Position): boolean {
  return pseudoLegalMoves(position).some((move) => !leavesKingInCheck(position, move));
}

export function legalMovesFrom(position: Position, from: Square): Move[] {
  return legalMoves(position).filter((move) => move.from === from);
}

/**
 * Looks up the legal move matching a request from a client. A pawn move to
 * the last rank requires `promotion` (FIDE 3.7.3.3); it is ignored otherwise.
 */
export function findLegalMove(
  position: Position,
  from: Square,
  to: Square,
  promotion?: PromotionPiece | null,
): Move | null {
  const candidates = legalMovesFrom(position, from).filter((move) => move.to === to);
  if (candidates.length === 0) return null;
  const first = candidates[0];
  if (first?.promotion === null) return first;
  return candidates.find((move) => move.promotion === promotion) ?? null;
}

function leavesKingInCheck(position: Position, move: Move): boolean {
  return isInCheck(applyMove(position, move), move.color);
}

/** Plays a move that is assumed to be (pseudo-)legal and returns the new position. */
export function applyMove(position: Position, move: Move): Position {
  const board = position.board.slice();
  const moving = board[move.from];
  if (!moving) throw new Error('applyMove: no piece on the source square');

  board[move.from] = null;
  board[move.to] = move.promotion ? { color: move.color, type: move.promotion } : moving;

  if (move.kind === 'en-passant') {
    // The captured pawn stands beside the moving pawn, not on the target square.
    const captured = makeSquare(fileOf(move.to), rankOf(move.from));
    if (captured !== null) board[captured] = null;
  } else if (move.kind === 'castle-kingside' || move.kind === 'castle-queenside') {
    const rank = rankOf(move.from);
    const [rookFrom, rookTo] = move.kind === 'castle-kingside' ? [7, 5] : [0, 3];
    board[rank * 8 + rookTo] = board[rank * 8 + rookFrom] ?? null;
    board[rank * 8 + rookFrom] = null;
  }

  const resetsClock = move.piece === 'p' || move.captured !== null;
  return {
    board,
    turn: opposite(position.turn),
    castling: updateCastlingRights(position.castling, move),
    enPassant: move.kind === 'double-push' ? (move.from + move.to) / 2 : null,
    halfmoveClock: resetsClock ? 0 : position.halfmoveClock + 1,
    fullmoveNumber: position.fullmoveNumber + (position.turn === 'b' ? 1 : 0),
  };
}

/**
 * FIDE 3.8.2.1: the right to castle is lost once the king or that rook has
 * moved. A rook captured on its original square can never castle either.
 * (The legacy client only tracked its own king/rook moves by column, so a
 * captured rook still allowed castling and any h-file rook move lost it.)
 */
function updateCastlingRights(rights: CastlingRights, move: Move): CastlingRights {
  const next = { ...rights };
  if (move.piece === 'k') {
    if (move.color === 'w') next.whiteKingside = next.whiteQueenside = false;
    else next.blackKingside = next.blackQueenside = false;
  }
  for (const key of Object.keys(ROOK_HOMES) as (keyof CastlingRights)[]) {
    if (move.from === ROOK_HOMES[key] || move.to === ROOK_HOMES[key]) next[key] = false;
  }
  return next;
}

function makeMove(
  position: Position,
  from: Square,
  to: Square,
  piece: PieceType,
  kind: MoveKind = 'normal',
  promotion: PromotionPiece | null = null,
): Move {
  const captured = kind === 'en-passant' ? 'p' : (position.board[to]?.type ?? null);
  return { from, to, color: position.turn, piece, captured, promotion, kind };
}

function addSteps(
  position: Position,
  from: Square,
  piece: Piece,
  steps: readonly Direction[],
  moves: Move[],
): void {
  for (const step of steps) {
    const to = offset(from, step);
    if (to === null || position.board[to]?.color === piece.color) continue;
    moves.push(makeMove(position, from, to, piece.type));
  }
}

function addSlides(
  position: Position,
  from: Square,
  piece: Piece,
  directions: readonly Direction[],
  moves: Move[],
): void {
  for (const direction of directions) {
    for (let to = offset(from, direction); to !== null; to = offset(to, direction)) {
      const occupant = position.board[to];
      if (occupant?.color === piece.color) break;
      moves.push(makeMove(position, from, to, piece.type));
      if (occupant) break;
    }
  }
}

function addPawnMoves(position: Position, from: Square, moves: Move[]): void {
  const color = position.turn;
  const dir = pawnDirection(color);
  const startRank = color === 'w' ? 1 : 6;
  const lastRank = color === 'w' ? 7 : 0;

  const push = (to: Square, kind: MoveKind = 'normal') => {
    if (rankOf(to) === lastRank) {
      for (const promotion of PROMOTION_PIECES) {
        moves.push(makeMove(position, from, to, 'p', kind, promotion));
      }
    } else {
      moves.push(makeMove(position, from, to, 'p', kind));
    }
  };

  // FIDE 3.7.1 / 3.7.2: one square forward, or two from the starting rank.
  const one = offset(from, [0, dir]);
  if (one !== null && !position.board[one]) {
    push(one);
    const two = offset(one, [0, dir]);
    if (rankOf(from) === startRank && two !== null && !position.board[two]) {
      push(two, 'double-push');
    }
  }

  // FIDE 3.7.3: diagonal captures, including en passant (3.7.3.1). The en
  // passant square exists only right after the opponent's double step, and
  // the captured pawn is always the one that made it (the legacy client
  // captured whatever pawn stood behind the target square).
  for (const df of [-1, 1]) {
    const to = offset(from, [df, dir]);
    if (to === null) continue;
    const target = position.board[to];
    if (target && target.color !== color) push(to);
    else if (!target && to === position.enPassant) push(to, 'en-passant');
  }
}

function addCastling(position: Position, from: Square, moves: Move[]): void {
  const color = position.turn;
  const home = color === 'w' ? WHITE_KING_HOME : BLACK_KING_HOME;
  if (from !== home) return;
  const enemy = opposite(color);
  const board = position.board;
  const sides = [
    {
      right: color === 'w' ? position.castling.whiteKingside : position.castling.blackKingside,
      rook: home + 3,
      between: [home + 1, home + 2],
      kingPath: [home, home + 1, home + 2],
      kind: 'castle-kingside' as const,
    },
    {
      right: color === 'w' ? position.castling.whiteQueenside : position.castling.blackQueenside,
      rook: home - 4,
      between: [home - 1, home - 2, home - 3],
      kingPath: [home, home - 1, home - 2],
      kind: 'castle-queenside' as const,
    },
  ];
  for (const side of sides) {
    const rook = board[side.rook];
    if (!side.right || rook?.type !== 'r' || rook.color !== color) continue;
    // 3.8.2.2: no piece between king and rook, and the king's square, the
    // square it crosses and its destination are not attacked.
    if (side.between.some((square) => board[square])) continue;
    if (side.kingPath.some((square) => isSquareAttacked(board, square, enemy))) continue;
    const to = side.kingPath[2];
    if (to !== undefined) moves.push(makeMove(position, from, to, 'k', side.kind));
  }
}
