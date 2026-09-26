import { describe, expect, it } from 'vitest';
import {
  flagTime,
  flaggedSide,
  pressClock,
  remainingMs,
  startClock,
  stopClock,
  TIME_CONTROL,
  type TimeControl,
} from '../../src/shared/clock.ts';

const control: TimeControl = { initialMs: 60_000, incrementMs: 5_000 };

describe('Fischer clock', () => {
  it('uses 15 minutes + 10 seconds by default', () => {
    expect(TIME_CONTROL).toEqual({ initialMs: 900_000, incrementMs: 10_000 });
  });

  it("starts White's clock at the start, with the first increment (FIDE 6.6, glossary)", () => {
    const clock = startClock(control, 1000);
    expect(clock.running).toBe('w');
    expect(remainingMs(clock, 'w', 1000)).toBe(65_000);
    expect(remainingMs(clock, 'b', 1000)).toBe(60_000);
    expect(remainingMs(clock, 'w', 11_000)).toBe(55_000);
    expect(remainingMs(clock, 'b', 11_000)).toBe(60_000);
  });

  it('stops the mover, starts the opponent and adds its increment before its move', () => {
    let clock = startClock(control, 0);
    clock = pressClock(clock, control, 20_000); // white used 20 s
    expect(clock.running).toBe('b');
    expect(remainingMs(clock, 'w', 20_000)).toBe(45_000);
    expect(remainingMs(clock, 'b', 20_000)).toBe(65_000);
    clock = pressClock(clock, control, 21_000); // black used 1 s
    expect(remainingMs(clock, 'b', 21_000)).toBe(64_000);
    expect(remainingMs(clock, 'w', 21_000)).toBe(50_000);
  });

  it('accumulates time for fast moves (cumulative mode)', () => {
    let clock = startClock(control, 0);
    for (let t = 1000; t <= 10_000; t += 1000) clock = pressClock(clock, control, t);
    // Each side moved 5 times using 1 s each and received 5 s per move.
    expect(remainingMs(clock, 'w', 10_000)).toBe(60_000 + 5 * 5_000 + 5_000 - 5 * 1000);
    expect(remainingMs(clock, 'b', 10_000)).toBeGreaterThan(60_000);
  });

  it('reports the flag fall of the running side only', () => {
    const clock = startClock(control, 0);
    expect(flagTime(clock)).toBe(65_000);
    expect(flaggedSide(clock, 64_999)).toBeNull();
    expect(flaggedSide(clock, 65_000)).toBe('w');
    expect(remainingMs(clock, 'w', 70_000)).toBe(0);
  });

  it('freezes the times when stopped', () => {
    const stopped = stopClock(startClock(control, 0), 30_000);
    expect(stopped.running).toBeNull();
    expect(remainingMs(stopped, 'w', 99_000)).toBe(35_000);
    expect(flaggedSide(stopped, 99_000)).toBeNull();
    expect(flagTime(stopped)).toBeNull();
  });

  it('survives a JSON round trip (stored in a database)', () => {
    const clock = pressClock(startClock(control, 0), control, 3000);
    expect(JSON.parse(JSON.stringify(clock))).toEqual(clock);
  });
});
