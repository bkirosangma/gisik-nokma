import type { DragEvent } from 'react';

/**
 * The dragged card's lifted image (styling refresh Plan A Task 5A; owner
 * ruling 2026-09-29: the full lift toward the user — scale, deeper shadow,
 * a 2–3° tilt — happens only while a card is DRAGGED).
 *
 * The board drags NATIVELY, and a native drag moves a bitmap the browser
 * snapshots at `dragstart`: CSS on the source `<li>` never follows the
 * pointer. So the lift is painted on a clone, handed to `setDragImage`, and
 * removed on the next task — after the snapshot, which the browser takes
 * synchronously once this handler returns. The browser adds its own
 * translucency to a drag image; no page can remove it (plan D26).
 *
 * The clone is `aria-hidden` and `inert`, and every `id`/`data-testid` in it is
 * stripped: for the one task it exists it must not be a second copy of the
 * card to assistive tech, to `getByTestId`, or to `document.getElementById`.
 *
 * FEATURE-GUARDED: jsdom's `DataTransfer` fakes carry no `setDragImage`
 * (`board-drag-drop.test.tsx:100-109`); the drag must still work without one.
 */
const PAD_LEFT = 48; // = the wrapper's 3rem inline padding
const PAD_TOP = 24; // = its 1.5rem top padding

export function setCardDragImage(event: DragEvent<HTMLElement>, card: HTMLElement): void {
  if (typeof event.dataTransfer.setDragImage !== 'function') return;
  const rect = card.getBoundingClientRect();
  const clone = card.cloneNode(true) as HTMLElement;
  clone.removeAttribute('id');
  clone.removeAttribute('data-testid');
  for (const element of clone.querySelectorAll('[id], [data-testid]')) {
    element.removeAttribute('id');
    element.removeAttribute('data-testid');
  }
  clone.style.width = `${rect.width}px`;
  const wrapper = document.createElement('div');
  wrapper.className = 'gn-board-drag-image';
  wrapper.setAttribute('aria-hidden', 'true');
  wrapper.setAttribute('inert', '');
  wrapper.append(clone);
  document.body.append(wrapper);
  event.dataTransfer.setDragImage(
    wrapper,
    event.clientX - rect.left + PAD_LEFT,
    event.clientY - rect.top + PAD_TOP,
  );
  setTimeout(() => wrapper.remove(), 0);
}
