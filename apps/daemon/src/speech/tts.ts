import { spawn, type ChildProcess } from 'node:child_process';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Text to speech with the voices the Mac already has, through `say`. Free,
 * offline and instant; the nicer "Premium" / "Enhanced" voices a user downloads
 * in System Settings show up here on their own and are preferred.
 *
 * Everything that touches the system goes through `Runner`, so the parsing and
 * the one-voice-at-a-time rule are testable without speaking.
 */

export interface SpeechVoice {
  id: string;
  name: string;
  /** BCP-47-ish, e.g. `es-MX`. */
  lang: string;
  quality: 'premium' | 'enhanced' | 'standard';
}

/** Joke and 90s robotic voices the assistant should never pick. */
const NOVELTY = new Set([
  'albert', 'bad news', 'bahh', 'bells', 'boing', 'bubbles', 'cellos', 'deranged', 'fred',
  'good news', 'hysterical', 'jester', 'junior', 'kathy', 'organ', 'princess', 'ralph',
  'superstar', 'trinoids', 'whisper', 'wobble', 'zarvox',
]);
const ELOQUENCE = new Set(['eddy', 'flo', 'grandma', 'grandpa', 'reed', 'rocko', 'sandy', 'shelley']);

function baseName(id: string): string {
  return id.replace(/\s*\(.*\)\s*$/, '').trim().toLowerCase();
}

function qualityOf(id: string): SpeechVoice['quality'] {
  const lower = id.toLowerCase();
  if (lower.includes('premium')) return 'premium';
  if (lower.includes('enhanced') || lower.includes('mejorada')) return 'enhanced';
  return 'standard';
}

/** Parses `say -v ?`: `Name (Lang)   es_MX    # sample sentence`. */
export function parseVoiceList(output: string): SpeechVoice[] {
  const voices: SpeechVoice[] = [];
  const seen = new Set<string>();
  for (const line of output.split('\n')) {
    const match = line.match(/^(.+?)\s+([a-z]{2,3}[_-][A-Za-z0-9]{2,})\s+#/);
    if (!match) continue;
    const id = match[1]!.trim();
    const lang = match[2]!.replace('_', '-');
    const key = `${id}|${lang}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const base = baseName(id);
    if (NOVELTY.has(base) || ELOQUENCE.has(base)) continue;
    voices.push({ id, name: id.replace(/\s*\(.*\)\s*$/, '').trim(), lang, quality: qualityOf(id) });
  }
  const rank = { premium: 0, enhanced: 1, standard: 2 } as const;
  return voices.sort((a, b) => rank[a.quality] - rank[b.quality] || a.name.localeCompare(b.name));
}

/** The best voice for a language: premium, then enhanced, then any; exact region first. */
export function pickVoice(voices: readonly SpeechVoice[], lang: string): SpeechVoice | null {
  const wanted = lang.toLowerCase().replace('_', '-');
  const primary = wanted.split('-')[0]!;
  const rank = { premium: 0, enhanced: 1, standard: 2 } as const;
  const candidates = voices.filter((v) => v.lang.toLowerCase().split('-')[0] === primary);
  candidates.sort(
    (a, b) =>
      rank[a.quality] - rank[b.quality] ||
      Number(b.lang.toLowerCase() === wanted) - Number(a.lang.toLowerCase() === wanted),
  );
  return candidates[0] ?? null;
}

/** `say` speaks in words per minute; 175 is a calm conversational pace. */
export function wordsPerMinute(rate: number | undefined): number {
  const factor = Math.max(0.7, Math.min(1.4, rate ?? 1));
  return Math.round(175 * factor);
}

export interface SpeechRun {
  /** Resolves with the exit code when speaking ends (or is stopped). */
  done: Promise<number | null>;
  kill: () => void;
}

export type SpeechRunner = {
  list: () => Promise<string>;
  speak: (args: string[], text: string) => SpeechRun;
  /** Writes the speech to `outFile` (WAV) instead of the speakers; resolves with the exit code. */
  render: (args: string[], text: string, outFile: string) => Promise<number | null>;
};

export const systemRunner: SpeechRunner = {
  list: () =>
    new Promise((resolve, reject) => {
      const child = spawn('say', ['-v', '?']);
      let out = '';
      child.stdout.on('data', (d) => { out += String(d); });
      child.on('error', reject);
      child.on('close', () => resolve(out));
    }),
  speak: (args, text) => {
    const child: ChildProcess = spawn('say', args, { stdio: ['pipe', 'ignore', 'ignore'] });
    const done = new Promise<number | null>((resolve) => {
      child.on('error', () => resolve(1));
      child.on('close', (code) => resolve(code));
    });
    child.stdin?.end(text);
    return { done, kill: () => child.kill('SIGTERM') };
  },
  render: (args, text, outFile) =>
    new Promise((resolve) => {
      const child = spawn(
        'say',
        [...args, '-o', outFile, '--file-format=WAVE', '--data-format=LEI16@22050'],
        { stdio: ['pipe', 'ignore', 'ignore'] },
      );
      child.on('error', () => resolve(1));
      child.on('close', (code) => resolve(code));
      child.stdin?.end(text);
    }),
};

export interface SpeakInput {
  text: string;
  voiceId?: string | null | undefined;
  lang?: string | undefined;
  rate?: number | undefined;
}

export function createTtsService(
  options: { platform?: NodeJS.Platform; runner?: SpeechRunner; tmpDir?: string } = {},
) {
  const platform = options.platform ?? process.platform;
  const runner = options.runner ?? systemRunner;
  let voices: SpeechVoice[] | null = null;
  let active: SpeechRun | null = null;

  const supported = platform === 'darwin';

  async function listVoices(): Promise<SpeechVoice[]> {
    if (!supported) return [];
    if (!voices) voices = parseVoiceList(await runner.list());
    return voices;
  }

  function stop(): boolean {
    const was = active !== null;
    active?.kill();
    active = null;
    return was;
  }

  async function voiceArgs(input: SpeakInput): Promise<string[]> {
    const all = await listVoices();
    const chosen =
      (input.voiceId && all.find((v) => v.id === input.voiceId)) ||
      pickVoice(all, input.lang ?? 'es-MX');
    const args = ['-r', String(wordsPerMinute(input.rate))];
    if (chosen) args.unshift('-v', chosen.id);
    return args;
  }

  /**
   * The speech as a WAV file's bytes, for the app to play itself: playing it
   * there lets the monkey's mouth follow the real sound, which `say` speaking
   * straight to the speakers never exposes.
   */
  async function render(input: SpeakInput): Promise<Buffer> {
    if (!supported) throw new Error('SPEECH_UNSUPPORTED');
    const text = input.text.trim();
    if (!text) throw new Error('SPEECH_EMPTY');
    const dir = options.tmpDir ?? os.tmpdir();
    await fsp.mkdir(dir, { recursive: true });
    const file = path.join(dir, `tts-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`);
    try {
      const code = await runner.render(await voiceArgs(input), text, file);
      if (code !== 0) throw new Error('SPEECH_FAILED');
      return await fsp.readFile(file);
    } finally {
      await fsp.rm(file, { force: true }).catch(() => {});
    }
  }

  async function speak(input: SpeakInput): Promise<{ stopped: boolean; voice: string | null }> {
    if (!supported) throw new Error('SPEECH_UNSUPPORTED');
    const text = input.text.trim();
    if (!text) return { stopped: false, voice: null };
    stop();
    const args = await voiceArgs(input);
    const run = runner.speak(args, text);
    active = run;
    const code = await run.done;
    const stopped = active !== run;
    if (active === run) active = null;
    if (code !== 0 && code !== null && !stopped) throw new Error('SPEECH_FAILED');
    const voiceIndex = args.indexOf('-v');
    return { stopped, voice: voiceIndex >= 0 ? args[voiceIndex + 1]! : null };
  }

  return { supported, listVoices, speak, render, stop, isSpeaking: () => active !== null };
}

export type TtsService = ReturnType<typeof createTtsService>;
