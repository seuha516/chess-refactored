// Lays the DOM board over the 3D one: the projective map of a square onto the
// board's four corners on screen, as a CSS transform.

/**
 * The CSS matrix3d that maps a size × size square onto the quadrilateral
 * p0 (top-left), p1 (top-right), p2 (bottom-right), p3 (bottom-left).
 */
export function homography(
  p0: readonly [number, number],
  p1: readonly [number, number],
  p2: readonly [number, number],
  p3: readonly [number, number],
  size: number,
): number[] {
  const [x0, y0] = p0;
  const [x1, y1] = p1;
  const [x2, y2] = p2;
  const [x3, y3] = p3;
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const dy3 = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1 || 1e-9;
  const g = (dx3 * dy2 - dx2 * dy3) / den;
  const h = (dx1 * dy3 - dx3 * dy1) / den;
  const a = x1 - x0 + g * x1;
  const b = x3 - x0 + h * x3;
  const d = y1 - y0 + g * y1;
  const e = y3 - y0 + h * y3;
  return [
    a / size,
    d / size,
    0,
    g / size,
    b / size,
    e / size,
    0,
    h / size,
    0,
    0,
    1,
    0,
    x0,
    y0,
    0,
    1,
  ];
}
