import { describe, expect, it } from 'vitest';
import {
  findLegalMove,
  parseFen,
  toSan,
  type PromotionPiece,
} from '../../src/shared/chess/index.ts';
import { sq } from './helpers.ts';

function san(fen: string, uci: string): string {
  const position = parseFen(fen);
  const move = findLegalMove(
    position,
    sq(uci.slice(0, 2)),
    sq(uci.slice(2, 4)),
    (uci[4] ?? null) as PromotionPiece | null,
  );
  if (!move) throw new Error(`illegal: ${uci}`);
  return toSan(position, move);
}

describe('SAN', () => {
  it('writes piece moves, captures and pawn moves', () => {
    expect(san('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'g1f3')).toBe('Nf3');
    expect(san('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e2e4')).toBe('e4');
    expect(san('4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1', 'e4d5')).toBe('exd5');
    expect(san('4k3/8/8/3r4/8/8/8/3RK3 w - - 0 1', 'd1d5')).toBe('Rxd5');
  });

  it('legacy: disambiguates by file when the pieces share neither file nor rank', () => {
    expect(san('4k3/8/8/8/8/5N2/8/1N2K3 w - - 0 1', 'b1d2')).toBe('Nbd2');
  });

  it('disambiguates by rank when the file is shared', () => {
    expect(san('4k3/8/8/R7/8/8/8/R3K3 w - - 0 1', 'a1a3')).toBe('R1a3');
  });

  it('uses file and rank when neither alone is unique', () => {
    expect(san('4k3/8/8/8/8/Q7/8/Q1Q1K3 w - - 0 1', 'a1b2')).toBe('Qa1b2');
  });

  it('does not disambiguate against a pinned piece that cannot legally move there', () => {
    expect(san('4k3/8/8/3b4/8/5N2/8/1N5K w - - 0 1', 'b1d2')).toBe('Nd2');
  });

  it('writes castling, promotion, en passant, check and mate', () => {
    expect(san('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1g1')).toBe('O-O');
    expect(san('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1c1')).toBe('O-O-O');
    expect(san('8/1P2k3/8/8/8/8/8/4K3 w - - 0 1', 'b7b8n')).toBe('b8=N');
    expect(san('4k3/8/8/2pP4/8/8/8/4K3 w - c6 0 1', 'd5c6')).toBe('dxc6');
    expect(san('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', 'a1a8')).toBe('Ra8+');
    expect(san('k7/8/1K6/8/8/8/8/7R w - - 0 1', 'h1h8')).toBe('Rh8#');
  });
});
