import { describe, expect, it } from 'vitest';
import {
  parseChatText,
  parseMoveRequest,
  parseName,
  parseToken,
} from '../../src/server/validation.ts';

describe('parseMoveRequest', () => {
  it('accepts well-formed moves', () => {
    expect(parseMoveRequest({ from: 'e2', to: 'e4', ply: 0 })).toEqual({
      from: 12,
      to: 28,
      promotion: null,
      ply: 0,
    });
    expect(parseMoveRequest({ from: 'b7', to: 'b8', promotion: 'n', ply: 9 })?.promotion).toBe('n');
  });

  it.each([
    null,
    'e2e4',
    [],
    { from: 'e2', to: 'e4' },
    { from: 'e2', to: 'e9', ply: 0 },
    { from: 12, to: 28, ply: 0 },
    { from: 'e2', to: 'e4', ply: -1 },
    { from: 'e2', to: 'e4', ply: 1.5 },
    { from: 'e2', to: 'e4', ply: 0, promotion: 'k' },
    { from: 'e2', to: 'e4', ply: 0, promotion: { toString: (): string => 'q' } },
  ])('rejects %j', (payload) => {
    expect(parseMoveRequest(payload)).toBeNull();
  });
});

describe('text input', () => {
  it('trims and collapses whitespace and strips invisible/control characters', () => {
    expect(parseName('  Magnus \n Carlsen ')).toBe('Magnus Carlsen');
    expect(parseName('a‮b​c')).toBe('a b c');
    expect(parseChatText('hello\u0000world')).toBe('hello world');
  });

  it('enforces length limits in characters, not UTF-16 units', () => {
    expect(parseName('가'.repeat(16))).toBe('가'.repeat(16));
    expect(parseName('가'.repeat(17))).toBeNull();
    expect(parseName('😀'.repeat(16))).toBe('😀'.repeat(16));
    expect(parseChatText('x'.repeat(200))).toHaveLength(200);
    expect(parseChatText('x'.repeat(201))).toBeNull();
  });

  it('rejects empty or non-string input', () => {
    expect(parseName('   ')).toBeNull();
    expect(parseName(42)).toBeNull();
    expect(parseChatText({ message: 'hi' })).toBeNull();
  });
});

describe('parseToken', () => {
  it('accepts URL-safe tokens of a reasonable length only', () => {
    expect(parseToken('abcdefghijklmnop')).toBe('abcdefghijklmnop');
    expect(parseToken('short')).toBeNull();
    expect(parseToken('x'.repeat(65))).toBeNull();
    expect(parseToken('abcdefghijklmnop!')).toBeNull();
    expect(parseToken(undefined)).toBeNull();
  });
});
