// Chess clock with a Fischer (cumulative) increment. Pure functions over a
// JSON-serialisable state, so the server can store it anywhere and the
// client can compute the same remaining times for display.
//
// FIDE Laws of Chess (2023), Glossary "increment": time added "from the start
// before each move" — in cumulative mode the player receives the extra time
// prior to each move. Article 6.6: White's clock is started at the start of
// the game. Online Regulations 4.2: when a player has moved, their clock stops
// and the opponent's starts.
import { opposite, type Color } from './chess/types.ts';

export interface TimeControl {
  readonly initialMs: number;
  readonly incrementMs: number;
}

/** 15 minutes + 10 seconds per move: the FIDE World Rapid Championship control. */
export const TIME_CONTROL: TimeControl = { initialMs: 15 * 60_000, incrementMs: 10_000 };

export interface ClockState {
  /** Time left for each side when its clock last stopped (increment included). */
  readonly remainingMs: Readonly<Record<Color, number>>;
  /** Side whose clock is running, or null once stopped. */
  readonly running: Color | null;
  /** When the running clock was started. */
  readonly startedAt: number | null;
}

/** A new clock with White's time running (including White's first increment). */
export function startClock(control: TimeControl, now: number): ClockState {
  return {
    remainingMs: { w: control.initialMs + control.incrementMs, b: control.initialMs },
    running: 'w',
    startedAt: now,
  };
}

/** Time left for `color` at `now` (never negative). */
export function remainingMs(clock: ClockState, color: Color, now: number): number {
  const stored = clock.remainingMs[color];
  if (clock.running !== color || clock.startedAt === null) return stored;
  return Math.max(0, stored - (now - clock.startedAt));
}

/** The side whose time has run out at `now`, if any. */
export function flaggedSide(clock: ClockState, now: number): Color | null {
  return clock.running !== null && remainingMs(clock, clock.running, now) <= 0
    ? clock.running
    : null;
}

/** Moment the running side's time runs out, or null if no clock is running. */
export function flagTime(clock: ClockState): number | null {
  if (clock.running === null || clock.startedAt === null) return null;
  return clock.startedAt + clock.remainingMs[clock.running];
}

/**
 * The running side has completed a move: stop its clock and start the
 * opponent's, adding the opponent's increment for the coming move.
 * Callers must check {@link flaggedSide} first.
 */
export function pressClock(clock: ClockState, control: TimeControl, now: number): ClockState {
  const mover = clock.running;
  if (mover === null) return clock;
  const next = opposite(mover);
  return {
    remainingMs: {
      ...clock.remainingMs,
      [mover]: remainingMs(clock, mover, now),
      [next]: clock.remainingMs[next] + control.incrementMs,
    },
    running: next,
    startedAt: now,
  };
}

/** Stops the clock (game over), keeping the times shown at that moment. */
export function stopClock(clock: ClockState, now: number): ClockState {
  if (clock.running === null) return clock;
  return {
    remainingMs: {
      ...clock.remainingMs,
      [clock.running]: remainingMs(clock, clock.running, now),
    },
    running: null,
    startedAt: null,
  };
}
