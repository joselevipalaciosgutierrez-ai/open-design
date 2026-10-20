import { useSyncExternalStore } from 'react';

/**
 * What the assistant is doing right now, shared between the monkey in the
 * composer and the aura around it. There is one assistant, so one store.
 * The speech level (how open its mouth is) changes every frame, so it is a
 * plain number to read from an animation loop, not React state.
 */

export type AssistantPhase = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking';

let phase: AssistantPhase = 'idle';
let level = 0;
const listeners = new Set<() => void>();

export function setAssistantPhase(next: AssistantPhase): void {
  if (next === phase) return;
  phase = next;
  if (next !== 'speaking') level = 0;
  listeners.forEach((l) => l());
}

export function getAssistantPhase(): AssistantPhase {
  return phase;
}

export function setAssistantLevel(next: number): void {
  level = Math.max(0, Math.min(1, next));
}

export function getAssistantLevel(): number {
  return level;
}

/**
 * A spoken request is waiting for its answer. It lives here, not in a component,
 * so it survives the jump from Home to the new project's chat, where the reply
 * will arrive and be read aloud.
 */
let awaitingSpokenReply = false;
export function setAwaitingSpokenReply(value: boolean): void {
  awaitingSpokenReply = value;
}
export function takeAwaitingSpokenReply(): boolean {
  const was = awaitingSpokenReply;
  awaitingSpokenReply = false;
  return was;
}

/**
 * A request said out loud is about to become a chat turn. The turn takes this
 * mark when it is created so its message can show the assistant, not the agent.
 * It expires, so a request that never reached a turn cannot mark a typed one.
 */
const SPOKEN_TURN_TTL_MS = 60_000;
let spokenTurnAt = 0;
export function markSpokenTurn(now: number = Date.now()): void {
  spokenTurnAt = now;
}
export function takeSpokenTurn(now: number = Date.now()): boolean {
  const was = spokenTurnAt > 0 && now - spokenTurnAt <= SPOKEN_TURN_TTL_MS;
  spokenTurnAt = 0;
  return was;
}

/**
 * The assistant can stand out of the composer, large at the left of the page,
 * after the person presses and holds the monkey on Home (or holds or clicks it
 * in a chat). It lives here, not in the control, because the control on Home
 * and the one in the chat are different instances and the stage carries over.
 */
export type AssistantStage = 'off' | 'big' | 'subtle';
let stage: AssistantStage = 'off';
export function setAssistantStage(next: AssistantStage): void {
  if (next === stage) return;
  stage = next;
  listeners.forEach((l) => l());
}
export function getAssistantStage(): AssistantStage {
  return stage;
}
export function useAssistantStage(): AssistantStage {
  return useSyncExternalStore(subscribeAssistantPhase, getAssistantStage, () => 'off');
}

/**
 * Holding the monkey on Home only listens. What it asks for opens the chat, and
 * there the assistant stands out: this remembers that the hold happened.
 */
let stageOnSend = false;
export function setStageOnSend(value: boolean): void {
  stageOnSend = value;
}
export function takeStageOnSend(): boolean {
  const was = stageOnSend;
  stageOnSend = false;
  return was;
}

/**
 * How open the monkey's mouth is while the app plays the assistant's speech,
 * measured from the sound itself; null when nothing is playing (the monkey
 * then times its own syllables). Read every animation frame.
 */
export const speechMouthLevel: { current: number | null } = { current: null };

export function subscribeAssistantPhase(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAssistantPhase(): AssistantPhase {
  return useSyncExternalStore(subscribeAssistantPhase, getAssistantPhase, () => 'idle');
}

// A handle for looking at the monkey and its aura without a microphone: in the
// browser console, `__odAssistant.setPhase('speaking'); __odAssistant.setLevel(0.8)`.
// Development builds only.
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  (window as unknown as Record<string, unknown>).__odAssistant = { setPhase: setAssistantPhase, setLevel: setAssistantLevel };
}
