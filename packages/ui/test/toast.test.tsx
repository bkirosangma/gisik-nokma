import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toast, TOAST_DEFAULT_DURATION_MS } from '../src/components/toast.js';

/**
 * **16.42 — the shared toast: it dismisses itself on the ruled window, it can
 * be dismissed by hand, and its countdown yields to a person using it.**
 *
 * The product had no transient surface at all before this (swept 2026-09-20:
 * zero `toast` hits across `packages/ui/src`, `apps/web/src` and `apps/web/app`,
 * against a positive control of 80 in the prototype), so there is no existing
 * behaviour to inherit — every arm here is the first statement of one.
 */
describe('16.42 Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function renderToast(props: Partial<Parameters<typeof Toast>[0]> = {}) {
    const onDismiss = vi.fn();
    const onUndo = vi.fn();
    render(<Toast open message="3 notifications marked read" onDismiss={onDismiss} {...props} />);
    return { onDismiss, onUndo };
  }

  it('16.42 renders the message as a status, not an alert', () => {
    renderToast();
    // `role="status"` rather than `alert`: a toast about something that already
    // happened is not an error, and `alert` interrupts. Same choice the sync
    // status bar and the read-only banner make.
    expect(screen.getByRole('status')).toHaveTextContent('3 notifications marked read');
  });

  it('16.42 renders nothing at all when closed — not a hidden cluster of controls', () => {
    renderToast({ open: false });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('16.42 dismisses itself on the ruled window', () => {
    const { onDismiss } = renderToast();
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(TOAST_DEFAULT_DURATION_MS - 1);
    });
    // NOT YET — so the assertion after it is about the boundary and not about
    // "a timer exists somewhere".
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('16.42 the window is the ruled fifteen seconds, pinned by value', () => {
    // Pinned as a literal AND used through the constant above: if someone
    // changes the constant, this line is the one that says the ruling moved.
    expect(TOAST_DEFAULT_DURATION_MS).toBe(15_000);
  });

  it('16.42 a null duration means no timer at all', () => {
    const { onDismiss } = renderToast({ durationMs: null });
    act(() => {
      vi.advanceTimersByTime(TOAST_DEFAULT_DURATION_MS * 10);
    });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('16.42 ⚠ the countdown PAUSES while the pointer is in it, and resumes on the way out', () => {
    const { onDismiss } = renderToast();
    const card = screen.getByRole('status');

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    // Hover with 5 s left.
    act(() => {
      card.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    // Still here: the window does not run down while a person is reading it.
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      card.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    });
    act(() => {
      vi.advanceTimersByTime(4_999);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    // The REMAINDER, not a fresh fifteen seconds — the pause carries what is
    // left rather than restarting the clock.
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('16.42 the pause also holds while FOCUS is inside — the keyboard is what makes Undo reachable', () => {
    const { onDismiss, onUndo } = renderToast({
      undo: { onUndo: () => undefined },
    });
    act(() => {
      screen.getByRole('button', { name: 'Undo' }).focus();
    });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('16.42 the Undo button calls its handler, and Dismiss calls its own — two different things', () => {
    const onUndo = vi.fn();
    const { onDismiss } = renderToast({ undo: { onUndo } });
    act(() => {
      screen.getByRole('button', { name: 'Undo' }).click();
    });
    expect(onUndo).toHaveBeenCalledTimes(1);
    // Pressing Undo must NOT also dismiss — the page drops the toast when its
    // handler runs, and a component that also called `onDismiss` would make the
    // two indistinguishable to a caller that wanted them apart.
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      screen.getByRole('button', { name: 'Dismiss' }).click();
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('16.42 no Undo button when none is offered — an informing toast is not an actionable one', () => {
    renderToast({ message: 'Saved' });
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    // But it is always dismissible: a toast nobody can leave is worse than one
    // nobody can undo.
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
  });

  it('16.42 the whole message is rendered — no truncation of a refusal reason', () => {
    const long = 'Refused by the server — require-evidence: an attachment must be provided to make this move, and none was.';
    renderToast({ message: long });
    expect(screen.getByRole('status')).toHaveTextContent(long);
  });
});
