// Sound effects from the original game. Browsers may refuse to play audio
// before the first user interaction; that is not an error worth reporting.
const SOUNDS = {
  move: '/sounds/move.mp3',
  victory: '/sounds/victory.mp3',
  clockWarning: '/sounds/clock-warning.mp3',
  gameStart: '/sounds/game-start.mp3',
  check: '/sounds/check.mp3',
  yourTurn: '/sounds/your-turn.mp3',
  defeatOrDraw: '/sounds/defeat-or-draw.mp3',
} as const;

export type SoundName = keyof typeof SOUNDS;

const cache = new Map<SoundName, HTMLAudioElement>();

export function playSound(name: SoundName): void {
  let audio = cache.get(name);
  if (!audio) {
    audio = new Audio(SOUNDS[name]);
    cache.set(name, audio);
  }
  audio.currentTime = 0;
  audio.play().catch(() => undefined);
}
