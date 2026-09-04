import { render, screen, within } from '@testing-library/react';
// Named import, not the default: `@testing-library/user-event` ships no default
// export under this package's resolution, and the default spelling resolves to
// `undefined` at `userEvent.setup()` rather than failing at the import.
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NOTIFICATION_KINDS } from '@gisik-nokma/domain';
import { notificationBody, notificationHeadline } from '../../src/inbox/format.js';
import { InboxView } from '../../src/inbox/inbox-view.js';
import { notificationOf, oneOfEveryKind, userName } from './fixtures.js';

/**
 * 11.89–11.93 — `InboxView`.
 *
 * EVERY CONDITIONAL AFFORDANCE IS ASSERTED IN BOTH DIRECTIONS, and that is a
 * claim this file has to earn rather than announce: the recorded failure on
 * this branch is a commit that asserted exactly this sentence while ten
 * mutants survived. The affordances are enumerated here so a reader can check
 * the list against the component rather than against the prose —
 * `data-unread`, the unread dot, the mark-read guard, `Load more`, and the map
 * itself — and each has a test that fires when it is FORCED ON as well as one
 * that fires when it is forced off.
 *
 * The expected strings are never hand-typed. Every headline and body is
 * composed by calling the same `format.ts` function the component calls,
 * because the question here is "did the row pass the string through" and not
 * "what does the string say" — that is pinned one layer down in
 * `format.test.ts`, where the literals live.
 */
const ROW = '.gn-inbox__row';

describe('11.89 a row is the notification, whole', () => {
  it('renders the attributed headline, the body, the kind icon and the unread mark', async () => {
    const user = userEvent.setup();
    const notification = notificationOf('date-approaching');
    const onOpen = vi.fn();
    const onMarkRead = vi.fn();
    render(
      <InboxView
        notifications={[notification]}
        userName={userName}
        onOpen={onOpen}
        onMarkRead={onMarkRead}
      />,
    );

    const row = screen.getByRole('button', {
      name: new RegExp(notificationHeadline(notification, userName)),
    });
    expect(row).toHaveAttribute('data-unread', 'true');
    expect(row).toHaveAttribute('data-notification-id', notification.id);
    expect(within(row).getByText(notificationBody(notification))).not.toBeNull();
    expect(row.querySelector('svg[data-kind="date-approaching"]')).not.toBeNull();
    expect(row.querySelector('.gn-inbox__dot')).not.toBeNull();

    await user.click(row);
    expect(onMarkRead).toHaveBeenCalledWith(notification.id);
    expect(onOpen).toHaveBeenCalledWith(notification);
  });

  it('a read row carries NO unread mark and is not marked again', async () => {
    const user = userEvent.setup();
    const notification = notificationOf('date-approaching', { read: true });
    const onOpen = vi.fn();
    const onMarkRead = vi.fn();
    render(
      <InboxView
        notifications={[notification]}
        userName={userName}
        onOpen={onOpen}
        onMarkRead={onMarkRead}
      />,
    );

    const row = screen.getByRole('button', {
      name: new RegExp(notificationHeadline(notification, userName)),
    });
    // The other direction of `data-unread` and of the dot. Without this pair a
    // `data-unread` hard-coded to `'true'`, and a dot rendered unconditionally,
    // both pass every assertion in the test above.
    expect(row).not.toHaveAttribute('data-unread');
    expect(row.querySelector('.gn-inbox__dot')).toBeNull();

    await user.click(row);
    expect(onMarkRead).not.toHaveBeenCalled();
    // Opening still happens: the guard is about not re-marking, not about
    // making a read row inert.
    expect(onOpen).toHaveBeenCalledWith(notification);
  });

  it('a MIXED list draws both states at once, so the probe is proven able to see both', () => {
    // A single-state render proves the branch it rendered and nothing about
    // whether the query could have seen the other one. One list, one query,
    // both answers.
    render(
      <InboxView
        notifications={[
          notificationOf('assignment', { read: false }),
          notificationOf('mention', { read: true }),
          notificationOf('stale-ticket', { read: false }),
        ]}
        userName={userName}
        onOpen={vi.fn()}
        onMarkRead={vi.fn()}
      />,
    );
    const rows = [...document.querySelectorAll(ROW)];
    expect(rows.map((row) => row.getAttribute('data-unread'))).toEqual(['true', null, 'true']);
    expect(rows.map((row) => row.querySelector('.gn-inbox__dot') !== null)).toEqual([
      true,
      false,
      true,
    ]);
  });
});

describe('11.90 the delivered letter is rendered — every row, no filter, no re-check', () => {
  it('renders one row per notification handed in, across all five kinds', () => {
    // The standing ruling — "revocation removes future sight, not letters
    // delivered" — is an ABSENCE in the component, and an absence is what a
    // per-row lookup cannot see: `getByText('Kiro mentioned you')` passes
    // just as happily when some OTHER row was dropped. So the measurement is a
    // count against the fixture's own length.
    const notifications = oneOfEveryKind();
    render(
      <InboxView
        notifications={notifications}
        userName={userName}
        onOpen={vi.fn()}
        onMarkRead={vi.fn()}
      />,
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(notifications.length);
    // Counted against the vocabulary too, so a fixture that quietly lost a
    // kind cannot make the assertion above true by shrinking both sides.
    expect(notifications).toHaveLength(NOTIFICATION_KINDS.length);
    // Every kind's own icon reached the list: five rows is not five DIFFERENT
    // rows, and a map that rendered one row five times would satisfy a count.
    const kinds = [...document.querySelectorAll('svg[data-kind]')].map((svg) =>
      svg.getAttribute('data-kind'),
    );
    expect(kinds).toEqual([...NOTIFICATION_KINDS]);
  });

  it('renders the rows in the order given — the list is not re-sorted here', () => {
    const first = notificationOf('stale-ticket');
    const second = notificationOf('assignment');
    render(
      <InboxView
        notifications={[first, second]}
        userName={userName}
        onOpen={vi.fn()}
        onMarkRead={vi.fn()}
      />,
    );
    expect([...document.querySelectorAll(ROW)].map((row) => row.getAttribute('data-notification-id'))).toEqual([
      first.id,
      second.id,
    ]);
  });

  it('an empty list renders an empty list, not a row and not a crash', () => {
    render(
      <InboxView notifications={[]} userName={userName} onOpen={vi.fn()} onMarkRead={vi.fn()} />,
    );
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(document.querySelectorAll(ROW)).toHaveLength(0);
  });
});

describe('11.91 Load more exists exactly when there is more to load', () => {
  it('is offered, and calls back, when a handler is given', async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();
    render(
      <InboxView
        notifications={[notificationOf('assignment')]}
        userName={userName}
        onOpen={vi.fn()}
        onMarkRead={vi.fn()}
        onLoadMore={onLoadMore}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('is absent at BOTH spellings of "no next page" — null and omitted', () => {
    const { rerender, unmount } = render(
      <InboxView
        notifications={[notificationOf('assignment')]}
        userName={userName}
        onOpen={vi.fn()}
        onMarkRead={vi.fn()}
        onLoadMore={null}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
    // The prop omitted entirely — `undefined`, which a shell writes when it
    // has no cursor to carry at all. A guard written `!== null` would pass the
    // line above and render the button here.
    rerender(
      <InboxView
        notifications={[notificationOf('assignment')]}
        userName={userName}
        onOpen={vi.fn()}
        onMarkRead={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
    unmount();
    // And the positive control in the same describe block above proves this
    // query can see the button when it IS rendered.
  });

  it('clicking a row does not load more, and loading more does not open a row', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onLoadMore = vi.fn();
    const notification = notificationOf('mention');
    render(
      <InboxView
        notifications={[notification]}
        userName={userName}
        onOpen={onOpen}
        onMarkRead={vi.fn()}
        onLoadMore={onLoadMore}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(onOpen).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', { name: new RegExp(notificationHeadline(notification, userName)) }),
    );
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe('11.92 the copy on screen is format.ts’s, passed through unaltered', () => {
  it('every kind’s headline and body reach the row verbatim', () => {
    const notifications = oneOfEveryKind();
    render(
      <InboxView
        notifications={notifications}
        userName={userName}
        onOpen={vi.fn()}
        onMarkRead={vi.fn()}
      />,
    );
    const rows = [...document.querySelectorAll(ROW)];
    expect(rows).toHaveLength(notifications.length);
    for (const [index, notification] of notifications.entries()) {
      const row = rows[index];
      expect(row, `no row ${index}`).toBeDefined();
      const headline = row?.querySelector('.gn-inbox__headline')?.textContent;
      const body = row?.querySelector('.gn-inbox__body')?.textContent;
      // Whole-string equality, not containment: a row that prefixed the
      // engine's refusal reason, or appended a kind name to the headline,
      // would pass `toContain` while putting this surface's voice into
      // somebody else's sentence.
      expect(headline, `headline of ${notification.kind}`).toBe(
        notificationHeadline(notification, userName),
      );
      expect(body, `body of ${notification.kind}`).toBe(notificationBody(notification));
      // The body is CLIPPED on screen: `.gn-inbox__body` in `ui.css` is
      // `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`, so
      // the longest string this surface carries — a contested claim's refusal
      // reason, the one string the suite works hardest to keep character for
      // character — is the one that gets cut. `textContent` cannot see a clip,
      // which is why nothing noticed. `title` is the affordance that gives the
      // rest back, and it must be the SAME string rather than a second,
      // driftable spelling of it.
      expect(
        row?.querySelector('.gn-inbox__body')?.getAttribute('title'),
        `title of ${notification.kind}`,
      ).toBe(notificationBody(notification));
    }
  });

  it('userName is the shell’s, not a name this view invents', () => {
    const notification = notificationOf('assignment');
    render(
      <InboxView
        notifications={[notification]}
        userName={() => 'THE LOOKUP RAN'}
        onOpen={vi.fn()}
        onMarkRead={vi.fn()}
      />,
    );
    // The prop is forwarded rather than shadowed by a default — a component
    // that ignored it would still print a plausible headline off the actor id.
    expect(document.querySelector('.gn-inbox__headline')?.textContent).toBe(
      'THE LOOKUP RAN assigned this to you',
    );
  });
});

describe('11.93 the mark-read guard is per ROW, not per list', () => {
  it('marks the row that was CLICKED — not the first one, and not the last', async () => {
    const user = userEvent.setup();
    // The read row is deliberately FIRST. A guard that closed over
    // `props.notifications[0]` rather than over its own row produces the right
    // id whenever the clicked row happens to be index 0 — which it was in this
    // test's first draft, and the mutation survived because of it (measured).
    // Ordering the fixture so no clicked row is index 0 is the whole fix.
    const read = notificationOf('mention', { read: true });
    const unreadA = notificationOf('assignment', { read: false });
    const unreadB = notificationOf('stale-ticket', { read: false });
    const onMarkRead = vi.fn();
    const onOpen = vi.fn();
    render(
      <InboxView
        notifications={[read, unreadA, unreadB]}
        userName={userName}
        onOpen={onOpen}
        onMarkRead={onMarkRead}
      />,
    );
    const rows = [...document.querySelectorAll<HTMLElement>(ROW)];
    expect(rows).toHaveLength(3);
    const [readRow, rowA, rowB] = rows;
    if (readRow === undefined || rowA === undefined || rowB === undefined) {
      throw new Error('missing rows');
    }

    await user.click(readRow);
    expect(onMarkRead).not.toHaveBeenCalled();
    // Two different unread rows, clicked in an order that is neither the
    // fixture's nor the reverse: a closure over any FIXED index gives one id
    // twice, and a closure over the last row gives the wrong id first.
    await user.click(rowB);
    await user.click(rowA);
    expect(onMarkRead.mock.calls).toEqual([[unreadB.id], [unreadA.id]]);
    // `onOpen` fires for EVERY click, read row included, and carries the row
    // that was clicked. Measured: with this list three deep and no click on
    // index 0, a handler that opened `props.notifications[0]` every time
    // survived the single-row assertions elsewhere in this file.
    expect(onOpen.mock.calls).toEqual([[read], [unreadB], [unreadA]]);
  });
});
