/**
 * The assistant monkey's motion, as plain functions: what each state looks like,
 * how it moves toward it, and how its mouth keeps time with speech. The component
 * only draws. Nothing here touches the DOM, so every rule is testable.
 */

export type MonkeyState = 'idle' | 'listen' | 'think' | 'speak' | 'surprise' | 'wink';

export type MouthShape = 'smile' | 'flat' | 'smirk';

/** Where the face wants to be in a state. Numbers are SVG units / degrees. */
export interface MonkeyPose {
  /** Brow lift: negative raises them. */
  brow: number;
  /** Right brow lift when it differs from `brow`. */
  browRight?: number;
  browRotLeft: number;
  browRotRight: number;
  /** Ear lift: negative lifts them. */
  ear: number;
  eyeScale: number;
  /** Fixed gaze, -1..1 on each axis; null follows the cursor. */
  look: readonly [number, number] | null;
  /** Added to the cursor's gaze: follows the mouse but keeps a lean (thinking looks up and aside). */
  lookBias?: readonly [number, number];
  /** Head tilt in degrees, on top of the one that follows the cursor. */
  headTilt?: number;
  /** The face slides sideways by this many units, turning the head and showing an ear. */
  faceShift?: number;
  /** Size of each ear; the one the head turns toward grows. */
  earScaleLeft?: number;
  earScaleRight?: number;
  /** The right ear moves outward by this many units. */
  earShiftRight?: number;
  mouth: MouthShape;
  /** The mouth keeps time with speech. */
  talk?: boolean;
  /** Round "o" mouth held open. */
  round?: boolean;
  /** The right eye closes for a moment. */
  wink?: boolean;
}

export const POSES: Record<MonkeyState, MonkeyPose> = {
  idle: { brow: 0, browRotLeft: 0, browRotRight: 0, ear: 0, eyeScale: 1, look: null, mouth: 'smile' },
  // Listening: the head turns a little to one side, the ear on that side comes
  // forward and up, the eyes look off to the side as if to hear better.
  listen: {
    brow: -1.3, browRotLeft: 0, browRotRight: 0, ear: -1.5, eyeScale: 1.05, look: [-0.5, 0.1], mouth: 'smile',
    headTilt: -10, faceShift: -2.4, earScaleLeft: 0.9, earScaleRight: 1.2, earShiftRight: 1.1,
  },
  think: { brow: -1.5, browRight: 0.4, browRotLeft: -10, browRotRight: 3, ear: 0, eyeScale: 1, look: null, lookBias: [0.35, -0.5], mouth: 'smirk' },
  speak: { brow: -0.4, browRotLeft: 0, browRotRight: 0, ear: 0, eyeScale: 1, look: null, mouth: 'smile', talk: true },
  surprise: { brow: -2.6, browRotLeft: 0, browRotRight: 0, ear: -2.2, eyeScale: 1.3, look: [0, 0], mouth: 'smile', round: true },
  wink: { brow: -0.3, browRotLeft: 0, browRotRight: 0, ear: 0, eyeScale: 1, look: null, mouth: 'smirk', wink: true },
};

export const MOUTH_PATHS: Record<MouthShape, string> = {
  smile: 'M15.6 27 Q20 30.4 24.4 27',
  flat: 'M16.5 28 L23.5 28',
  smirk: 'M16 27.8 Q20 29.4 24.6 26.4',
};

/** Frame-rate independent easing: the same feel at 60 and 120 Hz. */
export function damp(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

/** Vertical scale of the eyes during a blink (1 = open) `elapsedMs` after it began. */
export function blinkScale(elapsedMs: number): number {
  return elapsedMs >= 0 && elapsedMs < 150 ? 1 - 0.92 * Math.sin((elapsedMs / 150) * Math.PI) : 1;
}

/** When the next blink happens, relative to `now`: every 3 to 6.5 seconds. */
export function nextBlinkAt(now: number, rng: () => number = Math.random): number {
  return now + 3000 + rng() * 3500;
}

/** The cursor's gaze plus a lean, kept inside the eyes' reach. */
export function leanedGaze(gaze: readonly [number, number], bias: readonly [number, number], follow = 0.7): [number, number] {
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  return [clamp(gaze[0] * follow + bias[0]), clamp(gaze[1] * follow + bias[1])];
}

/** Where the face looks, from the cursor's offset to the monkey's centre. */
export function gazeToward(dx: number, dy: number): [number, number] {
  const dist = Math.hypot(dx, dy) || 1;
  const k = Math.min(1, dist / 160);
  return [(dx / dist) * k, (dy / dist) * k];
}

export interface MouthSample {
  /** 0 closed .. 1 wide open. */
  open: number;
  /** -1 round (o, u) .. 1 wide (a, e). */
  wide: number;
}

/**
 * A mouth that talks in syllables instead of a sine wave: each one lasts 170 to
 * 300 ms and opens differently, and every 4 to 6 syllables it pauses to breathe.
 * Slower and less regular than a wave, so it reads as speech, not a buzz.
 */
export function createSyllableMouth(rng: () => number = Math.random) {
  let sample: MouthSample = { open: 0, wide: 0 };
  let until = 0;
  let count = 0;
  let pauseEvery = 4 + Math.floor(rng() * 3);
  return {
    reset() {
      sample = { open: 0, wide: 0 };
      until = 0;
      count = 0;
      pauseEvery = 4 + Math.floor(rng() * 3);
    },
    sample(now: number): MouthSample {
      if (now >= until) {
        count += 1;
        if (count % pauseEvery === 0) {
          sample = { open: 0, wide: 0 };
          until = now + 260 + rng() * 260;
          pauseEvery = 4 + Math.floor(rng() * 3);
        } else {
          sample = { open: 0.28 + rng() * 0.62, wide: rng() * 2 - 1 };
          until = now + 170 + rng() * 130;
        }
      }
      return sample;
    },
  };
}

/** Mouth geometry for an openness / width, in the monkey's 40-unit space. */
export function mouthGeometry(open: number, wide: number, round = false) {
  const ry = 0.6 + open * 3.3;
  const rx = round ? 2.3 : 2.5 + (wide + 1) * 0.75;
  const cy = 27.4 + ry * 0.45;
  return {
    visible: open > 0.06,
    rx,
    ry,
    cy,
    tongue: { rx: rx * 0.66, ry: ry * 0.5, cy: cy + ry * 0.52 },
  };
}

/** Occasional small gestures while idle: a wink now and then, nothing twice in a row. */
export function nextGestureAt(now: number, rng: () => number = Math.random): number {
  return now + 18000 + rng() * 22000;
}
