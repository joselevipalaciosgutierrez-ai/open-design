import { describe, expect, it } from 'vitest';
import {
  MOUTH_PATHS,
  POSES,
  blinkScale,
  createSyllableMouth,
  damp,
  gazeToward,
  leanedGaze,
  mouthGeometry,
  nextBlinkAt,
} from '../../src/runtime/assistant/monkey-motion';

describe('monkey poses', () => {
  it('turns its head and shows an ear to listen', () => {
    const p = POSES.listen;
    expect(p.headTilt).toBeLessThan(0);
    expect(p.faceShift).toBeLessThan(0);
    expect(p.earScaleRight!).toBeGreaterThan(1);
    expect(p.earScaleLeft!).toBeLessThan(1);
    expect(p.earShiftRight!).toBeGreaterThan(0);
  });

  it('keeps following the cursor while it thinks, with a lean up and aside', () => {
    expect(POSES.think.look).toBeNull();
    expect(POSES.think.lookBias).toBeDefined();
    const [x, y] = leanedGaze([0, 0], POSES.think.lookBias!);
    expect(x).toBeGreaterThan(0.2);
    expect(y).toBeLessThan(-0.3);
    const [rx] = leanedGaze([-1, 0], POSES.think.lookBias!);
    expect(rx).toBeLessThan(x);
  });

  it('never looks further than the eyes can reach', () => {
    const [x, y] = leanedGaze([1, -1], [0.9, -0.9]);
    expect(x).toBe(1);
    expect(y).toBe(-1);
  });
});

describe('monkey motion', () => {
  it('has a pose and a mouth path for every state', () => {
    for (const state of ['idle', 'listen', 'think', 'speak', 'surprise', 'wink'] as const) {
      expect(MOUTH_PATHS[POSES[state].mouth]).toBeTruthy();
    }
    expect(POSES.speak.talk).toBe(true);
    expect(POSES.wink.wink).toBe(true);
    expect(POSES.listen.look).toEqual([-0.5, 0.1]);
  });

  it('eases the same distance per second whatever the frame rate', () => {
    let a = 0;
    for (let i = 0; i < 60; i += 1) a = damp(a, 1, 8, 1 / 60);
    let b = 0;
    for (let i = 0; i < 120; i += 1) b = damp(b, 1, 8, 1 / 120);
    expect(a).toBeCloseTo(b, 3);
    expect(damp(0, 1, 8, 0)).toBe(0);
  });

  it('blinks closed and back open within 150 ms', () => {
    expect(blinkScale(-5)).toBe(1);
    expect(blinkScale(75)).toBeCloseTo(0.08, 2);
    expect(blinkScale(150)).toBe(1);
    expect(nextBlinkAt(1000, () => 0)).toBe(4000);
    expect(nextBlinkAt(1000, () => 1)).toBe(7500);
  });

  it('looks toward the cursor, easing in over the first 160 px', () => {
    expect(gazeToward(0, 0)).toEqual([0, 0]);
    const [x] = gazeToward(80, 0);
    expect(x).toBeCloseTo(0.5, 2);
    const [fx, fy] = gazeToward(400, 300);
    expect(Math.hypot(fx, fy)).toBeCloseTo(1, 5);
  });

  it('talks in syllables with pauses to breathe', () => {
    let a = 0x9e3779b9;
    const rng = () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const mouth = createSyllableMouth(rng);
    let now = 0;
    const closed: number[] = [];
    const opens = new Set<number>();
    for (let i = 0; i < 60; i += 1) {
      const s = mouth.sample(now);
      opens.add(Math.round(s.open * 100));
      if (s.open === 0) closed.push(now);
      now += 100;
    }
    expect(opens.size).toBeGreaterThan(5);
    expect(closed.length).toBeGreaterThan(0);
    // Never faster than one syllable per 170 ms.
    const changes = new Set<string>();
    let t = 0;
    const m2 = createSyllableMouth(rng);
    let lastKey = '';
    let flips = 0;
    for (let i = 0; i < 100; i += 1) {
      const s = m2.sample(t);
      const key = `${s.open}|${s.wide}`;
      if (key !== lastKey) flips += 1;
      lastKey = key;
      changes.add(key);
      t += 10;
    }
    expect(flips).toBeLessThanOrEqual(7);
  });

  it('puts the tongue inside the mouth and rounds it for surprise', () => {
    const g = mouthGeometry(0.8, 1);
    expect(g.visible).toBe(true);
    expect(g.tongue.cy).toBeGreaterThan(g.cy);
    expect(g.tongue.rx).toBeLessThan(g.rx);
    expect(mouthGeometry(0.02, 0).visible).toBe(false);
    expect(mouthGeometry(0.7, 1, true).rx).toBe(2.3);
  });
});
