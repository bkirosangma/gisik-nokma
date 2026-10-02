import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpError, InviteAcceptanceError, createHttpInviteGateway } from '@gisik-nokma/app-core/online';
import InvitePage from '../app/invite/[token]/page.js';
import { Providers } from '../src/providers.js';
import { stubServices, type GatewayStubs } from './helpers/stub-services.js';

/**
 * The invite page has GATE coverage, not just the Playwright smoke.
 *
 * The plan builds the gateway inline inside the page — `createHttpInviteGateway(
 * createHttpClient('', fetch))` — which puts this page's entire behaviour behind
 * `test:e2e`, a script CI does not run because it needs a browser download. A
 * new page with zero coverage on the gate is a page whose next edit breaks
 * silently. The gateway therefore arrives through `Providers`, the same DI seam
 * Task 14 built for the `DataSource`, and these cases drive the REAL
 * `Providers`/`useAppServices` pair.
 *
 * Cases 3.118–3.123 (`test-cases/03-foundation-ledger.md`).
 *
 * 13.353 (Task 15, neo restyle) — every case in this file is UNCHANGED and
 * still green: `apps/web/app/invite/[token]/page.tsx` carries no hunk in that
 * task (verified `git diff 73e189de.. -- apps/web/app/invite` is empty), so
 * the markup this file drives is byte-identical to what it drove before.
 */
const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ token: 'tok_e2e' }),
  useSearchParams: () => new URLSearchParams(),
}));

let session: { data?: { user?: { id: string; name: string } }; isPending: boolean } = {
  isPending: false,
};
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => session,
    signOut: async () => ({ data: {}, error: null }),
  },
}));

const SUMMARY = {
  workspaceId: '01J9WORKSPACE0000000000000',
  workspaceName: 'Convenience Corner',
  role: 'guest' as const,
  // Widened for E5-18 (2026-09-21): the door has served this since 2026-09-19.
  expiresAt: null,
};

function mount(invites: GatewayStubs['invites']) {
  const services = stubServices({}, { invites });
  render(
    <Providers services={services}>
      <InvitePage />
    </Providers>,
  );
}

beforeEach(() => {
  push.mockClear();
  session = { isPending: false, data: { user: { id: '01J9USER000000000000000000', name: 'Kiro' } } };
});

describe('3.118 the invite page — a live link', () => {
  it('names the workspace and the role, and offers the join', async () => {
    mount({ getInvite: async () => SUMMARY });
    expect(await screen.findByText(/invited to join/)).toBeInTheDocument();
    expect(screen.getByText('Convenience Corner')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join Convenience Corner' })).toBeInTheDocument();
  });

  it('3.118 accepts and routes into the workspace the server named', async () => {
    const accepted: string[] = [];
    mount({
      getInvite: async () => SUMMARY,
      acceptInvite: async (token) => {
        accepted.push(token);
        return { workspaceId: '01J9WORKSPACE0000000000000' };
      },
    });
    await userEvent.setup().click(await screen.findByRole('button', { name: /^Join / }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/w/01J9WORKSPACE0000000000000/my-work'));
    expect(accepted).toEqual(['tok_e2e']);
  });
});

/**
 * 3.119 PLANTED DEFECT — the third session branch.
 *
 * The plan's page branches `user === null ? <sign-in link> : <join button>`.
 * `useCurrentUser` answers `null` while the session request is in flight, so a
 * signed-in person is shown "Sign in to accept" for the whole of that window,
 * and clicking it sends them through an authentication they had already
 * completed. Both halves are asserted in one case: the loading copy present AND
 * the sign-in link absent — asserting only the first passes against a page
 * rendering both.
 */
describe('3.119 the invite page — a session still loading is not a signed-out one', () => {
  it('says the session is being checked, and offers NEITHER the link nor the button', async () => {
    session = { isPending: true };
    mount({ getInvite: async () => SUMMARY });
    expect(await screen.findByText(/invited to join/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Checking whether you are signed in');
    expect(screen.queryByRole('link', { name: 'Sign in to accept' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Join / })).toBeNull();
  });

  it('3.120 sends a genuinely signed-out arrival to sign-in, carrying the way back', async () => {
    session = { isPending: false };
    mount({ getInvite: async () => SUMMARY });
    const link = await screen.findByRole('link', { name: 'Sign in to accept' });
    // The `?next=` the sign-in page reads, URL-encoded. A raw `/invite/tok_e2e`
    // in the query would be truncated at the first `&` a token can contain.
    expect(link).toHaveAttribute('href', '/sign-in?next=%2Finvite%2Ftok_e2e');
    // The summary is on screen for a stranger, which is the whole reason
    // `GET /v1/invites/:token` requires no session.
    expect(screen.getByText('Convenience Corner')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Join / })).toBeNull();
  });
});

describe('3.121 the invite page — a dead link', () => {
  /**
   * PLANTED DEFECT: `null` from `getInvite` used to be indistinguishable from
   * "still loading" if the page kept its initial state. The sentence has to
   * arrive, and the "Checking the invitation…" it replaces has to go.
   */
  it('says used, withdrawn or lapsed — all three — and stops checking', async () => {
    mount({ getInvite: async () => null });
    const dead = await screen.findByText(/does not open anything/);
    expect(dead).toHaveTextContent('used, withdrawn, or lapsed');
    expect(screen.queryByText('Checking the invitation…')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Join / })).toBeNull();
  });

});

describe('17.061 the invite page — a link that could not be CHECKED (V9)', () => {
  /**
   * 17.061 — V9. This case used to be the second arm of `3.121`, under the title
   * *"treats a transport failure the same way"*, and it asserted the defect: the
   * rejection arm set `invite = null` for ANY failure, so a dropped connection, a
   * 500 or an unparseable body were all drawn as
   * *"This invitation link does not open anything. It may have been used,
   * withdrawn, or lapsed — ask whoever invited you for a new one."*
   *
   * That sentence has a COST the transport failure does not: it sends the person
   * to ask for a replacement for a link that was never tried. `3.121` keeps the
   * ANSWERED `null` — the server's one-body 404 for used/withdrawn/lapsed, which
   * really does mean the link opens nothing — and this case covers everything
   * else, which the page now tells apart.
   *
   * Asserted on the pair, because the two sentences are alternatives in one
   * branch: the unable-to-check sentence is present AND the dead-link sentence is
   * absent. A case asserting only the first passes on a page drawing both.
   */
  it('17.061 a transport failure says the link could not be CHECKED, and does not send them to burn it', async () => {
    mount({ getInvite: async () => Promise.reject(new Error('network down')) });

    const unreachable = await screen.findByTestId('invite-unreachable');
    expect(unreachable.textContent ?? '').toMatch(/could not be checked/i);
    // The dead-link sentence is the one this must NOT say: it tells the person to
    // ask for a new link, which retires a working one.
    expect(screen.queryByText(/does not open anything/)).toBeNull();
    expect(screen.queryByText(/ask whoever invited you for a new one/)).toBeNull();
    // And a retry is offered, because the failure is the transport's and may clear.
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  /**
   * 17.061's second half — the retry actually asks again, and a second answer is
   * believed. A Retry that only re-rendered would leave the person with a button
   * that reports nothing, which is the class of control this batch exists to
   * remove.
   */
  it('17.061 Try again re-asks, and a live link is shown when the second answer is one', async () => {
    let calls = 0;
    mount({
      getInvite: async () => {
        calls += 1;
        if (calls === 1) throw new Error('network down');
        return SUMMARY;
      },
    });

    await screen.findByTestId('invite-unreachable');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText(/invited to join/)).toBeInTheDocument();
    expect(screen.queryByTestId('invite-unreachable')).toBeNull();
    expect(calls).toBe(2);
  });

  /**
   * 17.062 — the control for the two cases above: the ANSWERED `null` still renders the dead-link sentence.
   * Without this the fix could be "always say it could not be checked", which
   * would be false of every link the server actually refused.
   */
  it('17.062 an ANSWERED null still says the link does not open anything', async () => {
    mount({ getInvite: async () => null });
    expect(await screen.findByText(/does not open anything/)).toBeInTheDocument();
    expect(screen.queryByTestId('invite-unreachable')).toBeNull();
  });
});

/**
 * 3.122 PLANTED DEFECT — the acceptance refusal is the DOOR's sentence.
 *
 * `POST /v1/invites/:token/accept` answers 404 `INVITE_NOT_OPENABLE_BODY` for a
 * link that was used, withdrawn or lapsed. That body survives because
 * `createHttpClient` gates 404-as-null on the METHOD, and `HttpError` now
 * carries the parsed body — before both, the most this page could have shown
 * was `HTTP 404 for /v1/invites/tok_e2e/accept`.
 */
describe('3.122 the invite page — a refused acceptance', () => {
  it('renders the server’s own words, unparaphrased, and does not route anywhere', async () => {
    const message =
      'This invitation link does not open anything. It may have been used, withdrawn, or lapsed — ask whoever invited you for a new one.';
    mount({
      getInvite: async () => SUMMARY,
      acceptInvite: async () => Promise.reject(new InviteAcceptanceError(404, message)),
    });
    await userEvent.setup().click(await screen.findByRole('button', { name: /^Join / }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(push).not.toHaveBeenCalled();
  });

  it('3.123 says the server gave no reason, rather than showing a blank, when it gave none', async () => {
    mount({
      getInvite: async () => SUMMARY,
      acceptInvite: async () => Promise.reject(new InviteAcceptanceError(500, null)),
    });
    await userEvent.setup().click(await screen.findByRole('button', { name: /^Join / }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('the server did not say why');
    expect(alert.textContent?.trim()).not.toBe('');
  });
});

/**
 * 6.261 (R4) — the server refuses a link opened by another account with a 403
 * whose `message` is the sentence to show. Driven through the REAL gateway and
 * the real body the server sends (`inviteNotYoursBody`), not a hand-built
 * `InviteAcceptanceError`, so the status-agnostic path from body to page is what
 * is measured. The refusal must not route, must not retry, and must leave the
 * button usable.
 */
describe('6.261 the invite page — a link addressed to another account', () => {
  it('6.261 renders the 403 sentence verbatim, asks once, routes nowhere; CONTROL: a later 200 still joins', async () => {
    const message = 'This invitation was sent to a•••@example.com. Sign in with that account to accept it.';
    const post = vi
      .fn()
      .mockRejectedValueOnce(new HttpError(403, '/v1/invites/tok_e2e/accept', { error: 'not_yours', message }))
      .mockResolvedValueOnce({ workspaceId: SUMMARY.workspaceId });
    const gateway = createHttpInviteGateway({ get: vi.fn(), post, put: vi.fn(), del: vi.fn() });
    mount({ getInvite: async () => SUMMARY, acceptInvite: (token) => gateway.acceptInvite(token) });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /^Join / }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent?.trim()).toBe(message);
    expect(post).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    // Not spinning, not disabled: the visitor can sign in elsewhere or try again.
    expect(screen.getByRole('button', { name: /^Join / })).toBeEnabled();

    // CONTROL (same it): the same page joins when the door says yes.
    await user.click(screen.getByRole('button', { name: /^Join / }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/w/${SUMMARY.workspaceId}/my-work`));
  });
});

/**
 * 16.44 — the token page names NO inviter, and that is half of the ruling.
 *
 * `owner-holds.md:74` rules the inviter's identity **BUILD — name + role,
 * AUTHENTICATED ONLY** … **NEVER on the session-less token page.** Both halves
 * are real, and they are about different surfaces:
 *
 * - **The authenticated half is BUILT** — `/workspaces`' invitation banner,
 *   `#400` (`d3d0abdd`), which renders the prototype's own sentence
 *   (`desktop.dc.html:216` — *"Anjali invited you to Garo Hills Logistics as a
 *   member."*) and is asserted verbatim at
 *   `workspaces-invitation-banner.test.tsx:176`. **Nothing is owed there.**
 * - **This file's half is the ABSENCE**, and nothing pinned it: the whole file
 *   did not contain the word "inviter" until this case existed.
 *
 * ## The fixture carries an inviter ON PURPOSE, because otherwise this cannot fail
 *
 * A summary with no inviter field would make the assertion below unfalsifiable —
 * a page that rendered `summary.invitedByName` would pass anyway, because the
 * fixture never supplied one. **So the fixture supplies a field the CONTRACT does
 * not carry** (`InviteSummary` is `{workspaceId, workspaceName, role}`) and the
 * case asserts it stays off the screen: *the reading that must not appear is
 * present in the input.* A future implementer who wants to show it must first add
 * it to the type — at which point this fixture already carries it and this case
 * goes red, which is the point.
 *
 * ## And the SIGNED-IN branch is the one that matters
 *
 * A visitor holding a session is exactly the reader an implementer would
 * reasonably decide is entitled to know who asked; the ruling says no
 * regardless, because this page's audience is **whoever holds the URL**, which
 * the server's own docblock records *"may have been forwarded"*. Asserting the
 * absence on the branch that was most likely to leak it is what makes adding the
 * inviter later a DECISION rather than a drift.
 */
describe('16.44 the token page names no inviter, in any branch', () => {
  const WITH_INVITER = { ...SUMMARY, invitedByName: 'Rukhang' } as unknown as typeof SUMMARY;

  it('16.44 a SIGNED-IN visitor sees the workspace and the role, and no inviter', async () => {
    session = { isPending: false, data: { user: { id: '01J9USER000000000000000000', name: 'Kiro' } } };
    mount({ getInvite: async () => WITH_INVITER });
    expect(await screen.findByText(/invited to join/)).toBeInTheDocument();
    // The JOIN button is the proof that this is the signed-in branch, so the
    // absence below is asserted against the reader most likely to be shown it.
    expect(screen.getByRole('button', { name: /^Join / })).toBeInTheDocument();
    expect(screen.queryByText(/Rukhang/)).toBeNull();
  });

  it('16.44 a SIGNED-OUT visitor gets no inviter either', async () => {
    session = { isPending: false };
    mount({ getInvite: async () => WITH_INVITER });
    expect(await screen.findByText(/invited to join/)).toBeInTheDocument();
    expect(screen.queryByText(/Rukhang/)).toBeNull();
  });
});

describe('17.067 the invite page shows the deadline and a next step (E5-18)', () => {
  /**
   * 17.067 — E5-18. The door has served the presented token's `expiresAt` since
   * 2026-09-19 and the client dropped it, so a person deciding whether to act on
   * a link NOW could not see when it stops working — while `/workspaces` renders
   * the same fact for a waiting invitation. The fixture instant is chosen to CROSS
   * the date line: 2026-09-30T04:30Z is the 30th in UTC and the 30th in IST too,
   * so the assertion is about the RENDERED day and not about the zone. The zone is
   * pinned separately, on the call, the way `13.969`'s own block does it.
   */
  it('17.067 names the day the link lapses', async () => {
    const zone = vi.spyOn(Date.prototype, 'toLocaleDateString');
    mount({
      getInvite: async () => ({ ...SUMMARY, expiresAt: '2026-09-30T04:30:00.000Z' }),
    });

    expect(await screen.findByText('This link lapses 30 Sept 2026.')).toBeInTheDocument();
    // The options object is what makes the claim falsifiable anywhere — a bare
    // day assertion passes in IST by accident of the runner's own zone.
    expect(zone.mock.calls.at(-1)?.[1]).toMatchObject({ timeZone: 'Asia/Kolkata' });
    zone.mockRestore();
  });

  /**
   * 17.067's control — a summary carrying NO expiry draws no deadline line rather
   * than an invented day. The shipped door always sends one; a page that defaulted
   * it would be stating a deadline nobody set.
   */
  it('17.067 control: a summary with no expiry draws no deadline line', async () => {
    mount({ getInvite: async () => ({ ...SUMMARY, expiresAt: null }) });
    expect(await screen.findByText(/invited to join/)).toBeInTheDocument();
    expect(screen.queryByTestId('invite-expiry')).toBeNull();
  });

  /**
   * 17.069 — the dead arm was ONE `<p>` in a Card with no link at all: a
   * person who followed a dead link, possibly while signed out, got a sentence
   * and no next step. `/workspaces` is where their own waiting invitations live.
   */
  it('17.069 the dead-link arm offers a next step instead of stopping at the sentence', async () => {
    // Amended 2026-10-02 (23.173): "See your workspaces" is the SIGNED-IN person's quiet link; a signed-out one is
    // offered "Go to sign in" (the page's primary) instead.
    session = { isPending: false, data: { user: { id: '01J9USER000000000000000000', name: 'Kiro' } } };
    mount({ getInvite: async () => null });
    await screen.findByText(/does not open anything/);
    expect(screen.getByRole('link', { name: 'See your workspaces' })).toHaveAttribute(
      'href',
      '/workspaces',
    );
  });
});

/**
 * UX fixes T10 (ENT-04) — a dead invitation is a dead END, and the page now names that and offers the way on.
 */
describe('23.173 the dead-invitation page', () => {
  it('23.173 an h1 "This invitation can\'t be used", the why, a primary "Go to sign in", and a quiet "See your workspaces" only when signed in', async () => {
    session = { isPending: false };
    mount({ getInvite: async () => null });
    expect(await screen.findByRole('heading', { level: 1, name: 'This invitation can\u2019t be used' })).toBeInTheDocument();
    // ONE h1 — the product name steps down in this arm.
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByText(/used, withdrawn, or lapsed/)).toBeInTheDocument();
    const primary = screen.getByRole('link', { name: 'Go to sign in' });
    expect(primary).toHaveAttribute('href', '/sign-in');
    expect(primary).toHaveClass('gn-button--primary');
    // Signed out: no "See your workspaces" (it would 401-bounce).
    expect(screen.queryByRole('link', { name: 'See your workspaces' })).toBeNull();

    // CONTROL — signed in, the quiet link appears, and the primary is still the one primary.
    cleanup();
    session = { isPending: false, data: { user: { id: '01J9USER000000000000000000', name: 'Kiro' } } };
    mount({ getInvite: async () => null });
    expect(await screen.findByRole('link', { name: 'See your workspaces' })).toHaveAttribute('href', '/workspaces');
    expect(screen.getByRole('link', { name: 'Go to sign in' })).toHaveClass('gn-button--primary');
    expect(screen.getByRole('link', { name: 'See your workspaces' })).not.toHaveClass('gn-button--primary');
  });
});
