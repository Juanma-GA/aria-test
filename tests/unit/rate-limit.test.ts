import { describe, it, expect } from 'vitest';
import { rateLimit } from '@/lib/rateLimit';

describe('rateLimit (MEDIUM-1)', () => {
  it('allows first N requests and blocks the next', () => {
    const key = `t:${Math.random()}`;
    const limit = 3;
    const window = 60_000;
    const results = Array.from({ length: 5 }, () => rateLimit(key, limit, window));
    expect(results.slice(0, 3).every(r => r.allowed)).toBe(true);
    expect(results.slice(3).every(r => !r.allowed)).toBe(true);
  });

  it('tracks buckets per key independently', () => {
    const a = `a:${Math.random()}`;
    const b = `b:${Math.random()}`;
    expect(rateLimit(a, 1, 60_000).allowed).toBe(true);
    expect(rateLimit(a, 1, 60_000).allowed).toBe(false);
    expect(rateLimit(b, 1, 60_000).allowed).toBe(true);
  });
});
