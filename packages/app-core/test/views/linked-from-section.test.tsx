import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LinkedFromPage, LinkedFromRow, ServerStreamFrame } from '@gisik-nokma/domain';
import { createFakeDataSource } from '../helpers/fake-data-source.js';
import { TICKET, WS, ticketStateSeed } from '../helpers/seed.js';
import { TicketSheet } from '../../src/views/ticket-sheet.js';
import type { TicketComment } from '../../src/views/comments-thread.js';
import type { TicketRead } from '../../src/view-types.js';
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

/* ------------------------------------------------------------------ *
 * The section on the ticket sheet (27.149–27.151). `MINIMAL_READ` and the
 * sheet's props are copied from `ticket-notes-section.test.tsx`.
 * ------------------------------------------------------------------ */
const MINIMAL_READ: TicketRead = {
  ticket: ticketStateSeed(),
  title: 'File the GST return',
  stateProvenance: { actorId: 'user_anselma', actorName: 'Anselma Marak', clientTime: '2026-08-19T09:58:12.000Z', serverTime: '2026-08-19T10:00:00.000Z' },
  assignedProvenance: null,
  visibility: null,
  parent: null,
  rollup: null,
  key: null,
  epic: null,
};
const commentRow = row(3, {
  sourceKind: 'comment', sourceId: 'C9',
  parent: { kind: 'ticket', ticketId: 'S3', projectId: 'P', key: 'GN-160', title: 'x', stateCategory: 'open' },
});
function comment(commentId: string): TicketComment {
  return {
    commentId, authorId: 'user_kiro', recordedAt: '2026-09-20T16:23:57.306Z', files: [],
    body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `body of ${commentId}` }] }] },
  };
}
const EVENT_FRAME: ServerStreamFrame = {
  type: 'event',
  envelope: {
    id: '01J9GEVT000000000000000099', workspaceId: WS, entity: { kind: 'ticket', id: TICKET }, type: 'ticket.field_set', version: 1,
    payload: {}, actorId: 'user_anselma', origin: 'web', clientTime: '2026-08-20T08:59:00.000Z', serverTime: '2026-08-20T09:00:00.000Z', seq: 4, workspaceSeq: 9,
  },
} as ServerStreamFrame;
const sheet = (source: ReturnType<typeof createFakeDataSource>, over: Partial<Parameters<typeof TicketSheet>[0]> = {}) => (
  <TicketSheet dataSource={source} workspaceId={WS} ticketId={TICKET} currentUserId="user_kiro" onClose={vi.fn()} {...over} />
);

describe('27.149 the ticket sheet asks for its Linked from and draws it between Notes and the thread', () => {
  it('27.149 one call for { kind: ticket, id }; the section follows ticket-notes and precedes the comment thread; total 0 draws none (control)', async () => {
    const getLinkedFrom = vi.fn(async () => ({ total: 1, items: [row(1)], nextCursor: null }));
    const { container, unmount } = render(sheet(createFakeDataSource({ getTicket: async () => MINIMAL_READ, getLinkedFrom })));
    const section = await screen.findByTestId('linked-from');
    expect(getLinkedFrom).toHaveBeenCalledTimes(1);
    expect(getLinkedFrom).toHaveBeenCalledWith(WS, { kind: 'ticket', id: TICKET });
    const notes = screen.getByTestId('ticket-notes');
    const thread = container.querySelector('.gn-comments');
    expect(thread).not.toBeNull();
    expect(notes.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(section.compareDocumentPosition(thread!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    unmount();

    // CONTROL: the same sheet whose read answers total 0 draws no section, after the read has answered.
    const empty = vi.fn(async () => ({ total: 0, items: [], nextCursor: null }));
    render(sheet(createFakeDataSource({ getTicket: async () => MINIMAL_READ, getLinkedFrom: empty })));
    await screen.findByTestId('ticket-notes');
    await waitFor(() => expect(empty).toHaveBeenCalledTimes(1));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(screen.queryByTestId('linked-from')).toBeNull();
  });
});

describe('27.150 the sheet scrolls to #comment-<id> once the thread arrives, once per hash', () => {
  afterEach(() => {
    window.location.hash = '';
    document.getElementById('heading-x')?.remove();
    vi.restoreAllMocks();
  });

  it('27.150 #comment-c1 scrolls that comment into view once, and a reload does not scroll again; #heading-x is never scrolled (control)', async () => {
    if (!('scrollIntoView' in Element.prototype)) {
      Object.defineProperty(Element.prototype, 'scrollIntoView', { value: () => undefined, configurable: true, writable: true });
    }
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => undefined);
    window.location.hash = '#comment-c1';
    // A NEW array on every call: a same-reference answer would not re-run the effect, and the guard mutant would survive.
    const getTicketComments = vi.fn(async () => [comment('c1')]);
    const source = createFakeDataSource({ getTicket: async () => MINIMAL_READ, getTicketComments });
    const { unmount } = render(sheet(source));
    await waitFor(() => expect(scroll).toHaveBeenCalledTimes(1));
    expect(scroll.mock.contexts[0]).toBe(document.getElementById('comment-c1'));
    act(() => source.pushStreamItem(EVENT_FRAME));
    // Precondition: the thread was read TWICE, so the effect has had its second chance.
    await waitFor(() => expect(getTicketComments).toHaveBeenCalledTimes(2));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(scroll).toHaveBeenCalledTimes(1);
    unmount();

    // CONTROL, fresh render: a hash naming a REAL element that is not a comment is left alone.
    scroll.mockClear();
    const heading = document.createElement('div');
    heading.id = 'heading-x';
    document.body.appendChild(heading);
    window.location.hash = '#heading-x';
    render(sheet(createFakeDataSource({ getTicket: async () => MINIMAL_READ, getTicketComments: vi.fn(async () => [comment('c1')]) })));
    await screen.findByTestId('comment-c1');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(scroll).not.toHaveBeenCalled();
  });
});

describe('27.151 a Linked from row on the sheet navigates through the sheet’s own href and onNavigate', () => {
  it('27.151 a comment row on ticket S3 calls onNavigate with exactly /t/S3#comment-C9', async () => {
    const onNavigate = vi.fn();
    const getLinkedFrom = vi.fn(async () => ({ total: 1, items: [commentRow], nextCursor: null }));
    render(
      sheet(createFakeDataSource({ getTicket: async () => MINIMAL_READ, getLinkedFrom }), {
        resolveTicketHref: (ref) => `/t/${ref.ticketId}`,
        onNavigate,
      }),
    );
    const section = await screen.findByTestId('linked-from');
    await userEvent.click(within(section).getByRole('link'));
    expect(onNavigate.mock.calls).toEqual([['/t/S3#comment-C9']]);
  });
});
