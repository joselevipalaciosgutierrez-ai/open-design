import type { Express, Response } from 'express';
import type { RequestHandler } from 'express';

import type { IslandCommand, IslandCommandResponse, IslandState } from '@open-design/contracts';

import type { RouteDeps } from '../server-context.js';

type Sse = { send: (event: string, data: unknown) => boolean };

export const ISLAND_TEXT_MAX_CHARS = 4000;

export function idleIslandState(appConnected: boolean): IslandState {
  return { appConnected, phase: 'idle', monkey: 'idle', mouth: null, reply: null, notice: null, updatedAt: Date.now() };
}

/** A command from the island, or null when it is not one. */
export function parseIslandCommand(body: unknown): IslandCommand | null {
  const b = (body ?? {}) as Record<string, unknown>;
  if (b.action === 'voice' || b.action === 'stop') return { action: b.action };
  if (b.action === 'say' && typeof b.text === 'string') {
    const text = b.text.trim().slice(0, ISLAND_TEXT_MAX_CHARS);
    return text ? { action: 'say', text } : null;
  }
  return null;
}

const PHASES = new Set(['idle', 'listening', 'transcribing', 'thinking', 'speaking']);
const MONKEYS = new Set(['idle', 'listen', 'think', 'speak', 'surprise', 'wink']);

export function parseIslandState(body: unknown, appConnected: boolean): IslandState {
  const b = (body ?? {}) as Record<string, unknown>;
  const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.slice(0, max) : null);
  return {
    appConnected,
    phase: PHASES.has(b.phase as string) ? (b.phase as IslandState['phase']) : 'idle',
    monkey: MONKEYS.has(b.monkey as string) ? (b.monkey as IslandState['monkey']) : 'idle',
    mouth: typeof b.mouth === 'number' && Number.isFinite(b.mouth) ? Math.max(0, Math.min(1, b.mouth)) : null,
    reply: text(b.reply, 600),
    notice: text(b.notice, 200),
    updatedAt: Date.now(),
  };
}

/**
 * The relay between the notch island and the app (see contracts/api/island.ts).
 * It keeps no history: the latest state, and who is listening.
 */
export function registerIslandRoutes(app: Express, ctx: RouteDeps<'http'>) {
  const { sendApiError, createSseResponse } = ctx.http as unknown as {
    sendApiError: (res: Response, status: number, code: string, message: string) => void;
    createSseResponse: (res: Response) => Sse;
  };
  const requireLocal = (ctx.http as unknown as { requireLocalDaemonRequest: RequestHandler }).requireLocalDaemonRequest;
  const apps = new Set<Sse>();
  const islands = new Set<Sse>();
  let state = idleIslandState(false);

  const publish = (next: IslandState) => {
    state = next;
    for (const island of islands) island.send('state', state);
  };

  app.post('/api/island/command', requireLocal, (req, res) => {
    const command = parseIslandCommand(req.body);
    if (!command) return sendApiError(res, 400, 'BAD_REQUEST', 'action must be voice, stop, or say with text');
    for (const listener of apps) listener.send('command', command);
    const body: IslandCommandResponse = { delivered: apps.size > 0 };
    res.json(body);
  });

  app.get('/api/island/commands', requireLocal, (req, res) => {
    const sse = createSseResponse(res);
    apps.add(sse);
    publish({ ...state, appConnected: true, updatedAt: Date.now() });
    req.on('close', () => {
      apps.delete(sse);
      if (apps.size === 0) publish(idleIslandState(false));
    });
  });

  app.post('/api/island/state', requireLocal, (req, res) => {
    publish(parseIslandState(req.body, apps.size > 0));
    res.json({ ok: true });
  });

  app.get('/api/island/state', requireLocal, (_req, res) => {
    res.json(state);
  });

  app.get('/api/island/events', requireLocal, (req, res) => {
    const sse = createSseResponse(res);
    islands.add(sse);
    sse.send('state', state);
    req.on('close', () => islands.delete(sse));
  });
}
