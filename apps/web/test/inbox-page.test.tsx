import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpError } from '@gisik-nokma/app-core/online';
import type { Notification } from '@gisik-nokma/domain';
import { Providers } from '../src/providers.js';
import { EXPIRED_SESSION_COPY } from '../src/expired-session.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * `/inbox`, driven through the REAL `Providers`/`useAppServices` pair with stub
 * gateways — the seam `providers.tsx` argues for, and the reason Task 14 mounts
 * the notifications gateway there instead of minting one inside the page as the
 * plan's sketch does. Mocking `../src/providers.js` would have made the wiring
 * under test the harness's.
 */
const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: 'u_kiro', name: 'Kiro' } } }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import InboxPage, {
  CANNOT_OPEN_COPY,
  EMPTY_INBOX_COPY,
  PAGING_FAILURE_PREFIX,
} from '../app/inbox/page.js';

afterEach(() => {
  push.mockClear();
});

function assignment(id: string, read = false): Notification {
  return {
    id,
    userId: 'u_kiro',
    workspaceId: 'ws_1',
    kind: 'assignment',
    dedupeKey: `assignment:${id}`,
    read,
    createdAt: '2026-08-20T10:00:00.000Z',
    payload: {
      ticketId: `t_${id}`,
      ticketTitle: 'Restock the cold shelf',
      assignedBy: 'u_ana',
      eventId: 'ev_1',
      clientTime: '2026-08-20T09:59:00.000Z',
      serverTime: '2026-08-20T10:00:00.000Z',
    },
  };
}

/** A promise this test resolves by hand, so the LOADING window is a state and not a race. */
function deferred<T>() {
  let settle!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

describe('/inbox — four states, because the plan’s two collapse the one that lies', () => {
  it('11.144 says "Loading…" while the first page is in flight, NOT that the inbox is empty', async () => {
    const first = deferred<{ notifications: Notification[]; nextCursor: string | null }>();
    render(
      <Providers
        services={stubServices({}, { notifications: { list: async () => first.promise } })}
      >
        <InboxPage />
      </Providers>,
    );

    expect(await screen.findByText('Loading…')).toBeInTheDocument();
    // The pair that makes the line above a test: the empty copy is NOT also on
    // screen. A page holding `useState<Notification[]>([])` would render it here.
    expect(screen.queryByText(EMPTY_INBOX_COPY)).not.toBeInTheDocument();

    first.settle({ notifications: [], nextCursor: null });
    await waitFor(() => expect(screen.getByText(EMPTY_INBOX_COPY)).toBeInTheDocument());
  });

  it('11.145 names an empty inbox instead of rendering a blank box', async () => {
    render(
      <Providers
        services={stubServices(
          {},
          { notifications: { list: async () => ({ notifications: [], nextCursor: null }) } },
        )}
      >
        <InboxPage />
      </Providers>,
    );
    expect(await screen.findByText(EMPTY_INBOX_COPY)).toBeInTheDocument();
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
  });

  it('11.146 renders every row the gateway answered, and marks an unread one read on click', async () => {
    const marked: string[] = [];
    render(
      <Providers
        services={stubServices(
          {},
          {
            notifications: {
              list: async () => ({
                notifications: [assignment('n_2'), assignment('n_1', true)],
                nextCursor: null,
              }),
              markRead: async (id) => {
                marked.push(id);
              },
            },
            ticketLocation: { locate: async () => ({ workspaceId: 'ws_1', projectId: 'p_1' }) },
          },
        )}
      >
        <InboxPage />
      </Providers>,
    );

    const rows = await screen.findAllByRole('button', { name: /Restock the cold shelf/ });
    // COUNT, printed rather than asserted one at a time: a per-row lookup passes
    // just as happily when a different row was dropped.
    expect(rows).toHaveLength(2);

    await userEvent.click(rows[0]!);
    expect(marked).toEqual(['n_2']);
    await waitFor(() => expect(push).toHaveBeenCalledWith('/w/ws_1/p/p_1?ticket=t_n_2'));

    // The already-read row is not marked again — the gateway is idempotent, so
    // this is about not spending a request per click on a row with nothing to change.
    await userEvent.click(rows[1]!);
    expect(marked).toEqual(['n_2']);
  });

  it('11.147 reloads the truth when markRead is refused, instead of leaving an invented read flag', async () => {
    let listCalls = 0;
    render(
      <Providers
        services={stubServices(
          {},
          {
            notifications: {
              list: async () => {
                listCalls += 1;
                return { notifications: [assignment('n_theirs')], nextCursor: null };
              },
              // The route's 404 for a row that is not yours AND for one that
              // does not exist — one frozen body, and the gateway does not
              // swallow it (case 11.138).
              markRead: async () => {
                throw new HttpError(404, '/v1/me/notifications/n_theirs/read', {
                  error: 'not_found',
                });
              },
            },
            ticketLocation: { locate: async () => null },
          },
        )}
      >
        <InboxPage />
      </Providers>,
    );

    const row = await screen.findByRole('button', { name: /Restock the cold shelf/ });
    expect(listCalls).toBe(1);
    await userEvent.click(row);
    await waitFor(() => expect(listCalls).toBe(2));
    // The row is drawn from the reloaded answer, so it is unread again.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Restock the cold shelf/ })).toHaveAttribute(
        'data-unread',
        'true',
      ),
    );
  });

  it('11.148 appends the next page rather than replacing the rows on screen', async () => {
    const pages = [
      { notifications: [assignment('n_3')], nextCursor: 'n_3' },
      { notifications: [assignment('n_2')], nextCursor: null },
    ];
    let call = 0;
    render(
      <Providers
        services={stubServices(
          {},
          { notifications: { list: async () => pages[call++]! } },
        )}
      >
        <InboxPage />
      </Providers>,
    );

    const more = await screen.findByRole('button', { name: /more/i });
    await userEvent.click(more);
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /Restock the cold shelf/ })).toHaveLength(2),
    );
    // Exhausted: the control is withdrawn rather than left offering a page that
    // does not exist.
    expect(screen.queryByRole('button', { name: /more/i })).not.toBeInTheDocument();
  });

  it('11.149 renders a refusal with the server’s own words when the list read fails', async () => {
    render(
      <Providers
        services={stubServices(
          {},
          {
            notifications: {
              list: async () => {
                throw new Error('the notifications table is not migrated on this deployment');
              },
            },
          },
        )}
      >
        <InboxPage />
      </Providers>,
    );

    // The whole PANEL, reached from the heading half. `findByText` matches the
    // innermost node — `ShellRefusal`'s `<span>` — and asserting on that one
    // proves only that the heading rendered, while the server's own words live
    // in the sibling text beside it. A bare `findByRole('status')` cannot be
    // used here either: the loading arm carries that role too, so it resolves on
    // the first frame and the assertion reads "Loading…".
    const refusal = (await screen.findByText(/Your inbox cannot be shown yet\./)).closest(
      '[role="status"]',
    );
    expect(refusal?.textContent).toContain('the notifications table is not migrated');
    // Neither falsehood stands in its place.
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
    expect(screen.queryByText(EMPTY_INBOX_COPY)).not.toBeInTheDocument();
  });

  it('11.150 sends a 401 to sign-in rather than calling an ended session a refusal', async () => {
    render(
      <Providers
        services={stubServices(
          {},
          {
            notifications: {
              list: async () => {
                throw new HttpError(401, '/v1/me/notifications', { error: 'unauthenticated' });
              },
            },
          },
        )}
      >
        <InboxPage />
      </Providers>,
    );

    expect(await screen.findByText(EXPIRED_SESSION_COPY)).toBeInTheDocument();
    await waitFor(() => expect(push).toHaveBeenCalledWith('/sign-in'));
    expect(screen.queryByText(/Your inbox cannot be shown yet\./)).not.toBeInTheDocument();
  });

  it('11.151 says the ticket cannot be opened — and keeps the message — when the locator answers null', async () => {
    render(
      <Providers
        services={stubServices(
          {},
          {
            notifications: {
              list: async () => ({ notifications: [assignment('n_1')], nextCursor: null }),
              markRead: async () => undefined,
            },
            // The ticket route's ONE 404, for "no such ticket" and "not yours" alike.
            ticketLocation: { locate: async () => null },
          },
        )}
      >
        <InboxPage />
      </Providers>,
    );

    await userEvent.click(await screen.findByRole('button', { name: /Restock the cold shelf/ }));
    expect(await screen.findByText(CANNOT_OPEN_COPY)).toBeInTheDocument();
    // No navigation to a URL that routes nowhere...
    expect(push).not.toHaveBeenCalled();
    // ...and the delivered message is still on the page: "a message you were
    // sent is yours; revocation removes future sight, not letters delivered".
    expect(screen.getByRole('button', { name: /Restock the cold shelf/ })).toBeInTheDocument();
  });
  /**
   * 11.172 — A FAILED "Load more" MUST NOT TAKE AWAY THE MESSAGES THAT ARRIVED.
   *
   * Measured before the fix, with a throwaway probe: page 1 serving one
   * notification and page 2 throwing left **0 rows on screen and 1 refusal
   * panel**. The mechanism was not subtle and not defensive — `loadMore`'s catch
   * called `setError`, and `ShellRefusal` is the render's FIRST arm, ahead of
   * both the loading and the rows arms — so a request that FAILED removed
   * messages the server had already DELIVERED.
   *
   * That inverts the standard the two files either side of it argue for at
   * length. `inbox-nav-link.tsx` keeps its last count rather than asserting
   * "none" from a request that did not answer; this page's whole four-arm shape
   * exists so "a reader whose inbox is still arriving is not told it is empty".
   * And it runs straight against the standing ruling that a message you were
   * sent is yours.
   *
   * Four things are asserted, because three of them alone would each pass over a
   * different half-fix: the rows stay, the failure is NAMED with the server's own
   * words, the refusal panel is ABSENT (the arm that used to eat the page), and
   * the Load-more control is still offered — `nextCursor` never moved, so the
   * retry is real, and a control withdrawn on failure would strand the reader on
   * a partial inbox with no way forward. The retry then clears the notice in the
   * same case, so the fix does not ship Minor (a)'s defect in new code.
   */
  it('11.172 keeps the rows already on screen when the next page fails, and retries', async () => {
    let call = 0;
    render(
      <Providers
        services={stubServices(
          {},
          {
            notifications: {
              list: async () => {
                call += 1;
                if (call === 1) return { notifications: [assignment('n_3')], nextCursor: 'n_3' };
                if (call === 2) throw new Error('the cursor has expired');
                return { notifications: [assignment('n_2')], nextCursor: null };
              },
            },
          },
        )}
      >
        <InboxPage />
      </Providers>,
    );

    await userEvent.click(await screen.findByRole('button', { name: /more/i }));
    await waitFor(() => expect(call).toBe(2));

    // 1. The message that DID arrive is still the reader's.
    expect(screen.getAllByRole('button', { name: /Restock the cold shelf/ })).toHaveLength(1);
    // 2. Named, in the server's own words rather than a paraphrase.
    const notice = await screen.findByText(new RegExp(PAGING_FAILURE_PREFIX.slice(0, 40)));
    expect(notice.textContent).toContain('the cursor has expired');
    // 3. NOT the arm that blanks the page. Asserted on the panel's own words:
    //    `findByRole('status')` is ambiguous here, as 11.149 records.
    expect(screen.queryByText(/Your inbox cannot be shown yet\./)).not.toBeInTheDocument();
    // 4. Still offered: the cursor did not move, so there is still a next page.
    const retry = screen.getByRole('button', { name: /more/i });

    await userEvent.click(retry);
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /Restock the cold shelf/ })).toHaveLength(2),
    );
    // The complaint about the try that failed is withdrawn by the try that worked.
    expect(
      screen.queryByText(new RegExp(PAGING_FAILURE_PREFIX.slice(0, 40))),
    ).not.toBeInTheDocument();
  });

  /**
   * 11.173 — a successful open CLEARS the notice a failed one left.
   *
   * `open()` opens with `setOpenFailure(null)`, and removing that line survived
   * the whole file: every case that produces the notice ends with it on screen,
   * and no case ever opened a ticket successfully afterwards. The consequence of
   * the gap is a sentence that outlives its cause — "that ticket cannot be
   * opened" still on the page while the reader is being navigated to a different
   * ticket that opened fine.
   *
   * `locate` answers per call: the first row click meets the ticket route's one
   * 404, the second meets a real placement.
   */
  it('11.173 clears the “cannot be opened” notice when the next open succeeds', async () => {
    let locates = 0;
    render(
      <Providers
        services={stubServices(
          {},
          {
            notifications: {
              list: async () => ({ notifications: [assignment('n_1')], nextCursor: null }),
              markRead: async () => undefined,
            },
            ticketLocation: {
              locate: async () => {
                locates += 1;
                return locates === 1 ? null : { workspaceId: 'ws_1', projectId: 'p_1' };
              },
            },
          },
        )}
      >
        <InboxPage />
      </Providers>,
    );

    const row = await screen.findByRole('button', { name: /Restock the cold shelf/ });
    await userEvent.click(row);
    expect(await screen.findByText(CANNOT_OPEN_COPY)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Restock the cold shelf/ }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/w/ws_1/p/p_1?ticket=t_n_1'));
    // The stale sentence is gone rather than sitting under a successful navigation.
    expect(screen.queryByText(CANNOT_OPEN_COPY)).not.toBeInTheDocument();
  });
  /**
   * 11.177 — the reload takes the paging complaint with it.
   *
   * Written because the mutation round found `loadFirstPage`'s
   * `setPagingError(null)` surviving: 11.172 pins the retry path, and nothing
   * stood on the other path that replaces the rows. The trigger is real rather
   * than contrived — a refused `markRead` reloads the truth (11.147) — and the
   * consequence of the gap is a sentence describing a second page that is no
   * longer on screen, sitting under a freshly read first one.
   */
  it('11.177 drops the paging failure when a reload replaces the rows it described', async () => {
    let listCalls = 0;
    render(
      <Providers
        services={stubServices(
          {},
          {
            notifications: {
              list: async () => {
                listCalls += 1;
                if (listCalls === 2) throw new Error('the cursor has expired');
                return { notifications: [assignment('n_3')], nextCursor: 'n_3' };
              },
              markRead: async () => {
                throw new HttpError(404, '/v1/me/notifications/n_3/read', { error: 'not_found' });
              },
            },
            // Answers the route's one 404 so the click produces no navigation;
            // this case is about the paging notice, not the deep link.
            ticketLocation: { locate: async () => null },
          },
        )}
      >
        <InboxPage />
      </Providers>,
    );

    await userEvent.click(await screen.findByRole('button', { name: /more/i }));
    await screen.findByText(new RegExp(PAGING_FAILURE_PREFIX.slice(0, 40)));

    // The refused markRead reloads the first page (11.147's mechanism).
    await userEvent.click(screen.getByRole('button', { name: /Restock the cold shelf/ }));
    await waitFor(() => expect(listCalls).toBe(3));
    await waitFor(() =>
      expect(
        screen.queryByText(new RegExp(PAGING_FAILURE_PREFIX.slice(0, 40))),
      ).not.toBeInTheDocument(),
    );
    // And the reloaded row is on screen, so the notice went away with its subject
    // rather than with the whole page.
    expect(screen.getByRole('button', { name: /Restock the cold shelf/ })).toBeInTheDocument();
  });
});
