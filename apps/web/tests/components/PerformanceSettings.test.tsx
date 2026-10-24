// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppConfigTuningResponse } from '@open-design/contracts';

import { PerformanceSettings } from '../../src/components/PerformanceSettings';

vi.mock('../../src/i18n', () => ({
  useT: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}));

function tuning(over: { max?: number | null; idle?: number | null } = {}): AppConfigTuningResponse {
  const max = over.max === undefined ? null : over.max;
  const idle = over.idle === undefined ? null : over.idle;
  return {
    memoryGb: 16,
    settings: [
      { key: 'antigravityWarmMax', value: max, effective: max ?? 4, default: 4, min: 0, max: 16, unit: 'processes' },
      { key: 'antigravityWarmIdleSeconds', value: idle, effective: idle ?? 180, default: 180, min: 5, max: 3600, unit: 'seconds' },
    ],
  };
}

type Call = { method: string; url: string; body: unknown };

describe('PerformanceSettings', () => {
  let calls: Call[];
  let current: AppConfigTuningResponse;
  let failLoad = false;

  beforeEach(() => {
    calls = [];
    current = tuning();
    failLoad = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
        if (url === '/api/app-config/tuning') {
          if (failLoad) return new Response('{}', { status: 500 });
          return new Response(JSON.stringify(current), { status: 200 });
        }
        if (method === 'PUT') {
          const body = JSON.parse(String(init?.body));
          current = tuning({
            max: body.antigravityWarmMax ?? current.settings[0]!.value,
            idle: body.antigravityWarmIdleSeconds ?? current.settings[1]!.value,
          });
          return new Response(JSON.stringify({ config: {} }), { status: 200 });
        }
        if (method === 'DELETE') {
          current = url.endsWith('antigravityWarmMax')
            ? tuning({ max: null, idle: current.settings[1]!.value })
            : tuning({ max: current.settings[0]!.value, idle: null });
          return new Response(JSON.stringify({ config: {}, removed: true }), { status: 200 });
        }
        return new Response('{}', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const open = async () => {
    render(<PerformanceSettings />);
    const details = screen.getByTestId('settings-performance') as HTMLDetailsElement;
    details.open = true;
    fireEvent(details, new Event('toggle'));
    await screen.findByTestId('tuning-input-antigravityWarmMax');
  };
  const maxInput = () => screen.getByTestId('tuning-input-antigravityWarmMax') as HTMLInputElement;

  it('starts folded and reads nothing from the daemon until it is opened', () => {
    render(<PerformanceSettings />);
    const details = screen.getByTestId('settings-performance') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(calls).toEqual([]);
  });

  it('shows the effective value of each setting and where the default comes from', async () => {
    await open();
    expect(maxInput().value).toBe('4');
    expect((screen.getByTestId('tuning-input-antigravityWarmIdleSeconds') as HTMLInputElement).value).toBe('180');
    expect(screen.getByTestId('tuning-default-antigravityWarmMax').textContent).toContain('settings.tuningDefaultFromMemory');
    expect(screen.getByTestId('tuning-default-antigravityWarmMax').textContent).toContain('"gb":16');
    expect(screen.getByTestId('tuning-default-antigravityWarmIdleSeconds').textContent).toContain('settings.tuningDefault:');
  });

  it('limits the inputs to the range the daemon reports', async () => {
    await open();
    expect(maxInput().min).toBe('0');
    expect(maxInput().max).toBe('16');
    const idle = screen.getByTestId('tuning-input-antigravityWarmIdleSeconds') as HTMLInputElement;
    expect([idle.min, idle.max]).toEqual(['5', '3600']);
  });

  it('saves a valid whole number when the field loses focus, then shows what the daemon now reports', async () => {
    await open();
    fireEvent.change(maxInput(), { target: { value: '3' } });
    fireEvent.blur(maxInput());
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    expect(calls.find((c) => c.method === 'PUT')).toMatchObject({ url: '/api/app-config', body: { antigravityWarmMax: 3 } });
    await waitFor(() => expect((screen.getByTestId('tuning-restore-antigravityWarmMax') as HTMLButtonElement).disabled).toBe(false));
  });

  it('saves with Enter as well', async () => {
    await open();
    fireEvent.change(maxInput(), { target: { value: '0' } });
    fireEvent.keyDown(maxInput(), { key: 'Enter' });
    await waitFor(() => expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({ antigravityWarmMax: 0 }));
  });

  it.each(['17', '-1', 'abc', '2.5', ''])('does not send %j and says what is allowed', async (typed) => {
    await open();
    fireEvent.change(maxInput(), { target: { value: typed } });
    fireEvent.blur(maxInput());
    await screen.findByTestId('tuning-error-antigravityWarmMax');
    expect(screen.getByTestId('tuning-error-antigravityWarmMax').textContent).toContain('settings.tuningSaveError');
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
  });

  it('does nothing when the field is left with the value it already had', async () => {
    await open();
    fireEvent.blur(maxInput());
    await Promise.resolve();
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
  });

  it('restores the default with a DELETE, only when something is stored', async () => {
    current = tuning({ max: 3 });
    await open();
    const idleRestore = screen.getByTestId('tuning-restore-antigravityWarmIdleSeconds') as HTMLButtonElement;
    expect(idleRestore.disabled).toBe(true);
    const restore = screen.getByTestId('tuning-restore-antigravityWarmMax') as HTMLButtonElement;
    expect(restore.disabled).toBe(false);
    fireEvent.click(restore);
    await waitFor(() =>
      expect(calls).toContainEqual({ method: 'DELETE', url: '/api/app-config/antigravityWarmMax', body: undefined }),
    );
    await waitFor(() => expect(maxInput().value).toBe('4'));
    expect((screen.getByTestId('tuning-restore-antigravityWarmMax') as HTMLButtonElement).disabled).toBe(true);
  });

  it('says so when the daemon cannot be read', async () => {
    failLoad = true;
    render(<PerformanceSettings />);
    const details = screen.getByTestId('settings-performance') as HTMLDetailsElement;
    details.open = true;
    fireEvent(details, new Event('toggle'));
    const error = await screen.findByTestId('tuning-load-error');
    expect(error.textContent).toContain('settings.tuningLoadError');
  });
});
