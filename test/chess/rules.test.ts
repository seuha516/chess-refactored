// Rule tests for the chess engine. Article numbers refer to the FIDE Laws of
// Chess (edition effective 1 January 2023) and, for how an online game ends,
// the FIDE Online Chess Regulations Part I. Cases marked "legacy" correspond
// to defects reproduced in test/legacy/rules.test.js in the original code.
import { describe, expect, it } from 'vitest';
import {
  ChessGame,
  canCheckmate,
  isDeadPositionByMaterial,
  parseFen,
  repetitionKey,
  toFen,
} from '../../src/shared/chess/index.ts';
import { gameFrom, playAll, sq, uciMoves } from './helpers.ts';

describe('castling (FIDE 3.8.2)', () => {
  it('is allowed with unmoved king and rook, empty and unattacked squares', () => {
    expect(uciMoves('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')).toEqual(
      expect.arrayContaining(['e1g1', 'e1c1']),
    );
  });

  it('legacy: is not allowed onto a square attacked by a pawn (3.8.2.2)', () => {
    // Black pawn h2 attacks g1.
    expect(uciMoves('4k3/8/8/8/8/8/7p/4K2R w K - 0 1')).not.toContain('e1g1');
  });

  it('is not allowed across a square attacked by a pawn (3.8.2.2)', () => {
    // Black pawn e2 attacks f1 (and d1) but does not give check.
    expect(uciMoves('4k3/8/8/8/8/8/4p3/R3K2R w KQ - 0 1')).not.toEqual(
      expect.arrayContaining(['e1g1']),
    );
    expect(uciMoves('4k3/8/8/8/8/8/4p3/R3K2R w KQ - 0 1')).not.toContain('e1c1');
  });

  it('is not allowed out of check or through an attacked square (3.8.2.2)', () => {
    expect(uciMoves('4k3/8/8/8/4r3/8/8/4K2R w K - 0 1')).not.toContain('e1g1');
    expect(uciMoves('3rk3/8/8/8/8/8/8/R3K3 w Q - 0 1')).not.toContain('e1c1');
  });

  it('only needs b1 to be empty, not unattacked, for queenside castling', () => {
    expect(uciMoves('1r2k3/8/8/8/8/8/8/R3K3 w Q - 0 1')).toContain('e1c1');
  });

  it('is not allowed with a piece between king and rook (3.8.2.2)', () => {
    expect(uciMoves('4k3/8/8/8/8/8/8/RN2K3 w Q - 0 1')).not.toContain('e1c1');
  });

  it('legacy: the right is lost when the rook is captured on its original square (3.8.2.1)', () => {
    const game = gameFrom('4k3/8/8/8/8/8/6b1/4K2R b K - 0 1');
    playAll(game, ['g2h1']);
    expect(game.position.castling.whiteKingside).toBe(false);
    expect(uciMoves('4k3/8/8/8/8/8/8/4K3 w K - 0 1')).not.toContain('e1g1');
  });

  it('legacy: moving a different rook along the h-file keeps the right', () => {
    const game = gameFrom('4k3/8/8/7R/8/8/8/4K2R w K - 0 1');
    playAll(game, ['h5h4']);
    expect(game.position.castling.whiteKingside).toBe(true);
  });

  it('is lost after the king or the rook moves, even if it returns (3.8.2.1)', () => {
    const game = gameFrom('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    playAll(game, ['e1f1', 'a8b8', 'f1e1', 'b8a8']);
    expect(toFen(game.position).split(' ')[2]).toBe('k');
  });

  it('moves the rook to the square the king crossed', () => {
    const game = gameFrom('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    playAll(game, ['e1g1', 'e8c8']);
    expect(toFen(game.position).split(' ')[0]).toBe('2kr3r/8/8/8/8/8/8/R4RK1');
  });
});

describe('pawns (FIDE 3.7)', () => {
  it('legacy: en passant only captures the pawn that just advanced two squares (3.7.3.1)', () => {
    // Black just played c7-c5; the white pawn on b3 must not "capture" on c4.
    expect(
      uciMoves('4k3/8/8/2p5/8/1Pp5/8/4K3 w - c6 0 1').filter((m) => m.startsWith('b3')),
    ).toEqual(['b3b4']);
  });

  it('allows en passant immediately after the double step, and removes the passed pawn', () => {
    const game = gameFrom('4k3/2p5/8/3P4/8/8/8/4K3 b - - 0 1');
    playAll(game, ['c7c5', 'd5c6']);
    expect(toFen(game.position).split(' ')[0]).toBe('4k3/8/2P5/8/8/8/8/4K3');
    expect(game.history.at(-1)?.move.captured).toBe('p');
  });

  it('does not allow en passant one move later (3.7.3.1 "just advanced")', () => {
    const game = gameFrom('4k3/2p5/8/3P4/8/8/8/4K3 b - - 0 1');
    playAll(game, ['c7c5', 'e1e2', 'e8e7']);
    expect(game.play(sq('d5'), sq('c6')).ok).toBe(false);
  });

  it('rejects en passant that would expose the king along the rank (3.9.2)', () => {
    expect(uciMoves('8/8/8/K1pP3r/8/8/8/7k w - c6 0 1')).not.toContain('d5c6');
  });

  it('requires choosing the promotion piece and allows under-promotion (3.7.3.3)', () => {
    const game = gameFrom('8/1P2k3/8/8/8/8/8/4K3 w - - 0 1');
    expect(game.play(sq('b7'), sq('b8')).ok).toBe(false);
    expect(game.play(sq('b7'), sq('b8'), 'n').ok).toBe(true);
    expect(game.position.board[sq('b8')]).toEqual({ color: 'w', type: 'n' });
  });

  it('legacy: a capturing promotion records the captured piece', () => {
    const game = gameFrom('r7/1P2k3/8/8/8/8/8/4K3 w - - 0 1');
    const result = game.play(sq('b7'), sq('a8'), 'q');
    expect(result.ok && result.record).toMatchObject({
      san: 'bxa8=Q',
      move: { captured: 'r', promotion: 'q' },
    });
  });

  it('allows the two-square advance only from the starting rank and over an empty square', () => {
    expect(uciMoves('4k3/8/8/8/8/4P3/8/4K3 w - - 0 1')).not.toContain('e3e5');
    expect(uciMoves('4k3/8/8/8/8/4n3/4P3/4K3 w - - 0 1')).not.toContain('e2e4');
  });
});

describe('check, checkmate and stalemate', () => {
  it('ends the game by checkmate (fool’s mate)', () => {
    const game = new ChessGame();
    playAll(game, ['f2f3', 'e7e5', 'g2g4', 'd8h4']);
    expect(game.outcome).toEqual({ winner: 'b', reason: 'checkmate' });
    expect(game.history.at(-1)?.san).toBe('Qh4#');
  });

  it('legacy: a check that only a two-square pawn advance can block is not checkmate', () => {
    const game = gameFrom('4k3/8/8/r7/7K/r7/4P3/1r6 b - - 0 1');
    playAll(game, ['b1b4']);
    expect(game.isCheck()).toBe(true);
    expect(game.outcome).toBeNull();
    expect(uciMoves(game.position)).toEqual(['e2e4']);
  });

  it('ends the game by stalemate (Online Regulations 5.4.2)', () => {
    const game = gameFrom('7k/4Q3/6K1/8/8/8/8/8 w - - 0 1');
    playAll(game, ['e7f7']);
    expect(game.outcome).toEqual({ winner: null, reason: 'stalemate' });
  });

  it('never lets a move leave the own king in check (3.9.2)', () => {
    // The e2 knight is pinned by the rook on e8.
    expect(uciMoves('4r1k1/8/8/8/8/8/4N3/4K3 w - - 0 1').some((m) => m.startsWith('e2'))).toBe(
      false,
    );
  });
});

describe('dead positions and mating material (5.2.2, Online 4.4 / 5.4.3)', () => {
  const dead = (fen: string) => isDeadPositionByMaterial(parseFen(fen).board);

  it('detects the standard dead material combinations', () => {
    expect(dead('4k3/8/8/8/8/8/8/4K3 w - - 0 1')).toBe(true); // K v K
    expect(dead('4k3/8/8/8/8/8/8/4KN2 w - - 0 1')).toBe(true); // KN v K
    expect(dead('4k3/8/8/8/8/8/8/4KB2 w - - 0 1')).toBe(true); // KB v K
    expect(dead('5b2/8/8/4k3/8/8/8/2B1K3 w - - 0 1')).toBe(true); // bishops on one colour
    expect(dead('4k3/8/8/8/8/8/8/1BB1K3 w - - 0 1')).toBe(false); // bishops on both colours
    expect(dead('5b2/8/8/4k3/8/8/8/4KB2 w - - 0 1')).toBe(false); // opposite-colour bishops
    expect(dead('4k3/8/8/8/8/8/8/3NKN2 w - - 0 1')).toBe(false); // KNN v K can be mated
    expect(dead('4k1n1/8/8/8/8/8/8/4KN2 w - - 0 1')).toBe(false); // KN v KN (helpmate)
  });

  it('ends the game automatically when a dead position arises', () => {
    const game = gameFrom('8/8/8/4k3/8/8/3n4/4K3 w - - 0 1');
    playAll(game, ['e1d2']);
    expect(game.outcome).toEqual({ winner: null, reason: 'dead-position' });
  });

  it('decides who can still mate from both sides’ material', () => {
    const board = (fen: string) => parseFen(fen).board;
    // K+N mates against a rook, bishop, knight or pawn (it can block its own king) ...
    expect(canCheckmate(board('4k3/8/8/8/8/8/8/R3K1n1 w - - 0 1'), 'b')).toBe(true);
    expect(canCheckmate(board('4k3/8/8/8/8/8/P7/4K1n1 w - - 0 1'), 'b')).toBe(true);
    // ... but not against a bare king or a lone queen.
    expect(canCheckmate(board('4k3/8/8/8/8/8/8/4K1n1 w - - 0 1'), 'b')).toBe(false);
    expect(canCheckmate(board('4k3/8/8/8/8/8/8/Q3K1n1 w - - 0 1'), 'b')).toBe(false);
    // A bishop needs a blocker that is not a rook/queen, or a bishop of the other colour.
    expect(canCheckmate(board('4k3/8/8/8/8/8/8/2b1KB2 w - - 0 1'), 'w')).toBe(true);
    expect(canCheckmate(board('4k3/8/8/8/8/8/8/1b2KB2 w - - 0 1'), 'w')).toBe(false);
    expect(canCheckmate(board('4k3/8/8/8/8/8/8/r3KB2 w - - 0 1'), 'w')).toBe(false);
  });
});

describe('time forfeit (Online Regulations 4.4 / Laws 6.9)', () => {
  it('legacy: K+R v K+N — the side with the rook loses on time, because K+N can mate', () => {
    const game = gameFrom('1n2k3/8/8/8/8/8/8/R3K3 w - - 0 1');
    expect(game.timeout('w')).toEqual({ winner: 'b', reason: 'timeout' });
  });

  it('legacy: the verdict does not depend on colour (K+N each)', () => {
    expect(gameFrom('1n2k3/8/8/8/8/8/8/1N2K3 w - - 0 1').timeout('w')).toEqual({
      winner: 'b',
      reason: 'timeout',
    });
    expect(gameFrom('1n2k3/8/8/8/8/8/8/1N2K3 w - - 0 1').timeout('b')).toEqual({
      winner: 'w',
      reason: 'timeout',
    });
  });

  it('is a draw when the opponent cannot mate by any series of legal moves', () => {
    expect(gameFrom('4k3/8/8/8/8/8/8/R3K3 w - - 0 1').timeout('w')).toEqual({
      winner: null,
      reason: 'timeout-vs-insufficient-material',
    });
  });

  it('cannot end a game that is already over', () => {
    const game = new ChessGame();
    game.resign('w');
    expect(game.timeout('b')).toBeNull();
    expect(game.outcome).toEqual({ winner: 'b', reason: 'resignation' });
  });
});

describe('repetition (Online Regulations 5.4.1, Laws 9.2.2 / 9.2.3)', () => {
  it('draws automatically when a position appears for the third time', () => {
    const game = new ChessGame();
    playAll(game, ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1']);
    expect(game.outcome).toBeNull();
    playAll(game, ['f6g8']);
    expect(game.outcome).toEqual({ winner: null, reason: 'threefold-repetition' });
  });

  it('legacy: positions with different castling rights are not the same position', () => {
    // The move strings repeat in a 4-ply cycle from 2.Ke2 on, but after 2.Ke2
    // black could still castle, so that position does not recur.
    const game = new ChessGame();
    playAll(game, ['e2e4', 'e7e5', 'e1e2', 'e8e7', 'e2e1', 'e7e8', 'e1e2', 'e8e7', 'e2e1']);
    playAll(game, ['e7e8', 'e1e2']);
    expect(game.outcome).toBeNull();
    playAll(game, ['e8e7']);
    expect(game.outcome).toEqual({ winner: null, reason: 'threefold-repetition' });
  });

  it('ignores an en passant square when no en passant capture is possible', () => {
    const withEp = parseFen('4k3/8/8/8/4P3/8/8/4K3 b - e3 0 1');
    const withoutEp = parseFen('4k3/8/8/8/4P3/8/8/4K3 b - - 0 1');
    expect(repetitionKey(withEp)).toBe(repetitionKey(withoutEp));
    const capturable = parseFen('4k3/8/8/8/3pP3/8/8/4K3 b - e3 0 1');
    const notCapturable = parseFen('4k3/8/8/8/3pP3/8/8/4K3 b - - 0 1');
    expect(repetitionKey(capturable)).not.toBe(repetitionKey(notCapturable));
  });
});

describe('fifty-move rule (Online Regulations 5.4.4)', () => {
  it('draws automatically after 50 moves by each side without capture or pawn move', () => {
    const game = gameFrom('4k3/8/8/8/8/8/8/R3K3 w - - 99 60');
    playAll(game, ['a1a2']);
    expect(game.outcome).toEqual({ winner: null, reason: 'fifty-move-rule' });
  });

  it('lets checkmate on the last move take precedence', () => {
    const game = gameFrom('k7/8/1K6/8/8/8/8/7R w - - 99 80');
    playAll(game, ['h1h8']);
    expect(game.outcome).toEqual({ winner: 'w', reason: 'checkmate' });
  });

  it('resets the count on a capture or pawn move', () => {
    const game = gameFrom('4k3/8/8/8/8/8/4p3/R3K3 w - - 99 60');
    playAll(game, ['e1e2']);
    expect(game.outcome).toBeNull();
    expect(game.position.halfmoveClock).toBe(0);
  });
});

describe('resignation and agreement (Online Regulations 5.2 / 5.3)', () => {
  it('scores a resignation as a loss', () => {
    expect(new ChessGame().resign('b')).toEqual({ winner: 'w', reason: 'resignation' });
  });

  it('scores an agreed draw', () => {
    expect(new ChessGame().agreeDraw()).toEqual({ winner: null, reason: 'agreement' });
  });

  it('rejects moves once the game is over', () => {
    const game = new ChessGame();
    game.agreeDraw();
    expect(game.play(sq('e2'), sq('e4'))).toEqual({ ok: false, error: 'game-over' });
  });
});

describe('forfeit by disconnection (Online Regulations 11.4.2)', () => {
  it('loses like a time forfeit, including the insufficient-material draw', () => {
    expect(new ChessGame().forfeitByDisconnection('w')).toEqual({
      winner: 'b',
      reason: 'disconnection',
    });
    expect(gameFrom('4k3/8/8/8/8/8/8/R3K3 w - - 0 1').forfeitByDisconnection('w')).toEqual({
      winner: null,
      reason: 'disconnection-vs-insufficient-material',
    });
  });
});
