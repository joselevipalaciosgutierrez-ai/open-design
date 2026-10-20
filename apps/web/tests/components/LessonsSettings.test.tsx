// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LessonsSettings } from '../../src/components/appearance/LessonsSettings';
import { I18nProvider } from '../../src/i18n';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const lesson = {
  id: 'l1', rule: 'Run pnpm install before building', scope: 'agent', agentKey: 'design', projectIds: ['p1', 'p2'],
  agentKeys: ['design'], confirmations: 3, evidenceRunIds: [], createdAt: 1, updatedAt: 2, lastUsedAt: null,
};

describe('LessonsSettings', () => {
  it('lists what agents learned and removes one', async () => {
    const methods: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      methods.push(init?.method ?? 'GET');
      return new Response(JSON.stringify(init?.method === 'DELETE' ? { deleted: 'l1' } : { lessons: [lesson] }), { status: 200 });
    }));
    render(
      <I18nProvider initial="es-ES">
        <LessonsSettings />
      </I18nProvider>,
    );
    const item = await screen.findByTestId('lesson-item');
    expect(item.textContent).toContain('Run pnpm install before building');
    expect(item.textContent).toContain('Agente');
    expect(item.textContent).toContain('Siempre');
    fireEvent.click(screen.getByTestId('lesson-remove'));
    await waitFor(() => expect(screen.queryByTestId('lesson-item')).toBeNull());
    expect(methods).toContain('DELETE');
  });
});
