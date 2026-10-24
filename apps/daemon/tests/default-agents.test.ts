/**
 * The app ships one agent: Design, which owns the `design-craft` skill. It is seeded once,
 * so deleting it is permanent, and it is an ordinary profile afterwards (editable,
 * deletable, picked by the orchestrator from its card).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  closeDatabase,
  deleteAgentProfile,
  insertAgentProfile,
  listAgentProfiles,
  openDatabase,
  updateAgentProfile,
} from '../src/db.js';
import { DESIGN_CRAFT_SKILL_ID } from '../src/design-craft-delivery.js';
import { seedDefaultAgents } from '../src/default-agents.js';

let tempDir: string;
beforeEach(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-default-agents-'));
});
afterEach(() => {
  closeDatabase();
  rmSync(tempDir, { recursive: true, force: true });
});

const openDb = () => openDatabase(tempDir, { dataDir: tempDir });
let counter = 0;
const options = (over: Partial<Parameters<typeof seedDefaultAgents>[1]> = {}) => ({
  runtimeId: 'claude' as string | null,
  isKnownRuntime: (id: string) => id === 'claude' || id === 'codex',
  randomId: () => `seed-${++counter}`,
  now: () => 1_000,
  ...over,
});

describe('seedDefaultAgents', () => {
  it('creates a Design agent that owns design-craft and says in its card what to send it', () => {
    const db = openDb();
    expect(seedDefaultAgents(db, options())).toEqual({ seeded: ['design'] });
    const [agent, ...rest] = listAgentProfiles(db);
    expect(rest).toEqual([]);
    expect(agent).toMatchObject({
      name: 'Design',
      runtimeId: 'claude',
      model: null,
      skillIds: [DESIGN_CRAFT_SKILL_ID],
    });
    expect(agent!.card.goodFor).toMatch(/design|interface|landing/i);
    expect(agent!.card.notFor).toMatch(/backend|test/i);
    expect(agent!.instructions).toContain('design-craft');
  });

  it('runs on the runtime the person chose, and waits when none is chosen yet', () => {
    const db = openDb();
    expect(seedDefaultAgents(db, options({ runtimeId: null }))).toEqual({ seeded: [] });
    expect(listAgentProfiles(db)).toEqual([]);
    expect(seedDefaultAgents(db, options({ runtimeId: 'unknown-cli' }))).toEqual({ seeded: [] });
    expect(listAgentProfiles(db)).toEqual([]);
    // Nothing was marked as done, so it still happens once a runtime exists.
    expect(seedDefaultAgents(db, options({ runtimeId: 'codex' }))).toEqual({ seeded: ['design'] });
    expect(listAgentProfiles(db)[0]!.runtimeId).toBe('codex');
  });

  it('seeds once: deleting the agent is permanent, even after the database is reopened', () => {
    const db = openDb();
    seedDefaultAgents(db, options());
    deleteAgentProfile(db, listAgentProfiles(db)[0]!.id);
    expect(seedDefaultAgents(db, options())).toEqual({ seeded: [] });
    closeDatabase();
    const reopened = openDb();
    expect(seedDefaultAgents(reopened, options())).toEqual({ seeded: [] });
    expect(listAgentProfiles(reopened)).toEqual([]);
  });

  it('does not add a second one when an agent already owns design-craft', () => {
    const db = openDb();
    insertAgentProfile(db, {
      id: 'mine',
      name: 'My designer',
      runtimeId: 'claude',
      skillIds: [DESIGN_CRAFT_SKILL_ID],
      createdAt: 1,
      updatedAt: 1,
    });
    expect(seedDefaultAgents(db, options())).toEqual({ seeded: [] });
    expect(listAgentProfiles(db).map((p) => p.id)).toEqual(['mine']);
    // ...and it counts as done: removing that agent later does not bring Design back.
    deleteAgentProfile(db, 'mine');
    expect(seedDefaultAgents(db, options())).toEqual({ seeded: [] });
  });

  it('is an ordinary profile afterwards: it can be edited', () => {
    const db = openDb();
    seedDefaultAgents(db, options());
    const id = listAgentProfiles(db)[0]!.id;
    updateAgentProfile(db, id, { name: 'Diseño', model: 'haiku', skillIds: [DESIGN_CRAFT_SKILL_ID, 'extra'] });
    expect(listAgentProfiles(db)[0]).toMatchObject({ name: 'Diseño', model: 'haiku', skillIds: [DESIGN_CRAFT_SKILL_ID, 'extra'] });
  });
});
