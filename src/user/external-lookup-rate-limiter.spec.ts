import { ExternalLookupRateLimiter } from './external-lookup-rate-limiter';

// Every unknown incoming number triggers a billable external (Google) lookup, so a
// looping or abusive caller could rack up cost. This caps external lookups per user
// per time window; over the cap, the caller-ID path simply skips enrichment.
describe('ExternalLookupRateLimiter', () => {
  it('allows up to max acquisitions per key within the window, then blocks', () => {
    let now = 1000;
    const rl = new ExternalLookupRateLimiter(3, 1000, () => now);
    expect(rl.tryAcquire('u1')).toBe(true);
    expect(rl.tryAcquire('u1')).toBe(true);
    expect(rl.tryAcquire('u1')).toBe(true);
    expect(rl.tryAcquire('u1')).toBe(false); // 4th within window is blocked
  });

  it('tracks each key (user) independently', () => {
    const now = 0;
    const rl = new ExternalLookupRateLimiter(1, 1000, () => now);
    expect(rl.tryAcquire('a')).toBe(true);
    expect(rl.tryAcquire('a')).toBe(false);
    expect(rl.tryAcquire('b')).toBe(true);
  });

  it('resets once the window has elapsed', () => {
    let now = 0;
    const rl = new ExternalLookupRateLimiter(1, 1000, () => now);
    expect(rl.tryAcquire('u')).toBe(true);
    expect(rl.tryAcquire('u')).toBe(false);
    now = 1001;
    expect(rl.tryAcquire('u')).toBe(true);
  });

  /**
   * Production always constructs this via UserModule's async factory, which
   * resolves EXTERNAL_LOOKUP_MAX_PER_WINDOW / EXTERNAL_LOOKUP_WINDOW_MS live
   * from the settings table and passes them in explicitly (see
   * user.module.spec.ts) — so this class itself no longer reads process.env.
   * The no-args constructor default below is a plain fallback for direct
   * construction (tests, ad-hoc use), not a production configuration path.
   */
  it('defaults to 15 per 60s when constructed with no args (test/ad-hoc convenience only)', () => {
    const rl = new ExternalLookupRateLimiter();
    for (let i = 0; i < 15; i++) expect(rl.tryAcquire('u')).toBe(true);
    expect(rl.tryAcquire('u')).toBe(false);
  });
});
