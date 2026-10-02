import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TicketSummary } from '@gisik-nokma/app-core';
import { OpeningSkeleton, TicketListView, ticketListBody, watchTicketSummaries } from './ticket-list.js';

/**
 * Smoothness T13 (spec §3.3; audit SM-12): the desktop list's loading states. The package's vitest is node-only with no DOM library, so the
 * arms are rendered with `react-dom/server` (already a dependency) and the effectful wiring is a plain function with a fake data source.
 */
const row = (id: string, over: Partial<TicketSummary> = {}): TicketSummary => ({ ticketId: id, title: `Ticket ${id}`, stateId: 'open', pending: false, openContests: 0, ...over }) as TicketSummary;
const markup = (node: Parameters<typeof renderToStaticMarkup>[0]): string => renderToStaticMarkup(node);
const count = (haystack: string, needle: RegExp): number => haystack.match(needle)?.length ?? 0;

describe('the desktop opening skeleton is the real list, with parts (spec S-R1)', () => {
  it("25.210 the opening arm renders the list's OWN container classes (ul.ticket-list > li.ticket-list__row ×6) and fills them with Skeleton parts; no card, no container style, one busy region", () => {
    const html = markup(createElement(OpeningSkeleton));
    expect(count(html, /<ul class="ticket-list"/g), 'the real list container').toBe(1);
    expect(count(html, /<li class="ticket-list__row"/g), 'six real rows').toBe(6);
    expect(count(html, /class="ticket-list__title"/g), 'each row has the real title element').toBe(6);
    expect(count(html, /class="ticket-list__state"/g), 'each row has the real state element').toBe(6);
    expect(count(html, /gn-skeleton gn-skeleton--line/g), 'a title line per row').toBeGreaterThanOrEqual(6);
    expect(html).not.toMatch(/gn-skeleton--card/); // `card` is the fallback for a region with NO real component
    // The containers are the component's own: no inline style on the region, the list or a row.
    expect(html).not.toMatch(/<(ul|li)[^>]*style=/);
    expect(html).toMatch(/aria-busy="true"/);
    expect(count(html, /Opening your local copy/g), 'named ONCE for assistive tech').toBe(1);
    // The fill is the surfacePlaceholder role through the shared class, never the well: no colour is written on the skeleton at all.
    expect(html).not.toMatch(/background|#[0-9a-f]{3,8}/i);
    // CONTROL (same it): a real row renders the same two real classes the skeleton reuses, so the match above reads the real markup.
    const real = markup(createElement(TicketListView, { tickets: [row('t1')], readError: null }));
    expect(real).toMatch(/<li class="ticket-list__row"/);
    expect(real).toMatch(/class="ticket-list__title"/);
  });
});

describe('the list says "No tickets yet" only after a read answered empty (spec §3.3)', () => {
  it('25.212 no read yet → skeleton; answered empty → "No tickets yet"; answered with rows → the rows', () => {
    const loading = markup(createElement(TicketListView, { tickets: null, readError: null }));
    expect(loading).toMatch(/aria-busy="true"/);
    expect(loading).not.toMatch(/No tickets yet/);
    const empty = markup(createElement(TicketListView, { tickets: [], readError: null }));
    expect(empty).toMatch(/No tickets yet/);
    expect(empty).not.toMatch(/aria-busy/);
    const rows = markup(createElement(TicketListView, { tickets: [row('a'), row('b', { pending: true })], readError: null }));
    expect(count(rows, /<li class="ticket-list__row"/g)).toBe(2);
    expect(rows).toMatch(/Ticket a/);
    expect(rows).toMatch(/claim in transit/);
    expect(rows).not.toMatch(/No tickets yet|aria-busy/);
    // CONTROL (same it): the pure decision under the view — null is NOT empty.
    expect(ticketListBody(null, null)).toBe('loading');
    expect(ticketListBody([], null)).toBe('empty');
    expect(ticketListBody([row('a')], null)).toBe('rows');
  });

  it('25.214 a read that FAILED shows the failure (never the skeleton forever, never "No tickets yet"); a later failure keeps the rows already shown', () => {
    expect(ticketListBody(null, 'disk is full')).toBe('error');
    const failed = markup(createElement(TicketListView, { tickets: null, readError: 'disk is full' }));
    expect(failed).toMatch(/role="alert"/);
    expect(failed).toMatch(/Couldn&#x27;t read your local copy: disk is full/);
    expect(failed).not.toMatch(/No tickets yet|aria-busy|gn-skeleton/);
    const later = markup(createElement(TicketListView, { tickets: [row('a')], readError: 'disk is full' }));
    expect(later).toMatch(/role="alert"/);
    expect(later).toMatch(/Ticket a/);
    // CONTROL (same it): no failure, no alert.
    expect(markup(createElement(TicketListView, { tickets: [row('a')], readError: null }))).not.toMatch(/role="alert"/);
  });
});

describe('engine events are coalesced into one list read (spec D11)', () => {
  afterEach(() => vi.useRealTimers());
  const fakeSource = () => {
    const callbacks = new Set<(item: unknown) => void>();
    return {
      callbacks,
      ds: { subscribe: (_ws: string, _after: number, cb: (item: never) => void) => { callbacks.add(cb as never); return () => void callbacks.delete(cb as never); } },
      emit: () => { for (const cb of [...callbacks]) cb({ type: 'event' }); },
    };
  };

  it('25.213 ten engine events inside 200 ms cause one list read, not ten; events a window apart read again; stopping cancels the pending read', () => {
    vi.useFakeTimers();
    const source = fakeSource();
    const read = vi.fn();
    const stop = watchTicketSummaries(source.ds as never, 'ws-burst', read);
    expect(read, 'the first read is immediate').toHaveBeenCalledTimes(1);
    for (let i = 0; i < 10; i += 1) { source.emit(); vi.advanceTimersByTime(15); }
    expect(read, 'nothing yet: the window restarts on every event').toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(250);
    expect(read, 'one coalesced read').toHaveBeenCalledTimes(2);
    // CONTROL (same it): two events a full window apart are two reads, so the coalescing is the window and not a dead listener.
    source.emit(); vi.advanceTimersByTime(250); source.emit(); vi.advanceTimersByTime(250);
    expect(read).toHaveBeenCalledTimes(4);
    source.emit();
    stop();
    vi.advanceTimersByTime(500);
    expect(read, 'a stopped watcher never reads').toHaveBeenCalledTimes(4);
    expect(source.callbacks.size, 'and holds no engine subscription').toBe(0);
  });
});
