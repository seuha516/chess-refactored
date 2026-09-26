import { describe, expect, it } from 'vitest';
import { homography } from '../../src/client/scene/overlay.ts';

/** Applies a CSS matrix3d (column-major) to a point on the element's plane. */
function apply(m: number[], x: number, y: number): [number, number] {
  const at = (i: number) => m[i] ?? 0;
  const w = at(3) * x + at(7) * y + at(15);
  return [(at(0) * x + at(4) * y + at(12)) / w, (at(1) * x + at(5) * y + at(13)) / w];
}

describe('homography', () => {
  it('maps the corners of the square onto the quadrilateral', () => {
    const quad = [
      [120, 80],
      [620, 95],
      [700, 540],
      [40, 520],
    ] as const;
    const m = homography(quad[0], quad[1], quad[2], quad[3], 512);
    const corners: [number, number][] = [
      [0, 0],
      [512, 0],
      [512, 512],
      [0, 512],
    ];
    corners.forEach(([x, y], index) => {
      const [px, py] = apply(m, x, y);
      expect(px).toBeCloseTo(quad[index]?.[0] ?? NaN, 6);
      expect(py).toBeCloseTo(quad[index]?.[1] ?? NaN, 6);
    });
  });

  it('is a plain scale for an upright square', () => {
    const m = homography([0, 0], [256, 0], [256, 256], [0, 256], 512);
    expect(apply(m, 512, 256)).toEqual([256, 128]);
  });
});
