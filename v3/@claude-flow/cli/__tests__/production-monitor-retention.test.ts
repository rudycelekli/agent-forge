import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { MonitoringHooks } from '../src/production/monitoring.js';

describe('monitoring metric retention without new writes', () => {
  it('expires a native HTTP response metric during a quiet interval', async () => {
    const server = createServer((_request, response) => response.end('healthy'));
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing fixture address');
      const monitor = new MonitoringHooks({ retentionMs: 40 });
      const end = monitor.startRequest('owned-http');
      const response = await fetch(`http://127.0.0.1:${address.port}`);
      expect(await response.text()).toBe('healthy');
      end();
      expect(monitor.getMetrics('response_time_ms')).toHaveLength(1);
      await delay(65);
      expect(monitor.getMetrics('response_time_ms')).toEqual([]);
      expect(monitor.getMetricsSummary()).toEqual({});
      // The separate performance-history contract remains intact.
      expect(monitor.getPerformanceMetrics().requestCount).toBe(1);
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });

  it('expires all metric names when summary is the first read after retention', async () => {
    const monitor = new MonitoringHooks({ retentionMs: 40 });
    monitor.counter('first', 3);
    monitor.gauge('second', 5);
    await delay(65);
    expect(monitor.getMetricsSummary()).toEqual({});
  });

  it('retains fresh metric values, labels and summary aggregation', () => {
    const monitor = new MonitoringHooks({ retentionMs: 5000, globalLabels: { service: 'fixture' } });
    monitor.counter('first', 3);
    monitor.counter('first', 5);
    monitor.gauge('second', 7);
    expect(monitor.getMetrics('first').map(metric => metric.value)).toEqual([3, 5]);
    expect(monitor.getMetrics('first')[0].labels).toEqual({ service: 'fixture' });
    expect(monitor.getMetricsSummary()).toEqual({
      first: { count: 2, lastValue: 5, avgValue: 4 },
      second: { count: 1, lastValue: 7, avgValue: 7 },
    });
    expect(monitor.getMetrics('first', Date.now() + 1000)).toEqual([]);
  });
});
