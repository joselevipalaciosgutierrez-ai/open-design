// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useStatusPanelPreference } from '../../src/state/status-panel-pref';

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe('useStatusPanelPreference', () => {
  it('shows the panel by default', () => {
    expect(renderHook(() => useStatusPanelPreference()).result.current[0]).toBe(true);
  });

  it('remembers hiding it across loads', () => {
    const first = renderHook(() => useStatusPanelPreference());
    act(() => first.result.current[1](false));
    expect(first.result.current[0]).toBe(false);
    first.unmount();

    expect(renderHook(() => useStatusPanelPreference()).result.current[0]).toBe(false);
  });

  it('shows it again when the user turns it back on', () => {
    const hook = renderHook(() => useStatusPanelPreference());
    act(() => hook.result.current[1](false));
    act(() => hook.result.current[1](true));
    expect(window.localStorage.getItem('od:chat-status-panel')).toBe('shown');
    expect(renderHook(() => useStatusPanelPreference()).result.current[0]).toBe(true);
  });
});
