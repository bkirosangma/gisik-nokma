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
    // THE KEY IS ITS OWN ELEMENT (Unit 3 styling, 2026-09-24, folded into
    // 9.302 rather than a new case — same row, same render): a muted chip
    // apart from the title, not a substring of one text node — `textContent`
    // above still reads "KEY title" unchanged regardless.
    const keyChip = document.querySelector('.ticketref-popup__item .ticketref-popup__key');
    expect(keyChip?.textContent).toBe('SHOP-8');

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

  /**
   * 18.272 (mechanism half; the page's own half lives in
   * apps/web/test/ticket-ref-callbacks.test.ts) — Ruling 1 (owner, via the
   * plan author, 2026-09-23): `queryTickets` rejecting (the replica's search
   * gap, offline) is caught HERE, inside the Suggestion's `items` wrapper —
   * `@tiptap/suggestion@3.30.5`'s own async-fetch error path (`plugin/view.ts`)
   * reaches the renderer as `loading: false` with `items` unchanged, no error
   * flag — so a per-editor closure flag is the only channel. The editor still
   * mounts and the popup still opens; its status line reads the connection
   * sentence instead of the count. Control in the SAME `it` (Ruling 1a): the
   * flag is cleared at the START of every `items()` call, so a query typed
   * after reconnecting shows the count text again.
   */
  it('18.272 a rejected queryTickets shows "Search needs a connection" in the status line; the editor still mounts; a later successful query shows the count again (control)', async () => {
    let fail = true;
    const queryTickets = vi.fn(async (q: string) => {
      if (fail) throw new Error('offline');
      return TICKETS.filter((t) => t.title.toLowerCase().includes(q.toLowerCase()));
    });
    let editor!: ReturnType<typeof createTestEditor>;
    expect(() => {
      editor = createTestEditor({ queryTickets });
    }).not.toThrow();

    typeText(editor, ':ticket comp');
    await vi.waitFor(() => {
      expect(document.querySelector('.ticketref-popup__status')?.textContent).toBe(
        'Search needs a connection',
      );
    });
    // THE EDITOR STILL MOUNTS: the popup itself is present and the document
    // is still there to type into — a rejection never reached the editor's
    // own construction or its content.
    expect(document.querySelector('.ticketref-popup')).not.toBeNull();
    expect(editor.isEditable).toBe(true);

    // CONTROL (Ruling 1a): reconnect, then type again — the SAME session
    // continuing is what proves the flag resets on every call, not only on a
    // fresh popup.
    fail = false;
    typeText(editor, 'r');
    await vi.waitFor(() => {
      expect(document.querySelector('.ticketref-popup__status')?.textContent).toBe(
        '1 ticket matches',
      );
    });
    editor.destroy();
  });

  /**
   * 9.318 — the sequence guard (Unit 3 ruling, planner via owner, 2026-09-24).
   * `@tiptap/suggestion` issues a new `items()` call on every keystroke
   * without waiting for the previous one, and its own abort guard protects
   * only the ITEMS it renders — an aborted call's resolution never repaints
   * the popup, so releasing the stale call alone proves nothing (`@tiptap/
   * suggestion`'s own staleness check would mask an unguarded flag exactly as
   * well as a guarded one). What is NOT protected is this file's
   * `searchUnavailable` variable itself: the stale call's `catch` still runs
   * and still writes it, and the wrong value sits there, invisible, until
   * SOMETHING ELSE calls `paint()` — an arrow key, say, which does not issue
   * a new `items()` call at all. That is the repaint this case forces, and
   * the reason the DOM only lies once no fresh `items()` call is left to
   * cover for it.
   */
  it('9.318 an older call that fails and resolves LAST must not overwrite a newer success — an ArrowDown after the stale rejection lands must still repaint the count, not the connection status; mutation: drop the sequence guard', async () => {
    let releaseFirst: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let calls = 0;
    const queryTickets = vi.fn(async (q: string) => {
      calls += 1;
      if (calls === 1) {
        await held; // the empty-query call: kept open past the second call's own resolution
        throw new Error('offline');
      }
      return TICKETS.filter((t) => t.title.toLowerCase().includes(q.toLowerCase()));
    });
    const editor = createTestEditor({ queryTickets });

    typeText(editor, ':ticket'); // call #1 starts (query ''), held open
    await vi.waitFor(() => expect(queryTickets).toHaveBeenCalledTimes(1));
    typeText(editor, ' comp'); // call #2 starts (query 'comp') and resolves normally
    await vi.waitFor(() => {
      expect(document.querySelector('.ticketref-popup__status')?.textContent).toBe(
        '1 ticket matches',
      );
    });

    // Release call #1's rejection — issued FIRST, but settling LAST. Give its
    // microtasks (the `await held`, the throw, the `catch`) a few turns to
    // write `searchUnavailable`, still with NO repaint triggered by either
    // call — `@tiptap/suggestion` discards call #1's own `onUpdate` as stale.
    releaseFirst();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // FORCE A REPAINT that issues no new `items()` call — `onKeyDown`'s
    // ArrowDown branch calls `paint()` directly, reading whatever
    // `searchUnavailable` currently holds. This is what the DOM's own status
    // text could not show without: the corrupted flag has nothing else left
    // to repaint it into view.
    editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

    expect(document.querySelector('.ticketref-popup__status')?.textContent).toBe(
      '1 ticket matches',
    );
    const rows = [...document.querySelectorAll('.ticketref-popup__item')].map((el) => el.textContent);
    expect(rows).toEqual(['SHOP-8 Compressor log']);

    editor.destroy();
  });
});
