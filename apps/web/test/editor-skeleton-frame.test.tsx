import { render, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TicketEditorSlot as RealTicketEditorSlot } from '@gisik-nokma/editor';
import { EditorSkeleton } from '../src/skeletons/editor-skeleton.js';

/**
 * 25.177 — the editor's skeleton IS the slot's box, per mode (smoothness T10 FIX 1; amendment S-R1 rule 1, spec S1).
 *
 * The real `TicketEditorSlot` (the dist the app ships) and `EditorSkeleton` are rendered with the same mode and compared on structure:
 * the root's classes, the ordered classes of the root's container children, what the `ticket-editor` host holds of the strip and the
 * content host, and the footer's leading containers. jsdom has no layout, so the SIZE is not measured here: the claim is that the
 * skeleton declares no size of its own (no inline `min-height`) and uses the classes the stylesheet sizes from.
 */

// jsdom has no `getClientRects`, which ProseMirror calls on every DOM change (see `description-editable.test.tsx`).
if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = function getClientRects(): DOMRectList {
    return { length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] } as unknown as DOMRectList;
  };
  Range.prototype.getBoundingClientRect = function getBoundingClientRect(): DOMRect {
    return { x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0, toJSON: () => ({}) } as DOMRect;
  };
}

const MODES = ['description', 'comment', 'note'] as const;
// `gn-skeleton-region` is the primitive's own busy marker, not part of the box being matched. A child with no class at all is the
// slot's visually hidden disabled-reason span: it draws no box, so it is not a container to match.
const classes = (element: Element) => [...element.classList].filter((name) => name !== 'gn-skeleton-region').sort().join(' ');
const containers = (element: Element) =>
  [...element.children].filter((child) => !child.classList.contains('gn-visually-hidden')).map(classes).filter((name) => name !== '');
const STRIP_AND_CONTENT = ['ticket-editor__toolbar', 'gn-field__input ticket-editor__content'].map((c) => c.split(' ').sort().join(' '));

function shape(root: Element) {
  const host = root.querySelector('.ticket-editor')!;
  const footer = root.querySelector('.editor-slot__footer')!;
  return {
    root: classes(root),
    rootChildren: containers(root),
    host: containers(host).filter((name) => STRIP_AND_CONTENT.includes(name)),
    footerLead: containers(footer).filter((name) => ['editor-slot__attach-wrap', 'editor-slot__hint'].includes(name)),
  };
}

async function realShape(mode: (typeof MODES)[number]) {
  const view = render(
    <RealTicketEditorSlot
      mode={mode}
      doc={null}
      readOnly={false}
      workspaceId="w"
      ticketId="t"
      uploadAttachment={async () => ({ attachmentId: 'a', url: '/a', name: 'a', mime: 'image/png', size: 1 }) as never}
    />,
  );
  await waitFor(() => expect(view.container.querySelector('.ticket-editor__content .ProseMirror')).not.toBeNull());
  const root = view.container.querySelector('.editor-slot')!;
  const result = { ...shape(root), formatButton: root.querySelector('.editor-slot__format') !== null };
  view.unmount();
  return result;
}

describe('25.177 the editor skeleton is the slot box, per mode', () => {
  it('matches the real slot on the root class, the container order, the strip and content host, and the footer lead — for description, comment and note', async () => {
    const seenRoots = new Set<string>();
    for (const mode of MODES) {
      const real = await realShape(mode);
      const view = render(<EditorSkeleton mode={mode} attach />);
      const skeleton = view.container.querySelector('.editor-slot')!;
      const { formatButton, ...realStructure } = real;
      expect(shape(skeleton), mode).toEqual(realStructure);
      // No size of its own: the stylesheet sizes the content host by class, per mode.
      const content = skeleton.querySelector('.ticket-editor__content') as HTMLElement;
      expect(content.style.minHeight, mode).toBe('');
      expect(skeleton.getAttribute('style') ?? '', mode).not.toMatch(/height/i);
      // The fill is the placeholder surface, never the well.
      expect(view.container.innerHTML, mode).not.toMatch(/well/i);
      // Control, in the same it(): the real slot's structure is not degenerate. It has all four pieces and its root differs per mode.
      // The strip is drawn by description and note; a comment slot keeps it behind its Format button (G-6), so it has the content host only.
      expect(real.host, mode).toHaveLength(mode === 'comment' ? 1 : 2);
      expect(real.footerLead, mode).toHaveLength(2);
      expect(real.rootChildren, mode).toEqual(['ticket-editor', 'editor-slot__footer']);
      // G-6's other half: where the strip is hidden the footer leads with the Format button, and the skeleton leads with its pill.
      const footerLead = skeleton.querySelector('.editor-slot__footer')!.firstElementChild!;
      expect(footerLead.classList.contains('gn-skeleton'), mode).toBe(mode === 'comment');
      expect(formatButton, mode).toBe(mode === 'comment');
      seenRoots.add(real.root);
      view.unmount();
    }
    expect(seenRoots.size).toBe(3);
  });

  it('draws no Attach pill without an uploader, and no strip when read-only (the real slot draws none either)', () => {
    const view = render(<EditorSkeleton mode="description" readOnly />);
    expect(view.container.querySelector('.editor-slot__attach-wrap')).toBeNull();
    expect(view.container.querySelector('.ticket-editor__toolbar')).toBeNull();
    // Control: with both on, both are there.
    view.rerender(<EditorSkeleton mode="description" attach />);
    expect(view.container.querySelector('.editor-slot__attach-wrap')).not.toBeNull();
    expect(view.container.querySelector('.ticket-editor__toolbar')).not.toBeNull();
  });
});

describe('25.177 (FIX 2) the strip skeleton has the real bar\'s items per breakpoint, and the hint its own words', () => {
  const tools = (root: Element) => root.querySelectorAll('.ticket-editor__tool').length;
  const skeletonSet = (which: 'desktop' | 'phone') => {
    const view = render(<EditorSkeleton mode="description" />);
    const set = view.container.querySelector(`.gn-editor-skeleton__set--${which}`)!;
    const result = {
      groups: set.querySelectorAll('.ticket-editor__tool-group').length,
      tools: set.querySelectorAll('.gn-editor-skeleton__tool').length,
      selects: set.querySelectorAll('.gn-editor-skeleton__select').length,
    };
    view.unmount();
    return result;
  };
  const realBar = async (phone: boolean) => {
    const original = window.matchMedia;
    // Absent in jsdom, which the editor reads as "not a phone"; stubbed to a match for the phone arm.
    if (phone) window.matchMedia = ((query: string) => ({ matches: true, media: query, addEventListener() {}, removeEventListener() {} })) as never;
    try {
      const view = render(<RealTicketEditorSlot mode="description" doc={null} readOnly={false} workspaceId="w" ticketId="t" />);
      await waitFor(() => expect(view.container.querySelector('.ticket-editor__toolbar')).not.toBeNull());
      const bar = view.container.querySelector('.ticket-editor__toolbar')!;
      const result = {
        groups: bar.querySelectorAll('.ticket-editor__tool-group').length,
        tools: tools(bar),
        selects: bar.querySelectorAll('.ticket-editor__heading-select').length,
      };
      view.unmount();
      return result;
    } finally {
      if (original === undefined) delete (window as { matchMedia?: unknown }).matchMedia;
      else window.matchMedia = original;
    }
  };

  it('25.177 desktop and phone: the same group count, tool count and heading select as the real toolbar; the same hint words per mode', async () => {
    const desktop = await realBar(false);
    const phone = await realBar(true);
    expect(skeletonSet('desktop')).toEqual(desktop);
    expect(skeletonSet('phone')).toEqual(phone);
    // Control, in the same it(): the two real bars differ and are not degenerate (17 tools on desktop; the eight phone tools plus More).
    expect(desktop.tools).toBe(17);
    expect(phone.tools).toBe(9);
    expect(desktop.selects).toBe(1);
    expect(phone.selects).toBe(1);
    // The hint line is the real sentence (it wraps to the real number of lines, 25.182): description's Markdown hint, a comment's
    // `footerNote`, nothing for a read-only description. The real text is read from the real slot, not restated here.
    const hintOf = async (props: Record<string, unknown>, skeleton: boolean) => {
      const view = skeleton
        ? render(<EditorSkeleton {...(props as object)} />)
        : render(<RealTicketEditorSlot {...({ doc: null, workspaceId: "w", ticketId: "t", ...props } as React.ComponentProps<typeof RealTicketEditorSlot>)} />);
      if (!skeleton) await waitFor(() => expect(view.container.querySelector('.ticket-editor__content .ProseMirror')).not.toBeNull());
      const text = view.container.querySelector('.editor-slot__hint')?.textContent ?? null;
      view.unmount();
      return text;
    };
    for (const props of [
      { mode: 'description', readOnly: false },
      { mode: 'description', readOnly: true },
      { mode: 'comment', readOnly: false, footerNote: 'Posting records an event citing you.' },
      { mode: 'comment', readOnly: false },
    ]) {
      expect(await hintOf(props, true), JSON.stringify(props)).toBe(await hintOf(props, false));
    }
    expect(await hintOf({ mode: 'description', readOnly: false }, true)).toMatch(/^Markdown: /); // control: not the empty string twice
  });
});
