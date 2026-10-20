import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import fsp from 'node:fs/promises';
import path from 'node:path';

/**
 * Speech to text, on this machine, with whisper.cpp. No account and no audio
 * leaves the computer. The binary and the model are looked for, never fetched:
 * installing them is a separate, explicit step (see `status().reason`).
 *
 * Speed: loading the model takes seconds, so a resident `whisper-server` keeps
 * it in memory and each request is just the audio (about a second for a
 * sentence). The server starts on demand, can be warmed ahead of the first
 * click, and stops after a quiet spell; if it cannot run, the one-shot
 * `whisper-cli` answers instead, just slower.
 *
 * Where they are looked for, in order: the `OD_WHISPER_BIN` / `OD_WHISPER_MODEL`
 * environment variables, `<data dir>/speech/whisper/`, then the PATH (binary).
 */

export type SttUnavailableReason = 'binary-missing' | 'model-missing';

export interface SttStatus {
  available: boolean;
  engine: 'whisper-cpp' | null;
  reason?: SttUnavailableReason;
  binary?: string;
  model?: string;
}

export class SttUnavailableError extends Error {
  constructor(readonly reason: SttUnavailableReason) {
    super('STT_UNAVAILABLE');
  }
}

/** Best multilingual model first. `.en` models only know English. */
const MODEL_PREFERENCE = ['ggml-large-v3-turbo', 'ggml-medium', 'ggml-small', 'ggml-base', 'ggml-tiny'];
const BINARY_NAMES = ['whisper-cli', 'whisper-cpp'];

/** A running resident whisper server. */
export interface WhisperServerHandle {
  baseUrl: string;
  stop: () => void;
}

export interface SttDeps {
  dataDir: string;
  env?: Record<string, string | undefined>;
  exists?: (file: string) => boolean;
  list?: (dir: string) => string[];
  run?: (bin: string, args: string[], timeoutMs: number) => Promise<{ code: number | null; stdout: string }>;
  tmpDir?: string;
  /** Starts the resident server; resolves once it answers. Injected in tests. */
  startServer?: (binary: string, model: string) => Promise<WhisperServerHandle>;
  /** HTTP used to talk to the server. Injected in tests. */
  fetchImpl?: typeof fetch;
  /** The server stops after this long without a request. */
  idleMs?: number;
}

export function pickModel(files: readonly string[]): string | null {
  const usable = files.filter((f) => /^ggml-.+\.bin$/.test(f) && !/\.en(\.|-)/.test(f) && !f.includes('.en.'));
  for (const prefix of MODEL_PREFERENCE) {
    const hit = usable.find((f) => f === `${prefix}.bin` || f.startsWith(`${prefix}-`) || f.startsWith(`${prefix}.`));
    if (hit) return hit;
  }
  return usable[0] ?? null;
}

/** Whisper wants `es`, not `es-MX`. */
export function whisperLanguage(lang: string): string {
  return (lang.split(/[-_]/)[0] ?? 'es').toLowerCase() || 'es';
}

/** Drops whisper's non-speech markers like `[BLANK_AUDIO]` and `(música)`, and its repeats. */
export function cleanTranscript(raw: string): string {
  return collapseRepeats(
    raw
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/\((?:música|music|silencio|silence|aplausos|applause)[^)]*\)/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

/**
 * Whisper sometimes loops on short audio and writes the same sentence two or
 * three times in a row. A person rarely does; one copy is kept.
 */
export function collapseRepeats(text: string): string {
  const sentences = text.match(/[^.?!…]+[.?!…]*/g) ?? [];
  const kept: string[] = [];
  let previous = '';
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    const key = sentence.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    if (key && key === previous) continue;
    previous = key;
    kept.push(sentence);
  }
  return kept.join(' ');
}

const defaultRun: NonNullable<SttDeps['run']> = (bin, args, timeoutMs) =>
  new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    let stdout = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (d) => { stdout += String(d); });
    child.on('error', () => { clearTimeout(timer); resolve({ code: 1, stdout: '' }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout }); });
  });

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

/** The longest audio the resident server hears whole (its context is 15 s). */
export const SERVER_MAX_SECONDS = 14.5;

/** Length in seconds of a 16-bit mono PCM WAV, from its header; 0 if it is not one. */
export function wavSeconds(wav: Buffer): number {
  if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF') return 0;
  const sampleRate = wav.readUInt32LE(24);
  const bytesPerSecond = sampleRate * 2;
  return bytesPerSecond > 0 ? (wav.length - 44) / bytesPerSecond : 0;
}

/** Where whisper.cpp's server binary sits next to the CLI. */
export function serverBinaryFor(cli: string): string {
  return path.join(path.dirname(cli), 'whisper-server');
}

const defaultStartServer = async (binary: string, model: string): Promise<WhisperServerHandle> => {
  const port = await freePort();
  const child: ChildProcess = spawn(
    binary,
    // `-ac 768` limits the encoder to 15 s of audio: about 2.5x faster for a
    // spoken request, which is what this server is for. Longer audio goes to the
    // one-shot CLI (see `SERVER_MAX_SECONDS`).
    ['-m', model, '--host', '127.0.0.1', '--port', String(port), '-t', '4', '-nt', '-ac', '768', '-mc', '0'],
    { stdio: 'ignore' },
  );
  let exited = false;
  child.on('exit', () => { exited = true; });
  child.on('error', () => { exited = true; });
  const baseUrl = `http://127.0.0.1:${port}`;
  const started = Date.now();
  // The first start compiles GPU shaders and can take most of half a minute.
  while (Date.now() - started < 60_000) {
    if (exited) throw new Error('STT_SERVER_EXITED');
    try {
      const res = await fetch(baseUrl, { signal: AbortSignal.timeout(1500) });
      if (res.status < 500) {
        const stop = () => { if (!exited) child.kill('SIGTERM'); };
        process.once('exit', stop);
        return { baseUrl, stop };
      }
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  child.kill('SIGKILL');
  throw new Error('STT_SERVER_TIMEOUT');
};

export function createSttService(deps: SttDeps) {
  const env = deps.env ?? process.env;
  const exists = deps.exists ?? ((f: string) => fs.existsSync(f));
  const list = deps.list ?? ((d: string) => { try { return fs.readdirSync(d); } catch { return []; } });
  const run = deps.run ?? defaultRun;
  const home = path.join(deps.dataDir, 'speech', 'whisper');
  const tmp = deps.tmpDir ?? path.join(deps.dataDir, 'speech', 'tmp');
  const startServer = deps.startServer ?? defaultStartServer;
  const http = deps.fetchImpl ?? fetch;
  const idleMs = deps.idleMs ?? 10 * 60_000;
  let server: WhisperServerHandle | null = null;
  let starting: Promise<WhisperServerHandle | null> | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  function findBinary(): string | null {
    const fromEnv = env.OD_WHISPER_BIN;
    if (fromEnv && exists(fromEnv)) return fromEnv;
    for (const name of BINARY_NAMES) {
      const local = path.join(home, name);
      if (exists(local)) return local;
    }
    for (const dir of (env.PATH ?? '').split(path.delimiter).filter(Boolean)) {
      for (const name of BINARY_NAMES) {
        const candidate = path.join(dir, name);
        if (exists(candidate)) return candidate;
      }
    }
    return null;
  }

  function findModel(): string | null {
    const fromEnv = env.OD_WHISPER_MODEL;
    if (fromEnv && exists(fromEnv)) return fromEnv;
    const picked = pickModel(list(home));
    return picked ? path.join(home, picked) : null;
  }

  function status(): SttStatus {
    const binary = findBinary();
    if (!binary) return { available: false, engine: null, reason: 'binary-missing' };
    const model = findModel();
    if (!model) return { available: false, engine: null, reason: 'model-missing', binary };
    return { available: true, engine: 'whisper-cpp', binary, model };
  }

  function touchIdle() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(stop, idleMs);
    idleTimer.unref?.();
  }

  /** Stops the resident server (it comes back on the next request). */
  function stop() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
    server?.stop();
    server = null;
  }

  /** The resident server, started if needed; null when it cannot run here. */
  function ensureServer(): Promise<WhisperServerHandle | null> {
    if (server) return Promise.resolve(server);
    if (starting) return starting;
    const s = status();
    if (!s.available || !s.binary || !s.model) return Promise.resolve(null);
    const binary = env.OD_WHISPER_SERVER_BIN && exists(env.OD_WHISPER_SERVER_BIN)
      ? env.OD_WHISPER_SERVER_BIN
      : serverBinaryFor(s.binary);
    if (!exists(binary)) return Promise.resolve(null);
    starting = startServer(binary, s.model)
      .then((handle) => {
        server = handle;
        touchIdle();
        return handle;
      })
      .catch(() => null)
      .finally(() => { starting = null; });
    return starting;
  }

  /** Loads the model ahead of the first request. Never throws. */
  async function warmup(): Promise<boolean> {
    return (await ensureServer()) !== null;
  }

  async function viaServer(handle: WhisperServerHandle, wav: Buffer, lang: string): Promise<string> {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'audio.wav');
    form.append('response_format', 'json');
    form.append('language', whisperLanguage(lang));
    form.append('temperature', '0.0');
    const res = await http(`${handle.baseUrl}/inference`, { method: 'POST', body: form, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error('STT_SERVER_FAILED');
    const body = (await res.json()) as { text?: unknown };
    return cleanTranscript(typeof body.text === 'string' ? body.text : '');
  }

  async function viaCli(s: SttStatus, wav: Buffer, lang: string): Promise<string> {
    await fsp.mkdir(tmp, { recursive: true });
    const file = path.join(tmp, `stt-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`);
    await fsp.writeFile(file, wav);
    try {
      const { code, stdout } = await run(
        s.binary!,
        ['-m', s.model!, '-f', file, '-l', whisperLanguage(lang), '-nt', '-np', '-t', '4', '-mc', '0'],
        60_000,
      );
      if (code !== 0 && !stdout.trim()) throw new Error('STT_FAILED');
      return cleanTranscript(stdout);
    } finally {
      fsp.unlink(file).catch(() => {});
    }
  }

  async function transcribe(
    wav: Buffer,
    lang = 'es-MX',
  ): Promise<{ text: string; ms: number; engine: 'whisper-cpp'; via: 'server' | 'cli' }> {
    const s = status();
    if (!s.available || !s.binary || !s.model) throw new SttUnavailableError(s.reason ?? 'binary-missing');
    const started = Date.now();
    // Short audio (the usual spoken request) takes the fast resident server;
    // anything over its 15 s window needs the full-context CLI.
    const handle = wavSeconds(wav) <= SERVER_MAX_SECONDS ? await ensureServer() : null;
    if (handle) {
      try {
        const text = await viaServer(handle, wav, lang);
        touchIdle();
        return { text, ms: Date.now() - started, engine: 'whisper-cpp', via: 'server' };
      } catch {
        // The server died or hiccuped: drop it and answer the slow way.
        stop();
      }
    }
    const text = await viaCli(s, wav, lang);
    return { text, ms: Date.now() - started, engine: 'whisper-cpp', via: 'cli' };
  }

  return { status, transcribe, warmup, stop };
}

export type SttService = ReturnType<typeof createSttService>;
