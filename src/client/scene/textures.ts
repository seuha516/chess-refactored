// Stone and light, painted on canvases at start-up: no image files to ship.
import {
  CanvasTexture,
  ClampToEdgeWrapping,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three';

/** Deterministic noise, so the table looks the same on every visit. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(width: number, height = width): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  const context = element.getContext('2d');
  if (!context) throw new Error('2D canvas is not available');
  return [element, context];
}

function texture(source: HTMLCanvasElement, color = true, repeat = false): CanvasTexture {
  const result = new CanvasTexture(source);
  if (color) result.colorSpace = SRGBColorSpace;
  result.wrapS = result.wrapT = repeat ? RepeatWrapping : ClampToEdgeWrapping;
  result.minFilter = LinearMipmapLinearFilter;
  result.magFilter = LinearFilter;
  result.anisotropy = 8;
  return result;
}

/** Scatters specks of the given colours, sized `min`..`max` px. */
function specks(
  context: CanvasRenderingContext2D,
  rand: () => number,
  count: number,
  colors: readonly string[],
  min: number,
  max: number,
  box = { x: 0, y: 0, w: context.canvas.width, h: context.canvas.height },
): void {
  for (let i = 0; i < count; i++) {
    context.fillStyle = colors[Math.floor(rand() * colors.length)] ?? '#000';
    const size = min + rand() ** 2 * (max - min);
    context.beginPath();
    context.ellipse(
      box.x + rand() * box.w,
      box.y + rand() * box.h,
      size,
      size * (0.5 + rand() * 0.5),
      rand() * Math.PI,
      0,
      Math.PI * 2,
    );
    context.fill();
  }
}

/** Soft wandering veins across a stone face. */
function veins(
  context: CanvasRenderingContext2D,
  rand: () => number,
  count: number,
  color: string,
  width: number,
  angle: number,
  box: { x: number; y: number; w: number; h: number },
  wander = 0.35,
): void {
  context.save();
  context.beginPath();
  context.rect(box.x, box.y, box.w, box.h);
  context.clip();
  context.strokeStyle = color;
  context.lineCap = 'round';
  context.filter = `blur(${String(Math.max(0.6, width * 0.6))}px)`;
  for (let i = 0; i < count; i++) {
    const length = Math.max(box.w, box.h) * 1.6;
    let x = box.x + rand() * box.w - Math.cos(angle) * length * 0.5;
    let y = box.y + rand() * box.h - Math.sin(angle) * length * 0.5;
    context.lineWidth = width * (0.4 + rand());
    context.beginPath();
    context.moveTo(x, y);
    let heading = angle + (rand() - 0.5) * 0.5;
    for (let step = 0; step < 24; step++) {
      heading += (rand() - 0.5) * wander;
      x += Math.cos(heading) * (length / 24);
      y += Math.sin(heading) * (length / 24);
      context.lineTo(x, y);
    }
    context.stroke();
  }
  context.filter = 'none';
  context.restore();
}

export interface BoardTextures {
  readonly map: Texture;
  readonly roughness: Texture;
}

/**
 * The inlaid playing field: every square its own cut of travertine or slate,
 * with a hairline joint between them. a1 sits at the bottom-left of the canvas.
 */
export function boardTextures(size = 1024): BoardTextures {
  const [colorCanvas, color] = canvas(size);
  const [roughCanvas, rough] = canvas(size);
  const rand = random(64);
  const cell = size / 8;
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const light = (file + rank) % 2 === 1;
      const box = { x: file * cell, y: (7 - rank) * cell, w: cell, h: cell };
      const tone = rand();
      if (light) {
        // Travertine: warm, banded, pitted.
        color.fillStyle = `hsl(${String(37 + tone * 5)} ${String(26 + tone * 8)}% ${String(79 + tone * 4)}%)`;
        color.fillRect(box.x, box.y, box.w, box.h);
        // Cut across or along its layers: long, nearly parallel bands.
        const across = (rand() < 0.5 ? 0 : Math.PI / 2) + (rand() - 0.5) * 0.12;
        veins(color, rand, 9, 'rgba(172, 138, 94, 0.13)', cell * 0.07, across, box, 0.05);
        veins(color, rand, 6, 'rgba(255, 251, 240, 0.22)', cell * 0.025, across, box, 0.05);
        specks(
          color,
          rand,
          30,
          ['rgba(120, 92, 58, 0.35)', 'rgba(90, 70, 44, 0.3)'],
          0.6,
          2.2,
          box,
        );
        rough.fillStyle = '#8c8c8c';
      } else {
        // Slate: cool green-grey with fine cleavage lines.
        color.fillStyle = `hsl(${String(160 + tone * 20)} ${String(4 + tone * 4)}% ${String(29 + tone * 5)}%)`;
        color.fillRect(box.x, box.y, box.w, box.h);
        const across = rand() * Math.PI;
        veins(color, rand, 5, 'rgba(14, 20, 19, 0.2)', cell * 0.03, across, box, 0.1);
        veins(color, rand, 3, 'rgba(200, 212, 206, 0.07)', cell * 0.02, across, box, 0.1);
        specks(
          color,
          rand,
          40,
          ['rgba(12, 18, 16, 0.35)', 'rgba(180, 196, 186, 0.18)'],
          0.5,
          1.6,
          box,
        );
        rough.fillStyle = '#707070';
      }
      rough.fillRect(box.x, box.y, box.w, box.h);
    }
  }
  // Joints between the inlaid squares.
  color.strokeStyle = 'rgba(24, 22, 18, 0.55)';
  color.lineWidth = 2;
  rough.strokeStyle = '#d0d0d0';
  rough.lineWidth = 3;
  for (let i = 0; i <= 8; i++) {
    for (const context of [color, rough]) {
      context.beginPath();
      context.moveTo(i * cell, 0);
      context.lineTo(i * cell, size);
      context.moveTo(0, i * cell);
      context.lineTo(size, i * cell);
      context.stroke();
    }
  }
  return { map: texture(colorCanvas), roughness: texture(roughCanvas, false) };
}

/**
 * The polished granite slab around the board, as seen from above, with the
 * coordinates engraved on all four sides of the playing field.
 * `width` × `depth` in board squares; the board (8 × 8) is centred.
 */
export function slabTexture(
  width: number,
  depth: number,
  pxPerSquare: number,
  facing: 'w' | 'b',
): BoardTextures {
  const w = Math.round(width * pxPerSquare);
  const h = Math.round(depth * pxPerSquare);
  const [colorCanvas, color] = canvas(w, h);
  const [roughCanvas, rough] = canvas(w, h);
  const rand = random(7);
  // Warm brown granite: dark enough for the sunlight, light enough for basalt pieces.
  color.fillStyle = '#46372c';
  color.fillRect(0, 0, w, h);
  specks(
    color,
    rand,
    Math.round(w * h * 0.012),
    ['#57463a', '#34281f', '#655242', '#2c221b'],
    0.8,
    3.4,
  );
  specks(color, rand, Math.round(w * h * 0.0005), ['#9a8870', '#a8977e', '#857462'], 0.6, 2);
  specks(color, rand, Math.round(w * h * 0.00012), ['#6e3f2c', '#7d6450'], 1.5, 4);
  rough.fillStyle = '#4a4a4a';
  rough.fillRect(0, 0, w, h);
  specks(rough, rand, Math.round(w * h * 0.004), ['#666', '#3a3a3a'], 1, 4);

  const cx = w / 2;
  const cy = h / 2;
  const unit = pxPerSquare;
  const files = 'abcdefgh';
  const inset = 4 + 0.32; // distance of the letters from the centre, in squares
  const engrave = (text: string, x: number, y: number, rotation: number) => {
    for (const [context, fill, shadow] of [
      [color, 'rgba(196, 188, 170, 0.62)', 'rgba(0, 0, 0, 0.7)'],
      [rough, '#b4b4b4', '#b4b4b4'],
    ] as const) {
      context.save();
      context.translate(x, y);
      context.rotate(rotation);
      context.font = `600 ${String(Math.round(unit * 0.26))}px "Hahmlet Variable", Georgia, serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillStyle = shadow;
      context.fillText(text, 0, -unit * 0.012);
      context.fillStyle = fill;
      context.fillText(text, 0, unit * 0.01);
      context.restore();
    }
  };
  // Engraved on the viewer's two edges, upright for them.
  for (let i = 0; i < 8; i++) {
    const along = (i - 3.5) * unit;
    const file = files.charAt(i);
    const rank = String(i + 1);
    if (facing === 'w') {
      engrave(file, cx + along, cy + inset * unit, 0);
      engrave(rank, cx - inset * unit, cy - along, 0);
    } else {
      engrave(file, cx + along, cy - inset * unit, Math.PI);
      engrave(rank, cx + inset * unit, cy - along, Math.PI);
    }
  }
  // A worn, lighter band where the board meets the slab.
  color.strokeStyle = 'rgba(210, 200, 180, 0.22)';
  color.lineWidth = unit * 0.035;
  color.strokeRect(cx - 4.06 * unit, cy - 4.06 * unit, 8.12 * unit, 8.12 * unit);
  return { map: texture(colorCanvas), roughness: texture(roughCanvas, false) };
}

/** Rough granite for the pedestal, stools and slab edges (tiles). */
export function graniteTexture(size = 256): Texture {
  const [element, context] = canvas(size);
  const rand = random(11);
  context.fillStyle = '#3d3027';
  context.fillRect(0, 0, size, size);
  specks(context, rand, size * size * 0.03, ['#4c3d31', '#2a2019', '#5a493b', '#241b15'], 0.6, 2.2);
  specks(context, rand, size * size * 0.004, ['#9c8a70', '#b09c80'], 0.5, 1.6);
  return texture(element, true, true);
}

/** Park paving in shade, far below the table (tiles). */
export function pavingTexture(size = 512): Texture {
  const [element, context] = canvas(size);
  const rand = random(3);
  context.fillStyle = '#3d3f37';
  context.fillRect(0, 0, size, size);
  const rows = 4;
  const height = size / rows;
  for (let row = 0; row < rows; row++) {
    const offset = row % 2 ? height : 0;
    for (let x = -offset; x < size; x += height * 2) {
      const tone = 34 + rand() * 12;
      context.fillStyle = `hsl(${String(60 + rand() * 30)} 6% ${String(tone)}%)`;
      context.fillRect(x + 3, row * height + 3, height * 2 - 6, height - 6);
    }
  }
  specks(context, rand, size * size * 0.01, ['rgba(0,0,0,0.25)', 'rgba(255,255,240,0.08)'], 0.5, 2);
  return texture(element, true, true);
}

/**
 * Pieces: pale alabaster or black basalt, with faint veining (tiles around
 * the lathe).
 */
export function pieceStoneTexture(dark: boolean, size = 256): Texture {
  const [element, context] = canvas(size);
  const rand = random(dark ? 21 : 22);
  context.fillStyle = dark ? '#2a2e2d' : '#efe7d8';
  context.fillRect(0, 0, size, size);
  const box = { x: 0, y: 0, w: size, h: size };
  if (dark) {
    veins(context, rand, 6, 'rgba(160, 170, 162, 0.16)', 1.6, 0.9, box);
    specks(context, rand, 500, ['rgba(0,0,0,0.3)', 'rgba(120,130,122,0.14)'], 0.4, 1.4);
  } else {
    veins(context, rand, 5, 'rgba(176, 150, 112, 0.2)', 2.2, 1.1, box);
    veins(context, rand, 4, 'rgba(255, 255, 255, 0.4)', 1.2, 0.9, box);
    specks(context, rand, 260, ['rgba(150,120,80,0.16)'], 0.4, 1.2);
  }
  return texture(element, true, true);
}

/**
 * The canopy the sun shines through: bright gaps between dark leaf clusters,
 * soft-edged. Used as the sun's light cookie.
 */
export function canopyTexture(size = 512): Texture {
  const [element, context] = canvas(size);
  const rand = random(5);
  context.fillStyle = '#fff';
  context.fillRect(0, 0, size, size);
  context.filter = `blur(${String(Math.round(size / 110))}px)`;
  for (let cluster = 0; cluster < 22; cluster++) {
    const cx = rand() * size;
    const cy = rand() * size;
    // Keep most of the middle (the board) in the sun.
    if (Math.hypot(cx - size / 2, cy - size / 2) < size * 0.16 && rand() < 0.7) continue;
    const spread = size * (0.04 + rand() * 0.08);
    for (let leaf = 0; leaf < 34; leaf++) {
      const alpha = 0.55 + rand() * 0.35;
      context.fillStyle = `rgba(0, 0, 0, ${alpha.toFixed(2)})`;
      context.beginPath();
      context.ellipse(
        cx + (rand() - 0.5) * spread * 2,
        cy + (rand() - 0.5) * spread * 2,
        size * (0.012 + rand() * 0.02),
        size * (0.006 + rand() * 0.01),
        rand() * Math.PI,
        0,
        Math.PI * 2,
      );
      context.fill();
    }
  }
  context.filter = 'none';
  // The edge of the cookie falls into full shade, so the spot has no rim.
  const fade = context.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.34,
    size / 2,
    size / 2,
    size / 2,
  );
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  context.fillStyle = fade;
  context.fillRect(0, 0, size, size);
  return texture(element);
}

/** A soft round puff for dust. */
export function puffTexture(size = 64): Texture {
  const [element, context] = canvas(size);
  const gradient = context.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return texture(element);
}

/** A glow for the king in check, and for light pooling on a square. */
export function glowTexture(size = 128): Texture {
  const [element, context] = canvas(size);
  const gradient = context.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.5, 'rgba(255,255,255,0.5)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return texture(element);
}
