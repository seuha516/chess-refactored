import type { Square } from './types.ts';

const FILES = 'abcdefgh';

export const fileOf = (square: Square): number => square % 8;
export const rankOf = (square: Square): number => Math.floor(square / 8);

export function makeSquare(file: number, rank: number): Square | null {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return rank * 8 + file;
}

export function isSquare(value: unknown): value is Square {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 64;
}

/** 0 -> "a1", 63 -> "h8" */
export function squareName(square: Square): string {
  return `${FILES.charAt(fileOf(square))}${rankOf(square) + 1}`;
}

/** "e4" -> 28; returns null for anything that is not a square name. */
export function parseSquare(name: string): Square | null {
  if (!/^[a-h][1-8]$/.test(name)) return null;
  return makeSquare(FILES.indexOf(name.charAt(0)), Number(name.charAt(1)) - 1);
}

/** Square colour, used for bishop analysis: true for light squares (h1 is light). */
export const isLightSquare = (square: Square): boolean =>
  (fileOf(square) + rankOf(square)) % 2 === 1;
