import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  addNotebookNote,
  appendNotebookEntry,
  lastEntries,
  lastNotebookEntrySync,
  NOTEBOOK_MAX_ENTRIES,
  readNotebook,
  renderNotebookPrompt,
  runNotebookEntry,
} from '../src/notebook.js';

const tmp = () => mkdtemp(path.join(os.tmpdir(), 'od-notebook-'));

describe('runNotebookEntry', () => {
  it('says who, what was asked, how it ended and which files', () => {
    expect(
      runNotebookEntry({ agentId: 'antigravity', userPrompt: 'crea   NOTAS.md', artifactPaths: ['/p/NOTAS.md'], delegation: { parentRunId: 'x' } }, 'succeeded'),
    ).toBe('orden de Lev → antigravity · «crea NOTAS.md» → hecho · NOTAS.md');
  });

  it('skips runs with nothing asked', () => {
    expect(runNotebookEntry({ agentId: 'claude' }, 'failed')).toBeNull();
  });
});

describe('the notebook file', () => {
  it('keeps the latest entries and the notes, and reads the last one', async () => {
    const dir = await tmp();
    await appendNotebookEntry(dir, 'p1', 'claude · «hola» → hecho', 0);
    await addNotebookNote(dir, 'p1', 'solo móvil, modo oscuro por defecto');
    const text = await readNotebook(dir, 'p1');
    expect(lastEntries(text, 5)).toHaveLength(2);
    expect(lastNotebookEntrySync(dir, 'p1')).toContain('Lev · nota: solo móvil');
  });

  it('drops the oldest entries past the cap', async () => {
    const dir = await tmp();
    for (let i = 0; i < NOTEBOOK_MAX_ENTRIES + 5; i += 1) await appendNotebookEntry(dir, 'p1', `run ${i}`, i);
    const entries = lastEntries(await readNotebook(dir, 'p1'), 1000);
    expect(entries).toHaveLength(NOTEBOOK_MAX_ENTRIES);
    expect(entries[0]).toContain('run 5');
  });

  it('refuses a project id that could leave the folder', async () => {
    await expect(appendNotebookEntry(await tmp(), '../x', 'a')).rejects.toThrow();
  });
});

describe('renderNotebookPrompt', () => {
  it('shows the last entries and how to read the rest, within its cap', () => {
    const text = `# Notebook\n\n${Array.from({ length: 20 }, (_, i) => `- 2026-10-20 · entry ${i} ${'x'.repeat(200)}`).join('\n')}\n`;
    const prompt = renderNotebookPrompt('p1', text);
    expect(prompt).toContain('entry 19');
    expect(prompt).not.toContain('entry 10 ');
    expect(prompt).toContain('project notebook p1');
    expect(prompt.length).toBeLessThan(2000);
  });

  it('is empty for an empty notebook', () => {
    expect(renderNotebookPrompt('p1', '')).toBe('');
  });
});
