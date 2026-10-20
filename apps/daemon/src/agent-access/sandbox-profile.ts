/**
 * The macOS sandbox (Seatbelt) profile every agent process runs inside. It is
 * applied by the kernel to the agent and everything it starts — its file
 * tools, its terminal, scripts — so no prompt and no model can talk its way
 * past it. One profile for every CLI (Claude Code, Codex, Antigravity, ...).
 *
 *   - Writes: only the project, the folders the person allowed, and the
 *     agent's own homes, caches and temp folders.
 *   - Reads: everything, or (when the person turns that off) everything but
 *     their personal folders. Secrets are never readable.
 *   - The daemon's own API is unreachable; the agent talks to the gateway,
 *     which leaves out the settings that grant access (see agent-gateway.ts).
 */
import path from 'node:path';


export interface AgentSandboxInput {
  home: string;
  /** The project folder and the run's own folder: always writable. */
  workDirs: string[];
  /** Folders the person allowed in Settings. */
  allowedDirs: string[];
  /** Extra folders the agent must read even when personal folders are closed (screenshots...). */
  readableDirs?: string[];
  readWholeMac: boolean;
  /** Loopback ports the agent may not connect to (the daemon, the web app). */
  blockedPorts: number[];
  /**
   * Folders above the project whose agent guides (AGENTS.md, CLAUDE.md...)
   * the CLI must not pick up. See `instructionFilesAbove`.
   */
  hiddenInstructionDirs?: string[];
  /**
   * Folders closed for reading whatever "read the whole Mac" says: the skill
   * libraries and every run's private folder. An agent reads only the skills
   * in its own scope, through `unlockedDirs`.
   */
  lockedDirs?: string[];
  /** Re-opened inside `lockedDirs`: this run's folder (its staged skills) and the project's active skill. */
  unlockedDirs?: string[];
}

/** Whether `child` is `parent` or inside it. */
export function isInsideDir(parent: string, child: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** The files agent CLIs read as standing instructions from a folder and its parents. */
export const AGENT_INSTRUCTION_FILES = ['AGENTS.md', 'AGENTS.override.md', 'CLAUDE.md', 'CLAUDE.local.md', 'GEMINI.md', '.cursorrules'];

/**
 * Every folder from `root` up to the disk root. A managed project lives inside
 * the data root; when that sits in a code checkout (development), the CLIs
 * walk up and load the checkout's own AGENTS.md / CLAUDE.md as if they were
 * the project's: thousands of tokens of unrelated guidance on every call
 * (measured: 18.3k vs 12.5k input tokens for "hola" on Antigravity). The
 * project's own guide, inside the project, is untouched.
 */
export function instructionDirsAbove(root: string): string[] {
  const dirs: string[] = [];
  let current = path.resolve(root);
  for (;;) {
    dirs.push(current);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return dirs;
}

/** Where agent CLIs keep their own state, sign-in, caches and package stores. */
export function toolHomeDirs(home: string): string[] {
  return [
    '.claude',
    '.codex',
    '.gemini',
    '.cursor',
    '.config',
    '.cache',
    '.local',
    '.npm',
    '.bun',
    '.yarn',
    '.pnpm-store',
    '.deno',
    '.cargo',
    '.rustup',
    '.nvm',
    '.volta',
    '.node-gyp',
    '.vscode-server',
    'Library/Caches',
    'Library/Logs',
    'Library/pnpm',
    'Library/Application Support',
    'Library/Preferences',
    'Library/HTTPStorages',
  ].map((dir) => path.join(home, dir));
}

/** The person's own folders, closed for reading when "read the whole Mac" is off. */
export function personalDirs(home: string): string[] {
  return ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Movies', 'Music', 'Library/Mobile Documents'].map(
    (dir) => path.join(home, dir),
  );
}

/**
 * Never readable nor writable by an agent: keys, cloud credentials, browser
 * data, mail, messages. The Keychain folder is not here on purpose: agent CLIs
 * keep their own sign-in there, and macOS already guards each keychain item
 * by the app that owns it.
 */
export function secretPaths(home: string): string[] {
  return [
    '.ssh',
    '.gnupg',
    '.aws',
    '.azure',
    '.kube',
    '.docker/config.json',
    '.netrc',
    '.config/gcloud',
    '.config/gh',
    'Library/Cookies',
    'Library/Safari',
    'Library/Mail',
    'Library/Messages',
    'Library/Application Support/Arc',
    'Library/Application Support/Google/Chrome',
    'Library/Application Support/BraveSoftware',
    'Library/Application Support/Microsoft Edge',
    'Library/Application Support/Firefox',
    'Library/Application Support/1Password',
    'Library/Application Support/com.apple.TCC',
    'Library/Group Containers/2BUA8C4S2C.com.1password',
  ].map((p) => path.join(home, p));
}

function str(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function regexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&').replace(/"/g, '\\"');
}

function subpaths(dirs: readonly string[]): string {
  return dirs.map((dir) => `  (subpath ${str(path.resolve(dir))})`).join('\n');
}

export function buildAgentSandboxProfile(input: AgentSandboxInput): string {
  const home = path.resolve(input.home);
  const work = [...input.workDirs, ...input.allowedDirs].filter(Boolean);
  const lines: string[] = ['(version 1)', '(allow default)', ''];

  lines.push(';; Writes: the project, the allowed folders, the agent\'s own homes and temp.');
  lines.push('(deny file-write*)');
  lines.push('(allow file-write*');
  lines.push(subpaths([...work, ...toolHomeDirs(home), '/private/tmp', '/private/var/folders']));
  lines.push(`  (regex #"^${regexLiteral(path.join(home, '.claude.json'))}")`);
  for (const dev of ['/dev/null', '/dev/zero', '/dev/random', '/dev/urandom', '/dev/tty', '/dev/ptmx', '/dev/dtracehelper']) {
    lines.push(`  (literal ${str(dev)})`);
  }
  lines.push('  (regex #"^/dev/fd/")');
  lines.push('  (regex #"^/dev/ttys[0-9]+$"))');
  lines.push('');

  if (!input.readWholeMac) {
    lines.push(';; Personal folders are closed for reading, except the ones the agent works in.');
    lines.push('(deny file-read*');
    lines.push(`${subpaths(personalDirs(home))})`);
    const readable = [...work, ...(input.readableDirs ?? [])];
    if (readable.length > 0) {
      lines.push('(allow file-read*');
      lines.push(`${subpaths(readable)})`);
    }
    lines.push('');
  }

  if (input.lockedDirs && input.lockedDirs.length > 0) {
    lines.push(';; Skills lock: the libraries and other runs\' folders are closed; this run\'s scope is reopened.');
    lines.push('(deny file-read* file-write*');
    lines.push(`${subpaths(input.lockedDirs)})`);
    const reopen = (input.unlockedDirs ?? []).filter(Boolean);
    if (reopen.length > 0) {
      lines.push('(allow file-read*');
      lines.push(`${subpaths(reopen)})`);
      // The run's own folder stays writable (the daemon stages the prompt
      // there). Never emit an empty allow: with no filter it allows everything.
      const ownLocked = input.workDirs.filter((dir) => input.lockedDirs!.some((locked) => isInsideDir(locked, dir)));
      if (ownLocked.length > 0) {
        lines.push('(allow file-write*');
        lines.push(`${subpaths(ownLocked)})`);
      }
    }
    lines.push('');
  }

  if (input.hiddenInstructionDirs && input.hiddenInstructionDirs.length > 0) {
    lines.push(';; Agent guides above the project are not the project\'s: the CLI must not load them.');
    lines.push('(deny file-read*');
    lines.push(
      input.hiddenInstructionDirs
        .flatMap((dir) => AGENT_INSTRUCTION_FILES.map((file) => `  (literal ${str(path.join(path.resolve(dir), file))})`))
        .join('\n') + ')',
    );
    lines.push('');
  }

  lines.push(';; Secrets: never, whatever else is allowed above (later rules win).');
  lines.push('(deny file-read* file-write*');
  lines.push(`${subpaths(secretPaths(home))})`);

  if (input.blockedPorts.length > 0) {
    lines.push('');
    lines.push(';; The daemon\'s own API is out of reach; the agent uses the gateway.');
    lines.push('(deny network-outbound');
    lines.push(input.blockedPorts.map((port) => `  (remote tcp ${str(`localhost:${port}`)})`).join('\n') + ')');
  }
  return `${lines.join('\n')}\n`;
}

export const SANDBOX_EXEC = '/usr/bin/sandbox-exec';

/**
 * The agent's command, run inside the profile. Only on macOS, and not when
 * `OD_AGENT_SANDBOX=off` (a deliberate escape hatch for debugging a CLI).
 */
export function sandboxInvocation(
  invocation: { command: string; args: string[] },
  profile: string,
  options: { platform?: NodeJS.Platform; env?: NodeJS.ProcessEnv } = {},
): { command: string; args: string[]; sandboxed: boolean } {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  if (platform !== 'darwin' || env.OD_AGENT_SANDBOX === 'off') {
    return { ...invocation, sandboxed: false };
  }
  return { command: SANDBOX_EXEC, args: ['-p', profile, invocation.command, ...invocation.args], sandboxed: true };
}

export function agentSandboxEnforced(options: { platform?: NodeJS.Platform; env?: NodeJS.ProcessEnv } = {}): boolean {
  return (options.platform ?? process.platform) === 'darwin' && (options.env ?? process.env).OD_AGENT_SANDBOX !== 'off';
}
