import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceRef } from '@gisik-nokma/app-core';
import type { DeletedItem } from '@gisik-nokma/domain';

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
 * own docblock on this exact mistake). `fetchMock`/`revokeOtherSessions` (devices plan Task 6, replacing
 * Task 7's `listSessions`/`revokeSession`)
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
  fetchMock,
  revokeOtherSessions,
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
    fetchMock: vi.fn(),
    revokeOtherSessions: vi.fn(),
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
    revokeOtherSessions,
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
 * every pre-Task-8 case sets its own `updateUser`/`fetchMock` expectation
 * inside the test body, so those are deliberately left alone.
 *
 * `listUserPasskeys` gets a benign default because the page now reads it on
 * EVERY mount — without one, each of the ten older cases would drive the
 * adapter against `undefined` and reach the list's `() => setPasskeys([])`
 * rejection branch, which renders the same empty state a real empty answer
 * does. That is a passing test for the wrong reason in ten places at once.
 */
/** A `Response`-shaped answer for the stubbed `fetch` (the devices list and per-device sign-out are plain fetches). */
const reply = (status: number, body: unknown = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
/** One `GET /v1/me/devices` row as the server sends it (the adapter derives `label` from `userAgent`). */
const serverDevice = (over: Record<string, unknown> = {}) => ({
  key: 'k1',
  tag: '7F3K',
  userAgent: null,
  isCurrent: false,
  lastSeenAt: new Date().toISOString(),
  firstSignedInAt: '2026-09-05T00:00:00.000Z',
  sessionCount: 1,
  legacy: false,
  ...over,
});
/** Answers `GET /v1/me/devices` with `devices`, every other read with a 500 and every write with `answer` (default 204). */
function serveDevices(devices: unknown[], answer: ReturnType<typeof reply> = reply(204)) {
  fetchMock.mockImplementation(async (url: string, init?: { method?: string }) =>
    (init?.method ?? 'GET') === 'GET'
      ? url === '/v1/me/devices'
        ? reply(200, { devices })
        : // Any OTHER read on the page (the MCP cards mount on /account too) stays refused, as it was before fetch was stubbed.
          reply(500)
      : answer,
  );
}
const deviceReads = () => fetchMock.mock.calls.filter(([url, init]) => url === '/v1/me/devices' && (init?.method ?? 'GET') === 'GET').length;

afterEach(() => vi.unstubAllGlobals());
beforeEach(() => {
  fetchMock.mockReset();
  serveDevices([]);
  vi.stubGlobal('fetch', fetchMock);
  revokeOtherSessions.mockReset();
  sessionAnswer.current = sessionAnswer.initial;
  listUserPasskeys.mockReset();
  listUserPasskeys.mockResolvedValue({ data: [], error: null });
  addPasskey.mockReset();
  deletePasskey.mockReset();
});

function mount() {
  render(
    <Providers
      services={stubServices(
        { getDeletedItems: async () => [], getMyWorkspaces: async () => [] },
        // A benign default, matching `listUserPasskeys`'s own precedent above:
        // without it, every pre-E5-13 case in this file would drive the
        // notification-preferences read against the unstubbed rejection and
        // render the new `prefsError` alert (ruling E5-13) alongside whatever
        // alert that case is itself asserting on.
        { notificationPreferences: { load: async () => ({ mutedKinds: [] }) } },
      )}
    >
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
   * 20.364 — Save name is the Account page's ONE loud element (styling refresh
   * Plan B, Task B17): exactly one primary `Button` is on the page and it is
   * Save name; the passkeys section's add action beside it is quiet.
   */
  it('20.364 Save name is the only primary on /account', async () => {
    mount();
    // CONTROL — the page has rendered both sections, so "one primary" is not "nothing rendered".
    const save = await screen.findByRole('button', { name: 'Save name' });
    expect(await screen.findByRole('button', { name: 'Add a passkey' })).toBeInTheDocument();
    const primaries = [...document.querySelectorAll('.gn-button--primary')];
    expect(primaries).toHaveLength(1);
    expect(primaries[0]).toBe(save);
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

  /**
   * RULING E5-19 — "Save name" had no success arm at all: a save, a
   * message-less refusal, and (in principle) a save that never sent all
   * painted identically, the button simply stopping "Saving…". This case
   * is the success half.
   */
  it('E5-19 a successful save states "Name saved", not silence', async () => {
    updateUser.mockResolvedValue({ data: {}, error: null });
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole('button', { name: 'Save name' }));
    // Scoped to the section's own status: the shell's route announcer (B05,
    // `role="status"`) is a second status element on every page.
    expect(await screen.findByText('Name saved')).toHaveAttribute('role', 'status');
  });

  it('E5-19 a refusal with NO message states a fallback, rather than reading as success', async () => {
    // better-auth's client types `error.message` as optional — this is the
    // account-page half of the same shape `passkeys` already covers for
    // add/remove. `error?.message ?? null` upstream would have collapsed
    // THIS to the same `null` a real success returns.
    updateUser.mockResolvedValue({ data: null, error: { status: 400, statusText: 'BAD_REQUEST' } });
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole('button', { name: 'Save name' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The server refused this change and did not say why.',
    );
    expect(screen.queryByText('Name saved')).toBeNull();
  });

  it('E5-19 editing the name again clears a stale "Name saved"', async () => {
    updateUser.mockResolvedValue({ data: {}, error: null });
    const user = userEvent.setup();
    mount();
    const nameInput = await screen.findByLabelText('Name');
    await user.click(screen.getByRole('button', { name: 'Save name' }));
    await screen.findByText('Name saved');
    await user.type(nameInput, '.');
    expect(screen.queryByText('Name saved')).toBeNull();
  });
});

function workspace(over: Partial<WorkspaceRef> = {}): WorkspaceRef {
  return {
    id: 'w1', name: 'Meghalaya Rollout', prefix: 'MR', role: 'admin', archived: false,
    memberCount: 4, nameRestrictedProjectCount: 0, projects: [],
    ...over,
  };
}

describe('AccountPage — Notifications', () => {
  it('11.208 loads real preferences through useAppServices and renders a muted kind unchecked — the page→gateway→section wiring', async () => {
    render(
      <Providers
        services={stubServices(
          { getDeletedItems: async () => [], getMyWorkspaces: async () => [] },
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
          { getDeletedItems: async () => [], getMyWorkspaces: async () => [] },
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
          { getDeletedItems: async () => [], getMyWorkspaces: async () => [] },
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

  /**
   * 11.215 — RULING E5-13, CRITICAL. Before this ruling, a failed read
   * collapsed to `setPrefs({ mutedKinds: [] })` — every row rendered ON, and
   * `toggleKind` would happily PUT that guessed document, silently
   * overwriting whatever the person actually had muted. The corrected
   * behaviour: the section renders disabled with a stated refusal, and no
   * row is togglable, so nothing can be saved from a state nobody confirmed.
   */
  it('11.215 a failed preferences read disables every row and refuses to save, rather than guessing all-on', async () => {
    const save = vi.fn();
    const user = userEvent.setup();
    render(
      <Providers
        services={stubServices(
          { getDeletedItems: async () => [], getMyWorkspaces: async () => [] },
          {
            notificationPreferences: {
              load: async () => {
                throw new Error('network error');
              },
              save,
            },
          },
        )}
      >
        <AccountPage />
      </Providers>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your preferences could not be loaded',
    );
    const mentionRow = screen.getByLabelText(/mentioned/i);
    expect(mentionRow).toBeDisabled();
    // Attempting a click on a disabled control is a no-op in the real DOM —
    // asserted rather than assumed, so a regression that dropped `disabled`
    // would show up as `save` having been called.
    await user.click(mentionRow);
    expect(save).not.toHaveBeenCalled();
  });

  /**
   * 11.218 — RULING E2-24(a). Before this ruling a refused save reverted the
   * optimistic flip with NO rendered outcome at all (case 11.210 above only
   * ever asserted the revert itself, never that anything on screen said the
   * save had been refused). This is the message half of the same fix.
   */
  it('11.218 a refused save states the outcome, not just the silent revert', async () => {
    const user = userEvent.setup();
    render(
      <Providers
        services={stubServices(
          { getDeletedItems: async () => [], getMyWorkspaces: async () => [] },
          {
            notificationPreferences: {
              load: async () => ({ mutedKinds: [] }),
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
    await user.click(mentionRow);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your change could not be saved. It has been reverted.',
    );
  });

  /**
   * 11.219 — the compounding-failure half of the same ruling: a refused
   * save whose REVERT read also fails. Before this ruling the revert's
   * `.load()` had no rejection handler at all, so this case left the
   * optimistic (wrong) flip standing with no trace whatsoever — worse than
   * 11.218's case, where at least the revert itself succeeds.
   */
  it('11.219 a refused save whose revert-read also fails falls back to the disabled refusal state, rather than leaving a silent wrong flip standing', async () => {
    const user = userEvent.setup();
    let loadCalls = 0;
    render(
      <Providers
        services={stubServices(
          { getDeletedItems: async () => [], getMyWorkspaces: async () => [] },
          {
            notificationPreferences: {
              load: async () => {
                loadCalls += 1;
                if (loadCalls === 1) return { mutedKinds: [] };
                throw new Error('revert read also failed');
              },
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
    await user.click(mentionRow);
    // The stronger refusal wins: the component cannot tell what the true
    // state is any more, so it earns the same disabled treatment 11.215
    // gives a failed INITIAL read, not merely the softer save-refusal note.
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Your preferences could not be loaded'),
    );
    expect(screen.getByLabelText(/mentioned/i)).toBeDisabled();
  });
});

describe('AccountPage — Your workspaces', () => {
  it('lists each workspace with its real role and project count', async () => {
    render(
      <Providers services={stubServices({
        getDeletedItems: async () => [], getMyWorkspaces: async () => [
          workspace({ id: 'w1', name: 'Meghalaya Rollout', role: 'admin', projects: [{ id: 'p1', name: 'Delivery', prefix: 'DL', archived: false, ticketCount: 3, blockedCount: 0 }] }),
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

  it('E5-12 counts LIVE projects and names the archived half, the unit /workspaces already uses', async () => {
    render(
      <Providers services={stubServices({
        getDeletedItems: async () => [], getMyWorkspaces: async () => [
          // One live, one archived. This row counted the WHOLE array, so it read
          // "2 projects" while `/workspaces`' card read "1 project · 1 archived"
          // for the same workspace — one word, two measurements, neither screen
          // naming its unit.
          workspace({ id: 'w1', name: 'Convenience Corner', role: 'owner', projects: [
            { id: 'p1', name: 'Delivery', prefix: 'DL', archived: false, ticketCount: 3, blockedCount: 0 },
            { id: 'p2', name: 'Winter stock', prefix: 'WS', archived: true, ticketCount: 1, blockedCount: 0 },
          ] }),
        ],
      }, {})}>
        <AccountPage />
      </Providers>,
    );
    expect(await screen.findByText('Convenience Corner')).toBeInTheDocument();
    expect(screen.getByText('1 project · 1 archived')).toBeInTheDocument();
    // The whole-array reading must be gone, not merely joined by the right one.
    expect(screen.queryByText('2 projects')).toBeNull();
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
        getDeletedItems: async () => [], getMyWorkspaces: async () => [workspace({ id: 'w1', name: 'Meghalaya Rollout', role: 'admin' })],
      }, {})}>
        <AccountPage />
      </Providers>,
    );
    const door = await screen.findByRole('link', { name: 'Open Meghalaya Rollout' });
    expect(door).toHaveAttribute('href', '/w/w1');
  });
});

/**
 * **Rewritten 2026-10-01 by the devices plan (Task 6):** the section lists DEVICES read from
 * `GET /v1/me/devices` (a plain `fetch`, stubbed here) and signs one out with
 * `POST /v1/me/devices/:key/sign-out`; "Sign out all other devices" is better-auth's `revokeOtherSessions`.
 */
describe('AccountPage — Sessions', () => {
  const CHROME_MAC =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  it('6.334 lists devices from GET /v1/me/devices (not authClient.listSessions) and signs ONE other device out by key; control: the list is re-read after', async () => {
    serveDevices([
      serverDevice({ key: 'k-current', tag: '7F3K', isCurrent: true, userAgent: CHROME_MAC }),
      serverDevice({ key: 'k/other', tag: 'Q2ZA', userAgent: null }),
    ]);
    const user = userEvent.setup();
    mount();
    expect(await screen.findByText('Chrome on Mac · 7F3K')).toBeInTheDocument();
    expect(screen.getByText('Unknown device · Q2ZA')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/v1/me/devices', { credentials: 'include' });
    const readsBefore = deviceReads();
    await user.click(screen.getByRole('button', { name: /^Sign out this device/ }));
    await waitFor(() => expect(deviceReads()).toBe(readsBefore + 1));
    expect(fetchMock).toHaveBeenCalledWith('/v1/me/devices/k%2Fother/sign-out', { method: 'POST', credentials: 'include' });
    expect(revokeOtherSessions).not.toHaveBeenCalled();
  });

  it('6.334 "Sign out all other devices" calls better-auth revokeOtherSessions, then re-reads the list', async () => {
    serveDevices([serverDevice({ key: 'a', tag: 'AAAA', isCurrent: true }), serverDevice({ key: 'b', tag: 'BBBB' })]);
    revokeOtherSessions.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole('button', { name: 'Sign out all other devices' }));
    expect(revokeOtherSessions).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(deviceReads()).toBe(2));
  });

  /**
   * RULING E2-24(b) - a refusal shows on screen and the list is NOT re-read (a re-list would make the
   * device appear to remain purely by coincidence rather than because the refusal was honoured).
   */
  it('6.334 a refused per-device sign-out renders an alert and the list is NOT re-read', async () => {
    serveDevices([serverDevice({ key: 'a', tag: 'AAAA', isCurrent: true }), serverDevice({ key: 'b', tag: 'BBBB' })], reply(409, { error: 'current_device' }));
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole('button', { name: /^Sign out this device/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That device could not be signed out. Try again.');
    expect(deviceReads()).toBe(1);
  });

  it('6.334 a refused "sign out all other devices" shows better-auth\'s own message and does not re-read', async () => {
    serveDevices([serverDevice({ key: 'a', tag: 'AAAA', isCurrent: true }), serverDevice({ key: 'b', tag: 'BBBB' })]);
    revokeOtherSessions.mockResolvedValue({ error: { message: 'Too many requests' } });
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole('button', { name: 'Sign out all other devices' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests');
    expect(deviceReads()).toBe(1);
  });

  it('6.334 a refused device read renders the hedged empty state, not a crash', async () => {
    fetchMock.mockResolvedValue(reply(401, { error: 'unauthorized' }));
    mount();
    expect(await screen.findByText('No signed-in devices to show.')).toBeInTheDocument();
  });

  it('6.331 renders "first signed in" through the IST clock and never the raw ISO string', async () => {
    serveDevices([serverDevice({ key: 'a', tag: 'AAAA', isCurrent: true, firstSignedInAt: '2026-09-10T00:00:00.000Z' })]);
    mount();
    expect(await screen.findByText('First signed in 10 Sep 2026')).toBeInTheDocument();
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
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(listUserPasskeys).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Passkey name')).toBeNull();
    expect(screen.queryByText('You have no passkeys yet.')).toBeNull();
  });

  /**
   * RULING E2-23 — a failed LIST read used to collapse to `setPasskeys([])`,
   * and `PasskeysSection` then asserted "You have no passkeys yet." over a
   * read that never actually confirmed that. The section now states the
   * read failure instead, distinct from an add/remove `error`.
   */
  it('E2-23 a failed passkey list read states the refusal, not the named empty state', async () => {
    listUserPasskeys.mockRejectedValue(new Error('network error'));
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your passkeys could not be loaded.',
    );
    expect(screen.queryByText('You have no passkeys yet.')).not.toBeInTheDocument();
  });
});

/** Trash series Plan 4, Task 9. Case 19.257 (`test-cases/19-trash.md` §19.27). */
describe('19.257 /account mounts Deleted items for a signed-in person', () => {
  const ROW: DeletedItem = {
    kind: 'project', id: 'prj2', workspaceId: 'ws1', workspaceName: 'Convenience Corner',
    projectId: 'prj2', projectName: 'Signage', label: 'Signage', deletedBy: 'u1', deletedByName: 'Anjali Kharkongor',
    deletedAt: '2026-09-29T10:00:00.000Z', purgeMarkedAt: null, purgeDueAt: null, containedCount: 0,
  };

  function mountWithDeleted(getDeletedItems: () => Promise<DeletedItem[]>) {
    render(
      <Providers
        services={stubServices(
          { getMyWorkspaces: async () => [], getDeletedItems },
          { notificationPreferences: { load: async () => ({ mutedKinds: [] }) } },
        )}
      >
        <AccountPage />
      </Providers>,
    );
  }

  it('19.257 the section and its rows; CONTROL: signed out, no section and no read', async () => {
    const read = vi.fn(async () => [ROW]);
    mountWithDeleted(read);
    expect(await screen.findByRole('heading', { name: 'Deleted items' })).toBeInTheDocument();
    expect(await screen.findByText('Signage')).toBeInTheDocument();
    expect(screen.getByText('Deleted by you · 29 Sep')).toBeInTheDocument();
    cleanup();

    sessionAnswer.current = null;
    const unread = vi.fn(async () => [ROW]);
    mountWithDeleted(unread);
    await screen.findByRole('heading', { name: 'Your account' });
    expect(screen.queryByRole('heading', { name: 'Deleted items' })).toBeNull();
    expect(unread).not.toHaveBeenCalled();
  });
});
