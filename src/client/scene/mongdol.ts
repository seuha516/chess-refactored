// 몽돌이: a round pebble with a face that sits at each player's corner of the
// table. It can be taken hold of and pulled; let go, it springs back and
// wobbles like rice cake. It also reacts to the game: it looks at the last
// move, flinches at captures, trembles when its king is in check, bounces
// when its side wins and sags when it loses, and sleeps in the lobby.
import {
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  CircleGeometry,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type BufferAttribute,
  type Material,
  type Object3D,
} from 'three';

/** Half extents of the pebble: wider than tall, a little deeper than a sphere. */
const RX = 0.54;
const RY = 0.37;
const RZ = 0.47;
/** How far the lower body is sunk and flattened, so it sits on the table. */
const FLAT = 0.55;
export const MONGDOL_HEIGHT = RY * (1 + FLAT);
/** With the crown on. */
export const MONGDOL_TOP = MONGDOL_HEIGHT + 0.2;
/** A pull never stretches it further than this (soft limit). */
const MAX_PULL = 0.95;
const GRAB_SPREAD = 0.3;

export type MongdolMood = 'idle' | 'sleep' | 'happy' | 'sad';

/** Where on the ellipsoid, by angle round from the front and angle up from the middle. */
function surface(azimuth: number, elevation: number): { point: Vector3; normal: Vector3 } {
  const x = Math.sin(azimuth) * Math.cos(elevation);
  const y = Math.sin(elevation);
  const z = Math.cos(azimuth) * Math.cos(elevation);
  return {
    point: new Vector3(x * RX, y * RY + RY * FLAT, z * RZ),
    normal: new Vector3(x / RX, y / RY, z / RZ).normalize(),
  };
}

interface Feature {
  readonly object: Object3D;
  readonly rest: Vector3;
  readonly normal: Vector3;
  /** Lifts the feature off the surface so it does not sink in. */
  readonly lift: number;
}

export class Mongdol {
  readonly root = new Group();
  readonly body: Mesh;
  readonly #rest: Float32Array;
  readonly #features: Feature[] = [];
  readonly #eyes: Mesh[] = [];
  readonly #cheeks: Mesh[] = [];
  readonly #cheekMaterial: MeshBasicMaterial;
  readonly #mouth: { smile: Mesh; round: Mesh; line: Mesh };
  readonly #still: () => boolean;

  /** The point taken hold of (rest frame) and how far it is pulled. */
  #grab = new Vector3(0, RY, 0);
  #pull = new Vector3();
  #pullVelocity = new Vector3();
  #target: Vector3 | null = null;
  #deformed = false;

  /** Squash (negative) and stretch (positive) of the whole body, and its hops. */
  #squash = 0;
  #squashVelocity = 0;
  #hop = 0;
  #hopVelocity = 0;
  #hopsLeft = 0;
  #shiver = 0;

  #mood: MongdolMood = 'idle';
  #baseYaw = 0;
  #look = 0;
  #lookGoal = 0;
  #lookUntil = 0;
  #time = Math.random() * 10;
  #blinkAt = 2 + Math.random() * 3;
  #blink = 0;
  #held = false;

  constructor(material: Material, dark: boolean, still: () => boolean) {
    this.#still = still;
    const geometry = new SphereGeometry(1, 48, 32);
    const position = geometry.getAttribute('position') as BufferAttribute;
    for (let i = 0; i < position.count; i++) {
      let y = position.getY(i) * RY;
      // The underside is pressed flat where it rests on the table.
      if (y < -RY * FLAT) y = -RY * FLAT + (y + RY * FLAT) * 0.12;
      position.setXYZ(i, position.getX(i) * RX, y + RY * FLAT, position.getZ(i) * RZ);
    }
    geometry.computeVertexNormals();
    this.#rest = Float32Array.from(position.array as ArrayLike<number>);
    this.body = new Mesh(geometry, material);
    this.body.castShadow = true;
    this.body.receiveShadow = true;
    this.root.add(this.body);

    // The face: dark beads on the white stone, pale ones on the basalt.
    const ink = new MeshStandardMaterial({
      color: dark ? '#efe7d8' : '#1f1b18',
      roughness: 0.25,
      metalness: 0,
    });
    this.#cheekMaterial = new MeshBasicMaterial({
      color: '#f08f86',
      transparent: true,
      opacity: dark ? 0.32 : 0.26,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });

    const eyeGeometry = new SphereGeometry(0.058, 16, 12);
    for (const side of [-1, 1]) {
      const eye = new Mesh(eyeGeometry, ink);
      eye.scale.set(0.9, 1.2, 0.5);
      this.#attach(eye, surface(side * 0.36, 0.62), 0.012);
      this.#eyes.push(eye);
      const cheek = new Mesh(new CircleGeometry(0.058, 20), this.#cheekMaterial);
      this.#attach(cheek, surface(side * 0.6, 0.36), 0.006);
      this.#cheeks.push(cheek);
    }

    // Three mouths, one shown at a time: a small smile, a round "o", a flat line.
    // A little gold crown, worn slightly askew: after all, it guards the king.
    const gold = new MeshStandardMaterial({
      color: '#e2b65a',
      metalness: 0.85,
      roughness: 0.3,
      side: DoubleSide, // the band is open
    });
    const crown = new Group();
    const band = new Mesh(new CylinderGeometry(0.125, 0.135, 0.075, 24, 1, true), gold);
    crown.add(band);
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const point = new Mesh(new ConeGeometry(0.032, 0.08, 10), gold);
      point.position.set(Math.sin(angle) * 0.12, 0.075, Math.cos(angle) * 0.12);
      const tip = new Mesh(new SphereGeometry(0.02, 10, 8), gold);
      tip.position.set(0, 0.05, 0);
      point.add(tip);
      crown.add(point);
    }
    for (const part of crown.children) part.castShadow = true;
    // On the crown of its head, upright along the surface normal, with a jaunty tilt.
    crown.rotation.set(Math.PI / 2, 0, 0.18);
    crown.position.z = 0.03;
    crown.scale.setScalar(1.35);
    this.#attach(crown, surface(0, 1.5), 0);

    const mouthAt = surface(0, 0.42);
    const smile = new Mesh(new TorusGeometry(0.052, 0.012, 8, 18, Math.PI), ink);
    smile.rotation.z = Math.PI; // the arc opens upwards: a smile
    const round = new Mesh(new TorusGeometry(0.03, 0.012, 8, 18), ink);
    const line = new Mesh(new CapsuleGeometry(0.011, 0.07, 4, 8), ink);
    line.rotation.z = Math.PI / 2;
    const mouth = new Group();
    mouth.add(smile, round, line);
    this.#attach(mouth, mouthAt, 0.008);
    this.#mouth = { smile, round, line };
    this.#setFace();
  }

  #attach(object: Object3D, at: { point: Vector3; normal: Vector3 }, lift: number): void {
    const holder = new Group();
    holder.add(object);
    holder.position.copy(at.point).addScaledVector(at.normal, lift);
    holder.lookAt(holder.position.clone().add(at.normal));
    this.body.add(holder);
    this.#features.push({ object: holder, rest: at.point.clone(), normal: at.normal, lift });
  }

  /** Puts it at its corner, facing along `yaw` (0 faces +z). */
  place(x: number, y: number, z: number, yaw: number): void {
    this.root.position.set(x, y, z);
    this.#baseYaw = yaw;
    this.root.rotation.y = yaw;
  }

  get mood(): MongdolMood {
    return this.#mood;
  }

  setMood(mood: MongdolMood): void {
    if (mood === this.#mood) return;
    this.#mood = mood;
    if (mood === 'happy') this.#hopsLeft = 3;
    if (mood === 'sad') this.#squashVelocity -= 1.2;
    this.#setFace();
  }

  /** Takes hold of the pebble at `grab` (a point in its rest frame). */
  hold(grab: Vector3): void {
    this.#grab.copy(grab);
    this.#target = new Vector3();
    this.#held = true;
    this.#setFace();
  }

  /** Pulls the held point by `offset` (in the pebble's frame). */
  pullTo(offset: Vector3): void {
    if (!this.#target) return;
    const length = offset.length();
    // Resistance grows with the stretch: it never tears off.
    const soft = length > 0 ? (MAX_PULL * Math.tanh(length / MAX_PULL)) / length : 0;
    this.#target.copy(offset).multiplyScalar(soft);
    this.#target.y = Math.max(this.#target.y, -0.12);
  }

  /**
   * Lets go: it springs back and wobbles. Returns how far it was stretched
   * (0..1). `catchUp` first stretches it all the way to the last pull, for a
   * release replayed from another screen that arrived before it got there.
   */
  release(catchUp = false): number {
    if (catchUp && this.#target && this.#target.lengthSq() > this.#pull.lengthSq()) {
      this.#pull.copy(this.#target);
    }
    const stretch = this.#pull.length() / MAX_PULL;
    this.#target = null;
    this.#held = false;
    this.#squashVelocity += stretch * 2.2;
    this.#setFace();
    return stretch;
  }

  get held(): boolean {
    return this.#held;
  }

  /** The current pull, in the pebble's frame (what the other player's screen replays). */
  get pull(): Vector3 {
    return this.#pull;
  }

  get grab(): Vector3 {
    return this.#grab;
  }

  /** Something hit the board: a small jump of fright. */
  flinch(strength: number): void {
    if (this.#still()) return;
    this.#squashVelocity -= 1.6 * strength;
    this.#hopVelocity += 1.1 * strength;
  }

  /** Its king is in check: it trembles for a moment. */
  tremble(): void {
    if (this.#still()) return;
    this.#shiver = 0.9;
  }

  /** Turns to look at a point on the table for a moment. */
  lookAt(world: Vector3): void {
    const dx = world.x - this.root.position.x;
    const dz = world.z - this.root.position.z;
    const angle = Math.atan2(dx, dz) - this.#baseYaw;
    this.#lookGoal = MathUtils.clamp(
      MathUtils.euclideanModulo(angle + Math.PI, Math.PI * 2) - Math.PI,
      -0.55,
      0.55,
    );
    this.#lookUntil = this.#time + 1.8;
  }

  #setFace(): void {
    const { smile, round, line } = this.#mouth;
    const surprised = this.#held;
    smile.visible =
      !surprised && (this.#mood === 'idle' || this.#mood === 'happy' || this.#mood === 'sad');
    round.visible = surprised;
    line.visible = !surprised && this.#mood === 'sleep';
    // Sad: the smile turned over.
    smile.rotation.z = this.#mood === 'sad' ? 0 : Math.PI;
    smile.scale.setScalar(this.#mood === 'happy' ? 1.35 : 1);
    this.#cheekMaterial.opacity = surprised ? 0.55 : this.#mood === 'happy' ? 0.45 : 0.3;
  }

  /** Advances by dt seconds; returns true while it is visibly moving. */
  step(dt: number): boolean {
    this.#time += dt;
    const still = this.#still();

    // The pull follows the pointer with a little lag (held), or springs back (let go).
    const goal = this.#target ?? new Vector3();
    const [stiffness, damping] = this.#target ? [240, 26] : still ? [260, 34] : [150, 5.2];
    const accel = goal.clone().sub(this.#pull).multiplyScalar(stiffness);
    accel.addScaledVector(this.#pullVelocity, -damping);
    this.#pullVelocity.addScaledVector(accel, dt);
    this.#pull.addScaledVector(this.#pullVelocity, dt);
    const pulling = this.#pull.lengthSq() > 1e-6 || this.#pullVelocity.lengthSq() > 1e-5;
    if (pulling || this.#deformed) this.#deform();
    if (!pulling && !this.#target) {
      this.#pull.set(0, 0, 0);
      this.#pullVelocity.set(0, 0, 0);
    }

    // Squash and stretch of the whole body, and hops.
    const sad = this.#mood === 'sad' ? -0.1 : 0;
    this.#squashVelocity += ((sad - this.#squash) * 180 - this.#squashVelocity * 7) * dt;
    this.#squash += this.#squashVelocity * dt;
    if (this.#hopsLeft > 0 && this.#hop <= 0 && this.#hopVelocity <= 0 && !still) {
      this.#hopsLeft--;
      this.#hopVelocity = 2.4;
      this.#squashVelocity -= 1.2;
    }
    this.#hopVelocity -= 16 * dt;
    this.#hop += this.#hopVelocity * dt;
    if (this.#hop <= 0) {
      if (this.#hopVelocity < -1) this.#squashVelocity -= -this.#hopVelocity * 0.45;
      this.#hop = 0;
      this.#hopVelocity = 0;
    }
    const sleeping = this.#mood === 'sleep';
    const breath = still
      ? 0
      : Math.sin(this.#time * (sleeping ? 1.3 : 2.1)) * (sleeping ? 0.03 : 0.012);
    const s = MathUtils.clamp(this.#squash + breath, -0.4, 0.5);
    this.body.scale.set(1 - s * 0.45, 1 + s, 1 - s * 0.45);
    this.body.position.y = this.#hop;

    // Looking round at a move, and trembling.
    if (this.#time > this.#lookUntil) this.#lookGoal = 0;
    this.#look += (this.#lookGoal - this.#look) * (1 - Math.exp(-dt * 5));
    this.#shiver = Math.max(0, this.#shiver - dt);
    const tremble = this.#shiver > 0 ? Math.sin(this.#time * 70) * 0.05 * this.#shiver : 0;
    this.root.rotation.y = this.#baseYaw + this.#look + tremble;

    // Blinking (shut while asleep, squeezed while pulled, smiling when happy).
    this.#blinkAt -= dt;
    if (this.#blinkAt <= 0) {
      this.#blink = 0.14;
      this.#blinkAt = 2.5 + Math.random() * 3.5;
    }
    this.#blink = Math.max(0, this.#blink - dt);
    const open = sleeping
      ? 0.12
      : this.#held
        ? 0.3
        : this.#mood === 'happy'
          ? 0.4
          : this.#mood === 'sad'
            ? 0.6
            : this.#blink > 0
              ? 0.15
              : 1;
    for (const eye of this.#eyes)
      eye.scale.y += (1.2 * open - eye.scale.y) * (1 - Math.exp(-dt * 30));

    return (
      pulling ||
      this.#target !== null ||
      Math.abs(this.#squashVelocity) > 0.01 ||
      this.#hop > 0 ||
      this.#hopsLeft > 0 ||
      this.#shiver > 0 ||
      Math.abs(this.#look - this.#lookGoal) > 0.002
    );
  }

  /** Moves every vertex by the pull, most near the grabbed point, none at the base. */
  #deform(): void {
    const position = this.body.geometry.getAttribute('position') as BufferAttribute;
    const rest = this.#rest;
    const pull = this.#pull;
    const grab = this.#grab;
    const offset = new Vector3();
    const moved = (x: number, y: number, z: number, out: Vector3) => {
      const d2 = (x - grab.x) ** 2 + (y - grab.y) ** 2 + (z - grab.z) ** 2;
      const near = Math.exp(-d2 / (2 * GRAB_SPREAD * GRAB_SPREAD));
      const base = MathUtils.smoothstep(y, 0, MONGDOL_HEIGHT * 0.7);
      const weight = (0.3 + 0.7 * near) * base;
      return out.set(x, y, z).addScaledVector(pull, weight);
    };
    for (let i = 0; i < position.count; i++) {
      moved(rest[i * 3] ?? 0, rest[i * 3 + 1] ?? 0, rest[i * 3 + 2] ?? 0, offset);
      position.setXYZ(i, offset.x, offset.y, offset.z);
    }
    position.needsUpdate = true;
    this.body.geometry.computeVertexNormals();
    this.body.geometry.computeBoundingSphere();
    for (const feature of this.#features) {
      moved(feature.rest.x, feature.rest.y, feature.rest.z, offset);
      feature.object.position.copy(offset).addScaledVector(feature.normal, feature.lift);
    }
    this.#deformed = pull.lengthSq() > 1e-6;
  }
}
