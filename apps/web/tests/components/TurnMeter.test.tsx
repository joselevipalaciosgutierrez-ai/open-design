// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatTokens, reportedUsageFromEvents, TurnMeter } from '../../src/components/TurnMeter';
import { I18nProvider } from '../../src/i18n';

const budget = {
  runId: 'run-1',
  agentId: 'antigravity',
  model: null,
  resumed: true,
  rulesResent: false,
  historyCompacted: false,
  mode: 'design',
  sent: { rules: 0, skills: 120, designSystem: 0, history: 0, message: 40, total: 160 },
  sections: [{ kind: 'daemonSystemPrompt', tokens: 12870 }, { kind: 'skillPrompt', tokens: 1537 }],
  timings: { prepareMs: 200, launchMs: 300, firstTokenMs: 2500, totalMs: 6100 },
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) =>
    url === '/api/runs/run-1/budget'
      ? new Response(JSON.stringify(budget), { status: 200 })
      : new Response('{}', { status: 404 }),
  ));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('reportedUsageFromEvents', () => {
  it('takes the run usage and adds up the cached tokens', () => {
    expect(
      reportedUsageFromEvents([
        { kind: 'request_usage', requestId: 'a', cacheReadInputTokens: 800 },
        { kind: 'request_usage', requestId: 'b', cacheReadInputTokens: 200 },
        { kind: 'usage', inputTokens: 9000, outputTokens: 300, durationMs: 4000 },
      ] as never),
    ).toEqual({ inputTokens: 9000, outputTokens: 300, durationMs: 4000, cachedTokens: 1000 });
  });

  it('is null when the CLI reported nothing', () => {
    expect(reportedUsageFromEvents([])).toBeNull();
  });
});

describe('formatTokens', () => {
  it('reads like a person would say it', () => {
    expect(formatTokens(640)).toBe('640');
    expect(formatTokens(8726)).toBe('8.7k');
    expect(formatTokens(18171)).toBe('18k');
  });
});

describe('TurnMeter', () => {
  it('shows the reported total and opens the breakdown on click', async () => {
    render(
      <I18nProvider initial="es-ES">
        <TurnMeter runId="run-1" usage={{ inputTokens: 9000, outputTokens: 300 }} />
      </I18nProvider>,
    );
    expect(screen.getByTestId('turn-meter').textContent).toContain('9.3k');
    fireEvent.click(screen.getByTestId('turn-meter'));
    await waitFor(() => expect(screen.getByTestId('turn-meter-panel').textContent).toContain('Retomó su sesión'));
    const panel = screen.getByTestId('turn-meter-panel').textContent ?? '';
    expect(panel).toContain('Skills');
    expect(panel).not.toContain('Reglas de la app');
    expect(panel).toContain('Hasta la primera palabra');
    expect(panel).toContain('2.5 s');
    expect(panel).toContain('Modo: Diseño');
    expect(panel).toContain('Instrucciones del modo');
    expect(panel).toContain('13k');
  });

  it('says so when a reply has no reading', async () => {
    render(
      <I18nProvider initial="es-ES">
        <TurnMeter runId="run-2" usage={null} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByTestId('turn-meter'));
    await waitFor(() => expect(screen.getByTestId('turn-meter-panel').textContent).toContain('no tiene medición'));
  });
});
