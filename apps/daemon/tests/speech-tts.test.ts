import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createTtsService,
  parseVoiceList,
  pickVoice,
  wordsPerMinute,
  type SpeechRunner,
} from '../src/speech/tts.js';

const SAMPLE = [
  'Albert              en_US    # Hello! My name is Albert.',
  'Eddy (Español (México)) es_MX    # ¡Hola! Me llamo Eddy.',
  'Mónica              es_ES    # ¡Hola! Me llamo Mónica.',
  'Paulina (Español (México)) es_MX    # ¡Hola! Me llamo Paulina.',
  'Paulina (Español (México)) es_MX    # ¡Hola! Me llamo Paulina.',
  'Jimena (Premium)    es_MX    # ¡Hola! Me llamo Jimena.',
  'Samantha            en_US    # Hello! My name is Samantha.',
  'Daniel (Enhanced)   en_GB    # Hello! My name is Daniel.',
].join('\n');

describe('parseVoiceList', () => {
  const voices = parseVoiceList(SAMPLE);

  it('drops novelty and robotic voices and duplicates', () => {
    const names = voices.map((v) => v.name);
    expect(names).not.toContain('Albert');
    expect(names).not.toContain('Eddy');
    expect(names.filter((n) => n === 'Paulina')).toHaveLength(1);
  });

  it('reads language and quality, best first', () => {
    expect(voices[0]).toMatchObject({ name: 'Jimena', quality: 'premium', lang: 'es-MX' });
    expect(voices.find((v) => v.name === 'Daniel')?.quality).toBe('enhanced');
    expect(voices.find((v) => v.name === 'Mónica')?.quality).toBe('standard');
  });
});

describe('pickVoice', () => {
  const voices = parseVoiceList(SAMPLE);

  it('prefers premium, then the exact region', () => {
    expect(pickVoice(voices, 'es-MX')?.name).toBe('Jimena');
    const noPremium = voices.filter((v) => v.quality !== 'premium');
    expect(pickVoice(noPremium, 'es-ES')?.name).toBe('Mónica');
    expect(pickVoice(noPremium, 'es-MX')?.name).toBe('Paulina');
  });

  it('is null when no voice speaks the language', () => {
    expect(pickVoice(voices, 'ja-JP')).toBeNull();
  });
});

describe('wordsPerMinute', () => {
  it('is 175 at normal pace and stays within a natural range', () => {
    expect(wordsPerMinute(undefined)).toBe(175);
    expect(wordsPerMinute(0.1)).toBe(Math.round(175 * 0.7));
    expect(wordsPerMinute(9)).toBe(Math.round(175 * 1.4));
  });
});

function fakeRunner() {
  const started: Array<{ args: string[]; text: string; finish: (code: number) => void; killed: boolean }> = [];
  const rendered: Array<{ args: string[]; text: string; outFile: string }> = [];
  const runner: SpeechRunner = {
    list: async () => SAMPLE,
    speak: (args, text) => {
      let finish: (code: number) => void = () => {};
      const done = new Promise<number | null>((resolve) => { finish = resolve; });
      const entry = { args, text, finish, killed: false };
      started.push(entry);
      return { done, kill: () => { entry.killed = true; finish(143); } };
    },
    render: async (args, text, outFile) => {
      rendered.push({ args, text, outFile });
      await fsp.writeFile(outFile, Buffer.from(`RIFF${text}`));
      return 0;
    },
  };
  return { runner, started, rendered };
}

describe('createTtsService', () => {
  it('speaks with the best voice for the language and the calm pace', async () => {
    const { runner, started } = fakeRunner();
    const tts = createTtsService({ platform: 'darwin', runner });
    const speaking = tts.speak({ text: '  Hola  ', lang: 'es-MX' });
    await new Promise((r) => setTimeout(r, 0));
    expect(started[0]!.args).toEqual(['-v', 'Jimena (Premium)', '-r', '175']);
    expect(started[0]!.text).toBe('Hola');
    expect(tts.isSpeaking()).toBe(true);
    started[0]!.finish(0);
    await expect(speaking).resolves.toMatchObject({ stopped: false, voice: 'Jimena (Premium)' });
    expect(tts.isSpeaking()).toBe(false);
  });

  it('takes the chosen voice over its own pick', async () => {
    const { runner, started } = fakeRunner();
    const tts = createTtsService({ platform: 'darwin', runner });
    const speaking = tts.speak({ text: 'Hola', voiceId: 'Paulina (Español (México))' });
    await new Promise((r) => setTimeout(r, 0));
    expect(started[0]!.args.slice(0, 2)).toEqual(['-v', 'Paulina (Español (México))']);
    started[0]!.finish(0);
    await speaking;
  });

  it('speaks one voice at a time: a new one stops the old one', async () => {
    const { runner, started } = fakeRunner();
    const tts = createTtsService({ platform: 'darwin', runner });
    const first = tts.speak({ text: 'uno' });
    await new Promise((r) => setTimeout(r, 0));
    const second = tts.speak({ text: 'dos' });
    await new Promise((r) => setTimeout(r, 0));
    expect(started[0]!.killed).toBe(true);
    await expect(first).resolves.toMatchObject({ stopped: true });
    started[1]!.finish(0);
    await expect(second).resolves.toMatchObject({ stopped: false });
  });

  it('stop() ends the speech and says whether anything was playing', async () => {
    const { runner } = fakeRunner();
    const tts = createTtsService({ platform: 'darwin', runner });
    expect(tts.stop()).toBe(false);
    const speaking = tts.speak({ text: 'hola' });
    await new Promise((r) => setTimeout(r, 0));
    expect(tts.stop()).toBe(true);
    await expect(speaking).resolves.toMatchObject({ stopped: true });
  });

  it('says nothing for empty text and is unsupported off macOS', async () => {
    const { runner, started } = fakeRunner();
    const tts = createTtsService({ platform: 'darwin', runner });
    await expect(tts.speak({ text: '   ' })).resolves.toMatchObject({ stopped: false, voice: null });
    expect(started).toHaveLength(0);
    const linux = createTtsService({ platform: 'linux', runner });
    expect(linux.supported).toBe(false);
    expect(await linux.listVoices()).toEqual([]);
    await expect(linux.speak({ text: 'hola' })).rejects.toThrow('SPEECH_UNSUPPORTED');
  });
});

describe('rendering speech for the app to play', () => {
  it('writes the chosen voice to a WAV, hands back its bytes and cleans up', async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'tts-test-'));
    const { runner, rendered } = fakeRunner();
    const tts = createTtsService({ platform: 'darwin', runner, tmpDir: dir });
    const wav = await tts.render({ text: ' Hola ', lang: 'es-MX', rate: 1 });
    expect(wav.toString()).toBe('RIFFHola');
    expect(rendered[0]!.text).toBe('Hola');
    expect(rendered[0]!.args).toContain('-v');
    expect(await fsp.readdir(dir)).toEqual([]);
    await fsp.rm(dir, { recursive: true, force: true });
  });

  it('is not offered off macOS', async () => {
    const tts = createTtsService({ platform: 'linux', runner: fakeRunner().runner });
    await expect(tts.render({ text: 'hola' })).rejects.toThrow('SPEECH_UNSUPPORTED');
  });
});
