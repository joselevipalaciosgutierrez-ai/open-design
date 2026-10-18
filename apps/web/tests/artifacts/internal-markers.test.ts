import { describe, expect, it } from 'vitest';

import {
  findSwitchModeMarker,
  stripInternalControlMarkers,
} from '../../src/artifacts/internal-markers';

describe('stripInternalControlMarkers', () => {
  it('removes a leaked conversation-title marker from settled prose', () => {
    const text = [
      '我会使用 Open Design 技能把已确认的电商流程整理为可执行的原型计划。',
      '<od-title>LV奢侈品电商原型</od-title>',
      '目标已锁定为响应式 LV 奢侈品电商概念原型。',
    ].join('\n');

    const out = stripInternalControlMarkers(text);

    expect(out).not.toContain('od-title');
    expect(out).toContain('我会使用 Open Design 技能');
    expect(out).toContain('目标已锁定为响应式');
  });

  it('removes OD Next machine protocol blocks', () => {
    const text = [
      'Here is the plan.',
      '<open-design-plan-contract>{"schema":"open-design.plan-contract/v2"}</open-design-plan-contract>',
      '<open-design-runtime-state>{"schema":"open-design.strategy-state/v2"}</open-design-runtime-state>',
      'Done.',
    ].join('\n');

    const out = stripInternalControlMarkers(text);

    expect(out).not.toContain('open-design-plan-contract');
    expect(out).not.toContain('open-design-runtime-state');
    expect(out).not.toContain('plan-contract/v2');
    expect(out).toContain('Here is the plan.');
    expect(out).toContain('Done.');
  });

  it('hides a half-arrived marker while the turn is still streaming', () => {
    expect(stripInternalControlMarkers('Answer <od-tit', { streaming: true })).toBe('Answer ');
    expect(stripInternalControlMarkers('Answer <od-title>Par', { streaming: true })).toBe('Answer ');
  });

  it('keeps settled prose when a turn ended mid-marker', () => {
    // Deleting the remainder of a finished answer over one stray tag would lose
    // real content, so only the tag itself goes.
    const out = stripInternalControlMarkers('Lead <od-title>Trailing answer body');

    expect(out).toBe('Lead Trailing answer body');
  });

  it('leaves renderable artifacts alone', () => {
    const text = '<question-form>{"id":"discovery"}</question-form>\n<od-card>{"kind":"memory"}</od-card>';

    expect(stripInternalControlMarkers(text)).toBe(text);
  });

  it('returns text without markup untouched', () => {
    expect(stripInternalControlMarkers('plain answer')).toBe('plain answer');
    expect(stripInternalControlMarkers('')).toBe('');
  });
});

describe('switch-mode marker', () => {
  it('is hidden from the reader like the other internal markers', () => {
    const text = 'Perfecto, abro el modo Diseño.\n<od-switch-mode>design</od-switch-mode>';

    expect(stripInternalControlMarkers(text)).toBe('Perfecto, abro el modo Diseño.\n');
  });

  it('is hidden while it is still streaming in', () => {
    expect(
      stripInternalControlMarkers('Listo.\n<od-switch-mode>des', { streaming: true }),
    ).toBe('Listo.\n');
  });

  it('is found only when it asks for Design', () => {
    expect(findSwitchModeMarker('ok\n<od-switch-mode>design</od-switch-mode>')).toBe('design');
    expect(findSwitchModeMarker('<od-switch-mode> Design </od-switch-mode>')).toBe('design');
    expect(findSwitchModeMarker('<od-switch-mode>plan</od-switch-mode>')).toBeNull();
    expect(findSwitchModeMarker('no marker here')).toBeNull();
  });
});
