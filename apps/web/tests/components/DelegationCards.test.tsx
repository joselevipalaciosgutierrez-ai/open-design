// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunDelegate } from '@open-design/contracts';

const navigateMock = vi.hoisted(() => vi.fn());
vi.mock('../../src/router', () => ({ navigate: navigateMock }));

import { DelegationCards } from '../../src/components/agents/DelegationCards';
import { I18nProvider } from '../../src/i18n';
import { resetRunDelegatesCache } from '../../src/state/run-delegates';

function delegate(over: Partial<RunDelegate> & { runId: string }): RunDelegate {
  return {
    status: 'succeeded',
    createdAt: 1,
    terminalAt: 2,
    conversationId: `conv-${over.runId}`,
    depth: 1,
    agent: { id: 'a1', name: 'Diseño', emoji: '🎨' },
    ...over,
  };
}

function stub(delegates: Record<string, RunDelegate[]>) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ delegates }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  resetRunDelegatesCache();
  navigateMock.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('DelegationCards', () => {
  it('renders nothing for a turn that delegated nothing', async () => {
    const fetchMock = stub({});
    render(<I18nProvider initial="es-ES"><DelegationCards projectId="p1" runId="r1" live={false} /></I18nProvider>);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByTestId('delegation-cards')).toBeNull();
  });

  it('shows who the orchestrator delegated to and how each one ended', async () => {
    stub({
      r1: [
        delegate({ runId: 'c1' }),
        delegate({ runId: 'c2', status: 'running', terminalAt: null, agent: null }),
        delegate({ runId: 'c3', status: 'failed', agent: { id: 'a2', name: 'QA', emoji: null } }),
      ],
    });
    render(<I18nProvider initial="es-ES"><DelegationCards projectId="p1" runId="r1" live={false} /></I18nProvider>);

    expect((await screen.findByTestId('delegation-cards')).textContent).toContain('El orquestador delegó');
    expect(screen.getByTestId('delegation-card-c1').textContent).toContain('🎨 Diseño');
    expect(screen.getByTestId('delegation-card-c1').textContent).toContain('Terminó');
    // An unassigned worker has no agent to name.
    expect(screen.getByTestId('delegation-card-c2').textContent).toContain('Ayudante');
    expect(screen.getByTestId('delegation-card-c2').textContent).toContain('Trabajando');
    expect(screen.getByTestId('delegation-card-c3').textContent).toContain('Falló');
  });

  it('opens the delegate\'s own conversation', async () => {
    stub({ r1: [delegate({ runId: 'c1' })] });
    render(<I18nProvider initial="es-ES"><DelegationCards projectId="p1" runId="r1" live={false} /></I18nProvider>);

    fireEvent.click(await screen.findByRole('button', { name: 'Abrir conversación' }));

    expect(navigateMock).toHaveBeenCalledWith({
      kind: 'project',
      projectId: 'p1',
      conversationId: 'conv-c1',
      fileName: null,
    });
  });

  it('asks for every turn of a conversation in one request', async () => {
    const fetchMock = stub({});
    render(
      <I18nProvider initial="es-ES">
        <DelegationCards projectId="p1" runId="r1" live={false} />
        <DelegationCards projectId="p1" runId="r2" live={false} />
        <DelegationCards projectId="p1" runId="r3" live={false} />
      </I18nProvider>,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const url = String((fetchMock.mock.calls[0] as unknown[])[0]);
    expect(url).toContain('/api/projects/p1/run-delegates?parentRunIds=');
    for (const id of ['r1', 'r2', 'r3']) expect(url).toContain(id);
  });

  it('keeps polling while a delegate is working, and updates the card when it finishes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ delegates: { r1: [delegate({ runId: 'c1', status: 'running', terminalAt: null })] } })),
      )
      .mockResolvedValue(
        new Response(JSON.stringify({ delegates: { r1: [delegate({ runId: 'c1', status: 'succeeded' })] } })),
      );
    vi.stubGlobal('fetch', fetchMock);

    render(<I18nProvider initial="es-ES"><DelegationCards projectId="p1" runId="r1" live={false} /></I18nProvider>);
    expect((await screen.findByTestId('delegation-card-c1')).textContent).toContain('Trabajando');

    await waitFor(
      () => expect(screen.getByTestId('delegation-card-c1').textContent).toContain('Terminó'),
      { timeout: 6000 },
    );
  }, 12000);

  it('treats a response of another shape as no delegates instead of throwing', async () => {
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => rejections.push(reason);
    process.on('unhandledRejection', onRejection);
    try {
      for (const body of ['{}', 'null', '"x"', '<html>not json</html>']) {
        resetRunDelegatesCache();
        vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 200 })));
        const { unmount } = render(<I18nProvider initial="es-ES"><DelegationCards projectId="p1" runId="r1" live={false} /></I18nProvider>);
        await new Promise((r) => setTimeout(r, 120));
        expect(screen.queryByTestId('delegation-cards'), body).toBeNull();
        unmount();
      }
      await new Promise((r) => setTimeout(r, 20));
    } finally {
      process.off('unhandledRejection', onRejection);
    }
    expect(rejections).toEqual([]);
  });

  it('does not fetch without a run to ask about', () => {
    const fetchMock = stub({});
    render(<I18nProvider initial="es-ES"><DelegationCards projectId="p1" runId={null} live /></I18nProvider>);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
