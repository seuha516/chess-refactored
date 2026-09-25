// Characterization tests for the original client-side rule code in
// static/js/Chess.js. They pin down how the legacy code *actually* behaves.
// Tests named "LEGACY BUG" assert behaviour that contradicts the FIDE Laws of
// Chess (the article is cited in each test); they exist to reproduce the
// defect before it is fixed in the new rules engine.
import { beforeEach, describe, expect, it } from 'vitest';
import { loadLegacyClient, setWhitePerspectiveBoard, toLegacy } from './harness.js';

let legacy;
let ctx;

beforeEach(() => {
  legacy = loadLegacyClient();
  ctx = legacy.ctx;
});

function canMove(from, to) {
  return ctx.이동가능여부확인(...toLegacy(from), ...toLegacy(to));
}

function lastEmit(event) {
  return legacy.emitted.filter((e) => e.event === event).at(-1)?.data;
}

describe('legacy rules: behaviour that is correct', () => {
  it('allows ordinary kingside castling with an unmoved king and rook', () => {
    setWhitePerspectiveBoard(ctx, { e1: 'wK', h1: 'wR', e8: 'bK' });
    expect(canMove('e1', 'g1')).toBe(9);
  });

  it('rejects castling out of check (FIDE 3.8.2.2.1)', () => {
    setWhitePerspectiveBoard(ctx, { e1: 'wK', h1: 'wR', e8: 'bK', e5: 'bR' });
    expect(canMove('e1', 'g1')).toBe(0);
  });

  it('rejects castling through a square attacked by a piece (FIDE 3.8.2.2.2)', () => {
    setWhitePerspectiveBoard(ctx, { e1: 'wK', h1: 'wR', e8: 'bK', f5: 'bR' });
    expect(canMove('e1', 'g1')).toBe(0);
  });

  it('detects a normal checkmate (back-rank mate)', () => {
    setWhitePerspectiveBoard(ctx, { g1: 'wK', f2: 'wP', g2: 'wP', h2: 'wP', a1: 'bR', e8: 'bK' });
    expect(ctx.공격당하는지확인(...toLegacy('g1'))).toBe(1);
    expect(ctx.움직일수있는말이있는지확인()).toBe(0);
  });

  it('accepts a legal en passant capture', () => {
    setWhitePerspectiveBoard(ctx, { e1: 'wK', e5: 'wP', d5: 'bP', e8: 'bK' });
    ctx.상대가전턴에y열폰을두칸움직임 = 3; // black just played d7-d5
    expect(canMove('e5', 'd6')).toBe(4);
  });
});

describe('legacy rules: defects reproduced', () => {
  it('LEGACY BUG: allows castling onto a square attacked by a pawn (FIDE 3.8.2.2.2)', () => {
    // The black pawn on h2 attacks g1. The attack test re-uses the pawn move
    // generator, which only treats a diagonal as a capture when an enemy piece
    // stands there, so pawn attacks on empty squares are invisible.
    setWhitePerspectiveBoard(ctx, { e1: 'wK', h1: 'wR', h2: 'bP', e8: 'bK' });
    expect(ctx.공격당하는지확인(...toLegacy('g1'))).toBe(0);
    expect(canMove('e1', 'g1')).toBe(9);
  });

  it('LEGACY BUG: allows castling when the rook is no longer on its original square (FIDE 3.8.2.1)', () => {
    // Castling flags only track whether the player moved the king/rook. If the
    // h1 rook was captured on h1, the flag stays set and castling "succeeds"
    // with no rook.
    setWhitePerspectiveBoard(ctx, { e1: 'wK', e8: 'bK' });
    expect(canMove('e1', 'g1')).toBe(9);
  });

  it('LEGACY BUG: loses castling rights when any rook on the h-file moves', () => {
    // Only the column is checked (ny === 7), not that it is the h1 rook.
    setWhitePerspectiveBoard(ctx, { e1: 'wK', h1: 'wR', h5: 'wR', e8: 'bK' });
    ctx.내턴 = 1;
    ctx.집은말x좌표 = toLegacy('h5')[0];
    ctx.집은말y좌표 = toLegacy('h5')[1];
    ctx.이동(...toLegacy('h5'), ...toLegacy('h4'));
    expect(ctx.오른쪽룩움직인적없음).toBe(0);
  });

  it('LEGACY BUG: declares checkmate when only a two-square pawn advance can block (FIDE 3.7.2, 5.1.1)', () => {
    // White Kh4 is checked by Ra4; e2-e4 blocks. The "any legal move" scan
    // only counts move codes 1, 4 and >= 9, so a double step (code 5) is ignored.
    setWhitePerspectiveBoard(ctx, {
      h4: 'wK',
      e2: 'wP',
      a4: 'bR',
      a3: 'bR',
      a5: 'bR',
      e8: 'bK',
    });
    expect(canMove('e2', 'e4')).toBe(5);
    expect(ctx.이동시킨척하고체크당하는지확인(...toLegacy('e2'), ...toLegacy('e4'))).toBe(0);
    expect(ctx.움직일수있는말이있는지확인()).toBe(0);
  });

  it('LEGACY BUG: en passant can remove a pawn that did not just make the double step (FIDE 3.7.3.1)', () => {
    // Black just played c7-c5, but the white pawn on b3 "captures en passant"
    // to c4 and removes the other black pawn on c3.
    setWhitePerspectiveBoard(ctx, { e1: 'wK', b3: 'wP', c3: 'bP', c5: 'bP', e8: 'bK' });
    ctx.상대가전턴에y열폰을두칸움직임 = 2;
    expect(canMove('b3', 'c4')).toBe(4);
  });

  it('LEGACY BUG: timeout/insufficient-material verdict depends on colour, not on who can mate (FIDE 6.9)', () => {
    // Identical material (K+N each). 기물체크 checks white first, so it
    // reports "white cannot mate" (-2) and never "black cannot mate" (-3).
    // The timeout handler turns -2 into a draw only for black, so a black
    // flag-fall is scored as a draw while a white one loses.
    setWhitePerspectiveBoard(ctx, { e1: 'wK', b1: 'wN', e8: 'bK', b8: 'bN' });
    expect(ctx.기물체크()).toBe(-2);
  });

  it('LEGACY BUG: K+R vs K+N flag-fall is scored as a draw although K+N can mate (FIDE 6.9)', () => {
    // e.g. white Kh1 Rh2, black Kf2 Ng3# is a legal mate, so a white flag-fall
    // must lose. 기물체크 returns -3 ("black cannot mate") -> draw for white.
    setWhitePerspectiveBoard(ctx, { e1: 'wK', a1: 'wR', e8: 'bK', b8: 'bN' });
    expect(ctx.기물체크()).toBe(-3);
  });

  it('LEGACY BUG: SAN omits disambiguation when the two pieces share neither file nor rank', () => {
    // Knights on b1 and f3 can both reach d2; SAN requires "Nbd2".
    setWhitePerspectiveBoard(ctx, { e1: 'wK', b1: 'wN', f3: 'wN', e8: 'bK' });
    ctx.내턴 = 1;
    ctx.집은말x좌표 = toLegacy('b1')[0];
    ctx.집은말y좌표 = toLegacy('b1')[1];
    ctx.이동(...toLegacy('b1'), ...toLegacy('d2'));
    expect(lastEmit('turnend').일차기보).toBe('.Nd2');
  });

  it('LEGACY BUG: a capturing promotion emits a kill event without a colour and crashes receivers', () => {
    setWhitePerspectiveBoard(ctx, { e1: 'wK', b7: 'wP', a8: 'bR', h8: 'bK' });
    ctx.내턴 = 1;
    ctx.집은말x좌표 = toLegacy('b7')[0];
    ctx.집은말y좌표 = toLegacy('b7')[1];
    ctx.이동할x좌표 = toLegacy('a8')[0];
    ctx.이동할y좌표 = toLegacy('a8')[1];
    ctx.이동(...toLegacy('b7'), ...toLegacy('a8'));
    ctx.프로모션버튼결정완료(1);
    const kill = lastEmit('kill');
    expect(kill).toEqual({ type: 'kill', 잡은말종류: '룩', 잡은말색깔: undefined });
    // Every client runs this handler after the server re-broadcasts it.
    // (JSON drops the undefined field, so the receiver sees it missing.)
    expect(() => legacy.handlers.get('kill')({ type: 'kill', 잡은말종류: '룩' })).toThrow(
      /Cannot read properties of null/,
    );
  });

  it('LEGACY BUG: promotion turn-end omits the fifty-move counter, turning it into NaN for the opponent', () => {
    setWhitePerspectiveBoard(ctx, { e1: 'wK', b7: 'wP', h8: 'bK' });
    ctx.내턴 = 1;
    ctx.집은말x좌표 = toLegacy('b7')[0];
    ctx.집은말y좌표 = toLegacy('b7')[1];
    ctx.이동할x좌표 = toLegacy('b8')[0];
    ctx.이동할y좌표 = toLegacy('b8')[1];
    ctx.이동(...toLegacy('b7'), ...toLegacy('b8'));
    ctx.프로모션버튼결정완료(1);
    expect(lastEmit('turnend')).not.toHaveProperty('오십수체크');
    // The server forwards Number(undefined) === NaN, serialised as null.
    expect(Number(`${null}`)).toBeNaN();
  });

  it('LEGACY BUG: repetition is inferred from notation strings, not positions (FIDE 9.2.3)', () => {
    // 1.e4 e5 2.Ke2 Ke7 3.Ke1 Ke8 4.Ke2 Ke7 5.Ke1 Ke8 6.Ke2: the position
    // after 2.Ke2 differs (black could still castle), so the position has
    // occurred only twice — but the notation strings form a 4-ply cycle.
    // Newest first: the nine plies 2.Ke2 ... 6.Ke2 as they reach the client.
    setWhitePerspectiveBoard(ctx, { e1: 'wK', e8: 'bK', e4: 'wP', e5: 'bP' });
    ctx.n턴전기보 = ['.Ke2', '...Ke8', '.Ke1', '...Ke7', '.Ke2', '...Ke8', '.Ke1', '...Ke7', '.Ke2'];
    legacy.handlers.get('turnend')({ 일차기보: '...Ke8', 오십수체크: 10 });
    expect(lastEmit('gameend')).toMatchObject({ 승자: 0, 정산결과: '108' });
  });
});
