import { applyMove, hasLegalMove, isInCheck, legalMoves } from './moves.ts';
import { fileOf, rankOf, squareName } from './square.ts';
import type { Move, Position } from './types.ts';

/**
 * Standard Algebraic Notation for a legal move in `position`, including the
 * check (+) and checkmate (#) suffixes.
 */
export function toSan(position: Position, move: Move): string {
  return sanBody(position, move) + suffix(applyMove(position, move));
}

function suffix(after: Position): string {
  if (!isInCheck(after)) return '';
  return hasLegalMove(after) ? '+' : '#';
}

function sanBody(position: Position, move: Move): string {
  if (move.kind === 'castle-kingside') return 'O-O';
  if (move.kind === 'castle-queenside') return 'O-O-O';

  const target = squareName(move.to);
  const capture = move.captured !== null ? 'x' : '';
  if (move.piece === 'p') {
    const from = capture ? squareName(move.from).charAt(0) : '';
    const promotion = move.promotion ? `=${move.promotion.toUpperCase()}` : '';
    return `${from}${capture}${target}${promotion}`;
  }
  return `${move.piece.toUpperCase()}${disambiguation(position, move)}${capture}${target}`;
}

/**
 * When another piece of the same kind can also reach the target square, add
 * the origin file if that is unique, else the rank, else both. (The legacy
 * client only disambiguated pieces sharing a rank or file, so e.g. knights on
 * b1 and f3 both going to d2 were written "Nd2" instead of "Nbd2".)
 */
function disambiguation(position: Position, move: Move): string {
  const rivals = legalMoves(position).filter(
    (other) => other.piece === move.piece && other.to === move.to && other.from !== move.from,
  );
  if (rivals.length === 0) return '';
  const from = squareName(move.from);
  if (rivals.every((other) => fileOf(other.from) !== fileOf(move.from))) return from.charAt(0);
  if (rivals.every((other) => rankOf(other.from) !== rankOf(move.from))) return from.charAt(1);
  return from;
}
