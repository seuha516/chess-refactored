// The table in 3D: a polished granite slab with an inlaid board, stone
// pieces, low sun through a canopy. It acts out what the server reports
// (moves, captures, checks, mates) and follows the pointer while dragging.
// Input, focus and screen-reader text stay in the DOM board, which is laid
// exactly over the 3D board with a projective CSS transform.
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color as Tint,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  Material,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  Points,
  PointsMaterial,
  Quaternion,
  Raycaster,
  RingGeometry,
  Scene,
  Shape,
  SphereGeometry,
  SpotLight,
  SRGBColorSpace,
  TetrahedronGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import {
  fileOf,
  makeSquare,
  rankOf,
  type Board,
  type Color,
  type EndReason,
  type PieceType,
  type PromotionPiece,
  type Square,
} from '../../shared/chess/index.ts';
import * as sfx from '../sfx.ts';
import type { BoardModel } from '../view-model.ts';
import { homography } from './overlay.ts';
import { impactOf, planMove, type MovePlan } from './plan.ts';
import { PIECE_HEIGHT, pieceGeometry } from './pieces.ts';
import {
  boardTextures,
  canopyTexture,
  glowTexture,
  graniteTexture,
  pavingTexture,
  pieceStoneTexture,
  puffTexture,
  slabTexture,
} from './textures.ts';

export type SceneMode = 'lobby' | 'room';

/** Everything the table shows, derived from the room snapshot. */
export interface SceneModel {
  readonly board: BoardModel;
  readonly gameId: string | null;
  readonly status: 'none' | 'playing' | 'finished';
  readonly outcome: { readonly winner: Color | null; readonly reason: EndReason } | null;
  /** Pieces of each colour that have been taken. */
  readonly captured: Readonly<Record<Color, readonly PieceType[]>>;
  /** The viewer's colour in the game, for sounds and buzzes that concern them. */
  readonly me: Color | null;
  /** A move of this viewer is waiting for the server. */
  readonly pending: boolean;
  /** How the result reads to this viewer, while it is shown. */
  readonly resultTone: 'win' | 'loss' | 'draw' | 'neutral' | null;
}

/** What the DOM board tells the table while the pointer moves over it. */
export interface BoardPresenter {
  hover(square: Square | null): void;
  dragStart(from: Square, x: number, y: number): void;
  dragMove(x: number, y: number, over: Square | null): void;
  dragEnd(): void;
}

type Tier = 'high' | 'low';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const coarse = window.matchMedia('(pointer: coarse)');

/** Sunlight, the only accent: what is active stands in the light. */
const SUN = new Tint('#ffc978');
const SUN_CORE = new Tint('#fff0cf');
const CHECK = new Tint('#ff4a2e');
const BOARD_Y = 0.002;
const SLAB_W = 14.4;
const SLAB_D = 10.6;
const SLAB_H = 0.9;
const GROUND_Y = -14.4;
const OVERLAY_SIZE = 512;
const SELECT_LIFT = 0.34;
const HOVER_LIFT = 0.07;
const DRAG_LIFT = 0.55;

const ease = {
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
  inQuad: (t: number) => t * t,
  outBack: (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2,
};

/** Board square → world position of its centre (white sits at +z). */
function squarePosition(square: Square, target = new Vector3()): Vector3 {
  return target.set(fileOf(square) - 3.5, BOARD_Y, 3.5 - rankOf(square));
}

/** Where the n-th piece taken by `side` stands on the slab, beside the board. */
function gravePosition(side: Color, index: number, target = new Vector3()): Vector3 {
  const column = Math.floor(index / 8);
  const row = index % 8;
  const sign = side === 'w' ? 1 : -1;
  return target.set(sign * (5.2 + column * 0.82), BOARD_Y, sign * (3.55 - row * 0.98));
}

function detectTier(): Tier | null {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2');
    if (!gl) return null;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    // Software rendering (no GPU): keep the scene, drop the costly parts.
    return /swiftshader|llvmpipe|software|basic render/i.test(name) ? 'low' : 'high';
  } catch {
    return null;
  }
}

/** Creates the table, or returns null when this browser cannot draw it. */
export async function createStage(): Promise<TableStage | null> {
  const tier = detectTier();
  if (!tier) return null;
  // The coordinates are engraved in the display face; wait for it briefly.
  await Promise.race([
    document.fonts.load('600 32px "Hahmlet Variable"').catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]);
  try {
    return new TableStage(tier);
  } catch {
    return null;
  }
}

type Place =
  | { readonly kind: 'board'; readonly square: Square }
  | { readonly kind: 'grave'; readonly side: Color; readonly index: number };

function samePlace(a: Place, b: Place): boolean {
  return a.kind === 'board'
    ? b.kind === 'board' && a.square === b.square
    : b.kind === 'grave' && a.side === b.side && a.index === b.index;
}

interface Actor {
  readonly root: Group;
  readonly mesh: Mesh;
  readonly color: Color;
  type: PieceType;
  place: Place;
  /** Height above the board while resting (hover, selection). */
  lift: number;
  /** Something else (a flight, a drag, a topple) moves this piece. */
  busy: boolean;
  /** Bumped by every new animation, so an older one stops touching the piece. */
  token: number;
  toppled: boolean;
}

interface Tween {
  /** Advances by dt seconds of game time; returns true when finished. */
  step(dt: number): boolean;
}

interface Pose {
  azimuth: number;
  elevation: number;
  zoom: number;
  focus: Vector3;
}

interface Markers {
  readonly last: [Mesh, Mesh];
  readonly selected: Mesh;
  readonly selectedGlow: Mesh;
  readonly hover: Mesh;
  readonly check: Mesh;
  readonly dots: Mesh[];
  readonly rings: Mesh[];
}

interface Particle {
  alive: boolean;
  age: number;
  life: number;
  position: Vector3;
  velocity: Vector3;
  spin?: Vector3;
  rotation?: Vector3;
  scale: number;
}

export class TableStage implements BoardPresenter {
  readonly #tier: Tier;
  readonly #renderer: WebGLRenderer;
  readonly #scene = new Scene();
  readonly #camera = new PerspectiveCamera(30, 1, 0.5, 220);
  readonly #measure = new PerspectiveCamera(30, 1, 0.5, 220);
  readonly #sun: SpotLight;
  readonly #flash = new PointLight('#ffd9a0', 0, 7, 1.6);
  readonly #pieceMaterials: Record<Color, Material>;
  readonly #actors = new Set<Actor>();
  readonly #tweens: Tween[] = [];
  readonly #markers: Markers;
  readonly #dust: { readonly points: Points; readonly particles: Particle[] };
  readonly #chips: { readonly mesh: InstancedMesh; readonly particles: Particle[] };
  readonly #resize: ResizeObserver;

  #host: HTMLElement | null = null;
  #overlay: HTMLElement | null = null;
  #mode: SceneMode = 'lobby';
  #width = 1;
  #height = 1;
  #insets = { top: 0, right: 0, bottom: 0, left: 0 };
  #engrave: (side: Color) => void = () => undefined;
  #fitCache = new Map<string, { distance: number; offsetX: number; offsetY: number }>();

  #pose: Pose = { azimuth: 0.6, elevation: 0.62, zoom: 1.05, focus: new Vector3() };
  #poseAnim: {
    from: Pose;
    to: Pose;
    elapsed: number;
    duration: number;
    arc: number;
  } | null = null;
  #orientation: Color = 'w';
  #focusHold = 0;

  #model: SceneModel | null = null;
  #shown: Board | null = null;
  #shownPly = -1;
  #gameId: string | null = null;
  #status: SceneModel['status'] = 'none';
  /** A move this viewer made, already acted out before the server confirmed it. */
  #local: { from: Square; to: Square; ply: number } | null = null;
  #hovered: Square | null = null;
  #drag: {
    actor: Actor;
    point: Vector3;
    velocity: Vector3;
  } | null = null;
  #released: Actor | null = null;
  #overlayKey = '';

  #frame = 0;
  #last = 0;
  #lastRender = 0;
  #time = 0;
  #freezeUntil = 0;
  #timeScale = 1;
  #trauma = 0;
  #punch = 0;
  #shakeSeed = Math.random() * 100;
  #checkPulse = 0;
  readonly #raycaster = new Raycaster();
  readonly #plane = new Plane(new Vector3(0, 1, 0), -DRAG_LIFT);

  constructor(tier: Tier) {
    this.#tier = tier;
    this.#renderer = new WebGLRenderer({
      antialias: tier === 'high',
      powerPreference: 'high-performance',
    });
    const renderer = this.#renderer;
    renderer.setPixelRatio(
      tier === 'high' ? Math.min(window.devicePixelRatio, coarse.matches ? 2 : 2) : 1,
    );
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = tier === 'high';
    renderer.shadowMap.type = PCFShadowMap;
    renderer.domElement.className = 'scene-canvas';
    renderer.domElement.setAttribute('aria-hidden', 'true');

    const scene = this.#scene;
    scene.background = new Tint('#101714');
    scene.fog = new Fog('#101714', 34, 78);
    scene.environment = this.#environment();
    scene.environmentIntensity = 0.7;

    // Low sun through leaves: a far spotlight with the canopy as its cookie.
    const sun = new SpotLight('#ffd7a3', 3.4, 0, 0.36, 0.25, 0);
    sun.position.set(-30, 23, -13);
    sun.target.position.set(0, 0, 0);
    sun.map = canopyTexture(tier === 'high' ? 512 : 256);
    sun.castShadow = tier === 'high';
    sun.shadow.mapSize.set(coarse.matches ? 1024 : 2048, coarse.matches ? 1024 : 2048);
    sun.shadow.bias = -0.0003;
    sun.shadow.radius = 4;
    sun.shadow.blurSamples = 12;
    sun.shadow.normalBias = 0.025;
    sun.shadow.camera.near = 20;
    sun.shadow.camera.far = 80;
    scene.add(sun, sun.target);
    this.#sun = sun;
    // A tier without shadows still needs the cookie, which three.js only
    // projects for shadow-casting spots; keep the light's shadow but tiny.
    if (tier === 'low') {
      sun.castShadow = true;
      sun.shadow.mapSize.set(256, 256);
      renderer.shadowMap.enabled = true;
    }
    scene.add(new HemisphereLight('#a7c0c2', '#4a3b28', 1.05));
    scene.add(this.#flash);

    this.#pieceMaterials = {
      w: new MeshPhysicalMaterial({
        map: pieceStoneTexture(false),
        roughness: 0.34,
        clearcoat: 0.35,
        clearcoatRoughness: 0.28,
        sheen: 0.35,
        sheenColor: new Tint('#fff1dc'),
        sheenRoughness: 0.6,
      }),
      b: new MeshPhysicalMaterial({
        map: pieceStoneTexture(true),
        roughness: 0.22,
        clearcoat: 0.9,
        clearcoatRoughness: 0.1,
      }),
    };

    this.#buildTable();
    this.#markers = this.#buildMarkers();
    this.#dust = this.#buildDust();
    this.#chips = this.#buildChips();

    this.#resize = new ResizeObserver(() => {
      this.#measureHost();
    });
    reducedMotion.addEventListener('change', () => {
      this.#wake();
    });
  }

  // ------------------------------------------------------------- building

  /** Reflections: warm low sky, dark canopy, one bright sun. */
  #environment() {
    const sky = new Scene();
    const dome = new SphereGeometry(50, 32, 16);
    const colors: number[] = [];
    const top = new Tint('#6f8c99');
    const horizon = new Tint('#f0c893');
    const below = new Tint('#2a2820');
    const position = dome.getAttribute('position');
    const mixed = new Tint();
    for (let i = 0; i < position.count; i++) {
      const y = position.getY(i) / 50;
      if (y > 0) mixed.copy(horizon).lerp(top, Math.pow(y, 0.6));
      else mixed.copy(horizon).lerp(below, Math.min(1, -y * 4));
      colors.push(mixed.r, mixed.g, mixed.b);
    }
    dome.setAttribute('color', new Float32BufferAttribute(colors, 3));
    sky.add(new Mesh(dome, new MeshBasicMaterial({ vertexColors: true, side: BackSide })));
    const leaves = new MeshBasicMaterial({ color: '#16211a' });
    for (let i = 0; i < 14; i++) {
      const blob = new Mesh(new SphereGeometry(6 + (i % 4) * 2, 12, 8), leaves);
      const angle = (i / 14) * Math.PI * 2;
      blob.position.set(Math.cos(angle) * 38, 18 + (i % 3) * 7, Math.sin(angle) * 38);
      sky.add(blob);
    }
    const disc = new Mesh(
      new SphereGeometry(2.4, 16, 8),
      new MeshBasicMaterial({ color: new Tint(18, 13, 8) }),
    );
    disc.position.set(-30, 23, -13).setLength(44);
    sky.add(disc);
    const generator = new PMREMGenerator(this.#renderer);
    const target = generator.fromScene(sky, 0.02);
    generator.dispose();
    return target.texture;
  }

  #buildTable(): void {
    const scene = this.#scene;
    const anisotropy = this.#renderer.capabilities.getMaxAnisotropy();

    // The slab: a rounded, chamfered block whose top is flush with the board.
    const outline = new Shape();
    const w = SLAB_W / 2;
    const d = SLAB_D / 2;
    const r = 0.7;
    outline.moveTo(-w + r, -d);
    outline.lineTo(w - r, -d);
    outline.quadraticCurveTo(w, -d, w, -d + r);
    outline.lineTo(w, d - r);
    outline.quadraticCurveTo(w, d, w - r, d);
    outline.lineTo(-w + r, d);
    outline.quadraticCurveTo(-w, d, -w, d - r);
    outline.lineTo(-w, -d + r);
    outline.quadraticCurveTo(-w, -d, -w + r, -d);
    const bevel = 0.08;
    const slabGeometry = new ExtrudeGeometry(outline, {
      depth: SLAB_H,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 3,
      curveSegments: 10,
    });
    slabGeometry.rotateX(-Math.PI / 2);
    slabGeometry.translate(0, -(SLAB_H + bevel), 0);
    const density = this.#tier === 'high' ? 112 : 64;
    const faces = {
      w: slabTexture(SLAB_W, SLAB_D, density, 'w'),
      b: slabTexture(SLAB_W, SLAB_D, density, 'b'),
    };
    for (const face of [faces.w, faces.b]) {
      for (const texture of [face.map, face.roughness]) {
        texture.repeat.set(1 / SLAB_W, 1 / SLAB_D);
        texture.offset.set(0.5, 0.5);
        texture.anisotropy = anisotropy;
      }
    }
    const slabTop = faces.w;
    const granite = graniteTexture();
    granite.repeat.set(0.35, 0.35);
    const slab = new Mesh(slabGeometry, [
      new MeshPhysicalMaterial({
        map: slabTop.map,
        roughnessMap: slabTop.roughness,
        roughness: 1,
        clearcoat: 0.55,
        clearcoatRoughness: 0.2,
      }),
      new MeshStandardMaterial({ map: granite, roughness: 0.55 }),
    ]);
    slab.receiveShadow = true;
    slab.castShadow = true;
    scene.add(slab);
    // The coordinates are engraved for whoever sits at the near edge.
    this.#engrave = (side) => {
      const top = slab.material[0];
      if (!(top instanceof MeshPhysicalMaterial)) return;
      top.map = faces[side].map;
      top.roughnessMap = faces[side].roughness;
    };

    // The inlaid playing field.
    const inlay = boardTextures(this.#tier === 'high' ? 1024 : 512);
    inlay.map.anisotropy = anisotropy;
    const board = new Mesh(
      new PlaneGeometry(8, 8),
      new MeshPhysicalMaterial({
        map: inlay.map,
        roughnessMap: inlay.roughness,
        roughness: 1,
        clearcoat: 0.35,
        clearcoatRoughness: 0.3,
      }),
    );
    board.rotation.x = -Math.PI / 2;
    board.position.y = 0.001;
    board.receiveShadow = true;
    scene.add(board);

    // Pedestal and the paving far below, in shade.
    const rough = new MeshStandardMaterial({ map: granite, roughness: 0.85, color: '#9a9a92' });
    const pedestal = new Mesh(new CylinderGeometry(2.4, 3.1, -GROUND_Y - SLAB_H, 32), rough);
    pedestal.position.y = GROUND_Y + (-GROUND_Y - SLAB_H) / 2;
    pedestal.receiveShadow = true;
    scene.add(pedestal);
    const paving = pavingTexture();
    paving.repeat.set(26, 26);
    paving.anisotropy = anisotropy;
    const ground = new Mesh(
      new PlaneGeometry(160, 160),
      new MeshStandardMaterial({ map: paving, roughness: 0.95, color: '#8c8c80' }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = GROUND_Y;
    ground.receiveShadow = true;
    scene.add(ground);
  }

  #buildMarkers(): Markers {
    const flat = (geometry: BufferGeometry, color: Tint, opacity: number, additive = false) => {
      const mesh = new Mesh(
        geometry,
        new MeshBasicMaterial({
          color,
          transparent: true,
          opacity,
          depthWrite: false,
          toneMapped: false,
          ...(additive ? { blending: AdditiveBlending } : {}),
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.renderOrder = 2;
      this.#scene.add(mesh);
      return mesh;
    };
    const square = new PlaneGeometry(1, 1);
    const glow = glowTexture();
    const glowMesh = (color: Tint, size: number, opacity: number) => {
      const mesh = flat(new PlaneGeometry(size, size), color, opacity, true);
      mesh.material.map = glow;
      return mesh;
    };
    // A square frame: a four-sided ring turned by 45°.
    const frame = new RingGeometry(0.62, 0.7, 4, 1, Math.PI / 4);
    // Where the selected piece may go: small pools of light on the stone,
    // a hard bright core in a soft glow; rings of light round a piece to take.
    const dotGeometry = new CircleGeometry(0.085, 28);
    const ringGeometry = new RingGeometry(0.4, 0.455, 48);
    const dots: Mesh[] = [];
    const rings: Mesh[] = [];
    for (let i = 0; i < 28; i++) {
      const dot = glowMesh(SUN, 0.62, 0.75);
      const core = flat(dotGeometry, SUN_CORE, 1);
      core.rotation.x = 0;
      core.position.z = 0.0008;
      core.visible = true;
      dot.add(core);
      dots.push(dot);
    }
    for (let i = 0; i < 16; i++) {
      const ring = flat(ringGeometry, SUN_CORE, 0.95, true);
      const halo = glowMesh(SUN, 1.25, 0.35);
      halo.rotation.x = 0;
      halo.position.z = -0.0008;
      halo.visible = true;
      ring.add(halo);
      rings.push(ring);
    }
    return {
      last: [flat(square, SUN, 0.2), flat(square, SUN, 0.3)],
      selected: flat(square, SUN, 0.42),
      selectedGlow: glowMesh(SUN, 2.2, 0.55),
      hover: flat(frame, SUN, 0.95),
      check: glowMesh(CHECK, 1.9, 0.8),
      dots,
      rings,
    };
  }

  #buildDust(): { points: Points; particles: Particle[] } {
    const count = 160;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute('color', new BufferAttribute(new Float32Array(count * 4), 4));
    const points = new Points(
      geometry,
      new PointsMaterial({
        map: puffTexture(),
        size: 0.55,
        transparent: true,
        depthWrite: false,
        vertexColors: true,
        color: '#d8ccb6',
      }),
    );
    points.frustumCulled = false;
    points.renderOrder = 3;
    this.#scene.add(points);
    const particles: Particle[] = Array.from({ length: count }, () => ({
      alive: false,
      age: 0,
      life: 1,
      position: new Vector3(),
      velocity: new Vector3(),
      scale: 1,
    }));
    return { points, particles };
  }

  #buildChips(): { mesh: InstancedMesh; particles: Particle[] } {
    const count = 72;
    const mesh = new InstancedMesh(
      new TetrahedronGeometry(0.045),
      new MeshStandardMaterial({ color: '#bdb5a4', roughness: 0.6 }),
      count,
    );
    mesh.castShadow = this.#tier === 'high';
    mesh.frustumCulled = false;
    const hidden = new Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < count; i++) mesh.setMatrixAt(i, hidden);
    this.#scene.add(mesh);
    const particles: Particle[] = Array.from({ length: count }, () => ({
      alive: false,
      age: 0,
      life: 1,
      position: new Vector3(),
      velocity: new Vector3(),
      spin: new Vector3(),
      rotation: new Vector3(),
      scale: 1,
    }));
    return { mesh, particles };
  }

  // ------------------------------------------------------------ hosting

  /**
   * Shows the table inside `host`: idling under the canopy in the lobby, or
   * framed for play in a room with `overlay` (the DOM board) laid over it.
   */
  mount(host: HTMLElement, mode: SceneMode, overlay: HTMLElement | null): void {
    const previousMode = this.#mode;
    if (this.#host !== host) {
      if (this.#host) this.#resize.unobserve(this.#host);
      host.prepend(this.#renderer.domElement);
      this.#host = host;
      this.#resize.observe(host);
    }
    this.#overlay = overlay;
    this.#overlayKey = '';
    this.#mode = mode;
    this.#measureHost();
    if (mode === 'lobby') {
      this.#local = null;
      this.#flyTo(this.#lobbyPose(), previousMode === 'room' ? 1.4 : 0);
    } else if (previousMode === 'lobby') {
      // Arriving at the table: the camera comes down to the chair.
      this.#pose = {
        azimuth: this.#goalAzimuth() - 0.7,
        elevation: 1.2,
        zoom: 1.7,
        focus: new Vector3(),
      };
      this.#flyTo(this.#roomPose(), 1.5);
    }
    this.#wake();
  }

  #measureHost(): void {
    const host = this.#host;
    if (!host) return;
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    const style = getComputedStyle(host);
    const inset = (name: string) => parseFloat(style.getPropertyValue(name)) || 0;
    this.#insets = {
      top: inset('--safe-top'),
      right: inset('--safe-right'),
      bottom: inset('--safe-bottom'),
      left: inset('--safe-left'),
    };
    this.#width = width;
    this.#height = height;
    this.#renderer.setSize(width, height, false);
    this.#fitCache.clear();
    this.#overlayKey = '';
    if (!this.#poseAnim) {
      const goal = this.#mode === 'room' ? this.#roomPose() : null;
      if (goal) this.#pose.elevation = goal.elevation;
    }
    this.#wake();
  }

  // ------------------------------------------------------------- camera

  #goalAzimuth(): number {
    return this.#orientation === 'w' ? 0 : Math.PI;
  }

  /** Steeper on tall screens, so the far squares stay large enough to tap. */
  #elevation(): number {
    const safeW = this.#width - this.#insets.left - this.#insets.right;
    const safeH = this.#height - this.#insets.top - this.#insets.bottom;
    const aspect = safeW / Math.max(1, safeH);
    const t = MathUtils.clamp((aspect - 0.8) / 0.5, 0, 1);
    return MathUtils.degToRad(MathUtils.lerp(64, 50, t));
  }

  #roomPose(): Pose {
    return {
      azimuth: this.#goalAzimuth(),
      elevation: this.#elevation(),
      zoom: 1,
      focus: new Vector3(),
    };
  }

  #lobbyPose(): Pose {
    return { azimuth: this.#pose.azimuth, elevation: 0.6, zoom: 1, focus: new Vector3() };
  }

  #flyTo(to: Pose, duration: number): void {
    if (duration === 0 || reducedMotion.matches) {
      this.#pose = { ...to, focus: to.focus.clone() };
      this.#poseAnim = null;
      this.#wake();
      return;
    }
    const from = { ...this.#pose, focus: this.#pose.focus.clone() };
    // Turn the short way round.
    const turn =
      MathUtils.euclideanModulo(to.azimuth - from.azimuth + Math.PI, Math.PI * 2) - Math.PI;
    this.#poseAnim = {
      from,
      to: { ...to, azimuth: from.azimuth + turn, focus: to.focus.clone() },
      elapsed: 0,
      duration,
      arc: Math.abs(turn) > 2 ? 0.28 : 0,
    };
    this.#wake();
  }

  /** Region the camera keeps in frame, in world units. */
  #regionOfInterest(azimuth: number): Vector3[] {
    const points: Vector3[] = [];
    const [x, z, h] = this.#mode === 'room' ? [4.5, 4.5, 1.2] : [SLAB_W / 2, SLAB_D / 2, 0.4];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        points.push(new Vector3(sx * x, 0, sz * z));
      }
      // The far pieces stand up out of the board's far edge.
      points.push(new Vector3(sx * x, h, -z));
    }
    return points.map((point) => point.applyAxisAngle(new Vector3(0, 1, 0), azimuth));
  }

  #placeCamera(camera: PerspectiveCamera, pose: Pose, distance: number): void {
    const cos = Math.cos(pose.elevation);
    camera.position.set(
      pose.focus.x + Math.sin(pose.azimuth) * cos * distance,
      pose.focus.y + Math.sin(pose.elevation) * distance,
      pose.focus.z + Math.cos(pose.azimuth) * cos * distance,
    );
    camera.lookAt(pose.focus);
    camera.updateMatrixWorld();
  }

  /** The distance and screen offset that frame the table inside the safe area. */
  #fit(elevation: number, azimuth: number): { distance: number; offsetX: number; offsetY: number } {
    const key = `${this.#mode}:${elevation.toFixed(3)}:${azimuth.toFixed(2)}`;
    const cached = this.#fitCache.get(key);
    if (cached) return cached;
    const camera = this.#measure;
    camera.fov = 30;
    camera.aspect = this.#width / this.#height;
    camera.clearViewOffset();
    camera.updateProjectionMatrix();
    const safe = {
      w: Math.max(40, this.#width - this.#insets.left - this.#insets.right),
      h: Math.max(40, this.#height - this.#insets.top - this.#insets.bottom),
    };
    const points = this.#regionOfInterest(azimuth);
    const pose: Pose = { azimuth, elevation, zoom: 1, focus: new Vector3() };
    const projected = new Vector3();
    const bounds = (distance: number) => {
      this.#placeCamera(camera, pose, distance);
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const point of points) {
        projected.copy(point).project(camera);
        const px = ((projected.x + 1) / 2) * this.#width;
        const py = ((1 - projected.y) / 2) * this.#height;
        minX = Math.min(minX, px);
        maxX = Math.max(maxX, px);
        minY = Math.min(minY, py);
        maxY = Math.max(maxY, py);
      }
      return { minX, maxX, minY, maxY };
    };
    let low = 4;
    let high = 160;
    for (let i = 0; i < 26; i++) {
      const mid = (low + high) / 2;
      const box = bounds(mid);
      if (box.maxX - box.minX <= safe.w && box.maxY - box.minY <= safe.h) high = mid;
      else low = mid;
    }
    const box = bounds(high);
    const result = {
      distance: high,
      offsetX: (box.minX + box.maxX) / 2 - (this.#insets.left + safe.w / 2),
      offsetY: (box.minY + box.maxY) / 2 - (this.#insets.top + safe.h / 2),
    };
    this.#fitCache.set(key, result);
    return result;
  }

  #updateCamera(dt: number, realDt: number): void {
    const anim = this.#poseAnim;
    if (anim) {
      anim.elapsed += realDt;
      const t = Math.min(1, anim.elapsed / anim.duration);
      const k = ease.inOutCubic(t);
      this.#pose = {
        azimuth: MathUtils.lerp(anim.from.azimuth, anim.to.azimuth, k),
        elevation:
          MathUtils.lerp(anim.from.elevation, anim.to.elevation, k) +
          Math.sin(Math.PI * t) * anim.arc,
        zoom: MathUtils.lerp(anim.from.zoom, anim.to.zoom, k),
        focus: anim.from.focus.clone().lerp(anim.to.focus, k),
      };
      if (t >= 1) this.#poseAnim = null;
    } else if (this.#mode === 'lobby' && !reducedMotion.matches) {
      this.#pose.azimuth += dt * 0.045;
    }
    if (this.#focusHold > 0) {
      this.#focusHold -= realDt;
      if (this.#focusHold <= 0 && this.#mode === 'room') this.#flyTo(this.#roomPose(), 1.6);
    }

    const pose = this.#pose;
    const fitAzimuth = this.#mode === 'lobby' ? Math.PI / 4 : 0;
    const fit = this.#fit(pose.elevation, fitAzimuth);
    const camera = this.#camera;
    camera.fov = 30;
    camera.aspect = this.#width / this.#height;
    camera.setViewOffset(
      this.#width,
      this.#height,
      fit.offsetX,
      fit.offsetY,
      this.#width,
      this.#height,
    );
    camera.updateProjectionMatrix();
    this.#placeCamera(camera, pose, fit.distance * pose.zoom);
    this.#updateOverlay();

    // Shake and punch-in on impacts, on top of the framed pose.
    if (this.#trauma > 0 || this.#punch > 0) {
      const amount = this.#trauma ** 2;
      const t = this.#time * 38 + this.#shakeSeed;
      const scale = fit.distance * 0.006 * amount;
      const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      camera.position
        .addScaledVector(right, Math.sin(t * 1.1) * Math.cos(t * 0.37) * scale)
        .addScaledVector(up, Math.sin(t * 0.9 + 2) * Math.cos(t * 0.53) * scale);
      camera.rotateZ(Math.sin(t * 0.7 + 4) * 0.012 * amount);
      camera.fov = 30 * (1 - this.#punch * 0.05);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      this.#trauma = Math.max(0, this.#trauma - realDt * 1.6);
      this.#punch = Math.max(0, this.#punch - realDt * 2.6);
    }
  }

  /** Lays the DOM board exactly over the 3D board with a projective transform. */
  #updateOverlay(): void {
    const overlay = this.#overlay;
    if (!overlay || this.#mode !== 'room') return;
    // Top-left of the DOM grid is a8 for white at the bottom, h1 for black.
    const w = this.#model?.board.orientation ?? this.#orientation;
    const corners =
      w === 'w'
        ? [
            [-4, -4],
            [4, -4],
            [4, 4],
            [-4, 4],
          ]
        : [
            [4, 4],
            [-4, 4],
            [-4, -4],
            [4, -4],
          ];
    const projected = corners.map(([x = 0, z = 0]) => {
      const point = new Vector3(x, BOARD_Y, z).project(this.#camera);
      return [((point.x + 1) / 2) * this.#width, ((1 - point.y) / 2) * this.#height] as const;
    });
    const [p0, p1, p2, p3] = projected;
    if (!p0 || !p1 || !p2 || !p3) return;
    const matrix = homography(p0, p1, p2, p3, OVERLAY_SIZE);
    const key = matrix.map((value) => value.toFixed(6)).join(',');
    if (key === this.#overlayKey) return;
    this.#overlayKey = key;
    overlay.style.transform = `matrix3d(${key})`;
  }

  // ------------------------------------------------------------- the loop

  #wake(): void {
    if (this.#frame || !this.#host) return;
    this.#frame = requestAnimationFrame(this.#tick);
  }

  #tick = (now: number): void => {
    this.#frame = 0;
    const realDt = this.#last ? Math.min(0.05, (now - this.#last) / 1000) : 1 / 60;
    this.#last = now;
    const frozen = now < this.#freezeUntil;
    const dt = frozen ? 0 : realDt * this.#timeScale;
    this.#time += realDt;

    for (let i = this.#tweens.length - 1; i >= 0; i--) {
      if (this.#tweens[i]?.step(dt)) this.#tweens.splice(i, 1);
    }
    const settling = this.#settleActors(dt);
    const effects = this.#stepEffects(frozen ? 0 : realDt * this.#timeScale);
    this.#updateCamera(dt, realDt);
    this.#updateMarkers(realDt);

    // The canopy sways a little in the wind.
    const still = reducedMotion.matches || this.#tier === 'low';
    if (!still) {
      const t = this.#time;
      this.#sun.target.position.set(
        Math.sin(t * 0.31) * 0.22 + Math.sin(t * 0.83) * 0.08,
        0,
        Math.cos(t * 0.27) * 0.18,
      );
      this.#sun.target.updateMatrixWorld();
    }

    const busy =
      this.#tweens.length > 0 ||
      settling ||
      effects ||
      this.#poseAnim !== null ||
      this.#focusHold > 0 ||
      this.#trauma > 0 ||
      this.#punch > 0 ||
      frozen ||
      this.#drag !== null ||
      this.#model?.board.check != null ||
      this.#model?.board.selected != null;
    const ambient = !still || (this.#mode === 'lobby' && !reducedMotion.matches);
    // Only the leaves moving: 30 frames a second is plenty.
    if (busy || now - this.#lastRender > 30) {
      this.#renderer.render(this.#scene, this.#camera);
      this.#lastRender = now;
    }
    if (busy || ambient) this.#wake();
    else this.#last = 0;
  };

  #addTween(duration: number, update: (t: number) => void, done?: () => void): void {
    let elapsed = 0;
    this.#tweens.push({
      step: (dt) => {
        elapsed += dt;
        const t = Math.min(1, elapsed / duration);
        update(t);
        if (t >= 1) done?.();
        return t >= 1;
      },
    });
    this.#wake();
  }

  #wait(seconds: number, then: () => void): void {
    this.#addTween(seconds, () => undefined, then);
  }

  // ----------------------------------------------------------- the pieces

  #spawn(color: Color, type: PieceType, place: Place): Actor {
    const root = new Group();
    const mesh = new Mesh(pieceGeometry(type), this.#pieceMaterials[color]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Knights look to their left; everything else is turned a little by hand.
    mesh.rotation.y =
      type === 'n'
        ? (color === 'w' ? 0 : Math.PI) + (Math.random() - 0.5) * 0.16
        : Math.random() * Math.PI * 2;
    root.add(mesh);
    this.#scene.add(root);
    const actor: Actor = {
      root,
      mesh,
      color,
      type,
      place,
      lift: 0,
      busy: false,
      token: 0,
      toppled: false,
    };
    this.#placeAt(actor, place);
    this.#actors.add(actor);
    return actor;
  }

  #retype(actor: Actor, type: PieceType): void {
    actor.type = type;
    actor.mesh.geometry = pieceGeometry(type);
    if (type !== 'n') actor.mesh.rotation.y = Math.random() * Math.PI * 2;
  }

  #remove(actor: Actor): void {
    this.#actors.delete(actor);
    this.#scene.remove(actor.root);
  }

  #placeAt(actor: Actor, place: Place): void {
    actor.place = place;
    actor.root.quaternion.identity();
    actor.root.scale.setScalar(1);
    actor.toppled = false;
    this.#placePosition(place, actor.root.position);
  }

  #placePosition(place: Place, target: Vector3): Vector3 {
    return place.kind === 'board'
      ? squarePosition(place.square, target)
      : gravePosition(place.side, place.index, target);
  }

  #actorAt(square: Square): Actor | null {
    for (const actor of this.#actors) {
      if (actor.place.kind === 'board' && actor.place.square === square) return actor;
    }
    return null;
  }

  #graveCount(side: Color): number {
    let count = 0;
    for (const actor of this.#actors) {
      if (actor.place.kind === 'grave' && actor.place.side === side) count++;
    }
    return count;
  }

  /** Eases resting pieces toward their hover or selection height. */
  #settleActors(dt: number): boolean {
    const model = this.#model?.board;
    let moving = false;
    for (const actor of this.#actors) {
      if (actor.busy || actor.place.kind !== 'board') continue;
      const square = actor.place.square;
      let goal = 0;
      if (this.#mode === 'room' && model) {
        if (model.selected === square) goal = SELECT_LIFT + Math.sin(this.#time * 3.2) * 0.025;
        else if (this.#hovered === square && model.movable.has(square)) goal = HOVER_LIFT;
      }
      const next = actor.lift + (goal - actor.lift) * (1 - Math.exp(-dt * 16));
      if (Math.abs(next - goal) > 0.0005) moving = true;
      actor.lift = Math.abs(next - goal) < 0.0005 ? goal : next;
      actor.root.position.y = BOARD_Y + actor.lift;
    }
    return moving;
  }

  // ----------------------------------------------------------- syncing

  /** Brings the table in line with the latest snapshot, acting out what changed. */
  sync(model: SceneModel): void {
    const previous = this.#model;
    this.#model = model;
    const orientationChanged = model.board.orientation !== this.#orientation;
    this.#orientation = model.board.orientation;
    if (orientationChanged) this.#engrave(this.#orientation);
    if (orientationChanged && this.#mode === 'room') {
      // A flip orbits the table; the first look (or an arrival) just aims there.
      this.#flyTo(this.#roomPose(), previous || this.#poseAnim ? 1.1 : 0);
    }
    this.#overlayKey = '';

    const board = model.board.board;
    const ply = model.board.ply;
    const newGame = model.gameId !== this.#gameId;
    const firstLook = this.#shown === null;
    const quiet = firstLook || this.#mode === 'lobby';

    if (newGame) {
      this.#gameId = model.gameId;
      this.#local = null;
      this.#status = model.status;
      // A new game: every piece travels home, the fallen king stands up.
      const gather = !firstLook && (model.status === 'playing' || this.#mode === 'lobby');
      this.#reconcile(board, model.captured, gather ? 'gather' : 'snap');
      if (gather && this.#mode === 'room' && !this.#poseAnim) {
        this.#focusHold = 0;
        this.#timeScale = 1;
        this.#flyTo(this.#roomPose(), 1);
      }
    } else if (ply === this.#shownPly + 1 && model.board.lastMove && this.#shown) {
      const move = model.board.lastMove;
      const local = this.#local;
      if (local?.from === move.from && local.to === move.to && local.ply + 1 === ply) {
        // Already acted out when it was played here; settle any leftovers.
        this.#local = null;
        this.#after(board, model, true);
      } else {
        this.#local = null;
        const plan = planMove(this.#shown, board, move);
        if (plan && !quiet) {
          this.#playMove(plan, false, () => {
            this.#after(board, model, false);
          });
        } else this.#reconcile(board, model.captured, 'snap');
      }
    } else if (ply !== this.#shownPly) {
      this.#local = null;
      this.#reconcile(board, model.captured, quiet ? 'snap' : 'arc');
    } else if (this.#local && !model.pending) {
      // The server did not take the move played here: put things back.
      this.#local = null;
      sfx.deniedSound();
      this.#reconcile(board, model.captured, 'arc');
    }

    // Resignation, time, a lost connection or agreement end the game without a move.
    if (
      !newGame &&
      model.status === 'finished' &&
      this.#status === 'playing' &&
      ply === this.#shownPly
    ) {
      this.#ending(model, 0.1);
    }
    this.#status = model.status;
    this.#shown = board;
    this.#shownPly = ply;
    this.#wake();
  }

  /** After a move has landed: check, mate and the other endings. */
  #after(board: Board, model: SceneModel, local: boolean): void {
    // Any drift from what was expected (a promotion choice, a castling rook) snaps into place.
    this.#reconcile(board, model.captured, 'arc');
    if (model.status === 'finished' && model.outcome?.reason === 'checkmate') {
      this.#mate(model);
      return;
    }
    if (model.board.check !== null) {
      const king = this.#actorAt(model.board.check);
      if (king) this.#shudder(king, 0.5);
      this.#impact(0.45, squarePosition(model.board.check), false);
      sfx.checkSound();
      if (model.me && model.board.board[model.board.check]?.color === model.me) sfx.buzz(30);
    }
    if (model.status === 'finished') this.#ending(model, 0.45);
    else if (!local && model.me) sfx.buzz(8);
  }

  /**
   * Matches the pieces on the table to `board` and the taken pieces beside
   * it, moving (or placing) as few as possible. Pieces already on their way
   * somewhere keep going unless `how` is 'snap'.
   */
  #reconcile(board: Board, captured: SceneModel['captured'], how: 'snap' | 'arc' | 'gather'): void {
    interface Target {
      place: Place;
      color: Color;
      type: PieceType;
    }
    const targets: Target[] = [];
    const matched = new Map<Target, Actor>();
    const free = new Set(this.#actors);
    board.forEach((piece, square) => {
      if (piece)
        targets.push({ place: { kind: 'board', square }, color: piece.color, type: piece.type });
    });
    // Pieces already standing where they belong stay.
    for (const target of targets) {
      const place = target.place;
      for (const actor of free) {
        if (
          actor.color === target.color &&
          actor.type === target.type &&
          actor.place.kind === 'board' &&
          place.kind === 'board' &&
          actor.place.square === place.square
        ) {
          matched.set(target, actor);
          free.delete(actor);
          break;
        }
      }
    }
    // Taken pieces: whatever already lies beside the board stays in its spot;
    // missing ones get the first free spots.
    for (const side of ['w', 'b'] as const) {
      const color: Color = side === 'w' ? 'b' : 'w';
      const wanted = [...captured[color]];
      const used = new Set<number>();
      for (const actor of free) {
        if (actor.place.kind !== 'grave' || actor.place.side !== side || actor.color !== color)
          continue;
        const index = wanted.indexOf(actor.type);
        if (index < 0) continue;
        wanted.splice(index, 1);
        const target: Target = { place: actor.place, color, type: actor.type };
        targets.push(target);
        matched.set(target, actor);
        used.add(actor.place.index);
      }
      for (const actor of matched.values()) free.delete(actor);
      let next = 0;
      for (const type of wanted) {
        while (used.has(next)) next++;
        used.add(next);
        targets.push({ place: { kind: 'grave', side, index: next }, color, type });
      }
    }
    // The rest travel from the nearest piece of the same kind; a promoted
    // pawn may change kind.
    const spot = new Vector3();
    for (const kindMatters of [true, false]) {
      for (const target of targets) {
        if (matched.has(target)) continue;
        if (!kindMatters && target.place.kind !== 'board') continue;
        this.#placePosition(target.place, spot);
        let best: Actor | null = null;
        let bestDistance = Infinity;
        for (const actor of free) {
          if (actor.color !== target.color || (kindMatters && actor.type !== target.type)) continue;
          const distance = actor.root.position.distanceTo(spot);
          if (distance < bestDistance) {
            best = actor;
            bestDistance = distance;
          }
        }
        if (best) {
          matched.set(target, best);
          free.delete(best);
        }
      }
    }

    const animate = how !== 'snap' && !reducedMotion.matches;
    let order = 0;
    for (const target of targets) {
      const actor = matched.get(target);
      if (!actor) {
        const spawned = this.#spawn(target.color, target.type, target.place);
        if (animate) this.#dropIn(spawned, how === 'gather' ? order++ * 0.025 : 0);
        continue;
      }
      if (actor.type !== target.type) this.#retype(actor, target.type);
      const moved = !samePlace(actor.place, target.place) || (actor.toppled && how !== 'arc');
      if (!moved) {
        if (how === 'snap' && actor.busy) {
          actor.token++;
          actor.busy = false;
          this.#placeAt(actor, target.place);
        }
        continue;
      }
      if (animate) {
        this.#hop(actor, target.place, how === 'gather' ? 0.12 + order++ * 0.022 : 0);
      } else {
        actor.token++;
        actor.busy = false;
        this.#placeAt(actor, target.place);
      }
    }
    for (const actor of free) {
      if (animate) this.#sinkOut(actor);
      else this.#remove(actor);
    }
    if (how === 'gather' && animate) sfx.setupSound(Math.min(order, 32), 0.9);
  }

  // ----------------------------------------------------------- acting

  /** Arcs a piece to a new place (resets, reverts, the rook of a castling). */
  #hop(actor: Actor, place: Place, delay: number, onLand?: () => void): void {
    const token = ++actor.token;
    actor.busy = true;
    actor.place = place;
    const start = actor.root.position.clone();
    const startQuaternion = actor.root.quaternion.clone();
    const end = this.#placePosition(place, new Vector3());
    const distance = start.distanceTo(end);
    const height = 0.4 + Math.min(distance, 8) * 0.12;
    const duration = 0.32 + Math.min(distance, 10) * 0.025;
    const identity = new Quaternion();
    this.#wait(delay, () => {
      if (actor.token !== token) return;
      this.#addTween(
        duration,
        (t) => {
          if (actor.token !== token) return;
          const k = ease.inOutCubic(t);
          actor.root.position.lerpVectors(start, end, k);
          actor.root.position.y =
            MathUtils.lerp(start.y, end.y, k) + Math.sin(Math.PI * t) * height;
          actor.root.quaternion.slerpQuaternions(startQuaternion, identity, ease.outCubic(t));
        },
        () => {
          if (actor.token !== token) return;
          actor.busy = false;
          actor.lift = 0;
          this.#placeAt(actor, place);
          this.#dustRing(end, 0.35, 8);
          sfx.placeSound(actor.type, 0.05);
          onLand?.();
        },
      );
    });
  }

  /** A new piece comes down from above. */
  #dropIn(actor: Actor, delay: number): void {
    const token = ++actor.token;
    actor.busy = true;
    const end = actor.root.position.clone();
    actor.root.position.y = 5;
    actor.root.visible = false;
    this.#wait(delay, () => {
      if (actor.token !== token) return;
      actor.root.visible = true;
      this.#addTween(
        0.42,
        (t) => {
          if (actor.token !== token) return;
          actor.root.position.y = MathUtils.lerp(5, end.y, ease.inQuad(t));
        },
        () => {
          if (actor.token !== token) return;
          actor.busy = false;
          actor.root.position.copy(end);
          this.#dustRing(end, 0.3, 6);
        },
      );
    });
  }

  /** A piece that is no longer needed sinks into the stone. */
  #sinkOut(actor: Actor): void {
    const token = ++actor.token;
    actor.busy = true;
    const start = actor.root.position.y;
    this.#addTween(
      0.35,
      (t) => {
        if (actor.token !== token) return;
        actor.root.position.y = start - ease.inQuad(t) * 1.4;
      },
      () => {
        this.#remove(actor);
      },
    );
  }

  /**
   * One move, acted out: lift, flight, landing; the taken piece is knocked
   * off the board, the rook follows the king, a pawn turns into its promotion.
   */
  #playMove(plan: MovePlan, local: boolean, then?: () => void): void {
    const actor = this.#actorAt(plan.from);
    if (!actor) {
      then?.();
      return;
    }
    const victim = plan.capture ? this.#actorAt(plan.capture.square) : null;
    const token = ++actor.token;
    actor.busy = true;
    // The mover claims its square now, so the next snapshot finds it there.
    actor.place = { kind: 'board', square: plan.to };
    if (plan.promotion) actor.type = plan.promotion;
    if (victim) {
      victim.place = { kind: 'grave', side: actor.color, index: this.#graveCount(actor.color) };
      victim.token++;
      victim.busy = true;
    }

    const start = actor.root.position.clone();
    const end = squarePosition(plan.to);
    // A dropped piece is already over its square: it only comes down.
    const squares = Math.hypot(end.x - start.x, end.z - start.z);
    const fast = reducedMotion.matches;
    const knight = plan.piece.type === 'n' && squares > 1;
    const dropped = squares < 0.9;
    const duration = fast
      ? 0.14
      : dropped
        ? 0.13
        : MathUtils.clamp(0.22 + squares * 0.035 + (knight ? 0.06 : 0), 0.26, 0.52);
    const height = fast || dropped ? 0 : knight ? 0.95 : Math.min(0.28 + squares * 0.09, 0.85);
    const direction = new Vector3().subVectors(end, start).setY(0).normalize();
    const lean = new Vector3(direction.z, 0, -direction.x); // axis to lean into the flight
    const startQuaternion = actor.root.quaternion.clone();
    const tilt = new Quaternion();
    const weight = impactOf(plan, false, false);
    let struck = false;

    const strike = () => {
      if (struck) return;
      struck = true;
      if (victim) this.#knockOff(victim, actor, plan.capture?.piece.type ?? 'p');
    };

    const fly = () => {
      if (actor.token !== token) return;
      this.#addTween(
        duration,
        (t) => {
          if (actor.token !== token) return;
          const k = fast ? t : ease.inOutCubic(t);
          actor.root.position.lerpVectors(start, end, k);
          // A throw: up quickly, then down hard onto the square.
          actor.root.position.y =
            MathUtils.lerp(start.y, BOARD_Y, t * t) + 4 * height * t * (1 - t);
          tilt.setFromAxisAngle(lean, Math.sin(Math.PI * t) * (fast ? 0 : 0.2));
          actor.root.quaternion.copy(startQuaternion).premultiply(tilt);
          if (t > 0.86) strike();
        },
        () => {
          if (actor.token !== token) return;
          strike();
          actor.busy = false;
          actor.lift = 0;
          actor.root.position.copy(end);
          actor.root.quaternion.identity();
          this.#land(actor, plan, weight);
          if (plan.rook) {
            const rook = this.#actorAt(plan.rook.from);
            if (rook) this.#hop(rook, { kind: 'board', square: plan.rook.to }, 0);
          }
          if (plan.promotion) this.#promote(actor, plan.promotion);
          then?.();
        },
      );
    };

    if (!local && !fast && start.y - BOARD_Y < 0.1) {
      // Someone else's hand picks the piece up first.
      this.#addTween(
        0.1,
        (t) => {
          if (actor.token !== token) return;
          actor.root.position.y = BOARD_Y + ease.outCubic(t) * 0.22;
        },
        () => {
          start.y = actor.root.position.y;
          fly();
        },
      );
    } else {
      fly();
    }
  }

  #land(actor: Actor, plan: MovePlan, weight: number): void {
    const at = actor.root.position;
    if (plan.capture) return; // the capture already hit
    this.#impact(weight, at, true);
    sfx.placeSound(actor.type, weight);
  }

  /** The taken piece: a freeze, then it spins off the board and lands beside it. */
  #knockOff(victim: Actor, attacker: Actor, type: PieceType): void {
    const value = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 9 }[type];
    const weight = MathUtils.clamp(0.38 + value * 0.05, 0.4, 0.85);
    const at = victim.root.position.clone();
    this.#impact(weight, at, true, 0.05 + value * 0.012);
    this.#chipsBurst(at, 10 + value * 3, weight);
    sfx.captureSound(value);
    if (this.#model?.me === victim.color) sfx.buzz(18);

    const place = victim.place;
    if (place.kind !== 'grave') return;
    const token = victim.token;
    const start = at.clone();
    const end = gravePosition(place.side, place.index);
    const away = new Vector3().subVectors(start, attacker.root.position).setY(0);
    if (away.lengthSq() < 0.01) away.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    const axis = new Vector3(away.z, 0, -away.x).normalize();
    if (axis.lengthSq() < 0.5) axis.set(1, 0, 0);
    const turns = Math.PI * 2 * (value >= 5 ? 2 : 1);
    const duration = reducedMotion.matches ? 0.2 : 0.62;
    const peak = 1.6 + value * 0.08;
    const spin = new Quaternion();
    this.#addTween(
      duration,
      (t) => {
        if (victim.token !== token) return;
        victim.root.position.lerpVectors(start, end, t);
        victim.root.position.y = BOARD_Y + 4 * peak * t * (1 - t);
        spin.setFromAxisAngle(axis, turns * ease.outCubic(t));
        victim.root.quaternion.copy(spin);
      },
      () => {
        if (victim.token !== token) return;
        victim.busy = false;
        this.#placeAt(victim, place);
        this.#dustRing(end, 0.3, 6);
      },
    );
  }

  /** A pawn on the last rank sinks into the stone and its new piece rises. */
  #promote(actor: Actor, type: PieceType): void {
    const token = ++actor.token;
    actor.busy = true;
    const at = actor.root.position.clone();
    sfx.promoteSound();
    this.#flashAt(at, 1.2);
    this.#addTween(
      0.18,
      (t) => {
        if (actor.token !== token) return;
        actor.root.position.y = BOARD_Y - ease.inQuad(t) * 0.7;
      },
      () => {
        if (actor.token !== token) return;
        this.#retype(actor, type);
        this.#addTween(
          0.32,
          (t) => {
            if (actor.token !== token) return;
            actor.root.position.y = BOARD_Y - 1.2 + ease.outBack(t) * 1.2;
          },
          () => {
            if (actor.token !== token) return;
            actor.busy = false;
            actor.root.position.y = BOARD_Y;
            this.#dustRing(at, 0.5, 14);
            this.#impact(0.4, at, false);
          },
        );
      },
    );
  }

  /** The king in check shudders. */
  #shudder(actor: Actor, strength: number): void {
    if (reducedMotion.matches) return;
    const token = ++actor.token;
    actor.busy = true;
    const base = actor.root.position.clone();
    const axis = new Vector3(1, 0, 0.4).normalize();
    const q = new Quaternion();
    this.#addTween(
      0.5,
      (t) => {
        if (actor.token !== token) return;
        const wobble = Math.sin(t * Math.PI * 9) * (1 - t) * 0.09 * strength;
        q.setFromAxisAngle(axis, wobble);
        actor.root.quaternion.copy(q);
        actor.root.position.set(base.x + wobble * 0.3, BOARD_Y, base.z);
      },
      () => {
        if (actor.token !== token) return;
        actor.busy = false;
        actor.root.quaternion.identity();
        actor.root.position.copy(base).setY(BOARD_Y);
      },
    );
  }

  /** Tips a king over onto the board, the way a game is given up. */
  #topple(actor: Actor, duration: number, heavy: boolean): void {
    const token = ++actor.token;
    actor.busy = true;
    actor.toppled = true;
    const base = actor.root.position.clone().setY(BOARD_Y);
    // Falls sideways across the board, so both players see it go down.
    const fall = new Vector3(Math.random() < 0.5 ? -1 : 1, 0, 0)
      .applyAxisAngle(new Vector3(0, 1, 0), (Math.random() - 0.5) * 0.7)
      .normalize();
    const radius = 0.3;
    const pivot = base.clone().addScaledVector(fall, radius);
    const axis = new Vector3().crossVectors(new Vector3(0, 1, 0), fall).normalize();
    const final = 1.44;
    const q = new Quaternion();
    const setAngle = (angle: number) => {
      q.setFromAxisAngle(axis, angle);
      actor.root.quaternion.copy(q);
      actor.root.position.set(
        pivot.x - fall.x * radius * Math.cos(angle),
        BOARD_Y + radius * Math.sin(angle),
        pivot.z - fall.z * radius * Math.cos(angle),
      );
    };
    if (reducedMotion.matches) {
      setAngle(final);
      actor.busy = false;
      sfx.toppleSound();
      return;
    }
    this.#addTween(
      duration,
      (t) => {
        if (actor.token !== token) return;
        setAngle(final * ease.inQuad(t));
      },
      () => {
        if (actor.token !== token) return;
        const head = base.clone().addScaledVector(fall, PIECE_HEIGHT[actor.type] * 0.8);
        this.#dustRing(head, heavy ? 0.9 : 0.5, heavy ? 22 : 12);
        this.#chipsBurst(head, heavy ? 12 : 5, heavy ? 0.7 : 0.35);
        this.#impact(heavy ? 0.85 : 0.45, head, true);
        sfx.toppleSound();
        // A small bounce as the stone settles.
        this.#addTween(
          0.22,
          (t) => {
            if (actor.token !== token) return;
            setAngle(final - Math.sin(Math.PI * t) * 0.06);
          },
          () => {
            if (actor.token !== token) return;
            setAngle(final);
            actor.busy = false;
          },
        );
      },
    );
  }

  /** Checkmate: a freeze, slow motion, the camera closes in, the king falls. */
  #mate(model: SceneModel): void {
    const loser = model.outcome?.winner === 'w' ? 'b' : 'w';
    const kingSquare = model.board.board.findIndex(
      (piece) => piece?.type === 'k' && piece.color === loser,
    );
    const king = kingSquare >= 0 ? this.#actorAt(kingSquare) : null;
    const at = kingSquare >= 0 ? squarePosition(kingSquare) : new Vector3();
    this.#impact(1, at, true, 0.2);
    sfx.mateSound();
    if (model.me === loser) sfx.buzz([40, 60, 90]);
    if (reducedMotion.matches) {
      if (king) this.#topple(king, 0.1, true);
      this.#ending(model, 0.2, true);
      return;
    }
    this.#timeScale = 0.4;
    const focus = at.clone().multiplyScalar(0.7);
    this.#flyTo(
      { ...this.#roomPose(), zoom: 0.8, focus, elevation: this.#elevation() + 0.06 },
      1.3,
    );
    this.#focusHold = 3.4;
    this.#wait(0.18, () => {
      if (king) this.#shudder(king, 1);
    });
    this.#wait(0.42, () => {
      if (king) this.#topple(king, 0.7, true);
    });
    this.#wait(1.25, () => {
      this.#timeScale = 1;
      this.#ending(model, 0.35, true);
    });
  }

  /** Every other ending: a resignation or flag topples the king; a draw does not. */
  #ending(model: SceneModel, delay: number, toppled = false): void {
    const outcome = model.outcome;
    if (!outcome) return;
    this.#wait(delay, () => {
      if (!toppled && outcome.winner) {
        const loser = outcome.winner === 'w' ? 'b' : 'w';
        for (const actor of this.#actors) {
          if (actor.type === 'k' && actor.color === loser && actor.place.kind === 'board') {
            this.#topple(actor, 0.55, false);
          }
        }
      }
      if (model.resultTone)
        this.#wait(toppled ? 0.1 : 0.5, () => {
          if (model.resultTone) sfx.endSound(model.resultTone);
        });
    });
  }

  /** Acts out a move made here before the server confirms it. */
  playLocal(from: Square, to: Square, promotion: PromotionPiece | null): void {
    const model = this.#model;
    const shown = this.#shown;
    if (!model || !shown || this.#mode !== 'room') return;
    const piece = shown[from];
    if (!piece) return;
    const after = [...shown];
    after[from] = null;
    const step = fileOf(to) - fileOf(from);
    if (piece.type === 'p' && step !== 0 && !shown[to]) {
      const passed = makeSquare(fileOf(to), rankOf(from));
      if (passed !== null) after[passed] = null;
    }
    if (piece.type === 'k' && Math.abs(step) === 2) {
      const rank = rankOf(from);
      const rookFrom = makeSquare(step > 0 ? 7 : 0, rank);
      const rookTo = makeSquare(fileOf(from) + Math.sign(step), rank);
      if (rookFrom !== null && rookTo !== null) {
        after[rookTo] = after[rookFrom] ?? null;
        after[rookFrom] = null;
      }
    }
    after[to] = promotion ? { color: piece.color, type: promotion } : piece;
    const plan = planMove(shown, after, { from, to });
    if (!plan) return;
    this.#released = null;
    this.#local = { from, to, ply: model.board.ply };
    this.#playMove(plan, true);
  }

  // ------------------------------------------------------------- effects

  /** A hit: freeze for a beat, shake, punch in, flash. */
  #impact(weight: number, at: Vector3, dust: boolean, freeze = 0): void {
    if (dust) this.#dustRing(at, 0.25 + weight * 0.6, Math.round(6 + weight * 18));
    if (reducedMotion.matches) return;
    if (freeze > 0) this.#freezeUntil = performance.now() + freeze * 1000;
    this.#trauma = Math.min(1, this.#trauma + weight * 0.75);
    this.#punch = Math.min(1, this.#punch + Math.max(0, weight - 0.3));
    this.#flashAt(at, weight * 2.4);
    this.#wake();
  }

  #flashAt(at: Vector3, intensity: number): void {
    this.#flash.position.set(at.x, 0.7, at.z);
    this.#flash.intensity = Math.max(this.#flash.intensity, intensity);
  }

  #dustRing(at: Vector3, speed: number, count: number): void {
    const { particles } = this.#dust;
    let spawned = 0;
    for (const particle of particles) {
      if (spawned >= count) break;
      if (particle.alive) continue;
      spawned++;
      const angle = (spawned / count) * Math.PI * 2 + Math.random() * 0.4;
      particle.alive = true;
      particle.age = 0;
      particle.life = 0.45 + Math.random() * 0.35;
      particle.position.set(
        at.x + Math.cos(angle) * 0.22,
        BOARD_Y + 0.03,
        at.z + Math.sin(angle) * 0.22,
      );
      particle.velocity.set(
        Math.cos(angle) * speed * (0.7 + Math.random() * 0.6),
        0.15 + Math.random() * 0.3,
        Math.sin(angle) * speed * (0.7 + Math.random() * 0.6),
      );
    }
    this.#wake();
  }

  #chipsBurst(at: Vector3, count: number, weight: number): void {
    if (reducedMotion.matches) return;
    let spawned = 0;
    for (const particle of this.#chips.particles) {
      if (spawned >= count) break;
      if (particle.alive) continue;
      spawned++;
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.8 + Math.random() * 2.2 * weight;
      particle.alive = true;
      particle.age = 0;
      particle.life = 0.9 + Math.random() * 0.5;
      particle.scale = 0.5 + Math.random() * 0.9;
      particle.position.set(at.x, BOARD_Y + 0.15, at.z);
      particle.velocity.set(
        Math.cos(angle) * speed,
        2 + Math.random() * 3 * weight,
        Math.sin(angle) * speed,
      );
      particle.spin?.set(Math.random() * 12, Math.random() * 12, Math.random() * 12);
    }
  }

  /** Advances dust and chips; returns whether any are still alive. */
  #stepEffects(dt: number): boolean {
    let alive = false;
    const dust = this.#dust;
    const positions = dust.points.geometry.getAttribute('position') as BufferAttribute;
    const colors = dust.points.geometry.getAttribute('color') as BufferAttribute;
    dust.particles.forEach((particle, index) => {
      if (particle.alive) {
        particle.age += dt;
        if (particle.age >= particle.life) particle.alive = false;
        particle.velocity.multiplyScalar(Math.exp(-dt * 4));
        particle.position.addScaledVector(particle.velocity, dt);
      }
      const k = particle.alive ? 1 - particle.age / particle.life : 0;
      if (particle.alive) alive = true;
      positions.setXYZ(index, particle.position.x, particle.position.y, particle.position.z);
      colors.setXYZW(index, 1, 1, 1, k * k * 0.55);
    });
    positions.needsUpdate = true;
    colors.needsUpdate = true;

    const chips = this.#chips;
    const matrix = new Matrix4();
    const rotation = new Quaternion();
    const scale = new Vector3();
    const euler = new Object3D();
    chips.particles.forEach((particle, index) => {
      if (!particle.alive) return;
      alive = true;
      particle.age += dt;
      particle.velocity.y -= 12 * dt;
      particle.position.addScaledVector(particle.velocity, dt);
      if (
        particle.position.y < BOARD_Y + 0.02 &&
        Math.abs(particle.position.x) < SLAB_W / 2 &&
        Math.abs(particle.position.z) < SLAB_D / 2
      ) {
        particle.position.y = BOARD_Y + 0.02;
        particle.velocity.y *= -0.3;
        particle.velocity.x *= 0.6;
        particle.velocity.z *= 0.6;
      }
      if (particle.rotation && particle.spin) particle.rotation.addScaledVector(particle.spin, dt);
      const k = particle.age >= particle.life ? 0 : Math.min(1, (particle.life - particle.age) * 4);
      if (particle.age >= particle.life) particle.alive = false;
      euler.rotation.set(
        particle.rotation?.x ?? 0,
        particle.rotation?.y ?? 0,
        particle.rotation?.z ?? 0,
      );
      rotation.setFromEuler(euler.rotation);
      scale.setScalar(particle.scale * k);
      matrix.compose(particle.position, rotation, scale);
      chips.mesh.setMatrixAt(index, matrix);
    });
    chips.mesh.instanceMatrix.needsUpdate = true;

    if (this.#flash.intensity > 0) {
      this.#flash.intensity = Math.max(0, this.#flash.intensity - dt * 9);
      alive = true;
    }
    return alive;
  }

  #updateMarkers(dt: number): void {
    const markers = this.#markers;
    const model = this.#mode === 'room' ? this.#model?.board : null;
    const place = (mesh: Mesh, square: Square | null | undefined, y = 0.004) => {
      mesh.visible = square !== null && square !== undefined;
      if (square !== null && square !== undefined) {
        squarePosition(square, mesh.position);
        mesh.position.y = y;
      }
    };
    place(markers.last[0], model?.lastMove?.from);
    place(markers.last[1], model?.lastMove?.to, 0.0045);
    place(markers.selected, model?.selected, 0.005);
    place(markers.selectedGlow, model?.selected, 0.0055);
    place(markers.hover, this.#drag ? this.#dragOver : null, 0.006);
    place(markers.check, model?.check, 0.006);
    if (model?.check !== null && model?.check !== undefined) {
      this.#checkPulse += dt;
      (markers.check.material as MeshBasicMaterial).opacity =
        0.55 + Math.sin(this.#checkPulse * 5) * 0.25;
    }
    const targets = model ? [...model.targets] : [];
    let dot = 0;
    let ring = 0;
    for (const square of targets) {
      const occupied = model?.board[square] !== null && model?.board[square] !== undefined;
      const mesh = occupied ? markers.rings[ring++] : markers.dots[dot++];
      if (mesh) place(mesh, square, 0.007);
    }
    for (let i = dot; i < markers.dots.length; i++) {
      const mesh = markers.dots[i];
      if (mesh) mesh.visible = false;
    }
    for (let i = ring; i < markers.rings.length; i++) {
      const mesh = markers.rings[i];
      if (mesh) mesh.visible = false;
    }
  }

  // ------------------------------------------------------------ pointer

  #dragOver: Square | null = null;

  hover(square: Square | null): void {
    if (this.#hovered === square) return;
    this.#hovered = square;
    this.#wake();
  }

  dragStart(from: Square): void {
    const actor = this.#actorAt(from);
    if (!actor) return;
    actor.token++;
    actor.busy = true;
    sfx.liftSound();
    this.#drag = { actor, point: actor.root.position.clone(), velocity: new Vector3() };
    this.#wake();
  }

  dragMove(x: number, y: number, over: Square | null): void {
    const drag = this.#drag;
    const host = this.#host;
    if (!drag || !host) return;
    this.#dragOver = over;
    const box = host.getBoundingClientRect();
    const pointer = new Vector2(
      ((x - box.left) / box.width) * 2 - 1,
      -((y - box.top) / box.height) * 2 + 1,
    );
    this.#raycaster.setFromCamera(pointer, this.#camera);
    const hit = this.#raycaster.ray.intersectPlane(this.#plane, new Vector3());
    if (!hit) return;
    hit.x = MathUtils.clamp(hit.x, -5, 5);
    hit.z = MathUtils.clamp(hit.z, -5, 5);
    const root = drag.actor.root;
    const previous = root.position.clone();
    // A little lag and a lean in the direction of travel: the weight of stone.
    root.position.lerp(hit, 0.55);
    drag.velocity.lerp(new Vector3().subVectors(root.position, previous), 0.4);
    const lean = new Quaternion().setFromEuler(
      new Object3D().rotation.set(
        MathUtils.clamp(drag.velocity.z * 1.8, -0.35, 0.35),
        0,
        MathUtils.clamp(-drag.velocity.x * 1.8, -0.35, 0.35),
      ),
    );
    root.quaternion.slerp(lean, 0.5);
    this.#wake();
  }

  dragEnd(): void {
    const drag = this.#drag;
    this.#drag = null;
    this.#dragOver = null;
    if (!drag) return;
    const actor = drag.actor;
    this.#released = actor;
    // A drop on a legal square plays the move at once (playLocal); anything
    // else puts the piece back where it came from.
    setTimeout(() => {
      if (this.#released !== actor) return;
      this.#released = null;
      if (actor.place.kind === 'board') this.#hop(actor, actor.place, 0);
    }, 0);
    this.#wake();
  }
}
