import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const wrapper = new URL('../../../../ruflo/bin/ruflo.js', import.meta.url);
// Run the wrapper's exact private function without importing its CLI runtime.
const wrapperHelper = readFileSync(wrapper, 'utf8').match(/^async function exitAfterFlush[\s\S]*?\n}\n/m)?.[0];
if (!wrapperHelper) throw new Error('Missing wrapper output-drain helper');
const helpers = [
  { label: 'CLI', url: new URL('../src/process-exit.ts', import.meta.url) },
  { label: 'wrapper', url: new URL(`data:text/javascript;base64,${Buffer.from(`export ${wrapperHelper}`).toString('base64')}`) },
];

async function run(helper: URL, code: number, slow = false, broken?: 'stdout' | 'stderr') {
  const source = `
    const { exitAfterFlush } = await import(${JSON.stringify(helper.href)});
    setInterval(() => {}, 1000);
    process.stdout.write('o'.repeat(300000));
    process.stderr.write('e'.repeat(300000));
    await exitAfterFlush(${code});
  `;
  const child = spawn(process.execPath, ['--input-type=module', '-e', source], { stdio: ['ignore', 'pipe', 'pipe'] });
  const stdout: Buffer[] = [], stderr: Buffer[] = [];
  if (broken === 'stdout') child.stdout.destroy();
  else {
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    if (slow) child.stdout.pause();
  }
  if (broken === 'stderr') child.stderr.destroy();
  else child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
  const resume = slow ? setTimeout(() => child.stdout.resume(), 100) : undefined;
  const deadline = setTimeout(() => child.kill('SIGKILL'), 5000);
  try {
    const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (code, signal) => resolve({ code, signal }));
    });
    return { ...result, stdout: Buffer.concat(stdout).toString(), stderr: Buffer.concat(stderr).toString() };
  } finally {
    clearTimeout(deadline);
    if (resume) clearTimeout(resume);
  }
}

for (const { label, url: helper } of helpers) describe(`output draining: ${label}`, () => {
  it.each([0, 7])('drains both streams and terminates held handles with exit %i', async (code) => {
    const result = await run(helper, code);
    expect(result.signal).toBeNull();
    expect(result.code).toBe(code);
    expect(result.stdout).toBe('o'.repeat(300000));
    expect(result.stderr).toBe('e'.repeat(300000));
  });
  it('waits for a slow pipe reader', async () => {
    const result = await run(helper, 0, true);
    expect(result.signal).toBeNull();
    expect(result.code).toBe(0);
    expect(result.stdout).toBe('o'.repeat(300000));
    expect(result.stderr).toBe('e'.repeat(300000));
  });
  it.each(['stdout', 'stderr'] as const)('reports a broken %s pipe as failure', async (stream) => {
    const result = await run(helper, 0, false, stream);
    expect(result.signal).toBeNull();
    expect(result.code).toBe(1);
  });
  it('preserves a command failure when its pipe is broken', async () => {
    const result = await run(helper, 7, false, 'stdout');
    expect(result.signal).toBeNull();
    expect(result.code).toBe(7);
  });
});
