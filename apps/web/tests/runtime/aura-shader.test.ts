import { describe, expect, it } from 'vitest';
import { AURA_FRAG, AURA_VERT, auraDrive, hexToRgb } from '../../src/runtime/assistant/aura-shader';

describe('auraDrive', () => {
  it('shows nothing while idle', () => {
    expect(auraDrive('idle', 0.9, 0).alive).toBe(0);
  });

  it('listens alive but contained, and stirs with the person\'s own voice', () => {
    const silent = auraDrive('listening', 0, 0);
    const talking = auraDrive('listening', 0.8, 0);
    expect(silent.alive).toBe(1);
    expect(silent.amp).toBeCloseTo(0.1, 2);
    expect(silent.level).toBeLessThan(0.3);
    expect(talking.level).toBeGreaterThan(silent.level + 0.35);
    expect(talking.amp).toBeGreaterThan(silent.amp + 0.1);
    expect(talking.speed).toBeGreaterThan(silent.speed + 0.8);
    expect(auraDrive('listening', 40, 0).level).toBe(auraDrive('listening', 1, 0).level);
    expect(auraDrive('listening', 40, 0).level).toBeLessThanOrEqual(1);
  });

  it('speaks with the voice: more voice swells, wobbles and moves it more', () => {
    const quiet = auraDrive('speaking', 0.05, 0);
    const loud = auraDrive('speaking', 0.9, 0);
    expect(loud.level).toBeGreaterThan(quiet.level);
    expect(loud.amp).toBeGreaterThan(quiet.amp);
    expect(loud.speed).toBeGreaterThan(quiet.speed);
  });

  it('never exceeds its limits, however wild the input', () => {
    const wild = auraDrive('speaking', 40, 0);
    expect(wild.level).toBe(1);
    expect(wild.amp).toBeLessThanOrEqual(0.46 + 1e-9);
    expect(wild.speed).toBeLessThanOrEqual(2.4 + 1e-9);
    expect(auraDrive('speaking', -3, 0).level).toBe(0);
  });

  it('is dimmer while it thinks or transcribes', () => {
    expect(auraDrive('thinking', 0, 0).alive).toBeLessThan(1);
    expect(auraDrive('transcribing', 0, 0).alive).toBeGreaterThan(0);
  });
});

describe('aura shader source', () => {
  it('has the uniforms the component sets', () => {
    for (const name of ['uTime', 'uLevel', 'uAmp', 'uAlive', 'uRadius', 'uDpr', 'uCenter', 'uC1', 'uC2', 'uC3', 'uRes']) {
      expect(AURA_FRAG).toContain(name);
    }
    expect(AURA_VERT).toContain('gl_Position');
  });

  it('turns a hex colour into 0..1 channels', () => {
    expect(hexToRgb('#ff0000')).toEqual([1, 0, 0]);
    const [r, g, b] = hexToRgb('#4cc2ff');
    expect(r).toBeCloseTo(0.298, 2);
    expect(g).toBeCloseTo(0.761, 2);
    expect(b).toBe(1);
  });
});
