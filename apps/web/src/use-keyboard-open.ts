'use client';

import { useEffect, useState } from 'react';

/**
 * Is the on-screen keyboard up? The phone bottom bar steps aside while it is, so it can never sit
 * between a person and the field they are typing in (mobile-web plan Review Focus 3, case 21.031).
 *
 * The rule is the plan's: `visualViewport.height < 0.75 × <the height the page had>`. Two details are
 * what make it hold on both families of phone:
 *
 * - **The reference height is the one from BEFORE the keyboard.** With `interactiveWidget:
 *   'resizes-content'` (the root layout's viewport, FD9) Chrome on Android shrinks the LAYOUT
 *   viewport with the keyboard, so `window.innerHeight` falls together with `visualViewport.height`
 *   and the plain ratio stays at 1 — a bar that would then ride above the keyboard, over the field.
 *   So the height is remembered whenever no field has focus (which also tracks rotation) and the
 *   comparison is against the larger of it and the current `innerHeight`. iOS shrinks only the visual
 *   viewport, where the two references agree.
 * - **No `visualViewport` (an older browser) is "not open"**: nothing to measure, so the bar stays.
 *
 * Reads happen in an effect, never during render, so the server render and the first client render
 * agree (`false`).
 */
const RATIO = 0.75;

function fieldIsFocused(): boolean {
  const el = document.activeElement;
  if (el === null || !(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) {
    return !['button', 'checkbox', 'radio', 'submit', 'reset', 'file', 'image', 'range', 'color'].includes(el.type);
  }
  return false;
}

export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (viewport === null || viewport === undefined) return undefined;

    let settled = window.innerHeight;
    const measure = (): void => {
      if (!fieldIsFocused()) settled = window.innerHeight;
      const reference = Math.max(settled, window.innerHeight);
      setOpen(viewport.height < RATIO * reference);
    };

    measure();
    viewport.addEventListener('resize', measure);
    document.addEventListener('focusin', measure);
    document.addEventListener('focusout', measure);
    return () => {
      viewport.removeEventListener('resize', measure);
      document.removeEventListener('focusin', measure);
      document.removeEventListener('focusout', measure);
    };
  }, []);

  return open;
}
