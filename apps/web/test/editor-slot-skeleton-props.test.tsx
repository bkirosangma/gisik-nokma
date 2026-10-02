import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TicketEditorSlot } from '../src/editor-slot.js';

/**
 * 25.181 / 25.183 — what the slot WRAPPER hands its skeleton while the editor chunk is pending (smoothness T10 FIX 2). The chunk never
 * arrives here (the mock's factory never settles), so every render below is the skeleton.
 *
 * 25.181: the new-ticket dialog mounts the slot with `submitSlot="none"`, and the real slot then draws no submit button, so the footer
 * is the hint's height alone; a skeleton that drew its pill anyway made the footer about 24px taller until the editor landed.
 * 25.183: someone who showed the comment formatting strip (a stored per-device choice, G-6) gets a comment skeleton WITH the strip.
 */

vi.mock('@gisik-nokma/editor', () => new Promise(() => {}));

const base = { doc: null, readOnly: false, workspaceId: 'w', ticketId: 't' } as const;
const KEY = 'gn-comment-toolbar';

afterEach(() => {
  cleanup();
  window.localStorage.removeItem(KEY);
});

describe('25.181 the wrapper forwards submitSlot to the skeleton', () => {
  it('draws no submit pill for submitSlot="none", and one without it', () => {
    const none = render(<TicketEditorSlot {...base} mode="description" submitSlot="none" />);
    expect(none.container.querySelector('.gn-skeleton-region')).not.toBeNull(); // the skeleton is what is showing
    expect(none.container.querySelectorAll('.editor-slot__footer .gn-editor-skeleton__submit')).toHaveLength(0);
    none.unmount();
    // Control, same it(): the same mount without submitSlot draws one.
    const footer = render(<TicketEditorSlot {...base} mode="description" />);
    expect(footer.container.querySelectorAll('.editor-slot__footer .gn-editor-skeleton__submit')).toHaveLength(1);
  });
});

describe('25.183 an opted-in comment strip is in the comment skeleton', () => {
  it('draws the strip and the Format pill when the stored choice is shown, no strip when unset or hidden', () => {
    window.localStorage.setItem(KEY, 'shown');
    const shown = render(<TicketEditorSlot {...base} mode="comment" />);
    expect(shown.container.querySelector('.ticket-editor__toolbar')).not.toBeNull();
    expect(shown.container.querySelector('.editor-slot__footer .gn-editor-skeleton__format')).not.toBeNull();
    shown.unmount();
    // Control, same it(): unset and 'hidden' draw no strip (and still the Format pill).
    for (const stored of [null, 'hidden']) {
      if (stored === null) window.localStorage.removeItem(KEY);
      else window.localStorage.setItem(KEY, stored);
      const view = render(<TicketEditorSlot {...base} mode="comment" />);
      expect(view.container.querySelector('.ticket-editor__toolbar'), String(stored)).toBeNull();
      expect(view.container.querySelector('.editor-slot__footer .gn-editor-skeleton__format'), String(stored)).not.toBeNull();
      view.unmount();
    }
  });
});
