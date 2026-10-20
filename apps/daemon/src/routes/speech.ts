import express, { type Express, type RequestHandler } from 'express';
import type { RouteDeps } from '../server-context.js';
import { SttUnavailableError, type SttService } from '../speech/stt.js';
import type { TtsService } from '../speech/tts.js';

export interface RegisterSpeechRoutesDeps extends RouteDeps<'http'> {
  tts: TtsService;
  stt: SttService;
}

const MAX_SPEECH_CHARS = 4000;

/**
 * The assistant's voice, on this machine:
 *   GET  /api/speech/status      what can be spoken and heard
 *   GET  /api/speech/voices      the voices the Mac offers (best first)
 *   POST /api/speech/speak       say a text; answers when it has been said
 *   POST /api/speech/render      the same speech as WAV audio, for the app to play
 *   POST /api/speech/stop        stop talking
 *   POST /api/speech/warmup      load the listening model ahead of the first request
 *   POST /api/speech/transcribe  audio (WAV) in, text out
 * Local-only: nothing here may be driven from another machine.
 */
export function registerSpeechRoutes(app: Express, ctx: RegisterSpeechRoutesDeps) {
  const { sendApiError } = ctx.http;
  const requireLocal = (ctx.http as unknown as { requireLocalDaemonRequest: RequestHandler }).requireLocalDaemonRequest;
  const { tts, stt } = ctx;

  app.get('/api/speech/status', requireLocal, async (_req, res) => {
    const voices = await tts.listVoices().catch(() => []);
    res.json({
      tts: { supported: tts.supported, voices: voices.length, speaking: tts.isSpeaking() },
      stt: stt.status(),
    });
  });

  app.get('/api/speech/voices', requireLocal, async (_req, res) => {
    const voices = await tts.listVoices().catch(() => []);
    res.json({ supported: tts.supported, voices });
  });

  app.post('/api/speech/speak', requireLocal, async (req, res) => {
    if (!tts.supported) {
      return sendApiError(res, 501, 'SPEECH_UNSUPPORTED', 'Speaking needs macOS voices on this machine.');
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const text = typeof body.text === 'string' ? body.text : '';
    if (!text.trim()) return sendApiError(res, 400, 'BAD_REQUEST', 'text is required');
    if (text.length > MAX_SPEECH_CHARS) {
      return sendApiError(res, 400, 'BAD_REQUEST', `text must be ${MAX_SPEECH_CHARS} characters or fewer`);
    }
    const rate = typeof body.rate === 'number' && Number.isFinite(body.rate) ? body.rate : undefined;
    try {
      const out = await tts.speak({
        text,
        voiceId: typeof body.voiceId === 'string' ? body.voiceId : null,
        lang: typeof body.lang === 'string' ? body.lang : undefined,
        rate,
      });
      res.json({ ok: true, ...out });
    } catch {
      sendApiError(res, 502, 'SPEECH_FAILED', 'The system voice could not speak that.');
    }
  });

  app.post('/api/speech/render', requireLocal, async (req, res) => {
    if (!tts.supported) {
      return sendApiError(res, 501, 'SPEECH_UNSUPPORTED', 'Speaking needs macOS voices on this machine.');
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const text = typeof body.text === 'string' ? body.text : '';
    if (!text.trim()) return sendApiError(res, 400, 'BAD_REQUEST', 'text is required');
    if (text.length > MAX_SPEECH_CHARS) {
      return sendApiError(res, 400, 'BAD_REQUEST', `text must be ${MAX_SPEECH_CHARS} characters or fewer`);
    }
    const rate = typeof body.rate === 'number' && Number.isFinite(body.rate) ? body.rate : undefined;
    try {
      const wav = await tts.render({
        text,
        voiceId: typeof body.voiceId === 'string' ? body.voiceId : null,
        lang: typeof body.lang === 'string' ? body.lang : undefined,
        rate,
      });
      res.type('audio/wav').send(wav);
    } catch {
      sendApiError(res, 502, 'SPEECH_FAILED', 'The system voice could not speak that.');
    }
  });

  // Fire and forget: the model takes a few seconds to load, so the app asks as
  // soon as the person reaches for the microphone.
  app.post('/api/speech/warmup', requireLocal, (_req, res) => {
    void stt.warmup();
    res.json({ ok: true, available: stt.status().available });
  });

  app.post('/api/speech/stop', requireLocal, (_req, res) => {
    res.json({ ok: true, wasSpeaking: tts.stop() });
  });

  app.post(
    '/api/speech/transcribe',
    requireLocal,
    express.raw({ type: ['audio/*', 'application/octet-stream'], limit: '16mb' }),
    async (req, res) => {
      const audio = req.body;
      if (!Buffer.isBuffer(audio) || audio.length === 0) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'send the audio as the request body (audio/wav)');
      }
      const lang = typeof req.query.lang === 'string' ? req.query.lang : 'es-MX';
      try {
        res.json(await stt.transcribe(audio, lang));
      } catch (err) {
        if (err instanceof SttUnavailableError) {
          return sendApiError(
            res,
            503,
            'STT_UNAVAILABLE',
            err.reason === 'binary-missing'
              ? 'Speech recognition is not installed: whisper.cpp was not found.'
              : 'Speech recognition has no model: put a ggml model next to whisper.cpp.',
            { reason: err.reason },
          );
        }
        sendApiError(res, 502, 'STT_FAILED', 'The audio could not be transcribed.');
      }
    },
  );
}
