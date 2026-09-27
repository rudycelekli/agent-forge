import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const state = vi.hoisted(() => ({ cwd: '' }));
vi.mock('../src/mcp-tools/types.js', () => ({ getProjectCwd: () => state.cwd }));
import { sessionTools } from '../src/mcp-tools/session-tools.js';
const call = (name: string, input: object): Promise<any> => sessionTools.find(t => t.name === name)!.handler(input) as Promise<any>;
beforeEach(() => {
  state.cwd = mkdtempSync(join(tmpdir(), 'ruflo-session-id-'));
  vi.spyOn(Date, 'now').mockReturnValue(1790530000000);
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
});
afterEach(() => { vi.restoreAllMocks(); rmSync(state.cwd, { recursive: true, force: true }); });
it.each(['session_save', 'session_import'])('%s retains distinct snapshots despite identical timestamps and Math.random values', async tool => {
  const inputPath = join(state.cwd, 'input.json');
  writeFileSync(inputPath, JSON.stringify({ name: 'snapshot', data: {} }));
  const first = await call(tool, { name: 'first', inputPath });
  const second = await call(tool, { name: 'second', inputPath });
  expect(first.sessionId).not.toBe(second.sessionId);
  for (const [result, name] of [[first, 'first'], [second, 'second']]) {
    expect(result.sessionId).toMatch(/^session-\d+-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(JSON.parse(readFileSync(join(state.cwd, '.claude-flow/sessions', `${result.sessionId}.json`), 'utf8')).name).toBe(name);
  }
});
