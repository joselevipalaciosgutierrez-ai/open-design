/**
 * Home hands its composer to the project it opens: Home animates the composer
 * onto the spot the project keeps it in, then the project fades the rest of
 * itself in around it. This mark tells the project it was opened that way.
 * It expires, so a project opened later some other way never fades in.
 */
const HANDOFF_TTL_MS = 4000;
let handoffAt = 0;

export function markHomeHandoff(now: number = Date.now()): void {
  handoffAt = now;
}

export function takeHomeHandoff(now: number = Date.now()): boolean {
  const was = handoffAt > 0 && now - handoffAt <= HANDOFF_TTL_MS;
  handoffAt = 0;
  return was;
}
