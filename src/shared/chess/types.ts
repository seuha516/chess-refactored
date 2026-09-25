export type Color = 'w' | 'b';

/** p = pawn, n = knight, b = bishop, r = rook, q = queen, k = king */
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export type PromotionPiece = 'q' | 'r' | 'b' | 'n';

export interface Piece {
  readonly color: Color;
  readonly type: PieceType;
}

/**
 * Board square index 0..63: `rank * 8 + file`, so a1 = 0, h1 = 7, a8 = 56,
 * h8 = 63. Unlike the legacy client, coordinates never depend on which side
 * the local player is on.
 */
export type Square = number;

/** 64 entries indexed by {@link Square}. */
export type Board = readonly (Piece | null)[];

export interface CastlingRights {
  readonly whiteKingside: boolean;
  readonly whiteQueenside: boolean;
  readonly blackKingside: boolean;
  readonly blackQueenside: boolean;
}

export interface Position {
  readonly board: Board;
  readonly turn: Color;
  /** Permanent castling rights (FIDE 3.8.2.1); temporary obstacles are checked per move. */
  readonly castling: CastlingRights;
  /** Square passed over by a pawn that just advanced two squares, else null. */
  readonly enPassant: Square | null;
  /** Half-moves since the last capture or pawn move (fifty-move rule). */
  readonly halfmoveClock: number;
  readonly fullmoveNumber: number;
}

export type MoveKind =
  'normal' | 'double-push' | 'en-passant' | 'castle-kingside' | 'castle-queenside';

export interface Move {
  readonly from: Square;
  readonly to: Square;
  readonly color: Color;
  readonly piece: PieceType;
  readonly captured: PieceType | null;
  readonly promotion: PromotionPiece | null;
  readonly kind: MoveKind;
}

export const opposite = (color: Color): Color => (color === 'w' ? 'b' : 'w');
