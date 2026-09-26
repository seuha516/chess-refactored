import { canCheckmate, isDeadPositionByMaterial } from './material.ts';
import { applyMove, findLegalMove, hasLegalMove, isInCheck, legalMoves } from './moves.ts';
import { castlingFen, initialPosition, placementFen } from './position.ts';
import { toSan } from './san.ts';
import { squareName } from './square.ts';
import {
  opposite,
  type Color,
  type Move,
  type Position,
  type PromotionPiece,
  type Square,
} from './types.ts';

export type EndReason =
  | 'checkmate'
  | 'stalemate'
  | 'dead-position'
  | 'threefold-repetition'
  | 'fifty-move-rule'
  | 'resignation'
  | 'agreement'
  | 'timeout'
  | 'timeout-vs-insufficient-material'
  | 'disconnection'
  | 'disconnection-vs-insufficient-material';

export interface Outcome {
  /** null for a draw */
  readonly winner: Color | null;
  readonly reason: EndReason;
}

export interface MoveRecord {
  readonly move: Move;
  readonly san: string;
}

export type PlayResult =
  | { readonly ok: true; readonly record: MoveRecord }
  | { readonly ok: false; readonly error: 'game-over' | 'illegal-move' };

/**
 * Key identifying a position for repetition purposes (FIDE 9.2.3): same side
 * to move, same pieces on the same squares and the same possible moves. The
 * permanent castling rights are part of it, and the en passant square only
 * counts when an en passant capture is actually legal.
 */
export function repetitionKey(position: Position): string {
  const enPassant = legalMoves(position).find((move) => move.kind === 'en-passant');
  return [
    placementFen(position.board),
    position.turn,
    castlingFen(position.castling),
    enPassant ? squareName(enPassant.to) : '-',
  ].join(' ');
}

/**
 * A game from the initial position: the authoritative record of moves and
 * the automatic game-ending rules. Game completion follows the FIDE Online
 * Chess Regulations (Part I, Art. 4–5), which supersede Art. 5 of the Laws of
 * Chess for online play; moves follow Laws of Chess Art. 1–3.
 */
export class ChessGame {
  #position: Position;
  #history: MoveRecord[] = [];
  #repetitions: Map<string, number>;
  #outcome: Outcome | null = null;

  /** `start` exists for tests; real games always begin from the initial position. */
  constructor(start: Position = initialPosition()) {
    this.#position = start;
    this.#repetitions = new Map([[repetitionKey(start), 1]]);
  }

  get position(): Position {
    return this.#position;
  }

  get history(): readonly MoveRecord[] {
    return this.#history;
  }

  get outcome(): Outcome | null {
    return this.#outcome;
  }

  get turn(): Color {
    return this.#position.turn;
  }

  play(from: Square, to: Square, promotion?: PromotionPiece | null): PlayResult {
    if (this.#outcome) return { ok: false, error: 'game-over' };
    const move = findLegalMove(this.#position, from, to, promotion);
    if (!move) return { ok: false, error: 'illegal-move' };

    const record: MoveRecord = { move, san: toSan(this.#position, move) };
    this.#position = applyMove(this.#position, move);
    this.#history.push(record);
    const key = repetitionKey(this.#position);
    this.#repetitions.set(key, (this.#repetitions.get(key) ?? 0) + 1);
    this.#outcome = this.#automaticOutcome(key);
    return { ok: true, record };
  }

  /** Online Regulations 5.2: the player who resigns loses. */
  resign(color: Color): Outcome | null {
    return this.#finish({ winner: opposite(color), reason: 'resignation' });
  }

  /** Online Regulations 5.3: a draw offer accepted by the opponent. */
  agreeDraw(): Outcome | null {
    return this.#finish({ winner: null, reason: 'agreement' });
  }

  /**
   * Online Regulations 4.4 (Laws 6.9): running out of time loses, unless the
   * opponent cannot checkmate by any series of legal moves.
   */
  timeout(color: Color): Outcome | null {
    const opponent = opposite(color);
    return this.#finish(
      canCheckmate(this.#position.board, opponent)
        ? { winner: opponent, reason: 'timeout' }
        : { winner: null, reason: 'timeout-vs-insufficient-material' },
    );
  }

  /**
   * Online Regulations 11.4.2: a player who does not reconnect in time loses,
   * unless the opponent cannot checkmate (then the game is drawn).
   */
  forfeitByDisconnection(color: Color): Outcome | null {
    const opponent = opposite(color);
    return this.#finish(
      canCheckmate(this.#position.board, opponent)
        ? { winner: opponent, reason: 'disconnection' }
        : { winner: null, reason: 'disconnection-vs-insufficient-material' },
    );
  }

  isCheck(): boolean {
    return isInCheck(this.#position);
  }

  #finish(outcome: Outcome): Outcome | null {
    if (this.#outcome) return null;
    this.#outcome = outcome;
    return outcome;
  }

  #automaticOutcome(key: string): Outcome | null {
    const position = this.#position;
    if (!hasLegalMove(position)) {
      // Checkmate (5.1) takes precedence over every draw rule below.
      return isInCheck(position)
        ? { winner: opposite(position.turn), reason: 'checkmate' }
        : { winner: null, reason: 'stalemate' };
    }
    if (isDeadPositionByMaterial(position.board)) {
      return { winner: null, reason: 'dead-position' };
    }
    // Online Regulations 5.4.1 / 5.4.4 make these draws automatic online.
    if ((this.#repetitions.get(key) ?? 0) >= 3) {
      return { winner: null, reason: 'threefold-repetition' };
    }
    if (position.halfmoveClock >= 100) {
      return { winner: null, reason: 'fifty-move-rule' };
    }
    return null;
  }
}
