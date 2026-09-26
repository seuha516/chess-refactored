// Carved piece geometry, turned on a lathe like a real Staunton set. One board
// square is one unit; every piece stands on y = 0.
import {
  BoxGeometry,
  BufferGeometry,
  ExtrudeGeometry,
  LatheGeometry,
  Shape,
  SphereGeometry,
  Vector2,
  type Material,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PieceType } from '../../shared/chess/index.ts';

type Point = readonly [number, number];

/**
 * A lathe profile from runs of points: each run is smoothed through
 * (Catmull-Rom), and runs meet at crisp edges, like a turned stone.
 */
function profile(...runs: readonly (readonly Point[])[]): Vector2[] {
  const points: Vector2[] = [];
  for (const run of runs) {
    const vectors = run.map(([r, y]) => new Vector2(r, y));
    if (vectors.length < 3) {
      points.push(...vectors);
      continue;
    }
    // Centripetal Catmull-Rom through the run.
    const samples = vectors.length * 5;
    for (let i = 0; i <= samples; i++) {
      const t = (i / samples) * (vectors.length - 1);
      const index = Math.min(Math.floor(t), vectors.length - 2);
      const local = t - index;
      const p0 = vectors[Math.max(index - 1, 0)] ?? vectors[0];
      const p1 = vectors[index];
      const p2 = vectors[index + 1];
      const p3 = vectors[Math.min(index + 2, vectors.length - 1)];
      if (!p0 || !p1 || !p2 || !p3) continue;
      points.push(catmullRom(p0, p1, p2, p3, local));
    }
  }
  // The lathe needs a strictly ordered outline; drop duplicates.
  return points.filter((point, index) => index === 0 || !point.equals(points[index - 1] ?? point));
}

function catmullRom(p0: Vector2, p1: Vector2, p2: Vector2, p3: Vector2, t: number): Vector2 {
  const t2 = t * t;
  const t3 = t2 * t;
  const blend = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return new Vector2(Math.max(0, blend(p0.x, p1.x, p2.x, p3.x)), blend(p0.y, p1.y, p2.y, p3.y));
}

/** Points on a circle of the profile (a ball), from angle a0 to a1 (radians, 0 = out). */
function arc(cy: number, radius: number, a0: number, a1: number, steps = 10): Point[] {
  const points: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = a0 + ((a1 - a0) * i) / steps;
    points.push([Math.max(0, Math.cos(angle) * radius), cy + Math.sin(angle) * radius]);
  }
  return points;
}

/** The foot every piece stands on: a chamfered plinth with a bead. */
function foot(radius: number): Point[][] {
  return [
    [
      [0, 0],
      [radius - 0.015, 0],
    ],
    [
      [radius - 0.015, 0],
      [radius, 0.02],
      [radius, 0.055],
      [radius - 0.03, 0.075],
    ],
    [
      [radius - 0.03, 0.075],
      [radius - 0.055, 0.09],
      [radius - 0.05, 0.11],
      [radius - 0.065, 0.13],
    ],
  ];
}

const SEGMENTS = 44;

function lathe(points: Vector2[]): BufferGeometry {
  return new LatheGeometry(points, SEGMENTS);
}

function pawn(): BufferGeometry {
  const head = 0.105;
  const headY = 0.5;
  return lathe(
    profile(
      ...foot(0.27),
      [
        [0.205, 0.13],
        [0.17, 0.16],
        [0.13, 0.22],
        [0.098, 0.3],
        [0.088, 0.35],
      ],
      [
        [0.088, 0.35],
        [0.15, 0.362],
        [0.16, 0.378],
        [0.14, 0.392],
        [0.075, 0.4],
      ],
      [[0.07, 0.405], ...arc(headY, head, -Math.PI / 2.6, Math.PI / 2, 12)],
    ),
  );
}

function rook(): BufferGeometry {
  const body = lathe(
    profile(
      ...foot(0.31),
      [
        [0.245, 0.13],
        [0.2, 0.17],
        [0.19, 0.2],
        [0.175, 0.4],
        [0.18, 0.55],
      ],
      [
        [0.18, 0.55],
        [0.215, 0.58],
        [0.235, 0.62],
        [0.235, 0.7],
      ],
      [
        [0.235, 0.7],
        [0.16, 0.7],
        [0.16, 0.67],
        [0, 0.67],
      ],
    ),
  );
  // Six merlons around the top.
  const merlons: BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const merlon = new BoxGeometry(0.105, 0.1, 0.075);
    merlon.translate(0, 0.745, 0.198);
    merlon.rotateY(angle);
    merlons.push(merlon);
  }
  return merge([body, ...merlons]);
}

function bishop(): BufferGeometry {
  const body = lathe(
    profile(
      ...foot(0.3),
      [
        [0.235, 0.13],
        [0.19, 0.16],
        [0.14, 0.23],
        [0.1, 0.36],
        [0.09, 0.46],
      ],
      [
        [0.09, 0.46],
        [0.155, 0.475],
        [0.165, 0.495],
        [0.145, 0.51],
        [0.085, 0.52],
      ],
      [
        [0.085, 0.52],
        [0.13, 0.56],
        [0.148, 0.63],
        [0.13, 0.71],
        [0.08, 0.79],
        [0.03, 0.84],
        [0.022, 0.86],
      ],
      arc(0.895, 0.042, -Math.PI / 2.4, Math.PI / 2, 8),
    ),
  );
  return body;
}

function queen(): BufferGeometry {
  const body = lathe(
    profile(
      ...foot(0.33),
      [
        [0.265, 0.13],
        [0.21, 0.17],
        [0.155, 0.26],
        [0.112, 0.44],
        [0.1, 0.6],
      ],
      [
        [0.1, 0.6],
        [0.17, 0.615],
        [0.18, 0.64],
        [0.16, 0.655],
        [0.095, 0.665],
      ],
      [
        [0.095, 0.665],
        [0.12, 0.75],
        [0.17, 0.87],
        [0.2, 0.95],
      ],
      [
        [0.2, 0.95],
        [0.17, 0.955],
        [0.1, 0.99],
        [0.05, 1.03],
      ],
      arc(1.075, 0.05, -Math.PI / 2.4, Math.PI / 2, 8),
    ),
  );
  const points: BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const ball = new SphereGeometry(0.032, 12, 8);
    ball.translate(0, 0.965, 0.19);
    ball.rotateY((i / 9) * Math.PI * 2);
    points.push(ball);
  }
  return merge([body, ...points]);
}

function king(): BufferGeometry {
  const body = lathe(
    profile(
      ...foot(0.34),
      [
        [0.275, 0.13],
        [0.22, 0.17],
        [0.16, 0.27],
        [0.118, 0.46],
        [0.105, 0.62],
      ],
      [
        [0.105, 0.62],
        [0.175, 0.635],
        [0.185, 0.66],
        [0.165, 0.675],
        [0.1, 0.685],
      ],
      [
        [0.1, 0.685],
        [0.13, 0.78],
        [0.175, 0.9],
        [0.19, 0.97],
      ],
      [
        [0.19, 0.97],
        [0.15, 0.99],
        [0.09, 1.02],
        [0.05, 1.035],
        [0, 1.04],
      ],
    ),
  );
  const upright = new BoxGeometry(0.06, 0.2, 0.06);
  upright.translate(0, 1.13, 0);
  const arm = new BoxGeometry(0.16, 0.055, 0.06);
  arm.translate(0, 1.15, 0);
  return merge([body, upright, arm]);
}

/**
 * The knight: a carved Staunton head in profile (extruded, with chamfered
 * edges), a ridged mane and eyes, on a turned foot. The head faces -x.
 */
function knight(): BufferGeometry {
  const base = lathe(
    profile(...foot(0.31), [
      [0.245, 0.13],
      [0.215, 0.15],
      [0.225, 0.17],
      [0.2, 0.185],
      [0, 0.19],
    ]),
  );
  const lift = 0.17;
  const v = (x: number, y: number) => new Vector2(x, y);
  const shape = new Shape();
  shape.moveTo(0.23, 0);
  shape.lineTo(-0.2, 0);
  // Chest and throat, up to the jaw.
  shape.splineThru([v(-0.21, 0.1), v(-0.16, 0.22), v(-0.12, 0.3), v(-0.15, 0.37)]);
  // Under the jaw, forward to the muzzle, and the nose.
  shape.splineThru([v(-0.25, 0.41), v(-0.33, 0.44), v(-0.37, 0.48), v(-0.365, 0.53)]);
  shape.splineThru([v(-0.33, 0.565), v(-0.24, 0.61), v(-0.15, 0.665), v(-0.09, 0.7)]);
  // The ear.
  shape.lineTo(-0.045, 0.77);
  shape.lineTo(-0.005, 0.7);
  // Poll, then the arched back of the neck down to the foot.
  shape.splineThru([v(0.07, 0.66), v(0.16, 0.57), v(0.225, 0.43), v(0.26, 0.26), v(0.255, 0.1)]);
  shape.lineTo(0.23, 0);
  const depth = 0.19;
  const head = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.028,
    bevelSegments: 5,
    curveSegments: 14,
  });
  head.translate(0, lift, -depth / 2);
  const face = depth / 2 + 0.05;
  const parts: BufferGeometry[] = [base, head];
  for (const side of [-1, 1]) {
    // Eye.
    const eye = new SphereGeometry(0.034, 12, 8);
    eye.scale(1.2, 0.8, 0.45);
    eye.translate(-0.13, lift + 0.6, side * (face - 0.008));
    parts.push(eye);
    // Nostril.
    const nostril = new SphereGeometry(0.022, 10, 6);
    nostril.scale(1, 0.8, 0.4);
    nostril.translate(-0.31, lift + 0.5, side * (face - 0.02));
    parts.push(nostril);
  }
  // The mane: a row of ridges down the back of the neck.
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const ridge = new BoxGeometry(0.05, 0.075, depth + 0.13);
    ridge.rotateZ(-0.55 - t * 0.6);
    ridge.translate(0.03 + t * 0.2, lift + 0.64 - t * 0.44, 0);
    parts.push(ridge);
  }
  return merge(parts);
}

function merge(parts: BufferGeometry[]): BufferGeometry {
  // Lathe and box geometry carry different attributes; keep the common ones.
  const cleaned = parts.map((part) => {
    const geometry = part.index ? part.toNonIndexed() : part;
    for (const name of Object.keys(geometry.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') geometry.deleteAttribute(name);
    }
    return geometry;
  });
  return mergeGeometries(cleaned, false);
}

const BUILDERS: Record<PieceType, () => BufferGeometry> = {
  p: pawn,
  n: knight,
  b: bishop,
  r: rook,
  q: queen,
  k: king,
};

const cache = new Map<PieceType, BufferGeometry>();

export function pieceGeometry(type: PieceType): BufferGeometry {
  let geometry = cache.get(type);
  if (!geometry) {
    geometry = BUILDERS[type]();
    geometry.computeBoundingBox();
    cache.set(type, geometry);
  }
  return geometry;
}

/** How tall each piece stands, for lifting and toppling. */
export const PIECE_HEIGHT: Record<PieceType, number> = {
  p: 0.61,
  n: 0.86,
  b: 0.94,
  r: 0.8,
  q: 1.13,
  k: 1.22,
};

export type PieceMaterials = Record<'w' | 'b', Material>;
