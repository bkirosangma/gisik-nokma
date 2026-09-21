import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Notification } from '@gisik-nokma/domain';
import { HttpError } from '@gisik-nokma/app-core/online';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * **16.41 — the inbox's bulk action and its UNDO, at the call site.**
 *
 * The route's own suite proves what `POST /v1/me/notifications/read` does. What
 * it cannot prove is the thing this page has to get right: **the Undo must
 * un-read exactly the ids the SERVER reported changing, not the ids the page
 * asked about.** Those differ whenever a requested row was already read — and
 * un-reading such a row would put a notification back on screen that nobody
 * took away, with nothing recording who did it.
 *
 * The fake returns a SUBSET of what it was asked for on purpose, so a page that
 * discards `changed` and un-reads its own request fails here rather than in
 * production. That is the whole reason the route answers with a list.
 */
const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => ({}),
  usePathname: () => '/inbox',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: 'u_kiro', name: 'Kiro' } } }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import InboxPage, {
  BULK_REFUSED_COPY,
  BULK_UNREACHED_COPY,
  ROW_REFUSED_COPY,
  ROW_UNREACHED_COPY,
  UNDO_FAILED_COPY,
} from '../app/inbox/page.js';

afterEach(() => {
  push.mockClear();
});

function assignment(id: string, read = false): Notification {
  return {
    id,
    userId: 'u_kiro',
    workspaceId: '01J9GWS0000000000000000000',
    kind: 'assignment',
    dedupeKey: `assignment:${id}`,
    payload: {
      ticketId: '01J9GTKA000000000000000000',
      ticketTitle: 'Renew the DLT registration',
      assignedBy: '01J9GUKR000000000000000000',
      eventId: id,
      clientTime: '2026-08-19T10:00:00.000Z',
      serverTime: '2026-08-19T10:00:01.000Z',
    },
    read,
    createdAt: '2026-08-23T05:00:00.000Z',
  };
}

const THREE_UNREAD = [
  assignment('01JN0000000000000000000001'),
  assignment('01JN0000000000000000000002'),
  assignment('01JN0000000000000000000003'),
];

type SetReadFn = (ids: readonly string[], read: boolean) => Promise<string[]>;

function renderInbox(
  notifications: Notification[],
  setRead: SetReadFn,
  // Defaulted to the silent success every case before 13.1108 wants, and
  // overridden by that case alone — which is the one that measures the
  // single-row failure.
  markRead: (id: string) => Promise<void> = async () => undefined,
) {
  render(
    <Providers
      services={stubServices(
        {},
        {
          notifications: {
            list: async () => ({ notifications, nextCursor: null }),
            unreadCount: async () => notifications.filter((n) => !n.read).length,
            markRead,
            setRead,
          },
        },
      )}
    >
      <InboxPage />
    </Providers>,
  );
  return { setRead };
}

describe('16.41 the inbox bulk action and its Undo', () => {
  it('16.41 offers "Mark N read" for the rows it has drawn — and says N, never "all"', async () => {
    renderInbox(THREE_UNREAD, async (ids) => [...ids]);
    // The label is a claim about the DRAW N, because the action is id-scoped:
    // the prototype's "Mark all read" would be a claim about the whole inbox.
    expect(await screen.findByRole('button', { name: 'Mark 3 read' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mark all read/ })).toBeNull();
  });

  it('16.41 draws no bulk control when nothing drawn is unread', async () => {
    renderInbox([assignment('01JN0000000000000000000009', true)], async (ids) => [...ids]);
    // Wait for the list itself, so "no control" is read off a settled page.
    expect(await screen.findByRole('status', { hidden: true }).catch(() => null)).toBeDefined();
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Mark \d+ read$/ })).toBeNull());
  });

  it('16.41 sends the drawn-unread ids, once, and marks them locally', async () => {
    const calls: { ids: string[]; read: boolean }[] = [];
    renderInbox(THREE_UNREAD, async (ids, read) => {
      calls.push({ ids: [...ids], read });
      return [...ids];
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Mark 3 read' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.read).toBe(true);
    expect([...calls[0]!.ids].sort()).toEqual(THREE_UNREAD.map((n) => n.id).sort());
    // The rows redraw as read, and the control withdraws — nothing left to mark.
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Mark \d+ read$/ })).toBeNull());
  });

  it('16.41 ⚠ the UNDO sends the SERVER’S changed set, not the ids we asked about', async () => {
    const calls: { ids: string[]; read: boolean }[] = [];
    // The forward call reports ONE row changed although THREE were requested —
    // the shape an already-read row produces. The Undo must carry that one.
    renderInbox(THREE_UNREAD, async (ids, read) => {
      calls.push({ ids: [...ids], read });
      return read ? [ids[0]!] : [...ids];
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Mark 3 read' }));
    // The toast counts what CHANGED, not what was asked for.
    expect(await screen.findByText('1 notification marked read')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));

    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]!.read).toBe(false);
    // ⚠ ONE id, not three. A page that sent its own request back would send
    // all three and un-read two rows the forward call never touched.
    expect(calls[1]!.ids).toEqual([THREE_UNREAD[0]!.id]);
  });

  it('16.41 the Undo puts the row back to unread on screen, and withdraws itself', async () => {
    let forwardDone = false;
    renderInbox(THREE_UNREAD, async (ids, read) => {
      if (read) {
        forwardDone = true;
        return [ids[0]!];
      }
      return [...ids];
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Mark 3 read' }));
    expect(await screen.findByText('1 notification marked read')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));

    // The toast is gone, and the row it un-read is offered again — the control
    // is drawn from the same state the row is.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull());
    expect(forwardDone).toBe(true);
    expect(await screen.findByRole('button', { name: 'Mark 1 read' })).toBeInTheDocument();
  });

  it('16.41 Dismiss drops the Undo without sending anything', async () => {
    const calls: { ids: string[]; read: boolean }[] = [];
    renderInbox(THREE_UNREAD, async (ids, read) => {
      calls.push({ ids: [...ids], read });
      return [...ids];
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Mark 3 read' }));
    await screen.findByRole('button', { name: 'Undo' });
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull());
    // ONE call: the forward write. Dismissing is not a second write.
    expect(calls).toHaveLength(1);
  });

  it('16.41 a REFUSED bulk write SAYS SO, and reloads rather than leaving rows drawn as read', async () => {
    /**
     * ⚠ **THE SENTENCE IS THE ASSERTION, AND IT WAS MISSING FROM THE FIRST
     * VERSION OF THIS ARM.** That version checked only that the control came
     * back — which a page that swallowed the failure entirely would also do.
     * Independent review reproduced the real behaviour: over the bound, a click
     * marked nothing, said nothing, and snapped the list back from 120 rows to
     * 30. The adapter's own docblock promised *"the caller renders the refusal
     * rather than assuming the write landed"*, so this arm is that promise.
     */
    let attempts = 0;
    renderInbox(THREE_UNREAD, async () => {
      attempts += 1;
      // The route's own refusal, with the status the page distinguishes on.
      throw new HttpError(400, 'POST /v1/me/notifications/read', { error: 'invalid_ids', max: 100 });
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Mark 3 read' }));

    expect(await screen.findByText(BULK_REFUSED_COPY)).toBeInTheDocument();
    // And it is NOT the transport sentence — the server adjudicated, and saying
    // it could not be reached would be a different, false fact.
    expect(screen.queryByText(BULK_UNREACHED_COPY)).toBeNull();
    // The optimistic flip is rolled back by a reload, so the control returns.
    await waitFor(() => expect(attempts).toBe(1));
    expect(await screen.findByRole('button', { name: 'Mark 3 read' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('16.41 a bulk write that never reached a server says THAT instead, never a refusal', async () => {
    renderInbox(THREE_UNREAD, async () => {
      throw new TypeError('Failed to fetch');
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Mark 3 read' }));

    expect(await screen.findByText(BULK_UNREACHED_COPY)).toBeInTheDocument();
    expect(screen.queryByText(BULK_REFUSED_COPY)).toBeNull();
  });

  it('16.41 a second attempt CLEARS the first attempt’s refusal', async () => {
    let first = true;
    renderInbox(THREE_UNREAD, async (ids) => {
      if (first) {
        first = false;
        throw new HttpError(400, 'POST /v1/me/notifications/read', { error: 'invalid_ids', max: 100 });
      }
      return [...ids];
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Mark 3 read' }));
    expect(await screen.findByText(BULK_REFUSED_COPY)).toBeInTheDocument();

    await userEvent.click(await screen.findByRole('button', { name: 'Mark 3 read' }));
    // The sentence described the FIRST attempt; leaving it standing while the
    // second succeeds would describe something that is over.
    await waitFor(() => expect(screen.queryByText(BULK_REFUSED_COPY)).toBeNull());
  });
});

describe('13.1108/13.1109 the single-row reads and the Undo, which spoke to nobody (E5-10)', () => {
  /**
   * 13.1108 — E5-10. `markRead(id)` flipped the row optimistically and then
   * `void gateway.markRead(id).catch(() => loadFirstPage())` — a reload and NO
   * sentence. The bulk path sixty lines up classifies the failure and renders it,
   * and its own docblock records why: *"The first version of this catch reloaded
   * and said NOTHING: a reader over the bound saw a click do nothing and the list
   * snap back, with no sentence anywhere."* The single-row path was still that
   * first version.
   *
   * Both arms are asserted, because the page tells a server REFUSAL apart from a
   * transport failure everywhere else and a row must not be the one place that
   * collapses them: an `HttpError` is the server adjudicating, anything else
   * never reached one. **The row splits by KIND where the bulk arm splits by
   * STATUS** — the bulk route's 400 is its bound, a number only a bulk request
   * can exceed, and the single-row route's only status is the 404 both arms of
   * "not yours" and "does not exist" share.
   */
  it('13.1108 a refused single-row mark-read SAYS SO rather than reloading in silence', async () => {
    renderInbox(THREE_UNREAD, async (ids) => [...ids], async () => {
      // The route's 404 for a row that is not yours and for one that does not
      // exist — one frozen body, and the gateway does not swallow it (11.138).
      throw new HttpError(404, '/v1/me/notifications/01JN0000000000000000000001/read', {
        error: 'not_found',
      });
    });

    // EVERY row shares this ticket's title, so the query is plural and the
    // FIRST is clicked — a singular query reddens for a reason that is not this case's.
    const rows = await screen.findAllByRole('button', { name: /Renew the DLT registration/ });
    await userEvent.click(rows[0]!);

    expect(await screen.findByText(ROW_REFUSED_COPY)).toBeInTheDocument();
    expect(screen.queryByText(ROW_UNREACHED_COPY)).toBeNull();
  });

  it('13.1108 a single-row mark-read that never reached a server says THAT instead, never a refusal', async () => {
    renderInbox(THREE_UNREAD, async (ids) => [...ids], async () => {
      throw new TypeError('Failed to fetch');
    });

    // EVERY row shares this ticket's title, so the query is plural and the
    // FIRST is clicked — a singular query reddens for a reason that is not this case's.
    const rows = await screen.findAllByRole('button', { name: /Renew the DLT registration/ });
    await userEvent.click(rows[0]!);

    expect(await screen.findByText(ROW_UNREACHED_COPY)).toBeInTheDocument();
    expect(screen.queryByText(ROW_REFUSED_COPY)).toBeNull();
  });

  /**
   * 13.1109 — the Undo. `undoMarkAllRead` had the SAME silent catch
   * (`void gateway.setRead(ids, false).catch(() => loadFirstPage())`), so a
   * failed undo flipped the rows back to read with nothing said — and the reader
   * had just been TOLD they were unread, by a toast that then disappeared.
   */
  it('13.1109 a REFUSED undo says so, rather than silently leaving the rows read', async () => {
    renderInbox(THREE_UNREAD, async (ids, read) => {
      if (!read) throw new HttpError(404, '/v1/me/notifications/read', { error: 'not_found' });
      return [...ids];
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Mark 3 read' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));

    expect(await screen.findByText(UNDO_FAILED_COPY)).toBeInTheDocument();
  });
});

describe('17.071 the single row’s failure speaks in the ROW’s vocabulary (E2-26)', () => {
  /**
   * 17.071 — E2-26, filed independently of E5-10 against the same lines
   * (`inbox/page.tsx:278`, `:269-279`) and judged to score alongside it. The fix
   * landed with E5-10; what this case adds is the property that fix turns on and
   * that E5-10's case does NOT assert.
   *
   * **The finding's own remedy was "reuse the same two sentences the bulk path
   * already has — one fact, one vocabulary, no new copy", and this case asserts
   * the opposite on purpose, so the deviation is visible rather than silent.**
   * The bulk pair says *"Those notifications were not marked read"* — a plural,
   * about a set. Said about ONE row it is a second false statement laid on top of
   * the missing one: the reader clicked one row and is told about several. So the
   * row has its own pair, and this case pins BOTH halves of that choice — the
   * row's sentence present, the bulk's absent.
   */
  it('17.071 the row says “That notification”, never the bulk path’s “Those notifications”', async () => {
    renderInbox(THREE_UNREAD, async (ids) => [...ids], async () => {
      throw new TypeError('Failed to fetch');
    });

    const rows = await screen.findAllByRole('button', { name: /Renew the DLT registration/ });
    await userEvent.click(rows[0]!);

    expect(await screen.findByText(ROW_UNREACHED_COPY)).toBeInTheDocument();
    // THE HALF THAT MAKES THIS A DIFFERENT CASE FROM E5-10's: the bulk sentence
    // is the one the finding asked for, and it must NOT be the one rendered.
    expect(screen.queryByText(BULK_UNREACHED_COPY)).toBeNull();
    expect(screen.queryByText(BULK_REFUSED_COPY)).toBeNull();
  });
});
