import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TicketEditorSlot } from '../src/components/TicketEditorSlot.js';

/**
 * 9.363 — owner report 2026-09-29: "the ticket comment's editor has the tool tip on hover on the
 * toolbar, but note editor and note comment's editor does not."
 *
 * ROOT CAUSE (measured on the real markup in the live stylesheets): the toolbar's tooltip opens
 * ABOVE its button (`.ticket-editor__tooltip { bottom: 100% }`), and in every composer the
 * toolbar is the TOP row of `.editor-slot`, which is `overflow: hidden` (it owns the corners).
 * The panel sits entirely above the slot's top edge — measured: tooltip 171.4–200.0px, slot top
 * 200.0px — so the clip removes all of it. The component renders and reacts (that is asserted
 * below, per host); the stylesheet is what hides it. jsdom applies no stylesheet, so the second
 * half reads the rules.
 */
const CSS = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/styles/editor.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

function bodyOf(selector: string): string {
  return [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((hit) => (hit[1] ?? '').split(',').map((part) => part.trim()).includes(selector))
    .map((hit) => hit[2] ?? '')
    .join('\n');
}

const HOSTS = [
  { mode: 'note', name: 'the note body editor' },
  { mode: 'comment', name: 'the note comment editor (and the ticket comment editor)' },
  { mode: 'description', name: 'the ticket description editor' },
] as const;

describe('9.363 the toolbar tooltip of every composer host is drawn INSIDE the slot that clips', () => {
  for (const host of HOSTS) {
    it(`9.363 ${host.name} (mode="${host.mode}"): hover and focus show role="tooltip" inside .editor-slot`, async () => {
      const view = render(
        <TicketEditorSlot
          mode={host.mode}
          doc={null}
          readOnly={false}
          workspaceId="ws"
          ticketId=""
          {...(host.mode === 'note' ? { noteId: 'n1', submitSlot: 'none' as const } : {})}
          submit={async () => true}
        />,
      );
      const bold = await waitFor(() => {
        const found = view.container.querySelector<HTMLButtonElement>('button[aria-label="Bold"]');
        if (found === null) throw new Error('no toolbar yet');
        return found;
      });
      const slot = view.container.querySelector('.editor-slot');
      expect(slot, 'the composer wrapper').not.toBeNull();
      expect(view.container.querySelector('[role="tooltip"]')).toBeNull();

      fireEvent.mouseEnter(bold.parentElement as HTMLElement);
      const hovered = view.container.querySelector('[role="tooltip"]');
      expect(hovered?.textContent).toContain('Bold');
      expect(slot?.contains(hovered)).toBe(true);
      fireEvent.mouseLeave(bold.parentElement as HTMLElement);
      expect(view.container.querySelector('[role="tooltip"]')).toBeNull();

      fireEvent.focus(bold);
      expect(view.container.querySelector('[role="tooltip"]')?.textContent).toContain('Bold');
      view.unmount();
    });
  }

  it('9.363 the slot clips (`overflow: hidden`), so its tooltip opens BELOW the button, left-anchored, never above', () => {
    // CONTROL: the clip is still there — the fix is where the panel opens, not removing the corners.
    expect(bodyOf('.editor-slot')).toMatch(/overflow:\s*hidden;/);

    const tip = bodyOf('.editor-slot .ticket-editor__tooltip');
    expect(tip, 'a slot-scoped tooltip rule').not.toBe('');
    expect(tip).toMatch(/top:\s*100%;/);
    expect(tip).toMatch(/bottom:\s*auto;/);
    expect(tip).toMatch(/margin:\s*6px 0 0;/);
    // Centred on a button 8px from the slot's left edge, the panel's left third would be clipped too.
    expect(tip).toMatch(/left:\s*0;/);
    expect(tip).toMatch(/transform:\s*none;/);
    // CONTROL: outside a slot (the bare `TicketEditor`) the original above-the-button placement stays.
    expect(bodyOf('.ticket-editor__tooltip')).toMatch(/bottom:\s*100%;/);
  });
});

describe('9.364 a tooltip that would overshoot the slot’s clip edge is shifted back inside it', () => {
  afterEach(() => vi.restoreAllMocks());

  /** jsdom lays nothing out, so the two rects the effect reads are supplied. */
  function mountWithRects(tip: { left: number; right: number }) {
    const rect = (left: number, right: number): DOMRect =>
      ({ left, right, top: 0, bottom: 20, width: right - left, height: 20, x: left, y: 0, toJSON: () => ({}) }) as DOMRect;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this.classList.contains('ticket-editor__tooltip')) return rect(tip.left, tip.right);
      if (this.classList.contains('editor-slot')) return rect(0, 450);
      return rect(0, 0);
    });
    const view = render(
      <TicketEditorSlot mode="note" doc={null} readOnly={false} workspaceId="ws" ticketId="" noteId="n1" submitSlot="none" submit={async () => true} />,
    );
    return view;
  }

  async function openBold(view: ReturnType<typeof render>): Promise<HTMLElement> {
    const bold = await waitFor(() => {
      const found = view.container.querySelector<HTMLButtonElement>('button[aria-label="Bold"]');
      if (found === null) throw new Error('no toolbar yet');
      return found;
    });
    fireEvent.mouseEnter(bold.parentElement as HTMLElement);
    return view.container.querySelector('[role="tooltip"]') as HTMLElement;
  }

  it('9.364 a panel 70px past the right edge is pulled left by exactly 70px', async () => {
    const tip = await openBold(mountWithRects({ left: 400, right: 520 }));
    expect(tip.style.transform).toBe('translateX(-70px)');
  });

  it('9.364 a panel 5px past the left edge is pushed right by 5px, and one that fits is left alone', async () => {
    const left = await openBold(mountWithRects({ left: -5, right: 100 }));
    expect(left.style.transform).toBe('translateX(5px)');
    vi.restoreAllMocks();
    const fits = await openBold(mountWithRects({ left: 10, right: 100 }));
    expect(fits.style.transform).toBe('');
  });
});
