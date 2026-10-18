// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DevStyleGuard } from '../../src/dev/DevStyleGuard';

function addSheet(path: string): HTMLLinkElement {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `http://localhost/_next/static/css/${path}`;
  document.head.appendChild(link);
  return link;
}

async function settle(ms = 1700) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  document.head.querySelectorAll('link').forEach((l) => l.remove());
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('DevStyleGuard', () => {
  it('reloads when a stylesheet chunk disappears and is not replaced', async () => {
    const reload = vi.fn();
    addSheet('app/layout.css?v=1');
    const lazy = addSheet('chunk-entry.css');
    render(<DevStyleGuard enabled reload={reload} />);

    lazy.remove();
    await settle();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload when a chunk is swapped for the same file with a new cache-buster', async () => {
    const reload = vi.fn();
    const first = addSheet('chunk-entry.css?v=1');
    render(<DevStyleGuard enabled reload={reload} />);

    first.remove();
    addSheet('chunk-entry.css?v=2');
    await settle();

    expect(reload).not.toHaveBeenCalled();
  });

  it('does not reload when a chunk loads later', async () => {
    const reload = vi.fn();
    addSheet('app/layout.css');
    render(<DevStyleGuard enabled reload={reload} />);

    addSheet('chunk-later.css');
    await settle();

    expect(reload).not.toHaveBeenCalled();
  });

  it('gives up after a few reloads instead of looping', async () => {
    const reload = vi.fn();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (let i = 0; i < 6; i += 1) {
      const sheet = addSheet(`chunk-${i}.css`);
      const { unmount } = render(<DevStyleGuard enabled reload={reload} />);
      sheet.remove();
      await settle();
      unmount();
    }

    expect(reload).toHaveBeenCalledTimes(3);
  });

  it('does nothing when disabled, as in production', async () => {
    const reload = vi.fn();
    const lazy = addSheet('chunk-entry.css');
    render(<DevStyleGuard enabled={false} reload={reload} />);

    lazy.remove();
    await settle();

    expect(reload).not.toHaveBeenCalled();
  });

  it('renders nothing', () => {
    const { container } = render(<DevStyleGuard enabled={false} />);
    expect(container.innerHTML).toBe('');
  });
});
