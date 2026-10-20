// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LevOrders } from '../../../src/components/lev/LevOrders';
import { I18nProvider } from '../../../src/i18n';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('LevOrders', () => {
  it('shows each order as a card with its project, title and status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      orders: [
        { runId: 'r1', projectId: 'p1', projectName: 'Cafetería', conversationId: 'c1', conversationTitle: 'Lev: pantalla de inicio', agentId: 'claude', status: 'succeeded', createdAt: 1, terminalAt: 2 },
      ],
    }), { status: 200 })));
    render(
      <I18nProvider initial="es-ES">
        <LevOrders runId="lev-run" live={false} />
      </I18nProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('lev-orders').textContent).toContain('Cafetería'));
    const card = screen.getByTestId('lev-orders').textContent ?? '';
    expect(card).toContain('Lev: pantalla de inicio');
    expect(card).toContain('Listo');
    expect(screen.getByTestId('lev-order-open')).toBeTruthy();
  });

  it('shows nothing for a turn that gave no orders', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ orders: [] }), { status: 200 })));
    const { container } = render(
      <I18nProvider initial="es-ES">
        <LevOrders runId="lev-run" live={false} />
      </I18nProvider>,
    );
    await waitFor(() => expect(vi.mocked(globalThis.fetch)).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });
});
