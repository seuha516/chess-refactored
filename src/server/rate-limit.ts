/**
 * Token bucket: allows bursts of up to `capacity` actions and refills at
 * `capacity / intervalMs`. Used to throttle chat and event floods.
 */
export class RateLimiter {
  readonly #capacity: number;
  readonly #refillPerMs: number;
  readonly #now: () => number;
  #tokens: number;
  #updatedAt: number;

  constructor(capacity: number, intervalMs: number, now: () => number = Date.now) {
    this.#capacity = capacity;
    this.#refillPerMs = capacity / intervalMs;
    this.#now = now;
    this.#tokens = capacity;
    this.#updatedAt = now();
  }

  tryTake(): boolean {
    const now = this.#now();
    this.#tokens = Math.min(
      this.#capacity,
      this.#tokens + (now - this.#updatedAt) * this.#refillPerMs,
    );
    this.#updatedAt = now;
    if (this.#tokens < 1) return false;
    this.#tokens -= 1;
    return true;
  }
}
