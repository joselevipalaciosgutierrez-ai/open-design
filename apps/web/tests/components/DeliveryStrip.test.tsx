// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DeliveryStrip } from '../../src/components/delivery/DeliveryStrip';
import { deliveryStripView } from '../../src/components/delivery/delivery-strip-state';
import { I18nProvider } from '../../src/i18n';

afterEach(cleanup);

const stage = (id: string, status: string, name = `Etapa ${id}`) => ({
  id, name, agent: null, deliverable: null, status, notes: null,
});
function delivery(stages: ReturnType<typeof stage>[]) {
  const done = stages.filter((s) => s.status === 'done').length;
  const next = stages.find((s) => s.status !== 'done') ?? null;
  return {
    present: true, goal: 'g', stages, next, completed: done, total: stages.length,
    finished: next === null, blocked: stages.some((s) => s.status === 'blocked'), issues: [], violations: [],
  } as never;
}

function renderStrip(d: unknown, runActive = false, onSendMessage = vi.fn(), locale: 'es-ES' | 'en' = 'es-ES') {
  render(
    <I18nProvider initial={locale}>
      <DeliveryStrip delivery={d as never} runActive={runActive} onSendMessage={onSendMessage} />
    </I18nProvider>,
  );
  return onSendMessage;
}

describe('deliveryStripView', () => {
  it('is null without a delivery', () => {
    expect(deliveryStripView(null, false)).toBeNull();
    expect(deliveryStripView({ present: false, stages: [] } as never, false)).toBeNull();
  });

  it('focuses the blocked stage over the next one', () => {
    const view = deliveryStripView(
      delivery([stage('a', 'done'), stage('b', 'pending'), stage('c', 'blocked')]),
      false,
    );
    expect(view?.blocked).toBe(true);
    expect(view?.focus?.name).toBe('Etapa c');
    expect(view?.action).toEqual({ kind: 'retry', stageName: 'Etapa c' });
  });

  it('is ready to publish once everything before it is done', () => {
    const view = deliveryStripView(delivery([stage('build', 'done'), stage('publish', 'pending')]), false);
    expect(view?.readyToPublish).toBe(true);
    expect(view?.action).toEqual({ kind: 'publish' });
  });
});

describe('DeliveryStrip', () => {
  it('renders nothing when there is no delivery', () => {
    renderStrip(null);
    expect(screen.queryByTestId('delivery-strip')).toBeNull();
  });

  it('says how far it is and what is next, with the stages folded away', () => {
    renderStrip(delivery([stage('design', 'done'), stage('build', 'pending'), stage('publish', 'pending')]));
    expect(screen.getByTestId('delivery-strip').textContent).toContain('Entrega');
    expect(screen.getByTestId('delivery-strip').textContent).toContain('1 de 3');
    expect(screen.getByTestId('delivery-strip').textContent).toContain('Etapa build');
    expect(screen.getByTestId('delivery-strip-toggle').getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(screen.getByTestId('delivery-strip-toggle'));
    expect(screen.getByTestId('delivery-strip-toggle').getAttribute('aria-expanded')).toBe('true');
  });

  it('sends the user\'s reply from the one next move, and offers none while a run works', () => {
    const d = delivery([stage('design', 'done'), stage('build', 'pending'), stage('publish', 'pending')]);
    const onSend = renderStrip(d);
    fireEvent.click(screen.getByTestId('delivery-strip-action-continue'));
    expect(onSend).toHaveBeenCalledWith('Continúa con la siguiente etapa: Etapa build.');
    cleanup();
    renderStrip(d, true);
    expect(screen.queryByTestId('delivery-strip-action-continue')).toBeNull();
  });

  it('publishing has its own button and the "ready" line', () => {
    const onSend = renderStrip(delivery([stage('build', 'done'), stage('publish', 'pending')]));
    expect(screen.getByTestId('delivery-strip').textContent).toContain('Lista para publicar');
    fireEvent.click(screen.getByTestId('delivery-strip-action-publish'));
    expect(onSend).toHaveBeenCalledWith('Sí, publica el resultado.');
  });

  it('marks a blocked delivery and offers to retry, in English too', () => {
    const onSend = renderStrip(delivery([stage('build', 'blocked', 'Build')]), false, vi.fn(), 'en');
    expect(screen.getByTestId('delivery-strip').getAttribute('data-blocked')).toBe('true');
    expect(screen.getByTestId('delivery-strip').textContent).toContain('Blocked: Build');
    fireEvent.click(screen.getByTestId('delivery-strip-action-retry'));
    expect(onSend).toHaveBeenCalledWith('Retry the blocked stage: Build.');
  });
});
