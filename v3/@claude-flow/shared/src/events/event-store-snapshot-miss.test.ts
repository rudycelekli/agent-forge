import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EventStore } from './event-store.js';
import { createTaskCreatedEvent } from './domain-events.js';
import { StateReconstructor, TaskAggregate } from './state-reconstructor.js';

describe('missing event snapshots on real SQLite', () => {
  let store: EventStore;
  beforeEach(async () => {
    store = new EventStore({ databasePath: ':memory:', autoPersistInterval: 0 });
    await store.initialize();
  });
  afterEach(async () => { await store.shutdown(); });

  it('returns null for an aggregate with no snapshot', async () => {
    expect(await store.getSnapshot('absent')).toBeNull();
    await store.saveSnapshot({ aggregateId: 'other', aggregateType: 'task', version: 1,
      state: { title: 'Other task' }, timestamp: Date.now() });
    expect(await store.getSnapshot('absent')).toBeNull();
  });

  it('reconstructs a genuine task event before its first snapshot', async () => {
    await store.append(createTaskCreatedEvent('task-1', 'test', 'Owned task', 'Native fixture', 'normal', []));
    const task = await new StateReconstructor(store).reconstruct('task-1', id => new TaskAggregate(id));
    expect(task.title).toBe('Owned task');
    expect(task.version).toBe(1);
  });

  it('retains a saved snapshot and its version', async () => {
    const snapshot = { aggregateId: 'task-1', aggregateType: 'task' as const,
      version: 3, state: { title: 'Saved task' }, timestamp: Date.now() };
    await store.saveSnapshot(snapshot);
    expect(await store.getSnapshot('task-1')).toEqual(snapshot);
    const task = await new StateReconstructor(store).reconstruct('task-1', id => new TaskAggregate(id));
    expect(task.title).toBe('Saved task');
    expect(task.version).toBe(3);
  });
});
