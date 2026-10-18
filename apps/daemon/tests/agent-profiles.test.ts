/**
 * Agent profiles: a named role bound to a runtime and a model. These tests pin
 * the storage round-trip, the link from a conversation to its profile, what
 * happens to that link when the profile is deleted, and the request validation.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  closeDatabase,
  deleteAgentProfile,
  getAgentProfile,
  getConversation,
  insertAgentProfile,
  insertConversation,
  insertProject,
  listAgentProfiles,
  listConversations,
  openDatabase,
  updateAgentProfile,
  updateConversation,
} from '../src/db.js';
import { parseAgentProfileInput } from '../src/routes/agent-profiles.js';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-agent-profiles-'));
});

afterEach(() => {
  closeDatabase();
  rmSync(tempDir, { recursive: true, force: true });
});

function openDb() {
  return openDatabase(tempDir, { dataDir: tempDir });
}

function profile(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    id: 'a1',
    name: 'Design',
    role: 'Design and interfaces assistant',
    emoji: '🎨',
    runtimeId: 'antigravity',
    model: 'Gemini 3.5 Flash (High)',
    instructions: 'You are the design agent. Write only under design/.',
    skillIds: ['frontend-design'],
    designSystemId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('agent profiles · storage', () => {
  it('round-trips every field and reports no activity yet', () => {
    const db = openDb();
    insertAgentProfile(db, profile());

    const stored = getAgentProfile(db, 'a1');
    expect(stored).toMatchObject({
      id: 'a1',
      name: 'Design',
      role: 'Design and interfaces assistant',
      emoji: '🎨',
      runtimeId: 'antigravity',
      model: 'Gemini 3.5 Flash (High)',
      instructions: 'You are the design agent. Write only under design/.',
      skillIds: ['frontend-design'],
      designSystemId: null,
      lastActiveAt: null,
      conversationCount: 0,
    });
    expect(listAgentProfiles(db).map((p) => p.id)).toEqual(['a1']);
  });

  it('lists in creation order', () => {
    const db = openDb();
    insertAgentProfile(db, profile({ id: 'b', name: 'B', createdAt: 2 }));
    insertAgentProfile(db, profile({ id: 'a', name: 'A', createdAt: 1 }));

    expect(listAgentProfiles(db).map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('updates only the fields that are present', () => {
    const db = openDb();
    insertAgentProfile(db, profile());

    const updated = updateAgentProfile(db, 'a1', { name: 'Designer', model: null });

    expect(updated).toMatchObject({
      name: 'Designer',
      model: null,
      role: 'Design and interfaces assistant',
      runtimeId: 'antigravity',
      skillIds: ['frontend-design'],
    });
  });

  it('returns null when updating or reading a profile that does not exist', () => {
    const db = openDb();

    expect(updateAgentProfile(db, 'missing', { name: 'x' })).toBeNull();
    expect(getAgentProfile(db, 'missing')).toBeNull();
  });
});

describe('agent profiles · conversations', () => {
  function seed(db: ReturnType<typeof openDb>) {
    const now = Date.now();
    insertProject(db, { id: 'p1', name: 'P', createdAt: now, updatedAt: now });
    insertAgentProfile(db, profile());
    return now;
  }

  it('links a conversation to its profile and shows it everywhere', () => {
    const db = openDb();
    const now = seed(db);
    insertConversation(db, {
      id: 'c1',
      projectId: 'p1',
      title: 'T',
      agentProfileId: 'a1',
      createdAt: now,
      updatedAt: now + 5,
    });
    insertConversation(db, { id: 'c2', projectId: 'p1', title: 'Plain', createdAt: now, updatedAt: now });

    expect(getConversation(db, 'c1')?.agentProfileId).toBe('a1');
    expect(getConversation(db, 'c2')?.agentProfileId).toBeNull();
    const listed = listConversations(db, 'p1');
    expect(listed.find((c) => c.id === 'c1')?.agentProfileId).toBe('a1');
    expect(listed.find((c) => c.id === 'c2')?.agentProfileId).toBeNull();
  });

  it('reports the profile activity from its conversations', () => {
    const db = openDb();
    const now = seed(db);
    insertConversation(db, {
      id: 'c1', projectId: 'p1', title: 'One', agentProfileId: 'a1', createdAt: now, updatedAt: now + 5,
    });
    insertConversation(db, {
      id: 'c2', projectId: 'p1', title: 'Two', agentProfileId: 'a1', createdAt: now, updatedAt: now + 9,
    });

    expect(getAgentProfile(db, 'a1')).toMatchObject({
      conversationCount: 2,
      lastActiveAt: now + 9,
    });
  });

  it('links and unlinks a conversation by updating it', () => {
    const db = openDb();
    const now = seed(db);
    insertConversation(db, { id: 'c1', projectId: 'p1', title: 'T', createdAt: now, updatedAt: now });

    expect(updateConversation(db, 'c1', { agentProfileId: 'a1' })?.agentProfileId).toBe('a1');
    expect(updateConversation(db, 'c1', { title: 'Renamed' })?.agentProfileId).toBe('a1');
    expect(updateConversation(db, 'c1', { agentProfileId: null })?.agentProfileId).toBeNull();
  });

  it('keeps the conversations when the profile is deleted', () => {
    const db = openDb();
    const now = seed(db);
    insertConversation(db, {
      id: 'c1', projectId: 'p1', title: 'T', agentProfileId: 'a1', createdAt: now, updatedAt: now,
    });

    deleteAgentProfile(db, 'a1');

    expect(getAgentProfile(db, 'a1')).toBeNull();
    expect(getConversation(db, 'c1')).toMatchObject({ id: 'c1', agentProfileId: null });
  });
});

describe('agent profiles · request validation', () => {
  it('requires a name and a runtime on create', () => {
    expect(parseAgentProfileInput({ runtimeId: 'claude' }, false)).toEqual({
      ok: false,
      message: 'name required',
    });
    expect(parseAgentProfileInput({ name: 'X' }, false)).toEqual({
      ok: false,
      message: 'runtimeId required',
    });
  });

  it('trims text and turns blank optional text into null', () => {
    const parsed = parseAgentProfileInput(
      { name: '  Design  ', runtimeId: ' claude ', role: '   ', emoji: ' 🎨 ' },
      false,
    );

    expect(parsed).toEqual({
      ok: true,
      value: { name: 'Design', runtimeId: 'claude', role: null, emoji: '🎨' },
    });
  });

  it('rejects values over the limits and values of the wrong type', () => {
    expect(parseAgentProfileInput({ name: 'x'.repeat(61), runtimeId: 'claude' }, false)).toMatchObject({
      ok: false,
    });
    expect(parseAgentProfileInput({ name: 'X', runtimeId: 'claude', model: 5 }, false)).toEqual({
      ok: false,
      message: 'model must be a string or null',
    });
    expect(
      parseAgentProfileInput({ name: 'X', runtimeId: 'claude', instructions: 'x'.repeat(8001) }, false),
    ).toMatchObject({ ok: false });
  });

  it('only returns the fields that are present on update', () => {
    expect(parseAgentProfileInput({ model: null }, true)).toEqual({ ok: true, value: { model: null } });
    expect(parseAgentProfileInput({}, true)).toEqual({ ok: true, value: {} });
    expect(parseAgentProfileInput({ name: '   ' }, true)).toEqual({ ok: false, message: 'name required' });
  });

  it('validates and de-duplicates skill ids', () => {
    expect(
      parseAgentProfileInput({ name: 'X', runtimeId: 'claude', skillIds: ['a', ' a ', 'b', ''] }, false),
    ).toMatchObject({ ok: true, value: { skillIds: ['a', 'b'] } });
    expect(parseAgentProfileInput({ name: 'X', runtimeId: 'claude', skillIds: 'a' }, false)).toEqual({
      ok: false,
      message: 'skillIds must be an array of strings',
    });
    expect(
      parseAgentProfileInput(
        { name: 'X', runtimeId: 'claude', skillIds: Array.from({ length: 21 }, (_, i) => `s${i}`) },
        false,
      ),
    ).toMatchObject({ ok: false });
  });
});
