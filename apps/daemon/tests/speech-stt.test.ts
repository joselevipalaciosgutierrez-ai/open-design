import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  collapseRepeats,
  SERVER_MAX_SECONDS,
  SttUnavailableError,
  wavSeconds,
  cleanTranscript,
  createSttService,
  pickModel,
  whisperLanguage,
} from '../src/speech/stt.js';

describe('pickModel', () => {
  it('prefers the biggest multilingual model and ignores English-only ones', () => {
    expect(pickModel(['ggml-base.bin', 'ggml-small.bin', 'ggml-tiny.bin'])).toBe('ggml-small.bin');
    expect(pickModel(['ggml-small.en.bin', 'ggml-base.bin'])).toBe('ggml-base.bin');
    expect(pickModel(['ggml-large-v3-turbo-q5_0.bin', 'ggml-base.bin'])).toBe('ggml-large-v3-turbo-q5_0.bin');
    expect(pickModel(['readme.txt', 'ggml-base.en.bin'])).toBeNull();
  });
});

describe('transcript helpers', () => {
  it('turns es-MX into es and strips non-speech markers', () => {
    expect(whisperLanguage('es-MX')).toBe('es');
    expect(whisperLanguage('en_US')).toBe('en');
    expect(cleanTranscript(' [BLANK_AUDIO] Hola,  ¿qué tal? (música) ')).toBe('Hola, ¿qué tal?');
    expect(cleanTranscript('[BLANK_AUDIO]')).toBe('');
  });
});

describe('createSttService', () => {
  const dataDir = '/data';
  const home = path.join(dataDir, 'speech', 'whisper');

  it('says what is missing, binary first', () => {
    const stt = createSttService({ dataDir, env: { PATH: '' }, exists: () => false, list: () => [] });
    expect(stt.status()).toEqual({ available: false, engine: null, reason: 'binary-missing' });
    const noModel = createSttService({
      dataDir,
      env: { PATH: '' },
      exists: (f) => f === path.join(home, 'whisper-cli'),
      list: () => [],
    });
    expect(noModel.status()).toMatchObject({ available: false, reason: 'model-missing' });
  });

  it('finds the binary in the data dir, on the PATH or from the environment', () => {
    const local = createSttService({
      dataDir,
      env: { PATH: '' },
      exists: (f) => f === path.join(home, 'whisper-cli'),
      list: () => ['ggml-base.bin'],
    });
    expect(local.status()).toMatchObject({ available: true, model: path.join(home, 'ggml-base.bin') });
    const onPath = createSttService({
      dataDir,
      env: { PATH: '/usr/local/bin' },
      exists: (f) => f === '/usr/local/bin/whisper-cpp',
      list: () => ['ggml-small.bin'],
    });
    expect(onPath.status().binary).toBe('/usr/local/bin/whisper-cpp');
    const fromEnv = createSttService({
      dataDir,
      env: { OD_WHISPER_BIN: '/x/w', OD_WHISPER_MODEL: '/x/m.bin', PATH: '' },
      exists: (f) => f === '/x/w' || f === '/x/m.bin',
      list: () => [],
    });
    expect(fromEnv.status()).toMatchObject({ available: true, binary: '/x/w', model: '/x/m.bin' });
  });

  it('refuses to transcribe when it is not set up', async () => {
    const stt = createSttService({ dataDir, env: { PATH: '' }, exists: () => false, list: () => [] });
    await expect(stt.transcribe(Buffer.from('x'))).rejects.toBeInstanceOf(SttUnavailableError);
  });

  it('runs whisper on the audio, cleans the text and removes the temp file', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-stt-'));
    let seen: { bin: string; args: string[]; existedDuring: boolean } | null = null;
    const stt = createSttService({
      dataDir,
      tmpDir,
      env: { OD_WHISPER_BIN: '/x/w', OD_WHISPER_MODEL: '/x/m.bin', PATH: '' },
      exists: () => true,
      list: () => [],
      startServer: async () => { throw new Error('no server in this test'); },
      run: async (bin, args) => {
        seen = { bin, args, existedDuring: fs.existsSync(args[args.indexOf('-f') + 1]!) };
        return { code: 0, stdout: ' [BLANK_AUDIO] Hola mundo\n' };
      },
    });
    const result = await stt.transcribe(Buffer.from('RIFF'), 'es-MX');
    expect(result.text).toBe('Hola mundo');
    expect(result.engine).toBe('whisper-cpp');
    expect(result.via).toBe('cli');
    expect(seen!.bin).toBe('/x/w');
    expect(seen!.args).toEqual(expect.arrayContaining(['-m', '/x/m.bin', '-l', 'es', '-nt', '-np']));
    expect(seen!.existedDuring).toBe(true);
    await new Promise((r) => setTimeout(r, 20));
    expect(fs.readdirSync(tmpDir)).toEqual([]);
  });

  it('fails when whisper fails with no text', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-stt-'));
    const stt = createSttService({
      dataDir, tmpDir, env: { OD_WHISPER_BIN: '/x/w', OD_WHISPER_MODEL: '/x/m.bin', PATH: '' },
      exists: () => true, list: () => [], startServer: async () => { throw new Error('no'); }, run: async () => ({ code: 1, stdout: '' }),
    });
    await expect(stt.transcribe(Buffer.from('x'))).rejects.toThrow('STT_FAILED');
  });
});

function wavOf(seconds: number): Buffer {
  const data = Math.round(seconds * 32000);
  const buf = Buffer.alloc(44 + data);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(16000, 24);
  return buf;
}

describe('wavSeconds', () => {
  it('reads the length of a 16 kHz mono WAV, and 0 for anything else', () => {
    expect(wavSeconds(wavOf(3))).toBeCloseTo(3, 3);
    expect(wavSeconds(Buffer.from('not a wav'))).toBe(0);
    expect(SERVER_MAX_SECONDS).toBeLessThan(15);
  });
});

describe('createSttService — resident server', () => {
  const baseDeps = {
    dataDir: '/data',
    env: { OD_WHISPER_BIN: '/x/whisper-cli', OD_WHISPER_MODEL: '/x/m.bin', PATH: '' },
    exists: () => true,
    list: () => [] as string[],
  };

  function fakeServer() {
    let stops = 0;
    let starts = 0;
    return {
      stats: () => ({ starts, stops }),
      startServer: async () => {
        starts += 1;
        return { baseUrl: 'http://127.0.0.1:9999', stop: () => { stops += 1; } };
      },
    };
  }

  it('sends the audio to the resident server and cleans what comes back', async () => {
    const fake = fakeServer();
    const requests: Array<{ url: string; form: FormData }> = [];
    const stt = createSttService({
      ...baseDeps,
      startServer: fake.startServer,
      fetchImpl: (async (url: string, init: { body: FormData }) => {
        requests.push({ url, form: init.body });
        return { ok: true, json: async () => ({ text: ' [BLANK_AUDIO] Hola mundo ' }) };
      }) as unknown as typeof fetch,
      run: async () => { throw new Error('the CLI must not run'); },
    });
    const result = await stt.transcribe(Buffer.from('RIFF'), 'es-MX');
    expect(result).toMatchObject({ text: 'Hola mundo', via: 'server', engine: 'whisper-cpp' });
    expect(requests[0]!.url).toBe('http://127.0.0.1:9999/inference');
    expect(requests[0]!.form.get('language')).toBe('es');
    expect(requests[0]!.form.get('response_format')).toBe('json');
    expect(requests[0]!.form.get('file')).toBeInstanceOf(Blob);
  });

  it('starts the server once, even for requests that arrive together', async () => {
    const fake = fakeServer();
    const stt = createSttService({
      ...baseDeps,
      startServer: fake.startServer,
      fetchImpl: (async () => ({ ok: true, json: async () => ({ text: 'ok' }) })) as unknown as typeof fetch,
    });
    await Promise.all([stt.warmup(), stt.warmup(), stt.transcribe(Buffer.from('a'))]);
    await stt.transcribe(Buffer.from('b'));
    expect(fake.stats().starts).toBe(1);
  });

  it('falls back to the one-shot CLI when the server cannot run, and when it fails mid-request', async () => {
    const cli = async () => ({ code: 0, stdout: ' Desde la CLI ' });
    const noServer = createSttService({ ...baseDeps, startServer: async () => { throw new Error('x'); }, run: cli, tmpDir: fs.mkdtempSync(path.join(os.tmpdir(), 'od-stt-')) });
    expect(await noServer.transcribe(Buffer.from('x'))).toMatchObject({ text: 'Desde la CLI', via: 'cli' });

    const fake = fakeServer();
    const broken = createSttService({
      ...baseDeps,
      startServer: fake.startServer,
      fetchImpl: (async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch,
      run: cli,
      tmpDir: fs.mkdtempSync(path.join(os.tmpdir(), 'od-stt-')),
    });
    expect(await broken.transcribe(Buffer.from('x'))).toMatchObject({ text: 'Desde la CLI', via: 'cli' });
    expect(fake.stats().stops).toBe(1);
  });

  it('sends audio longer than the server\'s window to the full-context CLI', async () => {
    const fake = fakeServer();
    const stt = createSttService({
      ...baseDeps,
      startServer: fake.startServer,
      fetchImpl: (async () => { throw new Error('the server must not be asked'); }) as unknown as typeof fetch,
      run: async () => ({ code: 0, stdout: ' Un discurso largo ' }),
      tmpDir: fs.mkdtempSync(path.join(os.tmpdir(), 'od-stt-')),
    });
    expect(await stt.transcribe(wavOf(20))).toMatchObject({ text: 'Un discurso largo', via: 'cli' });
    expect(fake.stats().starts).toBe(0);
  });

  it('warmup says whether the fast path is ready', async () => {
    const fake = fakeServer();
    expect(await createSttService({ ...baseDeps, startServer: fake.startServer }).warmup()).toBe(true);
    const none = createSttService({ ...baseDeps, exists: () => false, startServer: fake.startServer });
    expect(await none.warmup()).toBe(false);
    const failing = createSttService({ ...baseDeps, startServer: async () => { throw new Error('x'); } });
    expect(await failing.warmup()).toBe(false);
  });

  it('stops the server after a quiet spell and brings it back on demand', async () => {
    vi.useFakeTimers();
    try {
      const fake = fakeServer();
      const stt = createSttService({
        ...baseDeps,
        idleMs: 1000,
        startServer: fake.startServer,
        fetchImpl: (async () => ({ ok: true, json: async () => ({ text: 'ok' }) })) as unknown as typeof fetch,
      });
      await stt.warmup();
      expect(fake.stats()).toEqual({ starts: 1, stops: 0 });
      await vi.advanceTimersByTimeAsync(1500);
      expect(fake.stats()).toEqual({ starts: 1, stops: 1 });
      await stt.transcribe(Buffer.from('x'));
      expect(fake.stats().starts).toBe(2);
      stt.stop();
      expect(fake.stats().stops).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('collapseRepeats', () => {
  it('keeps one copy of a sentence whisper wrote three times in a row', () => {
    expect(collapseRepeats('Hola, ¿me estás escuchando? Hola, ¿me estás escuchando? Hola, ¿me estás escuchando?'))
      .toBe('Hola, ¿me estás escuchando?');
  });

  it('ignores case and punctuation when comparing, and keeps sentences that differ', () => {
    expect(collapseRepeats('Hazlo azul. hazlo azul! Y luego verde.')).toBe('Hazlo azul. Y luego verde.');
    expect(collapseRepeats('Uno. Dos. Uno.')).toBe('Uno. Dos. Uno.');
  });
});
