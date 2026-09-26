// Stone-on-stone sounds, synthesised with Web Audio: no sound files. Audio
// starts after the first user interaction (browsers require it) and can be
// switched off; the choice is remembered in this browser.

const STORAGE_KEY = 'chess.sound';

function storedEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

let enabled = storedEnabled();
let context: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let room: ConvolverNode | null = null;

export const soundEnabled = (): boolean => enabled;

export function setSoundEnabled(next: boolean): void {
  enabled = next;
  try {
    localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off');
  } catch {
    // Not remembered (private mode); still applies to this page.
  }
  if (next) unlock();
}

/** Creates or resumes the audio context; call from a user gesture. */
export function unlock(): void {
  if (!enabled) return;
  if (!context) {
    const Context = window.AudioContext as typeof AudioContext | undefined;
    if (!Context) return;
    context = new Context();
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.ratio.value = 4;
    master = context.createGain();
    master.gain.value = 0.7;
    master.connect(compressor).connect(context.destination);
    noise = makeNoise(context);
    room = context.createConvolver();
    room.buffer = makeRoom(context);
    const wet = context.createGain();
    wet.gain.value = 0.22;
    room.connect(wet).connect(master);
  }
  if (context.state === 'suspended') void context.resume();
}

for (const type of ['pointerdown', 'keydown'] as const) {
  window.addEventListener(type, unlock, { capture: true, passive: true });
}

function makeNoise(audio: AudioContext): AudioBuffer {
  const buffer = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** A short open-air reflection: a park, not a hall. */
function makeRoom(audio: AudioContext): AudioBuffer {
  const length = Math.round(audio.sampleRate * 0.9);
  const buffer = audio.createBuffer(2, length, audio.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3.2) * 0.6;
    }
  }
  return buffer;
}

interface Voice {
  readonly audio: AudioContext;
  readonly out: AudioNode;
  readonly at: number;
}

function voice(delay = 0, reverb = 0.3): Voice | null {
  if (!enabled || !context || !master || context.state !== 'running') return null;
  const out = context.createGain();
  out.connect(master);
  if (room && reverb > 0) {
    const send = context.createGain();
    send.gain.value = reverb;
    out.connect(send).connect(room);
  }
  return { audio: context, out, at: context.currentTime + delay };
}

/** A burst of filtered noise: the hard click of stone meeting stone. */
function click(v: Voice, gain: number, frequency: number, decay: number, q = 1.4): void {
  if (!noise) return;
  const source = v.audio.createBufferSource();
  source.buffer = noise;
  const filter = v.audio.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = frequency;
  filter.Q.value = q;
  const envelope = v.audio.createGain();
  envelope.gain.setValueAtTime(0, v.at);
  envelope.gain.linearRampToValueAtTime(gain, v.at + 0.002);
  envelope.gain.exponentialRampToValueAtTime(0.0008, v.at + decay);
  source.connect(filter).connect(envelope).connect(v.out);
  source.start(v.at, Math.random() * 0.5);
  source.stop(v.at + decay + 0.05);
}

/** A decaying tone: the body of the piece, or a bell. */
function tone(
  v: Voice,
  gain: number,
  frequency: number,
  decay: number,
  type: OscillatorType = 'sine',
  endFrequency = frequency,
  offset = 0,
): void {
  const oscillator = v.audio.createOscillator();
  oscillator.type = type;
  const start = v.at + offset;
  oscillator.frequency.setValueAtTime(frequency, start);
  if (endFrequency !== frequency) {
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + decay);
  }
  const envelope = v.audio.createGain();
  envelope.gain.setValueAtTime(0, start);
  envelope.gain.linearRampToValueAtTime(gain, start + 0.004);
  envelope.gain.exponentialRampToValueAtTime(0.0008, start + decay);
  oscillator.connect(envelope).connect(v.out);
  oscillator.start(start);
  oscillator.stop(start + decay + 0.05);
}

/** Low rumble of grit: stone chips scattering. */
function crumble(v: Voice, gain: number, duration: number): void {
  if (!noise) return;
  const source = v.audio.createBufferSource();
  source.buffer = noise;
  const filter = v.audio.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1400;
  const envelope = v.audio.createGain();
  envelope.gain.setValueAtTime(0, v.at);
  // Grainy: a few quick bumps instead of one smooth swell.
  for (let i = 0; i < 6; i++) {
    const t = v.at + (i / 6) * duration;
    envelope.gain.linearRampToValueAtTime(
      gain * (1 - i / 7) * (0.5 + Math.random() * 0.5),
      t + 0.01,
    );
    envelope.gain.linearRampToValueAtTime(gain * 0.1, t + duration / 8);
  }
  envelope.gain.linearRampToValueAtTime(0, v.at + duration);
  source.connect(filter).connect(envelope).connect(v.out);
  source.start(v.at, Math.random() * 0.3);
  source.stop(v.at + duration + 0.05);
}

/** Moving air: noise through a band that sweeps up and back down. */
function sweep(v: Voice, gain: number, duration: number, low: number, high: number): void {
  if (!noise) return;
  const source = v.audio.createBufferSource();
  source.buffer = noise;
  source.loop = true;
  const filter = v.audio.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 0.9;
  filter.frequency.setValueAtTime(low, v.at);
  filter.frequency.exponentialRampToValueAtTime(high, v.at + duration * 0.45);
  filter.frequency.exponentialRampToValueAtTime(low * 0.8, v.at + duration);
  const envelope = v.audio.createGain();
  envelope.gain.setValueAtTime(0, v.at);
  envelope.gain.linearRampToValueAtTime(gain, v.at + duration * 0.45);
  envelope.gain.linearRampToValueAtTime(0, v.at + duration);
  source.connect(filter).connect(envelope).connect(v.out);
  source.start(v.at, Math.random() * 0.5);
  source.stop(v.at + duration + 0.05);
}

/** Heavier pieces sound lower. */
const PITCH: Record<string, number> = { p: 1.18, n: 1.04, b: 1.08, r: 0.94, q: 0.88, k: 0.82 };

/** A piece set down on the board. `weight` 0..1 grows with the moment. */
export function placeSound(piece: string, weight = 0.1, delay = 0): void {
  const v = voice(delay, 0.18);
  if (!v) return;
  const pitch = (PITCH[piece] ?? 1) * (0.96 + Math.random() * 0.08);
  click(v, 0.55 + weight * 0.4, 2600 * pitch, 0.05);
  click(v, 0.3, 5200 * pitch, 0.025, 2);
  tone(v, 0.32 + weight * 0.3, 210 * pitch, 0.11, 'triangle', 170 * pitch);
}

/** Lifting a piece: a soft scrape. */
export function liftSound(): void {
  const v = voice(0, 0.05);
  if (!v) return;
  click(v, 0.08, 1800, 0.05, 0.8);
}

/** A capture: the hit, the victim knocked away, and its landing beside the board. */
export function captureSound(value: number, flight = 0.62): void {
  const v = voice(0, 0.4);
  if (!v) return;
  const weight = Math.min(value / 9, 1);
  click(v, 0.95, 2100, 0.08, 1);
  click(v, 0.5, 4200, 0.04, 1.5);
  tone(v, 0.55 + weight * 0.35, 120 - weight * 30, 0.22 + weight * 0.2, 'sine', 48);
  crumble(v, 0.35 + weight * 0.25, 0.28);
  const landing = voice(flight, 0.25);
  if (landing) {
    click(landing, 0.4, 2400, 0.05);
    tone(landing, 0.2, 230, 0.08, 'triangle');
  }
}

/** Check: a low knock and a tense, dissonant ring. */
export function checkSound(): void {
  const v = voice(0.03, 0.5);
  if (!v) return;
  tone(v, 0.5, 90, 0.35, 'sine', 55);
  tone(v, 0.16, 740, 0.9, 'sine');
  tone(v, 0.12, 784, 0.9, 'sine');
  tone(v, 0.05, 1480, 0.6, 'triangle');
}

/** Checkmate: a deep boom that rolls away. */
export function mateSound(): void {
  const v = voice(0, 0.8);
  if (!v) return;
  tone(v, 0.9, 110, 1.6, 'sine', 32);
  tone(v, 0.25, 55, 1.8, 'triangle', 30);
  crumble(v, 0.5, 0.9);
  click(v, 1, 1600, 0.12, 0.9);
}

/** A toppled king hitting the board. */
export function toppleSound(delay = 0): void {
  const v = voice(delay, 0.5);
  if (!v) return;
  click(v, 0.8, 1900, 0.09, 1);
  tone(v, 0.5, 150, 0.3, 'triangle', 90);
  const roll = voice(delay + 0.16, 0.3);
  if (roll) click(roll, 0.25, 2600, 0.05);
}

/** The set coming down onto the board at the start of a game. */
export function setupSound(count: number, duration: number): void {
  for (let i = 0; i < count; i++) {
    const v = voice((i / count) * duration + Math.random() * 0.03, 0.12);
    if (!v) return;
    const pitch = 0.9 + Math.random() * 0.3;
    click(v, 0.22, 2800 * pitch, 0.04);
    tone(v, 0.1, 220 * pitch, 0.07, 'triangle');
  }
}

/** The game begins: the clock button is pressed, then a bell rings twice, rising. */
export function startSound(delay = 0): void {
  const press = voice(delay, 0.2);
  if (!press) return;
  click(press, 0.7, 1500, 0.06, 0.9);
  tone(press, 0.35, 160, 0.1, 'triangle', 120);
  for (const [index, frequency] of [587.33, 880].entries()) {
    const bell = voice(delay + 0.14 + index * 0.2, 0.7);
    if (!bell) return;
    tone(bell, 0.16, frequency, 1.5, 'sine');
    // Inharmonic partials make it a bell, not a beep.
    tone(bell, 0.05, frequency * 2.76, 0.6, 'sine');
    tone(bell, 0.03, frequency * 5.4, 0.3, 'sine');
  }
}

/** 몽돌이 taken hold of: a tiny rubbery squeak. */
export function squeakSound(): void {
  const v = voice(0, 0.1);
  if (!v) return;
  tone(v, 0.06, 820, 0.09, 'sine', 1180);
}

/** 몽돌이 let go: "뽁", deeper and louder the further it was stretched (0..1). */
export function popSound(stretch: number, gain = 1): void {
  const v = voice(0, 0.25);
  if (!v || stretch < 0.05) return;
  const size = MathClamp(stretch);
  tone(v, (0.18 + size * 0.3) * gain, 620 - size * 220, 0.12, 'sine', 240 - size * 60);
  click(v, (0.12 + size * 0.2) * gain, 1800, 0.03, 1.2);
  // The wobble after it: two soft, falling bounces.
  for (const [index, delay] of [0.16, 0.3].entries()) {
    const bounce = voice(delay, 0.2);
    if (bounce) tone(bounce, 0.05 * size * gain * (1 - index * 0.4), 360, 0.08, 'sine', 300);
  }
}

const MathClamp = (value: number) => Math.min(1, Math.max(0, value));

/** The board turning round: a sweep of air as the view circles the table. */
export function flipSound(duration: number): void {
  const v = voice(0, 0.35);
  if (!v) return;
  sweep(v, 0.22, duration, 380, 1700);
}

/** A piece turning into another on the last rank. */
export function promoteSound(): void {
  const v = voice(0, 0.6);
  if (!v) return;
  for (const [index, frequency] of [523.25, 659.25, 783.99, 1046.5].entries()) {
    tone(v, 0.12, frequency, 0.8, 'triangle', frequency, index * 0.06);
  }
}

/** The end of a game, from the listener's point of view. */
export function endSound(kind: 'win' | 'loss' | 'draw' | 'neutral'): void {
  const v = voice(0, 0.7);
  if (!v) return;
  const chords: Record<typeof kind, number[]> = {
    win: [392, 493.88, 587.33, 783.99],
    loss: [220, 261.63, 311.13],
    draw: [293.66, 440, 587.33],
    neutral: [329.63, 440, 554.37],
  };
  for (const [index, frequency] of chords[kind].entries()) {
    tone(v, 0.13, frequency, 1.6, 'triangle', frequency, index * 0.09);
  }
}

/** A move refused: a dull knock. */
export function deniedSound(): void {
  const v = voice(0, 0.1);
  if (!v) return;
  tone(v, 0.3, 140, 0.12, 'square', 90);
}

/** Running low on time: a wooden tick. */
export function tickSound(): void {
  const v = voice(0, 0.1);
  if (!v) return;
  click(v, 0.35, 3200, 0.03, 4);
  tone(v, 0.12, 1250, 0.05, 'sine');
}

/** Someone sat down, or offered a draw: two soft notes. */
export function chimeSound(): void {
  const v = voice(0, 0.5);
  if (!v) return;
  tone(v, 0.1, 659.25, 0.7, 'sine');
  tone(v, 0.08, 987.77, 0.8, 'sine', 987.77, 0.08);
}

/** A short buzz on phones for moments that concern the holder. */
export function buzz(pattern: number | number[]): void {
  if (!enabled) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Not supported.
  }
}
