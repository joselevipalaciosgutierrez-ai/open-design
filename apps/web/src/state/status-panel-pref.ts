import { useCallback, useState } from 'react';

const STORAGE_KEY = 'od:chat-status-panel';

function read(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'hidden';
  } catch {
    return true;
  }
}

/**
 * Whether the user wants the status panel in Ask conversations. Shown by default;
 * hiding it is remembered. Only a preference: the panel still stays out of the
 * way when it has nothing to show.
 */
export function useStatusPanelPreference(): [boolean, (shown: boolean) => void] {
  const [shown, setShown] = useState<boolean>(read);
  const update = useCallback((next: boolean) => {
    setShown(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? 'shown' : 'hidden');
    } catch {
      // Storage can be unavailable; the choice then lasts until reload.
    }
  }, []);
  return [shown, update];
}
