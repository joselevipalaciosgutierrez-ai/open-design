import { useCallback, useEffect, useRef, type PointerEvent } from 'react';

/** How long a button has to be held before it counts as a long press. */
export const LONG_PRESS_MS = 600;

/**
 * Pointer handlers that fire `onLongPress` once a button has been held for
 * `LONG_PRESS_MS`. A long press must not also act as a click, so `consumeClick`
 * reports (once) whether the click that follows the release should be ignored.
 *
 * Moving the pointer off the button, releasing early, or cancelling the touch
 * all abort the press, so a plain tap or a scroll never opens anything.
 */
export function useLongPress(onLongPress: () => void, ms: number = LONG_PRESS_MS) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const latest = useRef(onLongPress);
  latest.current = onLongPress;

  const cancel = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => cancel, [cancel]);

  const onPointerDown = useCallback(
    (event: PointerEvent) => {
      if (event.button !== 0) return;
      fired.current = false;
      cancel();
      timer.current = setTimeout(() => {
        timer.current = null;
        fired.current = true;
        latest.current();
      }, ms);
    },
    [cancel, ms],
  );

  /** True once after a long press, so the trailing click can be swallowed. */
  const consumeClick = useCallback(() => {
    const wasLong = fired.current;
    fired.current = false;
    return wasLong;
  }, []);

  return {
    handlers: {
      onPointerDown,
      onPointerUp: cancel,
      onPointerLeave: cancel,
      onPointerCancel: cancel,
    },
    consumeClick,
  };
}
