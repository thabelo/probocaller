/**
 * Simple in-memory sliding-window rate limiter for per-user external (Google)
 * caller-ID lookups. Each unknown incoming number costs a billable provider call,
 * so this bounds how many a single user can trigger per window — over the cap, the
 * caller-ID path skips enrichment (the call still rings; it just shows no external
 * name). In-memory is sufficient for the single-process deployment; it resets on
 * restart, which only ever loosens the cap.
 *
 * Not a Nest provider by decoration — provided via a factory so its numeric/clock
 * constructor args aren't treated as injectable dependencies.
 */
export class ExternalLookupRateLimiter {
  private readonly max: number;
  private readonly windowMs: number;
  private readonly hits = new Map<string, number[]>();

  constructor(
    max?: number,
    windowMs?: number,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.max = max ?? (Number(process.env.EXTERNAL_LOOKUP_MAX_PER_WINDOW) || 15);
    this.windowMs = windowMs ?? (Number(process.env.EXTERNAL_LOOKUP_WINDOW_MS) || 60_000);
  }

  /** Returns true if this key may perform a lookup now (and records it), else false. */
  tryAcquire(key: string): boolean {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((ts) => t - ts < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(t);
    this.hits.set(key, recent);
    return true;
  }
}
