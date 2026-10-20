// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProjectNotebookDialog } from '../../src/components/ProjectNotebookDialog';
import { I18nProvider } from '../../src/i18n';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ProjectNotebookDialog', () => {
  it('shows the notebook and saves the person\'s edit', async () => {
    const calls: Array<{ method: string; body?: string }> = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      calls.push({ method: init?.method ?? 'GET', body: init?.body as string | undefined });
      return new Response(JSON.stringify({ projectId: 'p1', text: '# Notebook\n\n- hecho\n' }), { status: 200 });
    }));
    render(
      <I18nProvider initial="es-ES">
        <ProjectNotebookDialog projectId="p1" projectName="Cafetería" onClose={vi.fn()} />
      </I18nProvider>,
    );
    const area = await screen.findByTestId('project-notebook-text') as HTMLTextAreaElement;
    expect(area.value).toContain('- hecho');
    fireEvent.change(area, { target: { value: '# Notebook\n\n- corregido\n' } });
    fireEvent.click(screen.getByTestId('project-notebook-save'));
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    expect(calls.find((c) => c.method === 'PUT')?.body).toContain('corregido');
  });
});
