import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const loader = createRequire(import.meta.url).resolve('tsx');
const queueUrl = new URL('../src/services/worker-queue.ts', import.meta.url).href;

function resourcesAfterShutdown(retries: number): string[] {
  const source = `
    import { WorkerQueue } from ${JSON.stringify(queueUrl)};
    const queue = new WorkerQueue();
    for (let i = 0; i < ${retries}; i++) {
      const id = await queue.enqueue('audit', {}, { maxRetries: 1 });
      await queue.dequeue(['audit']);
      await queue.fail(id, 'transient failure');
    }
    await queue.shutdown();
    console.log(JSON.stringify(process.getActiveResourcesInfo()));
  `;
  const stdout = execFileSync(process.execPath,
    ['--import', loader, '--input-type=module', '-e', source], { encoding: 'utf8', timeout: 5000 });
  return JSON.parse(stdout.trim());
}

describe('WorkerQueue shutdown owns its retry timers', () => {
  it.each([1, 2])('releases all retry timers for %i retrying tasks', retries => {
    expect(resourcesAfterShutdown(retries)).not.toContain('Timeout');
  });

  it('leaves no timers when there is no retrying task', () => {
    expect(resourcesAfterShutdown(0)).not.toContain('Timeout');
  });
});
