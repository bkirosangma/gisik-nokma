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

import InboxPage, { BULK_REFUSED_COPY, BULK_UNREACHED_COPY } from '../app/inbox/page.js';

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

function renderInbox(notifications: Notification[], setRead: SetReadFn) {
  render(
    <Providers
      services={stubServices(
        {},
        {
          notifications: {
            list: async () => ({ notifications, nextCursor: null }),
            unreadCount: async () => notifications.filter((n) => !n.read).length,
            markRead: async () => undefined,
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
