import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { composeMemoryBody, MEMORY_PROMPT_BUDGET_CHARS, upsertMemoryEntry } from '../src/memory.js';

let dataDir = '';

beforeEach(async () => {
  dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'od-memory-budget-'));
});

afterEach(async () => {
  await fsp.rm(dataDir, { recursive: true, force: true });
});

describe('the memory block in every prompt', () => {
  it('goes in full while it is small', async () => {
    await upsertMemoryEntry(dataDir, { name: 'Brand colour', description: 'Green', type: 'user', body: 'The brand is green.' }, { silent: true });
    const body = await composeMemoryBody(dataDir);
    expect(body).toContain('The brand is green.');
  });

  it('becomes an index with ids past its budget', async () => {
    for (let i = 0; i < 30; i += 1) {
      await upsertMemoryEntry(
        dataDir,
        { name: `Fact ${i}`, description: `Short line ${i}`, type: 'user', body: 'detail '.repeat(40) },
        { silent: true },
      );
    }
    const body = await composeMemoryBody(dataDir);
    expect(body.length).toBeLessThanOrEqual(MEMORY_PROMPT_BUDGET_CHARS + 200);
    expect(body).toContain('memory tree view <id>');
    expect(body).toMatch(/\(id: [^)]+\)/);
    expect(body).not.toContain('detail detail');
  });
});
