// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatStatusPanel, ChatStatusToggle } from '../../src/components/ChatStatusPanel';
import { I18nProvider } from '../../src/i18n';
import {
  formatElapsed,
  type StatusBackgroundItem,
  type StatusPanelState,
} from '../../src/runtime/chat/status-panel';

const empty: StatusPanelState = { delivery: null, tasks: null, background: null, changes: null, isEmpty: true };

function item(runId: string, status: StatusBackgroundItem['status'], over: Partial<StatusBackgroundItem> = {}) {
  return {
    runId,
    conversationId: `c-${runId}`,
    agent: { id: 'a1', name: 'Diseño', emoji: '🎨' },
    status,
    createdAt: Date.now(),
    terminalAt: null,
    ...over,
  };
}

function renderPanel(state: Partial<StatusPanelState>, handlers = {}) {
  const onOpenFile = vi.fn();
  const onOpenConversation = vi.fn();
  render(
    <I18nProvider initial="es-ES">
      <ChatStatusPanel
        state={{ ...empty, ...state, isEmpty: false }}
        onOpenFile={onOpenFile}
        onOpenConversation={onOpenConversation}
        {...handlers}
      />
    </I18nProvider>,
  );
  return { onOpenFile, onOpenConversation };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('ChatStatusPanel', () => {
  it('draws only the sections that have something in them', () => {
    renderPanel({ changes: { count: 1, files: [{ name: 'a.pdf', kind: 'pdf', mtime: 1 }] } });
    expect(screen.getByTestId('status-changes')).toBeTruthy();
    expect(screen.queryByTestId('status-tasks')).toBeNull();
    expect(screen.queryByTestId('status-background')).toBeNull();
  });

  it('shows the plan with its progress and which step is running', () => {
    renderPanel({
      tasks: {
        completed: 1,
        total: 3,
        items: [
          { content: 'Leer el brief', mark: 'done' },
          { content: 'Diseñar el hero', mark: 'running' },
          { content: 'Revisar', mark: 'pending' },
        ],
      },
    });
    const section = screen.getByTestId('status-tasks');
    expect(section.textContent).toContain('Tareas');
    expect(section.textContent).toContain('1 de 3');
    expect(section.querySelector('[data-mark="running"]')?.textContent).toBe('Diseñar el hero');
    expect(section.querySelector('[data-mark="done"]')).toBeTruthy();
  });

  it('lists what is working in the background with how long it has been going', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-18T12:00:42Z'));
    const created = new Date('2026-10-18T12:00:00Z').getTime();
    renderPanel({
      background: { running: [item('r1', 'running', { createdAt: created })], finished: [] },
    });
    const section = screen.getByTestId('status-background');
    expect(section.textContent).toContain('🎨 Diseño');
    expect(section.textContent).toContain('42s');
  });

  it('counts the finished ones and shows them only when asked', () => {
    renderPanel({
      background: { running: [], finished: [item('r1', 'succeeded'), item('r2', 'failed')] },
    });
    expect(screen.getByTestId('status-finished-toggle').textContent).toBe('2 finalizados');
    expect(screen.queryByText('Terminó')).toBeNull();

    fireEvent.click(screen.getByTestId('status-finished-toggle'));

    expect(screen.getByText('Terminó')).toBeTruthy();
    expect(screen.getByText('Falló')).toBeTruthy();
  });

  it('says "1 finalizado" in the singular', () => {
    renderPanel({ background: { running: [], finished: [item('r1', 'succeeded')] } });
    expect(screen.getByTestId('status-finished-toggle').textContent).toBe('1 finalizado');
  });

  it('opens the conversation of an agent that is working', () => {
    const { onOpenConversation } = renderPanel({
      background: { running: [item('r1', 'running')], finished: [] },
    });
    fireEvent.click(screen.getByRole('button', { name: /Abrir conversación: 🎨 Diseño/ }));
    expect(onOpenConversation).toHaveBeenCalledWith('c-r1');
  });

  it('opens a changed file in the preview', () => {
    const { onOpenFile } = renderPanel({
      changes: { count: 2, files: [{ name: 'a.pdf', kind: 'pdf', mtime: 2 }, { name: 'b.md', kind: 'text', mtime: 1 }] },
    });
    expect(screen.getByTestId('status-changes').textContent).toContain('2 archivos');
    fireEvent.click(screen.getByTestId('status-change-a.pdf'));
    expect(onOpenFile).toHaveBeenCalledWith('a.pdf');
  });

  it('folds a section away from its header', () => {
    renderPanel({ changes: { count: 1, files: [{ name: 'a.pdf', kind: 'pdf', mtime: 1 }] } });
    const header = screen.getByRole('button', { name: /Cambios/ });
    expect(header.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(header);

    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('status-change-a.pdf')).toBeNull();
  });

  it('keeps the elapsed time moving while something is running', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-18T12:00:00Z'));
    renderPanel({
      background: { running: [item('r1', 'running', { createdAt: Date.now() })], finished: [] },
    });
    expect(screen.getByTestId('status-background').textContent).toContain('0s');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(screen.getByTestId('status-background').textContent).toContain('5s');
  });
});

describe('ChatStatusToggle', () => {
  it('says what it will do and reports being pressed', () => {
    const onToggle = vi.fn();
    render(<I18nProvider initial="es-ES"><ChatStatusToggle shown onToggle={onToggle} /></I18nProvider>);
    const button = screen.getByRole('button', { name: 'Ocultar estado' });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalled();
  });

  it('offers to show the panel when it is hidden', () => {
    render(<I18nProvider initial="es-ES"><ChatStatusToggle shown={false} onToggle={() => undefined} /></I18nProvider>);
    expect(screen.getByRole('button', { name: 'Mostrar estado' })).toBeTruthy();
  });
});

describe('formatElapsed', () => {
  it('is coarse on purpose', () => {
    expect(formatElapsed(-5)).toBe('0s');
    expect(formatElapsed(42_000)).toBe('42s');
    expect(formatElapsed(3 * 60_000 + 5000)).toBe('3 min');
    expect(formatElapsed(2 * 3_600_000)).toBe('2 h');
  });
});

describe('ChatStatusPanel — staged delivery', () => {
  const tasks = { items: [{ content: 'Diseño', mark: 'done' as const }, { content: 'Publicar', mark: 'pending' as const }], completed: 1, total: 2 };

  it('offers the next move as a button that sends the user\'s reply', () => {
    const onSendMessage = vi.fn();
    renderPanel(
      { tasks, delivery: { action: { kind: 'continue', stageName: 'Construir' }, finished: false } },
      { onSendMessage },
    );
    fireEvent.click(screen.getByTestId('delivery-action-continue'));
    expect(onSendMessage).toHaveBeenCalledWith('Continúa con la siguiente etapa: Construir.');
  });

  it('publishing is its own button with its own explicit yes', () => {
    const onSendMessage = vi.fn();
    renderPanel({ tasks, delivery: { action: { kind: 'publish' }, finished: false } }, { onSendMessage });
    fireEvent.click(screen.getByTestId('delivery-action-publish'));
    expect(onSendMessage).toHaveBeenCalledWith('Sí, publica el resultado.');
  });

  it('shows no button when there is no next move or nothing to send with', () => {
    renderPanel({ tasks, delivery: { action: null, finished: false } }, { onSendMessage: vi.fn() });
    expect(screen.queryByTestId('delivery-action-continue')).toBeNull();
    cleanup();
    renderPanel({ tasks, delivery: { action: { kind: 'retry', stageName: 'X' }, finished: false } });
    expect(screen.queryByTestId('delivery-action-retry')).toBeNull();
  });
});

