// @ts-nocheck
// HTTP-layer tests for /api/speech/*: the real daemon, but never a real voice
// (no test speaks out loud) and no whisper installed.

import * as http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('/api/speech — HTTP layer', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const { startServer } = await import('../../src/server.js');
    const started = (await startServer({ port: 0, returnServer: true })) as unknown as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const post = (path: string, body?: unknown, headers: Record<string, string> = {}) =>
    fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  it('reports what can be spoken and heard', async () => {
    const res = await fetch(`${baseUrl}/api/speech/status`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.tts.supported).toBe('boolean');
    expect(body.stt).toHaveProperty('available');
  });

  it('lists voices as an array, best first, without the robotic ones', async () => {
    const res = await fetch(`${baseUrl}/api/speech/voices`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.voices)).toBe(true);
    expect(body.voices.map((v) => v.name.toLowerCase())).not.toContain('zarvox');
  });

  it('rejects an empty or oversized text before speaking', async () => {
    expect((await post('/api/speech/speak', { text: '   ' })).status).toBeGreaterThanOrEqual(400);
    const big = await post('/api/speech/speak', { text: 'a'.repeat(4001) });
    expect([400, 501]).toContain(big.status);
  });

  it('stop is always safe', async () => {
    const res = await post('/api/speech/stop');
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it('refuses audio when nothing is installed to listen with, and tells why', async () => {
    const status = await (await fetch(`${baseUrl}/api/speech/status`)).json();
    const res = await fetch(`${baseUrl}/api/speech/transcribe?lang=es-MX`, {
      method: 'POST',
      headers: { 'content-type': 'audio/wav' },
      body: Buffer.from('RIFF....WAVE'),
    });
    if (status.stt.available) {
      expect([200, 502]).toContain(res.status);
    } else {
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(JSON.stringify(body)).toContain('STT_UNAVAILABLE');
    }
  });

  it('warms the listening model without waiting for it', async () => {
    const res = await post('/api/speech/warmup');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.available).toBe('boolean');
  });

  it('asks for audio in the body', async () => {
    const res = await fetch(`${baseUrl}/api/speech/transcribe`, {
      method: 'POST',
      headers: { 'content-type': 'audio/wav' },
      body: Buffer.alloc(0),
    });
    expect(res.status).toBe(400);
  });
});
