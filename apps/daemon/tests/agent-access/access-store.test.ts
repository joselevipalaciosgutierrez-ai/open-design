import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { checkAllowedDir, createAgentAccessStore, normalizeAgentAccess } from '../../src/agent-access/access-store.js';

const exists = () => true;

describe('checkAllowedDir', () => {
  it('refuses what would undo the sandbox', () => {
    expect(checkAllowedDir('/', '/Users/ana', exists)).toBe('the whole disk');
    expect(checkAllowedDir('/Users/ana', '/Users/ana', exists)).toBe('the whole home folder');
    expect(checkAllowedDir('/System/Library', '/Users/ana', exists)).toBe('a system folder');
    expect(checkAllowedDir('/Applications', '/Users/ana', exists)).toBe('a system folder');
    expect(checkAllowedDir('/Users/ana/Library/LaunchAgents', '/Users/ana', exists)).toBe('a system folder');
    expect(checkAllowedDir('relative/dir', '/Users/ana', exists)).toBe('not an absolute path');
    expect(checkAllowedDir('/Users/ana/nope', '/Users/ana', () => false)).toBe('not an existing folder');
  });

  it('accepts an ordinary folder', () => {
    expect(checkAllowedDir('/Users/ana/Code/app', '/Users/ana', exists)).toBeNull();
  });
});

describe('agent access store', () => {
  it('starts closed for Mac control, open for reading, with only the project to write in', () => {
    expect(normalizeAgentAccess({}, '/Users/ana', exists).access).toEqual({
      allowedDirs: [],
      readWholeMac: true,
      macControl: false,
    });
  });

  it('saves what it accepts and says what it refused', async () => {
    const dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'access-'));
    // A folder outside the system's temp root (`/var/...` is refused as a system folder).
    await fsp.mkdir(path.join(process.cwd(), '.tmp'), { recursive: true });
    const folder = await fsp.mkdtemp(path.join(process.cwd(), '.tmp', 'allowed-'));
    const store = createAgentAccessStore({ dataDir, home: '/Users/nobody' });
    const out = await store.update({ allowedDirs: [folder, '/', folder], macControl: true });
    expect(out.access.allowedDirs).toEqual([path.resolve(folder)]);
    expect(out.refused).toEqual([{ path: '/', reason: 'the whole disk' }]);
    expect((await store.read()).macControl).toBe(true);
    await fsp.rm(dataDir, { recursive: true, force: true });
    await fsp.rm(folder, { recursive: true, force: true });
  });
});
