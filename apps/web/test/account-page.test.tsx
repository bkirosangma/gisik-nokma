import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceRef } from '@gisik-nokma/app-core';

vi.mock('next/navigation', () => ({
  usePathname: () => '/account',
  useRouter: () => ({ push: vi.fn() }),
  // Required by `LastProjectNav` (via `AppNav`), which reads the route's project
  // id. A partial mock of a module a component calls is an import-time throw.
  useParams: () => ({}),
}));
/**
 * `vi.hoisted`, not a bare `const` — `vi.mock` is hoisted above every
 * statement in this file, so a factory closing over a module-level binding
 * declared below it throws `ReferenceError: Cannot access 'updateUser' before
 * initialization` at import time (documented precedent: `test/sign-in.test.tsx`'s
 * own docblock on this exact mistake). `listSessions`/`revokeSession` (Task 7)
 * and `listUserPasskeys`/`addPasskey`/`deletePasskey` (Task 8) join the SAME
 * `vi.hoisted` call rather than a second one — there is exactly one
 * `vi.mock('../src/auth-client.js', ...)` call in this file, extended here,
 * not duplicated — and are referenced directly as the mock's members below,
 * no wrapper closure needed.
 *
 * The three Task 8 names are the REAL generated-client members, confirmed by
 * typechecking a probe against the installed `@better-auth/passkey@1.7.2`
 * (with a negative control proving the surface is not `any`) — see
 * `apps/web/src/account/account-clients.ts`'s own docblock. A mock is free to
 * spell a member however it likes and still pass, so the spelling is settled
 * by the compiler, never by this file.
 */
const {
  updateUser,
  listSessions,
  revokeSession,
  listUserPasskeys,
  addPasskey,
  deletePasskey,
  sessionAnswer,
} = vi.hoisted(() => {
  /**
   * Task 8 made `useSession`'s answer MUTABLE. It was a fixed literal, which
   * meant there was no way to mount this page as an ANONYMOUS visitor — and
   * that is the state the Passkeys gate exists for (`page.tsx`: the passkey
   * list is the one mount-time read gated on `user !== null`, because the
   * endpoint sits behind `sessionMiddleware` and an anonymous read would buy
   * a 401 with a unit of the shared `auth:` budget). Every existing case is
   * unaffected: `beforeEach` restores `initial` before each test, so the
   * default answer is byte-identical to the literal this replaces.
   */
  const initial = {
    user: { id: 'u1', name: 'Anjali Kharkongor', email: 'anjali@example.com' },
    // Task 7: the current session's own token, read by the page as
    // `session.data?.session.token` to build `createSessionsClient`.
    session: { token: 'current-token' },
  };
  return {
    updateUser: vi.fn(),
    listSessions: vi.fn(),
    revokeSession: vi.fn(),
    listUserPasskeys: vi.fn(),
    addPasskey: vi.fn(),
    deletePasskey: vi.fn(),
    sessionAnswer: { current: initial as typeof initial | null, initial },
  };
});
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    signOut: vi.fn(),
    useSession: () => ({ data: sessionAnswer.current }),
    updateUser,
    listSessions,
    revokeSession,
    // Task 8. Nested under `passkey` because that is where better-auth's
    // generated client puts them: each server endpoint path
    // (`/passkey/list-user-passkeys`, `/passkey/delete-passkey`) becomes a
    // camelCase member of a `passkey` namespace.
    passkey: { listUserPasskeys, addPasskey, deletePasskey },
  },
}));

import AccountPage from '../app/account/page.js';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * Task 8. Only the three passkey mocks and the session answer are touched:
 * every pre-Task-8 case sets its own `updateUser`/`listSessions` expectation
 * inside the test body, so those are deliberately left alone.
 *
 * `listUserPasskeys` gets a benign default because the page now reads it on
 * EVERY mount — without one, each of the ten older cases would drive the
 * adapter against `undefined` and reach the list's `() => setPasskeys([])`
 * rejection branch, which renders the same empty state a real empty answer
 * does. That is a passing test for the wrong reason in ten places at once.
 */
beforeEach(() => {
  sessionAnswer.current = sessionAnswer.initial;
  listUserPasskeys.mockReset();
  listUserPasskeys.mockResolvedValue({ data: [], error: null });
  addPasskey.mockReset();
  deletePasskey.mockReset();
});

function mount() {
  render(
    <Providers services={stubServices({ getMyWorkspaces: async () => [] }, {})}>
      <AccountPage />
    </Providers>,
  );
}

describe('AccountPage — the global settings shell', () => {
  it('renders AppNav and a page title', async () => {
    mount();
    expect(await screen.findByRole('heading', { name: 'Your account' })).toBeInTheDocument();
  });

  /**
   * Both Appearance controls became labelled SEGMENTED controls with the
   * owner's 2026-09-15 reference (a `tablist`, not a single button), so these
   * queries moved with them. Still asserted at the PAGE level rather than
   * only in the two component suites, because the thing this case is about is
   * that `/account` composes both axes — a component suite passing proves
   * neither is mounted here.
   */
  it('renders the Appearance section with both the Style and Theme controls', async () => {
    mount();
    expect(await screen.findByRole('tablist', { name: 'Style' })).toBeInTheDocument();
    expect(screen.getByRole('tablist', { name: 'Theme' })).toBeInTheDocument();
  });

  /**
   * 13.415 — MCP tokens LANDED here (Round 21, owner: "lets move MCP tokens to
   * the account page. as this should not be scoped to a workspace").
   *
   * The other half of the move: `workspace-home.test.tsx`'s 13.387 asserts the
   * link is GONE from the workspace-scoped nav, and a removal asserted only as
   * an absence is satisfied by deleting the feature outright. This is the case
   * that fails if it went nowhere.
   *
   * **`level: 2` is the assertion, not decoration.** `McpTokensScreen` defaults
   * to `h1`, which is what the standalone `/mcp/tokens` page wants and what this
   * page must not have — `/account`'s own `<h1>Your account</h1>` already owns
   * level 1, and a second h1 is a broken outline for a screen reader rather than
   * a style slip. Mounting the screen with its default would pass a bare
   * name-only query and fail this one.
   */
  it('13.415 mounts the Connected assistants section, at heading level 2', async () => {
    mount();
    expect(
      await screen.findByRole('heading', { name: 'Connected assistants', level: 2 }),
    ).toBeInTheDocument();
  });
});

describe('AccountPage — Profile', () => {
  it('shows the current name and email, and saves an edited name', async () => {
    updateUser.mockResolvedValue({ data: {}, error: null });
    const user = userEvent.setup();
    mount();
    const nameInput = await screen.findByLabelText('Name');
    expect(nameInput).toHaveValue('Anjali Kharkongor');
    expect(screen.getByText('anjali@example.com')).toBeInTheDocument();
    await user.clear(nameInput);
    await user.type(nameInput, 'Anjali K.');
    await user.click(screen.getByRole('button', { name: 'Save name' }));
    expect(updateUser).toHaveBeenCalledWith({ name: 'Anjali K.' });
  });

  it('shows a refusal verbatim if the save fails', async () => {
    updateUser.mockResolvedValue({ data: null, error: { message: 'Name cannot be empty' } });
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole('button', { name: 'Save name' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Name cannot be empty');
  });
});

function workspace(over: Partial<WorkspaceRef> = {}): WorkspaceRef {
  return {
    id: 'w1', name: 'Meghalaya Rollout', role: 'admin',
    memberCount: 4, nameRestrictedProjectCount: 0, projects: [],
    ...over,
  };
}

describe('AccountPage — Notifications', () => {
  it('11.208 loads real preferences through useAppServices and renders a muted kind unchecked — the page→gateway→section wiring', async () => {
    render(
      <Providers
        services={stubServices(
          { getMyWorkspaces: async () => [] },
          { notificationPreferences: { load: async () => ({ mutedKinds: ['mention'] }) } },
        )}
      >
        <AccountPage />
      </Providers>,
    );
    // The un-stubbed default (every other case in this file) rejects by
    // name and the page falls back to the all-on `{ mutedKinds: [] }`, which
    // never proves this seam actually carries a REAL answer through — only a
    // load that resolves to something OTHER than the fallback default can.
    expect(await screen.findByLabelText(/mentioned/i)).not.toBeChecked();
    expect(screen.getByLabelText(/assigned/i)).toBeChecked();
  });

  it('11.209 toggling an unmuted row flips it and saves the expected next mutedKinds', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <Providers
        services={stubServices(
          { getMyWorkspaces: async () => [] },
          { notificationPreferences: { load: async () => ({ mutedKinds: [] }), save } },
        )}
      >
        <AccountPage />
      </Providers>,
    );
    const mentionRow = await screen.findByLabelText(/mentioned/i);
    expect(mentionRow).toBeChecked();
    await user.click(mentionRow);
    // The optimistic `setPrefs(next)` in `toggleKind` — this is the ONLY state
    // update on the success path (nothing re-reads after a successful save),
    // so the flip standing here is what that call did, not a coincidence of
    // `save`'s own mock also resolving to something matching.
    expect(mentionRow).not.toBeChecked();
    expect(save).toHaveBeenCalledWith({ mutedKinds: ['mention'] });
  });

  it('11.210 a refused save reverts the optimistic flip once the reload settles, rather than leaving an invented mute standing', async () => {
    let loadCalls = 0;
    const load = vi.fn(async () => {
      loadCalls += 1;
      // The SAME true value both times: the save never landed, so a correct
      // revert reads back exactly what was there before the click.
      return { mutedKinds: [] };
    });
    const user = userEvent.setup();
    render(
      <Providers
        services={stubServices(
          { getMyWorkspaces: async () => [] },
          {
            notificationPreferences: {
              load,
              save: async () => {
                throw new Error('save refused');
              },
            },
          },
        )}
      >
        <AccountPage />
      </Providers>,
    );
    const mentionRow = await screen.findByLabelText(/mentioned/i);
    expect(loadCalls).toBe(1);
    await user.click(mentionRow);
    // `toggleKind`'s `.catch()` re-reads the true stored state — the same
    // mechanism `/inbox`'s own `markRead` catch uses (case 11.147) — so a
    // second `load()` call is the mechanism firing, not merely a coincidence
    // of the DOM settling back on its own.
    await waitFor(() => expect(loadCalls).toBe(2));
    // Drawn from the reloaded answer: the optimistic mute did not stick.
    await waitFor(() => expect(screen.getByLabelText(/mentioned/i)).toBeChecked());
  });
});

describe('AccountPage — Your workspaces', () => {
  it('lists each workspace with its real role and project count', async () => {
    render(
      <Providers services={stubServices({
        getMyWorkspaces: async () => [
          workspace({ id: 'w1', name: 'Meghalaya Rollout', role: 'admin', projects: [{ id: 'p1', name: 'Delivery', archived: false, ticketCount: 3, blockedCount: 0 }] }),
          workspace({ id: 'w2', name: 'Field Support', role: 'member', projects: [] }),
        ],
      }, {})}>
        <AccountPage />
      </Providers>,
    );
    expect(await screen.findByText('Meghalaya Rollout')).toBeInTheDocument();
    expect(screen.getByText('admin')).toBeInTheDocument();
    expect(screen.getByText('1 project')).toBeInTheDocument();
    expect(screen.getByText('Field Support')).toBeInTheDocument();
    expect(screen.getByText('member')).toBeInTheDocument();
    expect(screen.getByText('0 projects')).toBeInTheDocument();
  });

  /**
   * Added with the Account styling port, and the one piece of NEW BEHAVIOUR
   * in it: the desktop prototype's row is a control that opens the workspace,
   * where this list was previously inert text.
   *
   * Asserted as a LINK with an href, not as a clickable element: the whole
   * point of `.gn-workspace-card__door`'s own precedent is that reachability
   * comes from the element rather than from a handler, so a `<div onClick>`
   * that passed a click test would still be the defect. The accessible name
   * is pinned too, because `Avatar` labels ITSELF with the workspace name —
   * without the row's own `aria-label` the link would announce the name
   * twice before its role and count.
   */
  it('each workspace row is a real link to that workspace, named once', async () => {
    render(
      <Providers services={stubServices({
        getMyWorkspaces: async () => [workspace({ id: 'w1', name: 'Meghalaya Rollout', role: 'admin' })],
      }, {})}>
        <AccountPage />
      </Providers>,
    );
    const door = await screen.findByRole('link', { name: 'Open Meghalaya Rollout' });
    expect(door).toHaveAttribute('href', '/w/w1');
  });
});

describe('AccountPage — Sessions', () => {
  it('lists sessions and lets you revoke a non-current one', async () => {
    // `createdAt`/`updatedAt` as real `Date` instances, not string literals —
    // matching what the real `authClient.listSessions()` actually resolves
    // (its fetch client revives ISO date strings back into `Date` on the way
    // in; see `apps/web/src/account/account-clients.ts`'s docblock). A string
    // literal here would let the adapter's `.toISOString()` conversion go
    // completely unexercised while still typechecking and still passing.
    //
    // The `userAgent` below is a REAL, full Chrome-on-Mac string, not the
    // hand-abbreviated `'Mozilla/5.0 Chrome Mac'` this fixture originally
    // carried — that abbreviation put the browser token BEFORE the OS token,
    // which is backwards from every real UA string, and is exactly what let
    // `deviceLabelOf`'s original ordered-regex bug ship undetected (see
    // `account-clients.ts`'s docblock and `test/account-clients.test.ts`,
    // which drives that function directly against 9 real UA strings).
    listSessions.mockResolvedValue({
      data: [
        {
          token: 'current-token',
          createdAt: new Date('2026-09-01T00:00:00Z'),
          updatedAt: new Date('2026-09-14T00:00:00Z'),
          userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        { token: 'other-token', createdAt: new Date('2026-09-05T00:00:00Z'), updatedAt: new Date('2026-09-10T00:00:00Z'), userAgent: null },
      ],
      error: null,
    });
    revokeSession.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    mount();
    expect(await screen.findByText('Chrome on Mac')).toBeInTheDocument();
    expect(screen.getByText('Unknown device')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(revokeSession).toHaveBeenCalledWith({ token: 'other-token' });
  });

  it('renders "Last active" through the FULL pipeline — mocked Date, adapter\'s toISOString, then formatDateTime', async () => {
    // Round 1 fixed the adapter's Date→string conversion; round 2 added a
    // formatDateTime assertion, but only by feeding SessionsSection a
    // hand-written string directly (packages/app-core/test/account/
    // sessions-section.test.tsx), which never runs through this adapter's
    // own `.toISOString()` call. Neither round on its own would catch a
    // mutation IN THE ADAPTER — `.toISOString()` swapped for `String(value)`
    // or `.toDateString()` — because nothing downstream of the mocked `Date`
    // here read what the adapter actually produced. This case does: a real
    // `Date` goes in, and the exact `formatDateTime` string comes out the
    // other end of the real, un-mocked `account-clients.ts` and
    // `SessionsSection`. Expected string confirmed by running
    // `formatDateTime('2026-09-10T00:00:00.000Z')` directly, not computed by
    // hand (same value `sessions-section.test.tsx`'s own case pins, for the
    // same source instant, converted through `.toISOString()` first here).
    listSessions.mockResolvedValue({
      data: [
        {
          token: 'other-token',
          createdAt: new Date('2026-09-05T00:00:00Z'),
          updatedAt: new Date('2026-09-10T00:00:00Z'),
          userAgent: null,
        },
      ],
      error: null,
    });
    mount();
    expect(await screen.findByText('Last active 10 Sep 2026, 05:30 IST')).toBeInTheDocument();
    expect(screen.queryByText(/2026-09-10/)).not.toBeInTheDocument();
  });
});

/**
 * Task 8 — the Passkeys half of the same section, at the PAGE level: the
 * `authClient.passkey.*` adapter, the shell's own state, and `PasskeysSection`
 * driven together. The component's own behaviour is proven directly in
 * `packages/app-core/test/account/passkeys-section.test.tsx`; what these cases
 * add is the wiring between the two, which is the seam neither end can witness
 * alone.
 *
 * **Named vacuity, said before the assertions**, matching this file's own
 * precedent and `sign-in.test.tsx`'s: `../src/auth-client.js` is replaced
 * wholesale, so nothing here can fail because better-auth spells a member
 * differently. That axis is checked by `typecheck`, which resolves
 * `@better-auth/passkey` for real — and, for this task specifically, by a
 * throwaway probe module typechecked WITH a negative control (see
 * `src/account/account-clients.ts`'s docblock). What these cases do prove is
 * that the page calls the right member with the right argument, reads the
 * answer the right way, and re-lists rather than inventing a row.
 */
describe('AccountPage — Passkeys', () => {
  it('shows the empty state, adds a passkey, and lists it after re-reading the server', async () => {
    listUserPasskeys
      .mockResolvedValueOnce({ data: [], error: null })
      // The SECOND read answers differently, which is what makes the row's
      // appearance a fact about the re-list rather than about an optimistic
      // local push: a page that appended the typed name itself would show
      // "Work laptop" without ever asking again.
      .mockResolvedValueOnce({ data: [{ id: 'p1', name: 'Work laptop' }], error: null });
    addPasskey.mockResolvedValue({ data: {}, error: null });
    const user = userEvent.setup();
    mount();
    expect(await screen.findByText('You have no passkeys yet.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Passkey name'), 'Work laptop');
    await user.click(screen.getByRole('button', { name: 'Add a passkey' }));
    expect(addPasskey).toHaveBeenCalledWith({ name: 'Work laptop' });
    expect(await screen.findByText('Work laptop')).toBeInTheDocument();
    expect(listUserPasskeys).toHaveBeenCalledTimes(2);
  });

  it('deleting a listed passkey calls deletePasskey with that row\'s id and re-reads', async () => {
    listUserPasskeys
      .mockResolvedValueOnce({
        data: [
          { id: 'p1', name: 'MacBook Touch ID' },
          { id: 'p2', name: 'YubiKey' },
        ],
        error: null,
      })
      .mockResolvedValueOnce({ data: [{ id: 'p1', name: 'MacBook Touch ID' }], error: null });
    deletePasskey.mockResolvedValue({ data: { status: true }, error: null });
    const user = userEvent.setup();
    mount();
    // TWO rows, and the second is the one clicked — a single-row fixture would
    // pass against a page wired to `passkeys[0]`.
    await screen.findByText('YubiKey');
    await user.click(screen.getByRole('button', { name: 'Delete passkey YubiKey' }));
    expect(deletePasskey).toHaveBeenCalledWith({ id: 'p2' });
    await waitFor(() => expect(screen.queryByText('YubiKey')).toBeNull());
    expect(screen.getByText('MacBook Touch ID')).toBeInTheDocument();
  });

  it('a refusal from the server renders verbatim, and the list is NOT re-read', async () => {
    listUserPasskeys.mockResolvedValue({ data: [], error: null });
    addPasskey.mockResolvedValue({
      data: null,
      error: { message: 'This authenticator is already registered' },
    });
    const user = userEvent.setup();
    mount();
    await screen.findByText('You have no passkeys yet.');
    await user.type(screen.getByLabelText('Passkey name'), 'Work laptop');
    await user.click(screen.getByRole('button', { name: 'Add a passkey' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This authenticator is already registered',
    );
    // Exactly the mount read: a refused add re-lists nothing, so the count
    // discriminates the refusal branch from the success branch above rather
    // than merely observing that some text appeared.
    expect(listUserPasskeys).toHaveBeenCalledTimes(1);
  });

  it('a refusal with NO message still surfaces, rather than reading as success', async () => {
    // `addPasskey`'s error branch types `message` as `string | undefined`, and
    // an aborted WebAuthn ceremony is a routine outcome. The `?? null`
    // spelling used elsewhere on this page would collapse this to "no error"
    // and show nothing at all — after the person just touched a fingerprint
    // sensor. `refusalOf` in `account-clients.ts` is what this case pins.
    listUserPasskeys.mockResolvedValue({ data: [], error: null });
    addPasskey.mockResolvedValue({ data: null, error: { status: 400, statusText: 'BAD_REQUEST' } });
    const user = userEvent.setup();
    mount();
    await screen.findByText('You have no passkeys yet.');
    await user.click(screen.getByRole('button', { name: 'Add a passkey' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That did not work. Try again.');
  });

  it('an ANONYMOUS /account load makes no passkey request at all — the auth-bucket gate', async () => {
    /**
     * The rate-limit half of this task, on the `/account` side.
     *
     * `GET /passkey/list-user-passkeys` is charged to the shared `auth:`
     * bucket (`apps/server/src/app.ts`; `RATE_LIMIT_AUTH_MAX` is 10 per 60s,
     * on a key a web container shares across every browser behind it), and it
     * sits behind better-auth's `sessionMiddleware` — so for a signed-OUT
     * visitor it is a request that CANNOT succeed, spending everyone's
     * sign-in budget on a 401. `page.tsx` gates the effect on
     * `user !== null` for exactly that reason, and this is the case that
     * would go red if the gate were removed.
     *
     * The positive control is the four cases above: with a user, the same
     * page reads the list on mount every time. So a zero here is a fact about
     * the GATE, not about a page that never reads passkeys at all.
     */
    sessionAnswer.current = null;
    mount();
    // Anchor on something the anonymous page DOES render, so the zero below is
    // read from a settled DOM rather than from the first tick of a page that
    // has not mounted yet. `<h1>Your account</h1>` and Appearance render for
    // everyone; Profile and Passkeys do not.
    expect(await screen.findByRole('heading', { name: 'Your account' })).toBeInTheDocument();
    await waitFor(() => expect(listSessions).toHaveBeenCalled());
    expect(listUserPasskeys).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Passkey name')).toBeNull();
    expect(screen.queryByText('You have no passkeys yet.')).toBeNull();
  });
});
