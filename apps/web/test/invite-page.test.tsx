import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InviteAcceptanceError } from '@gisik-nokma/app-core/online';
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

  it('3.121 treats a transport failure the same way rather than claiming a workspace', async () => {
    mount({ getInvite: async () => Promise.reject(new Error('network down')) });
    expect(await screen.findByText(/does not open anything/)).toBeInTheDocument();
    expect(screen.queryByText(/invited to join/)).toBeNull();
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
