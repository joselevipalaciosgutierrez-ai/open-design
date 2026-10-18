// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LONG_PRESS_MS, useLongPress } from '../../src/components/agents/use-long-press';

function Probe({ onLong, onClick }: { onLong: () => void; onClick: () => void }) {
  const { handlers, consumeClick } = useLongPress(onLong);
  return (
    <button
      type="button"
      {...handlers}
      onClick={() => {
        if (consumeClick()) return;
        onClick();
      }}
    >
      hold me
    </button>
  );
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('useLongPress', () => {
  it('fires after the hold time and swallows the click that ends the press', () => {
    const onLong = vi.fn();
    const onClick = vi.fn();
    render(<Probe onLong={onLong} onClick={onClick} />);
    const button = screen.getByRole('button');

    fireEvent.pointerDown(button, { button: 0 });
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS);
    });
    fireEvent.pointerUp(button);
    fireEvent.click(button);

    expect(onLong).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();

    // The swallow is one-shot: the next plain click goes through.
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('treats a quick tap as a plain click', () => {
    const onLong = vi.fn();
    const onClick = vi.fn();
    render(<Probe onLong={onLong} onClick={onClick} />);
    const button = screen.getByRole('button');

    fireEvent.pointerDown(button, { button: 0 });
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS - 100);
    });
    fireEvent.pointerUp(button);
    fireEvent.click(button);
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(onLong).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is cancelled when the pointer leaves the button', () => {
    const onLong = vi.fn();
    render(<Probe onLong={onLong} onClick={() => undefined} />);
    const button = screen.getByRole('button');

    fireEvent.pointerDown(button, { button: 0 });
    fireEvent.pointerLeave(button);
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    });

    expect(onLong).not.toHaveBeenCalled();
  });

  it('ignores presses that are not the primary button', () => {
    const onLong = vi.fn();
    render(<Probe onLong={onLong} onClick={() => undefined} />);

    fireEvent.pointerDown(screen.getByRole('button'), { button: 2 });
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    });

    expect(onLong).not.toHaveBeenCalled();
  });
});
