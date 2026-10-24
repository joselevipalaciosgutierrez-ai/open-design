import { describe, expect, it } from 'vitest';
import { APP_CONFIG_TUNING } from '@open-design/contracts';

import { describeTuning } from '../src/app-config-tuning.js';
import { WARM_AGENT_IDLE_MS, WARM_AGENT_MAX_PARKED_CEILING } from '../src/runtimes/warm-agents.js';

const GB = 1024 ** 3;
const byKey = (settings: ReturnType<typeof describeTuning>['settings']) =>
  Object.fromEntries(settings.map((s) => [s.key, s]));

describe('describeTuning', () => {
  it('lists every tuning setting with its range and unit from the shared registry', () => {
    const { settings } = describeTuning({}, 16 * GB);
    expect(settings.map((s) => s.key)).toEqual(Object.keys(APP_CONFIG_TUNING));
    const s = byKey(settings);
    expect(s.antigravityWarmMax).toMatchObject({ min: 0, max: 16, unit: 'processes' });
    expect(s.antigravityWarmIdleSeconds).toMatchObject({ min: 5, max: 3600, unit: 'seconds' });
  });

  it('with nothing stored, the effective value is the default and the stored value is null', () => {
    const s = byKey(describeTuning({}, 16 * GB).settings);
    expect(s.antigravityWarmMax).toMatchObject({ value: null, effective: 4, default: 4 });
    expect(s.antigravityWarmIdleSeconds).toMatchObject({
      value: null,
      effective: WARM_AGENT_IDLE_MS / 1000,
      default: WARM_AGENT_IDLE_MS / 1000,
    });
  });

  it('the default depends on the memory, the effective value on what was stored', () => {
    const small = byKey(describeTuning({}, 8 * GB).settings);
    const big = byKey(describeTuning({}, 32 * GB).settings);
    expect(small.antigravityWarmMax?.default).toBe(2);
    expect(big.antigravityWarmMax?.default).toBe(8);
    const set = byKey(describeTuning({ antigravityWarmMax: 3, antigravityWarmIdleSeconds: 90 }, 16 * GB).settings);
    expect(set.antigravityWarmMax).toMatchObject({ value: 3, effective: 3, default: 4 });
    expect(set.antigravityWarmIdleSeconds).toMatchObject({ value: 90, effective: 90, default: 180 });
  });

  it('a stored zero is a real value (keep none), not "unset"', () => {
    const s = byKey(describeTuning({ antigravityWarmMax: 0 }, 16 * GB).settings);
    expect(s.antigravityWarmMax).toMatchObject({ value: 0, effective: 0 });
  });

  it('reports the memory the default was computed from, in whole GB', () => {
    expect(describeTuning({}, 16 * GB).memoryGb).toBe(16);
    expect(describeTuning({}, 17.4 * GB).memoryGb).toBe(17);
  });

  it('keeps the daemon ceiling and the registry in step', () => {
    expect(WARM_AGENT_MAX_PARKED_CEILING).toBe(APP_CONFIG_TUNING.antigravityWarmMax.max);
  });
});
