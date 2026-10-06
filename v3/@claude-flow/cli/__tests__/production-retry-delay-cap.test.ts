import { afterEach, describe, expect, it, vi } from 'vitest';
import { withRetry, type RetryStrategy } from '../src/production/retry.js';

afterEach(() => vi.restoreAllMocks());

describe('retry delay cap after jitter', () => {
  it.each<RetryStrategy>(['exponential', 'linear', 'constant', 'fibonacci'])(
    'caps the actual %s retry schedule and callback after positive jitter',
    async (strategy) => {
      vi.spyOn(Math, 'random').mockReturnValue(0.999);
      const onRetry = vi.fn();
      let calls = 0;
      const result = await withRetry(async () => {
        if (++calls === 1) throw new Error('temporarily unavailable');
        return 'recovered';
      }, { maxAttempts: 2, initialDelayMs: 20, maxDelayMs: 20, jitter: 0.5, onRetry }, strategy);
      expect(result.success).toBe(true);
      expect(result.result).toBe('recovered');
      expect(result.attempts).toBe(2);
      expect(result.retryHistory[0].delayMs).toBe(20);
      expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1, 20);
    },
  );

  it('retains negative jitter below the cap', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    let calls = 0;
    const result = await withRetry(async () => {
      if (++calls === 1) throw new Error('temporarily unavailable');
      return 'recovered';
    }, { maxAttempts: 2, initialDelayMs: 20, maxDelayMs: 20, jitter: 0.5 });
    expect(result.retryHistory[0].delayMs).toBe(10);
  });

  it('retains positive jitter when the result is below the cap', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    let calls = 0;
    const result = await withRetry(async () => {
      if (++calls === 1) throw new Error('temporarily unavailable');
      return 'recovered';
    }, { maxAttempts: 2, initialDelayMs: 20, maxDelayMs: 100, jitter: 0.5 });
    expect(result.retryHistory[0].delayMs).toBe(30);
  });

  it('preserves a nonnegative retry schedule for a negative cap', async () => {
    const onRetry = vi.fn();
    let calls = 0;
    const result = await withRetry(async () => {
      if (++calls === 1) throw new Error('temporarily unavailable');
      return 'recovered';
    }, { maxAttempts: 2, initialDelayMs: 20, maxDelayMs: -10, jitter: 0.5, onRetry });
    expect(result.success).toBe(true);
    expect(result.retryHistory[0].delayMs).toBe(0);
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1, 0);
  });

  it('does not delay or invoke onRetry for immediate success', async () => {
    const onRetry = vi.fn();
    const result = await withRetry(async () => 'success', { onRetry });
    expect(result.attempts).toBe(1);
    expect(result.retryHistory).toEqual([]);
    expect(onRetry).not.toHaveBeenCalled();
  });
});
