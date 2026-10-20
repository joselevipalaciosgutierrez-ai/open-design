import { describe, expect, it } from 'vitest';
import { createEndpointer } from '../../src/runtime/assistant/endpointing';
import { concatChunks, encodeWav, resampleTo16k, rmsLevel } from '../../src/runtime/assistant/wav';

/** Feeds `levels` (one every 50 ms) and collects the events. */
function run(levels: number[], options = {}) {
  const ep = createEndpointer(options);
  const events: Array<{ at: number; type: string; reason?: string }> = [];
  levels.forEach((level, i) => {
    const e = ep.push(level, i * 50);
    if (e) events.push({ at: i * 50, type: e.type, ...('reason' in e ? { reason: e.reason } : {}) });
  });
  return events;
}
const quiet = (n: number, v = 0.004) => Array(n).fill(v);
const loud = (n: number, v = 0.12) => Array(n).fill(v);

describe('endpointing', () => {
  it('ends after a short silence once the person has spoken', () => {
    const events = run([...quiet(10), ...loud(20), ...quiet(40)]);
    expect(events.map((e) => e.type)).toEqual(['speech-start', 'end']);
    expect(events[1]).toMatchObject({ reason: 'silence' });
    // Speech ran 20 samples (1 s), silence 1100 ms, so the end lands ~1.1 s after it.
    expect(events[1]!.at).toBeGreaterThanOrEqual(10 * 50 + 19 * 50 + 1100);
  });

  it('does not cut a pause between words', () => {
    const events = run([...quiet(10), ...loud(10), ...quiet(12), ...loud(10), ...quiet(40)]);
    expect(events.filter((e) => e.type === 'end')).toHaveLength(1);
    const end = events.find((e) => e.type === 'end')!;
    expect(end.at).toBeGreaterThan((10 + 10 + 12 + 10) * 50);
  });

  it('gives up when nobody speaks', () => {
    const events = run(quiet(200));
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('timeout');
    expect(events[0]!.at).toBeGreaterThanOrEqual(7000);
  });

  it('learns a noisy room and does not take its hum for speech', () => {
    const events = run([...quiet(20, 0.03), ...loud(20, 0.2), ...quiet(40, 0.03)]);
    expect(events.map((e) => e.type)).toEqual(['speech-start', 'end']);
  });

  it('ignores a click or a cough and keeps listening', () => {
    const events = run([...quiet(10), ...loud(2), ...quiet(40), ...loud(20), ...quiet(40)]);
    const ends = events.filter((e) => e.type === 'end');
    expect(ends).toHaveLength(1);
    expect(ends[0]!.at).toBeGreaterThan(52 * 50);
  });

  it('stops at the maximum length even if they keep talking', () => {
    const events = run([...quiet(10), ...loud(100)], { maxMs: 3000 });
    expect(events.map((e) => e.type)).toEqual(['speech-start', 'end']);
    expect(events[1]).toMatchObject({ reason: 'max-length' });
  });

  it('says nothing after it is done', () => {
    const ep = createEndpointer();
    [...quiet(10), ...loud(20), ...quiet(40)].forEach((l, i) => ep.push(l, i * 50));
    expect(ep.push(0.5, 99999)).toBeNull();
  });
});

describe('wav', () => {
  it('writes a valid 16 kHz mono PCM16 header and clamps samples', () => {
    const buf = encodeWav(new Float32Array([0, 0.5, -0.5, 2, -2]));
    const v = new DataView(buf);
    const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
    expect([tag(0), tag(8), tag(12), tag(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data']);
    expect(v.getUint16(20, true)).toBe(1);
    expect(v.getUint16(22, true)).toBe(1);
    expect(v.getUint32(24, true)).toBe(16000);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(10);
    expect(buf.byteLength).toBe(44 + 10);
    expect(v.getInt16(44 + 6, true)).toBe(0x7fff);
    expect(v.getInt16(44 + 8, true)).toBe(-0x8000);
  });

  it('brings 48 kHz down to 16 kHz by averaging', () => {
    const out = resampleTo16k(new Float32Array(480).fill(0.3), 48000);
    expect(out.length).toBe(160);
    expect(out[10]).toBeCloseTo(0.3, 5);
    const same = new Float32Array(10);
    expect(resampleTo16k(same, 16000)).toBe(same);
  });

  it('joins chunks and measures level', () => {
    const joined = concatChunks([new Float32Array([1, 2]), new Float32Array([3])]);
    expect([...joined]).toEqual([1, 2, 3]);
    expect(rmsLevel(new Float32Array([0.5, -0.5, 0.5, -0.5]))).toBeCloseTo(0.5, 5);
    expect(rmsLevel(new Float32Array(0))).toBe(0);
  });
});
