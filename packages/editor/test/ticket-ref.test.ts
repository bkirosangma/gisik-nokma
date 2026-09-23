import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestEditor } from './helpers/create-editor.js';
import { typeText } from './helpers/type-text.js';
import type { TicketRefCandidate } from '../src/extensions/ticket-ref.js';

/**
 * 9.301–9.306 — spec §14 (D26), Plan 7 Task 1: the `ticketRef` node and the
 * `:ticket` picker. Modelled on `wiki-link.test.ts` (Plan 4), whose own
 * docblock explains the cleanup below: the popup lives on `document.body`,
 * not inside the editor's own DOM, so a case that throws before its
 * `editor.destroy()` leaves one behind for the NEXT case to trip over.
 */
afterEach(() => {
  for (const el of document.querySelectorAll('.ticketref-popup')) el.remove();
});

const TICKETS: TicketRefCandidate[] = [
  { ticketId: 't1', projectId: 'p1', key: 'SHOP-7', title: 'Fix the freezer' },
  { ticketId: 't2', projectId: 'p1', key: 'SHOP-8', title: 'Compressor log' },
];

type Json = { type?: string; attrs?: Record<string, unknown>; content?: Json[]; text?: string };

function asJson(node: { getJSON(): unknown }): Json {
  return node.getJSON() as Json;
}

describe('9.301-9.306 ticketRef', () => {
  // 9.301 — schema v2 gains `ticketRef` and the closed-vocabulary case still
  // passes. The general witness is `test/schema.test.ts`'s own
  // `SCHEMA_V2_NODES` / "9.261 exposes NOTHING the spec does not name" test,
  // which now includes `ticketRef`; this asserts the node this file's
  // suggestion inserts is really the one registered on the built schema.
  it('9.301 the built schema carries ticketRef', () => {
    const editor = createTestEditor();
    expect(Object.keys(editor.schema.nodes)).toContain('ticketRef');
    editor.destroy();
  });

  it('9.302 typing :ticket comp calls queryTickets("comp"), lists KEY title rows, Enter inserts the node plus a space; "re: ticket 5" and ":ticketfoo" open nothing', async () => {
    const queryTickets = vi.fn(async (q: string) =>
      TICKETS.filter((t) => t.title.toLowerCase().includes(q.toLowerCase())),
    );
    const editor = createTestEditor({ queryTickets });

    // CONTROL: ordinary prose mentioning "ticket" never contains the literal
    // trigger `:ticket` (no space between the colon and the word), so no
    // query is ever sent and no popup opens.
    typeText(editor, 're: ticket 5');
    await Promise.resolve();
    await Promise.resolve();
    expect(queryTickets).not.toHaveBeenCalled();
    expect(document.querySelector('.ticketref-popup')).toBeNull();
    editor.commands.clearContent();

    // CONTROL: no whitespace or end-of-input directly after `:ticket` — the
    // trigger requires one or the other. Typing char by char passes through
    // ":ticket" alone first (an empty query, exactly like "@" or "[[" opening
    // on their own), which is allowed and legitimately calls `queryTickets('')`
    // — the control is that CONTINUING with "foo" right after is what the
    // trigger refuses: the query is no longer empty or whitespace-prefixed,
    // `allow` disallows it, and the popup closes with no query for "foo" ever
    // sent.
    queryTickets.mockClear();
    typeText(editor, ':ticketfoo');
    await Promise.resolve();
    await Promise.resolve();
    expect(queryTickets).not.toHaveBeenCalledWith('foo');
    await vi.waitFor(() => {
      expect(document.querySelector('.ticketref-popup')).toBeNull();
    });
    editor.commands.clearContent();

    typeText(editor, ':ticket comp');
    await vi.waitFor(() => {
      expect(queryTickets).toHaveBeenCalledWith('comp');
    });
    // THE STATUS ARM WAITS FOR A ROW, NOT ONLY THE CONTAINER — see
    // `wiki-link.test.ts`'s docblock: `items` resolves asynchronously, so the
    // popup exists with zero candidates for a moment, and `onKeyDown`
    // declines every key in that window (nothing to navigate).
    await vi.waitFor(() => {
      expect(document.querySelector('.ticketref-popup__item')).not.toBeNull();
    });
    const rows = [...document.querySelectorAll('.ticketref-popup__item')].map((el) => el.textContent);
    expect(rows).toEqual(['SHOP-8 Compressor log']);

    editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const para = asJson(editor).content?.[0];
    const ref = para?.content?.find((n) => n.type === 'ticketRef');
    expect(ref?.attrs).toEqual({ ticketId: 't2', projectId: 'p1', key: 'SHOP-8', title: 'Compressor log' });
    // THE TRAILING SPACE: without it the next word a person types glues to the chip.
    expect(editor.getText()).toBe('SHOP-8 Compressor log ');
    editor.destroy();
  });

  it('9.303 :ticket opens no popup with the caret inside a code block (the shared allow gate)', async () => {
    const queryTickets = vi.fn(async () => TICKETS);
    const editor = createTestEditor(
      { queryTickets },
      { type: 'doc', content: [{ type: 'codeBlock', content: [{ type: 'text', text: 'x' }] }] },
    );
    typeText(editor, ' :ticket comp');
    await Promise.resolve();
    await Promise.resolve();
    expect(queryTickets).not.toHaveBeenCalled();
    expect(document.querySelector('.ticketref-popup')).toBeNull();
    editor.destroy();
  });

  it('9.304 the chip renders a.editor-ticketref[href] when resolveTicketHref resolves and span.editor-ticketref with no href otherwise; text is KEY title', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'ticketRef',
              attrs: { ticketId: 't2', projectId: 'p1', key: 'SHOP-8', title: 'Compressor log' },
            },
          ],
        },
      ],
    };
    const linked = createTestEditor({ resolveTicketHref: () => '/w/x/p/p1?ticket=t2' }, doc);
    const link = linked.view.dom.querySelector('a.editor-ticketref');
    expect(link?.textContent).toBe('SHOP-8 Compressor log');
    expect(link?.getAttribute('href')).toBe('/w/x/p/p1?ticket=t2');
    linked.destroy();

    // No resolver at all: the option defaults to a function returning `null`,
    // exactly as if a host explicitly answered "no href for this one".
    const plain = createTestEditor(undefined, doc);
    const span = plain.view.dom.querySelector('span.editor-ticketref');
    expect(span?.textContent).toBe('SHOP-8 Compressor log');
    expect(span?.getAttribute('href')).toBeNull();
    plain.destroy();
  });

  it('9.305 Escape closes the picker leaving ":ticket comp" as text', () => {
    const editor = createTestEditor({ queryTickets: async () => TICKETS });
    typeText(editor, ':ticket comp');
    editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(editor.getText()).toBe(':ticket comp');
    editor.destroy();
  });
});
