// Works out what physically happened on the board between two positions one
// move apart, so the 3D table can act it out. No three.js here: unit-tested.
import {
  fileOf,
  makeSquare,
  rankOf,
  type Board,
  type Piece,
  type PieceType,
  type Square,
} from '../../shared/chess/index.ts';

export interface MovePlan {
  readonly from: Square;
  readonly to: Square;
  readonly piece: Piece;
  /** The square of the taken piece: `to`, or the passed pawn's square for en passant. */
  readonly capture: { readonly square: Square; readonly piece: Piece } | null;
  /** The rook's hop of a castling move. */
  readonly rook: { readonly from: Square; readonly to: Square } | null;
  /** The piece a pawn turns into on the last rank. */
  readonly promotion: PieceType | null;
}

/**
 * Explains `after` as `before` plus the move `from` → `to`. Returns null when
 * the boards do not fit that move (a resync, or a jump of several moves),
 * in which case the table snaps to the new position instead of acting.
 */
export function planMove(
  before: Board,
  after: Board,
  move: { readonly from: Square; readonly to: Square },
): MovePlan | null {
  const { from, to } = move;
  const piece = before[from];
  const landed = after[to];
  if (!piece || landed?.color !== piece.color || after[from]) return null;

  let capture: MovePlan['capture'] = null;
  const victim = before[to];
  if (victim) {
    if (victim.color === piece.color) return null;
    capture = { square: to, piece: victim };
  } else if (piece.type === 'p' && fileOf(from) !== fileOf(to)) {
    const passed = makeSquare(fileOf(to), rankOf(from));
    const pawn = passed === null ? null : before[passed];
    if (passed === null || !pawn || pawn.color === piece.color || after[passed]) return null;
    capture = { square: passed, piece: pawn };
  }

  let rook: MovePlan['rook'] = null;
  const step = fileOf(to) - fileOf(from);
  if (piece.type === 'k' && Math.abs(step) === 2) {
    const rank = rankOf(from);
    const rookFrom = makeSquare(step > 0 ? 7 : 0, rank);
    const rookTo = makeSquare(fileOf(from) + Math.sign(step), rank);
    if (rookFrom === null || rookTo === null || before[rookFrom]?.type !== 'r') return null;
    rook = { from: rookFrom, to: rookTo };
  }

  const promotion = piece.type === 'p' && landed.type !== 'p' ? landed.type : null;
  if (!promotion && landed.type !== piece.type) return null;

  // Nothing else may have changed; otherwise more than this move happened.
  const touched = new Set([from, to, capture?.square, rook?.from, rook?.to]);
  for (let square = 0; square < 64; square++) {
    if (touched.has(square)) continue;
    const was = before[square];
    const now = after[square];
    if (was?.color !== now?.color || was?.type !== now?.type) return null;
  }
  if (rook && after[rook.to]?.type !== 'r') return null;
  return { from, to, piece, capture, rook, promotion };
}

const VALUE: Readonly<Record<PieceType, number>> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 12 };

/**
 * How hard a moment hits, 0..1, so effects escalate with the event: a quiet
 * move, a capture scaled by what was taken, a check, a mate.
 */
export function impactOf(plan: MovePlan, check: boolean, mate: boolean): number {
  if (mate) return 1;
  let weight = 0.12;
  if (plan.capture) weight = 0.38 + VALUE[plan.capture.piece.type] * 0.04;
  if (plan.promotion) weight = Math.max(weight, 0.55);
  if (check) weight = Math.max(weight, 0.6);
  return Math.min(weight, 0.9);
}
