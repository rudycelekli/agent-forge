import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../src/production/rate-limiter.js';

describe('rate limiter reporting metadata', () => {
  it('reports anonymous operation names without counting operations as users', () => {
    const limiter = new RateLimiter({ burstMultiplier: 1 });
    limiter.check('build');
    limiter.check('build');
    limiter.check('test');
    expect(limiter.getStats()).toEqual({
      totalBuckets: 2, activeUsers: 0,
      mostLimitedOperations: [{ operation: 'build', requests: 2 }, { operation: 'test', requests: 1 }],
    });
  });

  it('retains nested operation names and complete user metadata', () => {
    const limiter = new RateLimiter();
    limiter.check('agent:spawn', 'fixture:agent');
    limiter.check('build', 'fixture:agent');
    limiter.check('build', 'second-agent');
    expect(limiter.getStats()).toEqual({
      totalBuckets: 3, activeUsers: 2,
      mostLimitedOperations: [{ operation: 'build', requests: 2 }, { operation: 'agent:spawn', requests: 1 }],
    });
  });

  it('does not report users when per-user tracking is disabled', () => {
    const limiter = new RateLimiter({ perUserLimits: false, maxRequests: 1, burstMultiplier: 1 });
    expect(limiter.check('build', 'first-agent').allowed).toBe(true);
    expect(limiter.check('build', 'second-agent').allowed).toBe(false);
    expect(limiter.getStats()).toEqual({
      totalBuckets: 1, activeUsers: 0,
      mostLimitedOperations: [{ operation: 'build', requests: 1 }],
    });
  });

  it('keeps request limits independent from the statistics projection', () => {
    const limiter = new RateLimiter({ maxRequests: 1, burstMultiplier: 1 });
    expect(limiter.check('build', 'agent').allowed).toBe(true);
    limiter.getStats();
    expect(limiter.check('build', 'agent').allowed).toBe(false);
    limiter.reset('build', 'agent');
    expect(limiter.check('build', 'agent').allowed).toBe(true);
    limiter.resetAll();
    expect(limiter.getStats()).toEqual({ totalBuckets: 0, activeUsers: 0, mostLimitedOperations: [] });
  });
});
