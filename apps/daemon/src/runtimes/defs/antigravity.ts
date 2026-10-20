import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { readFile as fsReadFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { DEFAULT_MODEL_OPTION } from './shared.js';
import { agentCapabilities } from '../capabilities.js';
import type { RuntimeAgentDef } from '../types.js';

const ANTIGRAVITY_SKIP_PERMISSIONS_FLAG = '--dangerously-skip-permissions';

/** Continue agy's own conversation on follow-up turns; `OD_ANTIGRAVITY_RESUME=off` turns it off. */
const ANTIGRAVITY_RESUME = process.env.OD_ANTIGRAVITY_RESUME !== 'off';

// Headless runs use agy's documented stdin channel (agy >= 1.1.15):
//   agy --input-format stream-json --output-format stream-json
// with the prompt written to stdin as one NDJSON `user` message. The prompt
// must never ride argv: on Windows the composed OD prompt routinely exceeds
// CreateProcess's 32_767-char command line and the spawn dies with
// `ENAMETOOLONG` before agy starts (OPEND-3495). And agy has no other way to
// read stdin — with `-p <text>` it ignores stdin entirely (agy 1.1.1: "no
// longer reading stdin when a prompt is provided via a flag"), while `-p -`
// is the literal prompt "-" (#7161). Every stream-json message runs one turn;
// the daemon hands the frame over as a complete file-backed stdin, so agy
// sees EOF after it and ends the session once the turn finishes.
const ANTIGRAVITY_STREAM_JSON_ARGS = [
  '--input-format',
  'stream-json',
  '--output-format',
  'stream-json',
] as const;

export function encodeAntigravityStdinPrompt(prompt: string): string {
  return `${JSON.stringify({ event: 'user', message: { content: prompt } })}\n`;
}

// `agy` v1.0.3 still has no `--model` flag (upstream issue #35), but the
// TUI's Switch-Model picker writes the choice to its settings.json, and
// every headless `agy` invocation re-reads that file on startup — verified by
// capturing the `--log-file` line `Propagating selected model override to
// backend: label="<model>"`. So we can route OD's model picker through
// settings.json: when the user picks a concrete model in Settings, the
// daemon writes the label into agy's settings.json right before spawn,
// and the resulting headless run uses that model.
//
// Two ids the picker exposes are special:
//   - 'default'         : leave settings.json untouched, so agy keeps
//                         whatever the user last picked in its own TUI.
//                         (Respects user choice when they switch models
//                         from `agy` directly.)
//   - any other id      : the literal display label agy expects (e.g.
//                         "Gemini 3.1 Pro (High)", "Claude Sonnet 4.6
//                         (Thinking)"). We persist it before spawn.
//
// `supportsCustomModel: false` because the label set is a server-side
// enum — a typed id agy doesn't recognise resolves to a silent
// `availableModels` cache miss + empty headless output, which surfaces
// to the user as a generic "empty response" error.
//
// The 8 model labels mirror what `Switch Model` in agy's TUI lists for
// consumer-tier accounts as of 2026-05-28. The set is small and stable
// enough to ship statically until upstream adds a programmatic
// `agy models` subcommand (also tracked under issue #35).
const ANTIGRAVITY_SETTINGS_PATH = join(
  homedir(),
  '.gemini',
  'antigravity-cli',
  'settings.json',
);

export function writeAntigravityModelSelection(
  label: string,
  settingsPath: string = ANTIGRAVITY_SETTINGS_PATH,
): void {
  let existing: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try {
      const parsed = JSON.parse(readFileSync(settingsPath, 'utf8')) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        existing = parsed as Record<string, unknown>;
      }
    } catch {
      // Corrupt JSON — fall through and rewrite the file from scratch so
      // the next spawn starts from a known-good state.
    }
  }
  existing.model = label;
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, `${JSON.stringify(existing, null, 2)}\n`);
}

// Per-process serialization for write-settings → spawn → agy-reads
// cycles on antigravity. `~/.gemini/antigravity-cli/settings.json` is
// process-global, so two OD runs that both pick concrete (non-default)
// models can race: run A writes model A, spawn A starts, run B writes
// model B before A's agy has read settings.json — A then executes on
// model B. The daemon serialises non-default antigravity spawns
// through this chain: each acquire awaits the previous release, and
// each release fires only after the spawned agy actually emits
// `Propagating selected model override to backend: label="<X>"` in
// its `--log-file` (which is the upstream signal that settings.json
// has been read).
let antigravityLockChain: Promise<void> = Promise.resolve();

export async function acquireAntigravityModelLock(): Promise<() => void> {
  const previous = antigravityLockChain;
  let release: () => void = () => {};
  antigravityLockChain = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  return release;
}

// Visible for tests. Resets the module-level lock chain so a test that
// installed a hanging acquirer can release it without leaking state to
// subsequent test cases. Production code never calls this.
export function _resetAntigravityModelLockForTests(): void {
  antigravityLockChain = Promise.resolve();
}

export interface WaitForAgyModelOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
  // Override for tests; production reads the daemon-owned log file path.
  readFile?: (path: string) => Promise<string>;
  // Override `Date.now` for tests; production uses the wall clock.
  now?: () => number;
  // Stops polling when fired. Production wires this to `child.once('exit')`
  // so the watcher cancels as soon as agy exits — the lock release is
  // then driven by the exit handler rather than the helper's return
  // value, eliminating the slow-startup race the looper review at
  // 263fd2fe7 flagged: if a cold agy takes >timeoutMs to read its
  // settings.json, we'd otherwise return false, the caller would
  // release the lock, and a concurrent run B could rewrite
  // settings.json before A's agy actually read it.
  abortSignal?: AbortSignal;
}

// Polls agy's `--log-file` for the line
//   `Propagating selected model override to backend: label="<expectedModel>"`
// which `model_config_manager.go` emits once agy has finished reading
// `~/.gemini/antigravity-cli/settings.json` and sent the model
// override to the upstream backend. Returns true on observed signal,
// false on timeout OR abort. Never throws — a missing log file is
// treated as "not yet seen" so the polling loop keeps retrying until
// either the deadline or the abort signal fires.
//
// IMPORTANT: callers MUST NOT use a `false` return as a "go ahead and
// release the settings.json lock" signal — false means "I gave up
// polling," not "agy definitely didn't read this." Release the lock
// only on (a) a `true` return, OR (b) child exit. See server.ts for
// the wiring.
export async function waitForAgyToReadModel(
  logFilePath: string,
  expectedModel: string,
  options: WaitForAgyModelOptions = {},
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const pollIntervalMs = options.pollIntervalMs ?? 250;
  const readFile =
    options.readFile ?? ((path: string) => fsReadFile(path, 'utf8'));
  const now = options.now ?? Date.now;
  const abortSignal = options.abortSignal;
  if (abortSignal?.aborted) return false;
  const escaped = expectedModel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `Propagating selected model override to backend: label="${escaped}"`,
  );
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    if (abortSignal?.aborted) return false;
    try {
      const content = await readFile(logFilePath);
      if (pattern.test(content)) return true;
    } catch {
      // Log file may not have appeared yet; keep polling.
    }
    if (now() >= deadline) break;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, pollIntervalMs);
      const onAbort = () => {
        clearTimeout(timer);
        resolve();
      };
      abortSignal?.addEventListener('abort', onAbort, { once: true });
    });
  }
  return false;
}

export const antigravityAgentDef = {
  id: 'antigravity',
  name: 'Antigravity',
  bin: 'agy',
  versionArgs: ['--version'],
  helpArgs: ['--help'],
  capabilityFlags: {
    [ANTIGRAVITY_SKIP_PERMISSIONS_FLAG]: 'skipPermissions',
  },
  fallbackModels: [
    DEFAULT_MODEL_OPTION,
    { id: 'Gemini 3.1 Pro (High)', label: 'Gemini 3.1 Pro (High)' },
    { id: 'Gemini 3.1 Pro (Low)', label: 'Gemini 3.1 Pro (Low)' },
    { id: 'Gemini 3.5 Flash (High)', label: 'Gemini 3.5 Flash (High)' },
    { id: 'Gemini 3.5 Flash (Medium)', label: 'Gemini 3.5 Flash (Medium)' },
    { id: 'Gemini 3.5 Flash (Low)', label: 'Gemini 3.5 Flash (Low)' },
    {
      id: 'Claude Sonnet 4.6 (Thinking)',
      label: 'Claude Sonnet 4.6 (Thinking)',
    },
    { id: 'Claude Opus 4.6 (Thinking)', label: 'Claude Opus 4.6 (Thinking)' },
    { id: 'GPT-OSS 120B (Medium)', label: 'GPT-OSS 120B (Medium)' },
  ],
  supportsCustomModel: false,
  // Follow-up turns continue agy's own conversation with `--conversation
  // <id>` (agy >= 1.4), so the daemon sends only the latest turn instead of
  // the whole transcript every time. The id is agy's `conversation_id`,
  // captured from the stream (capture-style, like Codex).
  //
  // History: this adapter used to be stateless. The earlier attempt used
  // `-c` ("continue the most recent conversation", not a specific one), and
  // on a turn after a `<question-form>` agy re-emitted the same form. The
  // resume-identity guard (model, cwd, cursor) and `sessionStillExists`
  // below now decide when a session may be continued, and
  // `OD_ANTIGRAVITY_RESUME=off` brings the stateless path back.
  //
  // agy given an unknown id does NOT fail: it warns and opens a new
  // conversation with no context. `sessionStillExists` checks agy's own
  // conversation store first, so a missing one gets the full transcript.
  resumesSessionViaCli: ANTIGRAVITY_RESUME,
  capturesSessionIdFromStream: ANTIGRAVITY_RESUME,
  resumeSkipsAfterQuestionForm: true,
  externalMcpInjection: 'antigravity-workspace-plugin',
  sessionStillExists: (sessionId: string) =>
    /^[A-Za-z0-9-]{8,80}$/.test(sessionId)
    && existsSync(join(homedir(), '.gemini', 'antigravity-cli', 'conversations', `${sessionId}.db`)),
  buildArgs: (
    _prompt,
    _imagePaths,
    _extra = [],
    options = {},
    runtimeContext = {},
  ) => {
    if (options.model && options.model !== DEFAULT_MODEL_OPTION.id) {
      writeAntigravityModelSelection(
        options.model,
        runtimeContext.antigravitySettingsPath,
      );
    }
    const args: string[] = [];
    // Always opt into `--log-file` when the daemon supplied a path: the
    // model lock in server.ts waits for agy to log the settings.json model
    // override there, and the connection test folds its tail into auth /
    // quota classification.
    //
    // Flag order is load-bearing on agy: put `--log-file` first so
    // diagnostics (model override / auth / quota) land in the log.
    if (runtimeContext.agentLogFilePath) {
      args.push('--log-file', runtimeContext.agentLogFilePath);
    }
    // Daemon-managed headless runs have no interactive approval channel.
    if (agentCapabilities.get('antigravity')?.skipPermissions) {
      args.push(ANTIGRAVITY_SKIP_PERMISSIONS_FLAG);
    }
    // agy >= 1.4 takes a per-session effort.
    if (options.reasoning && options.reasoning !== 'default') {
      args.push('--effort', options.reasoning);
    }
    if (
      ANTIGRAVITY_RESUME
      && typeof runtimeContext.resumeSessionId === 'string'
      && runtimeContext.resumeSessionId.length > 0
    ) {
      args.push('--conversation', runtimeContext.resumeSessionId);
    }
    args.push(...ANTIGRAVITY_STREAM_JSON_ARGS);
    return args;
  },
  reasoningOptions: [
    { id: 'default', label: 'Default' },
    { id: 'low', label: 'Low' },
    { id: 'medium', label: 'Medium' },
    { id: 'high', label: 'High' },
    { id: 'xhigh', label: 'XHigh' },
    { id: 'max', label: 'Max' },
  ],
  promptViaStdin: true,
  encodeStdinPrompt: encodeAntigravityStdinPrompt,
  streamFormat: 'json-event-stream',
  eventParser: 'antigravity',
  installUrl: 'https://antigravity.google/cli',
  docsUrl: 'https://antigravity.google/docs/cli-overview',
} satisfies RuntimeAgentDef;
