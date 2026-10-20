/**
 * The island on the Mac's notch is a second face of the same Lev: it does not
 * run its own assistant. It asks the app (which owns Lev's session, the voice
 * loop and the monkey) to act, and shows what the app reports back.
 *
 *   POST /api/island/command   IslandCommand → { delivered: boolean }   the island (or `od island`) asks
 *   GET  /api/island/commands  SSE `command` events                     the app listens
 *   POST /api/island/state     IslandState                              the app reports
 *   GET  /api/island/state     IslandState                              current state
 *   GET  /api/island/events    SSE `state` events                       the island listens
 *
 * Local-only and closed to agents: only the person drives the island.
 */

export type IslandCommand =
  /** Click on the monkey: start listening, stop listening, or stop talking (like the app's monkey). */
  | { action: 'voice' }
  /** Something written in the island, sent to Lev's current session. */
  | { action: 'say'; text: string }
  /** Stop listening or talking. */
  | { action: 'stop' };

export type IslandMonkeyState = 'idle' | 'listen' | 'think' | 'speak' | 'surprise' | 'wink';

export interface IslandState {
  /** Whether the app is connected and can act on commands. */
  appConnected: boolean;
  phase: 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking';
  monkey: IslandMonkeyState;
  /** Mouth openness 0..1 while speaking; null lets the monkey time its own syllables. */
  mouth: number | null;
  /** The newest reply from Lev, in plain text, for the island to show. */
  reply: string | null;
  /** Something the person should be told (nothing heard, no microphone…). */
  notice: string | null;
  updatedAt: number;
}

export interface IslandCommandResponse {
  /** False when the app is not open to act on it. */
  delivered: boolean;
}
