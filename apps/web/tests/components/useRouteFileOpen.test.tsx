// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useRouteFileOpen } from '../../src/components/useRouteFileOpen';

afterEach(cleanup);

describe('useRouteFileOpen', () => {
  it('opens the file in the URL once', () => {
    const open = vi.fn();
    renderHook(({ file }) => useRouteFileOpen(file, open), { initialProps: { file: 'a.pdf' as string | null } });
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('a.pdf');
  });

  it('does not open anything when the URL has no file', () => {
    const open = vi.fn();
    renderHook(() => useRouteFileOpen(null, open));
    expect(open).not.toHaveBeenCalled();
  });

  it('does not reopen the file when only the opener changes, as it does on a mode switch', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ open }) => useRouteFileOpen('a.pdf', open), {
      initialProps: { open: first },
    });
    expect(first).toHaveBeenCalledTimes(1);

    rerender({ open: second });
    rerender({ open: vi.fn() });

    // The old behaviour called the new opener on every change of identity.
    expect(second).not.toHaveBeenCalled();
    expect(first).toHaveBeenCalledTimes(1);
  });

  it('opens the new file when the URL changes to another one', () => {
    const open = vi.fn();
    const { rerender } = renderHook(({ file }) => useRouteFileOpen(file, open), {
      initialProps: { file: 'a.pdf' as string | null },
    });

    rerender({ file: 'b.pdf' });

    expect(open.mock.calls.map((c) => c[0])).toEqual(['a.pdf', 'b.pdf']);
  });

  it('uses the latest opener when the file does change', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ file, open }) => useRouteFileOpen(file, open), {
      initialProps: { file: 'a.pdf' as string | null, open: first },
    });

    rerender({ file: 'b.pdf', open: second });

    expect(second).toHaveBeenCalledWith('b.pdf');
  });
});
