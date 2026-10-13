import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { parseAdr } from '../lib/parse-adrs.mjs';

const cases = [
  ['accepted with trailing note', '- **Status**: accepted (2026-07-02) — spike closed all items', 'accepted'],
  ['superseded with linked decision', '- **Status**: superseded by [ADR-025](ADR-025.md) (2026-07-02)', 'superseded'],
  ['accepted with amended note', '**Status:** Accepted (2026-08-18) · **AMENDED 2026-08-20**', 'Accepted'],
  ['custom compound state', '- **Status**: accepted-experimental', 'accepted-experimental'],
  ['custom pending approval state', '- **Status**: accepted pending approval', 'accepted pending approval'],
  ['custom in-principle state', '- **Status**: accepted-in-principle', 'accepted-in-principle'],
  ['keyword prefix', '- **Status**: acceptedness', 'acceptedness'],
  ['frontmatter custom state', '---\nstatus: accepted pending approval\n---', 'accepted pending approval'],
  ['existing date-only state', '- **Status**: accepted (2026-07-02)', 'accepted'],
];

for (const [name, status, expected] of cases) {
  test(name, () => {
    const root = mkdtempSync(join(tmpdir(), 'ruflo-adr-annotation-'));
    try {
      const dir = join(root, 'docs', 'adr');
      mkdirSync(dir, { recursive: true });
      const file = join(dir, 'ADR-025.md');
      writeFileSync(file, `# Decision\n${status}\n`);
      assert.equal(parseAdr(file, root).status, expected);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
