import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LinkedFromPage, LinkedFromRow } from '@gisik-nokma/domain';
import { LinkedFromSection, linkedFromHref } from '../../src/views/linked-from-section.js';
import type { LiveQueryResult } from '../../src/views/use-live-query.js';

afterEach(cleanup);

const T = '01J9GTKT000000000000000000';
const N = '01J9GNTE000000000000000000';
function row(i: number, over: Partial<LinkedFromRow> = {}): LinkedFromRow {
  return {
    sourceKind: 'ticket', sourceId: `S${i}`, authorId: 'u_ama', snippet: `line ${i} [[GN-142 Chiller]] end`, updatedAt: '2026-10-03T10:00:00.000Z',
    parent: { kind: 'ticket', ticketId: `S${i}`, projectId: 'P', key: `GN-${i}`, title: `Source ${i}`, stateCategory: 'active' }, ...over,
  };
}
function live(data: LinkedFromPage | null, error: string | null = null): LiveQueryResult<LinkedFromPage> {
  return { data, error, settled: data !== null || error !== null, hasAnswered: data !== null, reload: vi.fn() } as unknown as LiveQueryResult<LinkedFromPage>;
}
const props = (page: LiveQueryResult<LinkedFromPage>, over: Partial<Parameters<typeof LinkedFromSection>[0]> = {}) => ({
  page,
  loadMore: vi.fn(async () => ({ total: 0, items: [], nextCursor: null })),
  hrefOf: (r: LinkedFromRow) => linkedFromHref(r, (ref) => `/t/${ref.ticketId}`),
  nameOf: (id: string) => (id === 'u_ama' ? 'Ama Rangsa' : id),
  ...over,
});

// 27.154: the manual's Linked from paragraph (docs/manual.md §15) describes this section.
describe('27.143 the section draws its heading, count, glyphs, names and the marked snippet', () => {
  it('27.143 a ticket, a note and a comment row; the snippet’s reference is a <mark>', () => {
    const page = { total: 3, nextCursor: null, items: [
      row(1),
      row(2, { sourceKind: 'note', sourceId: N, parent: { kind: 'note', noteId: N, title: 'Phone pass rulings' } }),
      row(3, { sourceKind: 'comment', sourceId: 'C9', parent: { kind: 'ticket', ticketId: 'S3', projectId: 'P', key: 'GN-160', title: 'x', stateCategory: 'open' } }),
    ] };
    render(<LinkedFromSection {...props(live(page))} />);
    const section = screen.getByTestId('linked-from');
    expect(within(section).getByRole('heading').textContent).toBe('Linked from3');
    const items = within(section).getAllByRole('listitem');
    expect(items.map((li) => li.querySelector('.gn-linked-from__name')?.textContent)).toEqual([
      'GN-1 Source 1', 'Note: Phone pass rulings', 'Comment on GN-160 by Ama Rangsa',
    ]);
    expect(items[0]!.querySelector('mark')?.textContent).toBe('GN-142 Chiller');
    expect(items[0]!.querySelector('.gn-linked-from__dot--active')).not.toBeNull();
    expect(items[1]!.querySelector('.gn-linked-from__glyph--note')).not.toBeNull();
    expect(items[2]!.querySelector('.gn-linked-from__glyph--comment')?.textContent).toBe('”');
    expect(items[1]!.querySelector('.gn-linked-from__glyph--note svg')).not.toBeNull();
  });
});

describe('27.144 nothing to say: the section is absent', () => {
  it('27.144 total 0 and a load in flight render nothing; one row renders the section (control)', () => {
    const { container, rerender } = render(<LinkedFromSection {...props(live({ total: 0, items: [], nextCursor: null }))} />);
    expect(container.innerHTML).toBe('');
    rerender(<LinkedFromSection {...props(live(null))} />);
    expect(container.innerHTML).toBe('');
    rerender(<LinkedFromSection {...props(live({ total: 1, items: [row(1)], nextCursor: null }))} />);
    expect(screen.getByTestId('linked-from')).toBeTruthy();
  });
});

describe('27.145 a snippet with no marker is drawn as plain text', () => {
  it('27.145 no <mark>, the words intact', () => {
    render(<LinkedFromSection {...props(live({ total: 1, items: [row(1, { snippet: 'plain words' })], nextCursor: null }))} />);
    expect(screen.getByTestId('linked-from').querySelector('mark')).toBeNull();
    expect(screen.getByText('plain words')).toBeTruthy();
  });
});

describe('27.146 a click opens the source; a comment opens its parent at the comment', () => {
  it('27.146 onNavigate gets the ticket path, the note path, and path#comment-<id>', async () => {
    const onNavigate = vi.fn();
    const page = { total: 3, nextCursor: null, items: [
      row(1),
      row(2, { sourceKind: 'note', sourceId: N, parent: { kind: 'note', noteId: N, title: 'R' } }),
      row(3, { sourceKind: 'comment', sourceId: 'C9', parent: { kind: 'note', noteId: N, title: 'R' } }),
    ] };
    render(<LinkedFromSection {...props(live(page), { onNavigate })} />);
    for (const link of screen.getAllByRole('link')) await userEvent.click(link);
    expect(onNavigate.mock.calls.map((c) => c[0])).toEqual(['/t/S1', `/notes/${N}`, `/notes/${N}#comment-C9`]);
    // A COMMENT row with no ticket href: without the `base === null` guard this would be 'null#comment-C4'
    // (a plain ticket row returns `base` either way, so it cannot tell the guard from its absence).
    expect(linkedFromHref(row(4, { sourceKind: 'comment', sourceId: 'C4' }), () => null)).toBeNull();
  });
});

describe('27.147 "Show all N" pages the rest from the same read', () => {
  it('27.147 22 sources: 20 drawn and a Show all 22 button; clicking pages the rest (two more pages) and the button goes', async () => {
    // TWO further pages, so "follows every cursor" is distinguishable from "follows one".
    const first = { total: 22, nextCursor: '100', items: Array.from({ length: 20 }, (_, i) => row(i)) };
    const loadMore = vi.fn(async (cursor: string) =>
      cursor === '100' ? { total: 22, nextCursor: '50', items: [row(20)] }
      : cursor === '50' ? { total: 22, nextCursor: null, items: [row(21)] }
      : { total: 22, nextCursor: null, items: [] });
    render(<LinkedFromSection {...props(live(first), { loadMore })} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(20);
    expect(screen.getByRole('heading').textContent).toBe('Linked from22'); // the count is the TOTAL, not the rows drawn
    await userEvent.click(screen.getByRole('button', { name: 'Show all 22' }));
    // `showAll` runs un-awaited (`void showAll(first)`): wait for its last state, not the click.
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(22));
    expect(loadMore.mock.calls.map((c) => c[0])).toEqual(['100', '50']);
    expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull();
  });
});

describe('27.148 a failed read says so, in one line', () => {
  it('27.148 an error renders the heading and an alert; a good read has no alert (control)', async () => {
    const { rerender, unmount } = render(<LinkedFromSection {...props(live(null, 'answered 500'))} />);
    expect(screen.getByRole('heading').textContent).toBe('Linked from');
    expect(screen.getByRole('alert').textContent).toBe(
      'What links here could not be read: answered 500. That is a failure of this read, not a statement about this item: it may answer on a retry.',
    );
    rerender(<LinkedFromSection {...props(live({ total: 1, items: [row(1)], nextCursor: null }))} />);
    expect(screen.queryByRole('alert')).toBeNull();
    unmount();
    // "Show all" failing is the same one line, under the rows already drawn.
    const loadMore = vi.fn(async () => {
      throw new Error('answered 502');
    });
    render(<LinkedFromSection {...props(live({ total: 2, items: [row(1)], nextCursor: '9' }), { loadMore })} />);
    await userEvent.click(screen.getByRole('button', { name: 'Show all 2' }));
    expect((await screen.findByRole('alert')).textContent).toBe('The rest could not be read: answered 502.');
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });
});
