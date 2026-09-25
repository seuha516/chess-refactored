import { parseSquare, squareName } from './square.ts';
import type { Board, CastlingRights, Color, Piece, PieceType, Position } from './types.ts';

export const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const PIECE_TYPES = new Set<string>(['p', 'n', 'b', 'r', 'q', 'k']);

export class FenError extends Error {
  constructor(fen: string, reason: string) {
    super(`Invalid FEN "${fen}": ${reason}`);
    this.name = 'FenError';
  }
}

/**
 * Parses Forsyth–Edwards Notation. Used for tests, debugging and for sending
 * positions to clients; the game itself always starts from the initial position.
 */
export function parseFen(fen: string): Position {
  const fields = fen.trim().split(/\s+/);
  if (fields.length !== 6) throw new FenError(fen, 'expected 6 fields');
  const [placement = '', turn, castling = '', enPassant = '', halfmove, fullmove] = fields;

  const rows = placement.split('/');
  if (rows.length !== 8) throw new FenError(fen, 'expected 8 ranks');
  const board: (Piece | null)[] = new Array<Piece | null>(64).fill(null);
  rows.forEach((row, index) => {
    const rank = 7 - index;
    let file = 0;
    for (const char of row) {
      if (/[1-8]/.test(char)) {
        file += Number(char);
      } else {
        const type = char.toLowerCase();
        if (!PIECE_TYPES.has(type) || file > 7) throw new FenError(fen, `bad rank "${row}"`);
        board[rank * 8 + file] = {
          color: char === type ? 'b' : 'w',
          type: type as PieceType,
        };
        file += 1;
      }
    }
    if (file !== 8) throw new FenError(fen, `rank "${row}" does not have 8 files`);
  });

  if (turn !== 'w' && turn !== 'b') throw new FenError(fen, 'bad side to move');
  if (!/^(-|K?Q?k?q?)$/.test(castling) || castling === '') {
    throw new FenError(fen, 'bad castling field');
  }
  const ep = enPassant === '-' ? null : parseSquare(enPassant);
  if (enPassant !== '-' && ep === null) throw new FenError(fen, 'bad en passant square');
  const halfmoveClock = Number(halfmove);
  const fullmoveNumber = Number(fullmove);
  if (!Number.isInteger(halfmoveClock) || halfmoveClock < 0) {
    throw new FenError(fen, 'bad halfmove clock');
  }
  if (!Number.isInteger(fullmoveNumber) || fullmoveNumber < 1) {
    throw new FenError(fen, 'bad fullmove number');
  }

  return {
    board,
    turn,
    castling: {
      whiteKingside: castling.includes('K'),
      whiteQueenside: castling.includes('Q'),
      blackKingside: castling.includes('k'),
      blackQueenside: castling.includes('q'),
    },
    enPassant: ep,
    halfmoveClock,
    fullmoveNumber,
  };
}

export function placementFen(board: Board): string {
  const rows: string[] = [];
  for (let rank = 7; rank >= 0; rank--) {
    let row = '';
    let empty = 0;
    for (let file = 0; file < 8; file++) {
      const piece = board[rank * 8 + file];
      if (!piece) {
        empty += 1;
        continue;
      }
      if (empty) row += String(empty);
      empty = 0;
      row += piece.color === 'w' ? piece.type.toUpperCase() : piece.type;
    }
    if (empty) row += String(empty);
    rows.push(row);
  }
  return rows.join('/');
}

export function castlingFen(castling: CastlingRights): string {
  const text =
    (castling.whiteKingside ? 'K' : '') +
    (castling.whiteQueenside ? 'Q' : '') +
    (castling.blackKingside ? 'k' : '') +
    (castling.blackQueenside ? 'q' : '');
  return text || '-';
}

export function toFen(position: Position): string {
  return [
    placementFen(position.board),
    position.turn,
    castlingFen(position.castling),
    position.enPassant === null ? '-' : squareName(position.enPassant),
    String(position.halfmoveClock),
    String(position.fullmoveNumber),
  ].join(' ');
}

export const initialPosition = (): Position => parseFen(INITIAL_FEN);

export function findKing(board: Board, color: Color): number {
  const square = board.findIndex((piece) => piece?.type === 'k' && piece.color === color);
  if (square < 0) throw new Error(`No ${color} king on the board`);
  return square;
}
