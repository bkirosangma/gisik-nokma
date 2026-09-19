'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { Button } from './button.js';

/**
 * The tone of the dot and nothing else — the copy carries the meaning, the
 * colour carries only the register, exactly as `.gn-refusal`'s variants do.
 */
export type ToastTone = 'success' | 'accent' | 'warning' | 'danger';

export type ToastProps = {
  open: boolean;
  /** The sentence. It is the whole message; the dot is decoration. */
  message: string;
  tone?: ToastTone;
  /**
   * `null` for a toast that only informs. Present, it renders an **Undo**
   * button, and the tone is downgraded to `success` rather than the caller
   * having to say both — an undoable action is one that went well and can be
   * taken back, not a warning.
   */
  undo?: { label?: string; onUndo: () => void } | null;
  /** Always required: a toast nobody can dismiss is a toast nobody can leave. */
  onDismiss: () => void;
  /**
   * Milliseconds before it dismisses itself. `null` disables the timer.
   *
   * **Defaults to 15 s, which is an owner ruling (2026-09-20) rather than a
   * design choice made here.**
   */
  durationMs?: number | null;
  /** An invisible label for the Dismiss control, since it is a bare glyph. */
  dismissLabel?: string;
};

/** The ruled window. Exported so a caller that passes its own can be read against it. */
export const TOAST_DEFAULT_DURATION_MS = 15_000;

/**
 * A transient, dismissible, optionally-undoable message at the foot of the
 * screen.
 *
 * ## Why this is in `packages/ui` and not in the screen that first needed it
 *
 * It was built for the inbox's bulk action, whose Undo had nowhere to live —
 * the product had **no transient surface of any kind** (swept 2026-09-20: zero
 * `toast` hits across `packages/ui/src`, `packages/app-core/src`, `apps/web/src`
 * and `apps/web/app`, against a positive control of 80 in the prototype). The
 * prototype's own toast serves **66 call sites** — invites, tokens, tickets,
 * members, types — so the owner ruled it a SHARED component, and this file is
 * the shared one: **the inbox is its only caller today**, and the rest are
 * other tasks' to wire, not this one's.
 *
 * ## The countdown pauses while the pointer or the keyboard is in it
 *
 * ⚠ **This is an addition to the ruling, and it is the one thing here I did
 * not take literally — call it out if it is unwanted.** The ruling is "dismiss
 * after 15 seconds", and the default below is exactly that. But a timer that
 * runs down while somebody is **reading or tabbing toward the Undo button** is
 * a control that can vanish mid-use, and WCAG 2.2.1 asks for time limits a
 * person can extend. Pausing on hover and on focus keeps the ruled 15 s of
 * *non-interaction* while making the Undo reachable by keyboard — which is the
 * only way this toast is undoable for somebody not using a mouse. The timer
 * resumes when the pointer and focus both leave.
 *
 * ## The code is a `12rem`-ish single line, and it does not truncate silently
 *
 * The message is rendered whole; the container caps its width and wraps. A
 * toast that ellipsised an engine's refusal reason would hide the one sentence
 * the person needed, and there is no hover affordance to recover it.
 */
export function Toast(props: ToastProps): ReactElement | null {
  const { open, message, onDismiss } = props;
  const tone = props.tone ?? (props.undo ? 'success' : 'accent');
  const durationMs = props.durationMs === undefined ? TOAST_DEFAULT_DURATION_MS : props.durationMs;
  const [paused, setPaused] = useState(false);
  /**
   * The remaining time, carried across a pause. Held in a ref rather than as
   * state because it is read only by the effect below, and re-rendering on
   * every tick would be a state update per second for a number nothing draws.
   */
  const remainingRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      remainingRef.current = null;
      return;
    }
    if (durationMs === null || paused) return;
    const startedAt = Date.now();
    const remaining = remainingRef.current ?? durationMs;
    const timer = setTimeout(onDismiss, remaining);
    return () => {
      clearTimeout(timer);
      // What is left of the window if the pause arrives before it fires.
      remainingRef.current = Math.max(0, remaining - (Date.now() - startedAt));
    };
  }, [open, paused, durationMs, onDismiss]);

  if (!open) return null;

  return (
    <div className="gn-toast-layer" data-tone={tone}>
      <div
        className="gn-toast"
        role="status"
        // The pause's two arms. `onBlur` rather than `onFocusOut`: React's blur
        // bubbles, so the container sees a child losing focus — which is what
        // keeps the timer alive while focus moves BETWEEN the Undo button and
        // Dismiss rather than restarting on each.
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
      >
        <span className="gn-toast__dot" aria-hidden="true" />
        <span className="gn-toast__text">{message}</span>
        {props.undo ? (
          <Button variant="ghost" onClick={props.undo.onUndo}>
            {props.undo.label ?? 'Undo'}
          </Button>
        ) : null}
        <button
          type="button"
          className="gn-toast__dismiss"
          aria-label={props.dismissLabel ?? 'Dismiss'}
          onClick={onDismiss}
        >
          ×
        </button>
      </div>
    </div>
  );
}
