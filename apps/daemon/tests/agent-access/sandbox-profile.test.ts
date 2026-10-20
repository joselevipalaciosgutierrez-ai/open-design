import { describe, expect, it } from 'vitest';

import { codexNeedsDangerFullAccessSandbox } from '../../src/runtimes/defs/codex.js';
import {
  SANDBOX_EXEC,
  instructionDirsAbove,
  isInsideDir,
  agentSandboxEnforced,
  buildAgentSandboxProfile,
  sandboxInvocation,
} from '../../src/agent-access/sandbox-profile.js';

const base = {
  home: '/Users/ana',
  workDirs: ['/Users/ana/Documents/od/projects/p1', '/Users/ana/Documents/od/runs/r1'],
  allowedDirs: ['/Users/ana/Code/app'],
  readableDirs: ['/Users/ana/Documents/od/mac-screens'],
  readWholeMac: true,
  blockedPorts: [7456, 7457],
};

describe('buildAgentSandboxProfile', () => {
  it('denies every write, then allows the project, the allowed folders and the agent homes', () => {
    const profile = buildAgentSandboxProfile(base);
    const deny = profile.indexOf('(deny file-write*)');
    const allow = profile.indexOf('(allow file-write*');
    expect(deny).toBeGreaterThan(-1);
    expect(allow).toBeGreaterThan(deny);
    expect(profile).toContain('(subpath "/Users/ana/Documents/od/projects/p1")');
    expect(profile).toContain('(subpath "/Users/ana/Code/app")');
    expect(profile).toContain('(subpath "/Users/ana/.claude")');
    expect(profile).not.toContain('(subpath "/Users/ana/Desktop")\n  (subpath "/Users/ana/.claude")');
  });

  it('never lets secrets be read or written, after everything else so it wins', () => {
    const profile = buildAgentSandboxProfile(base);
    const secrets = profile.indexOf('(deny file-read* file-write*');
    expect(secrets).toBeGreaterThan(profile.indexOf('(allow file-write*'));
    expect(profile).toContain('(subpath "/Users/ana/.ssh")');
    expect(profile).toContain('(subpath "/Users/ana/Library/Application Support/Arc")');
    // Agent CLIs keep their own sign-in in the keychain; macOS guards it per app.
    expect(profile).not.toContain('Library/Keychains');
  });

  it('closes personal folders for reading only when asked, keeping the project readable', () => {
    expect(buildAgentSandboxProfile(base)).not.toContain('(subpath "/Users/ana/Desktop")');
    const closed = buildAgentSandboxProfile({ ...base, readWholeMac: false });
    const deny = closed.indexOf('(subpath "/Users/ana/Desktop")');
    const reopen = closed.lastIndexOf('(subpath "/Users/ana/Documents/od/projects/p1")');
    expect(deny).toBeGreaterThan(-1);
    expect(reopen).toBeGreaterThan(deny);
    expect(closed).toContain('(subpath "/Users/ana/Documents/od/mac-screens")');
  });

  it('puts the daemon and web ports out of reach', () => {
    const profile = buildAgentSandboxProfile(base);
    expect(profile).toContain('(remote tcp "localhost:7456")');
    expect(profile).toContain('(remote tcp "localhost:7457")');
    expect(buildAgentSandboxProfile({ ...base, blockedPorts: [] })).not.toContain('network-outbound');
  });

  it('quotes paths so a folder name cannot end the rule early', () => {
    const profile = buildAgentSandboxProfile({ ...base, allowedDirs: ['/Users/ana/We"ird\\dir'] });
    expect(profile).toContain('(subpath "/Users/ana/We\\"ird\\\\dir")');
  });
});

describe('sandboxInvocation', () => {
  it('wraps the agent in sandbox-exec on macOS', () => {
    const out = sandboxInvocation({ command: '/bin/agy', args: ['--x'] }, 'P', { platform: 'darwin', env: {} });
    expect(out).toEqual({ command: SANDBOX_EXEC, args: ['-p', 'P', '/bin/agy', '--x'], sandboxed: true });
  });

  it('leaves it alone elsewhere, or when switched off on purpose', () => {
    expect(sandboxInvocation({ command: 'a', args: [] }, 'P', { platform: 'linux', env: {} }).sandboxed).toBe(false);
    expect(sandboxInvocation({ command: 'a', args: [] }, 'P', { platform: 'darwin', env: { OD_AGENT_SANDBOX: 'off' } }).sandboxed).toBe(false);
    expect(agentSandboxEnforced({ platform: 'darwin', env: {} })).toBe(true);
  });
});

describe('Codex under the agent sandbox', () => {
  it('drops its own sandbox on macOS, where a second sandbox cannot be applied', () => {
    expect(codexNeedsDangerFullAccessSandbox('darwin', {})).toBe(true);
    expect(codexNeedsDangerFullAccessSandbox('darwin', { OD_AGENT_SANDBOX: 'off' })).toBe(false);
    expect(codexNeedsDangerFullAccessSandbox('linux', {})).toBe(false);
  });
});

describe('agent guides above the project', () => {
  it('lists every folder from the data root up to the disk root', () => {
    expect(instructionDirsAbove('/Users/ana/repo/.od/projects')).toEqual([
      '/Users/ana/repo/.od/projects',
      '/Users/ana/repo/.od',
      '/Users/ana/repo',
      '/Users/ana',
      '/Users',
      '/',
    ]);
  });

  it('hides their AGENTS.md and CLAUDE.md, not the project\'s own', () => {
    const profile = buildAgentSandboxProfile({ ...base, hiddenInstructionDirs: ['/Users/ana/repo'] });
    expect(profile).toContain('(literal "/Users/ana/repo/AGENTS.md")');
    expect(profile).toContain('(literal "/Users/ana/repo/CLAUDE.md")');
    expect(profile).not.toContain('projects/p1/AGENTS.md');
  });

  it('knows when a folder is inside another', () => {
    expect(isInsideDir('/a/b', '/a/b/c')).toBe(true);
    expect(isInsideDir('/a/b', '/a/b')).toBe(true);
    expect(isInsideDir('/a/b', '/a/bc')).toBe(false);
  });
});

describe('skills lock', () => {
  it('closes the libraries and other runs, reopening only this run and the active skill', () => {
    const profile = buildAgentSandboxProfile({
      ...base,
      lockedDirs: ['/od/skills', '/od/data/runs'],
      unlockedDirs: ['/od/data/runs/r1', '/od/skills/web-prototype'],
      workDirs: ['/od/data/projects/p1', '/od/data/runs/r1'],
    });
    const deny = profile.indexOf('(deny file-read* file-write*\n  (subpath "/od/skills")');
    const reopen = profile.indexOf('(allow file-read*\n  (subpath "/od/data/runs/r1")');
    expect(deny).toBeGreaterThan(-1);
    expect(reopen).toBeGreaterThan(deny);
    expect(profile).toContain('(allow file-write*\n  (subpath "/od/data/runs/r1"))');
  });

  it('never writes an allow rule with no folder (that would allow everything)', () => {
    const profile = buildAgentSandboxProfile({ ...base, lockedDirs: ['/od/skills'], unlockedDirs: [] });
    expect(profile).not.toMatch(/\(allow file-(read|write)\*\)/);
    expect(profile).not.toMatch(/\(allow file-(read|write)\*\n\)/);
  });
});
