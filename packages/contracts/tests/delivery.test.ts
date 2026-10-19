import { describe, expect, it } from 'vitest';

import {
  checkDeliveryUpdate,
  parseDeliveryFile,
  summarizeDelivery,
} from '../src/api/delivery.js';

const file = (stages: unknown[], goal = 'Landing') => JSON.stringify({ goal, stages });
const stage = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: `Stage ${id}`,
  agent: 'a1',
  deliverable: `${id}.md`,
  status: 'pending',
  ...over,
});

describe('parseDeliveryFile', () => {
  it('reads a well-formed file', () => {
    const { state, issues } = parseDeliveryFile(file([stage('design'), stage('build', { status: 'running' })]));
    expect(issues).toEqual([]);
    expect(state?.stages.map((s) => [s.id, s.status])).toEqual([['design', 'pending'], ['build', 'running']]);
  });

  it('never throws and says what is wrong', () => {
    expect(parseDeliveryFile('{nope').issues).toEqual(['DELIVERY.json is not valid JSON']);
    expect(parseDeliveryFile('[]').state).toBeNull();
    expect(parseDeliveryFile('{"goal":"x"}').issues[0]).toContain('no "stages"');
  });

  it('keeps usable stages and reports bad ones', () => {
    const { state, issues } = parseDeliveryFile(
      file([stage('a'), { name: 'no id' }, stage('a'), stage('b', { status: 'finished' })]),
    );
    expect(state?.stages.map((s) => s.id)).toEqual(['a', 'b']);
    expect(state?.stages[1]?.status).toBe('pending');
    expect(issues.join(' ')).toContain('has no id');
    expect(issues.join(' ')).toContain('is repeated');
    expect(issues.join(' ')).toContain('unknown status');
  });
});

describe('checkDeliveryUpdate', () => {
  const before = parseDeliveryFile(file([stage('design'), stage('build')])).state!;

  it('allows status, notes and a reassigned agent to move, and stages to be appended', () => {
    const after = parseDeliveryFile(
      file([stage('design', { status: 'done', notes: 'ok' }), stage('build', { agent: 'a2' }), stage('verify')]),
    ).state!;
    expect(checkDeliveryUpdate(before, after)).toEqual([]);
  });

  it('refuses to delete, reorder, rename or reword to make a stage pass', () => {
    const removed = parseDeliveryFile(file([stage('build')])).state!;
    expect(checkDeliveryUpdate(before, removed).join(' ')).toContain('removed or moved');
    const renamed = parseDeliveryFile(file([stage('design', { name: 'Easier' }), stage('build')])).state!;
    expect(checkDeliveryUpdate(before, renamed).join(' ')).toContain('renamed');
    const reworded = parseDeliveryFile(file([stage('design'), stage('build')], 'Another goal')).state!;
    expect(checkDeliveryUpdate(before, reworded)).toContain('the goal was reworded');
  });
});

describe('summarizeDelivery', () => {
  it('points at the next unfinished stage and reports progress', () => {
    const s = summarizeDelivery(
      parseDeliveryFile(file([stage('a', { status: 'done' }), stage('b'), stage('c')])),
    );
    expect(s).toMatchObject({ present: true, completed: 1, total: 3, finished: false, blocked: false });
    expect(s.next?.id).toBe('b');
  });

  it('flags a blocked stage and a finished delivery', () => {
    expect(
      summarizeDelivery(parseDeliveryFile(file([stage('a', { status: 'blocked' })]))).blocked,
    ).toBe(true);
    expect(
      summarizeDelivery(parseDeliveryFile(file([stage('a', { status: 'done' })]))).finished,
    ).toBe(true);
    expect(summarizeDelivery(parseDeliveryFile('x')).present).toBe(false);
  });
});
