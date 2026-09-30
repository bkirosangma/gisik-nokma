import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PendingInvitation } from '@gisik-nokma/app-core/online';
import type { WorkspaceRef } from '@gisik-nokma/app-core';
import WorkspacesPage from '../app/workspaces/page.js';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * 13.378 — the *"One invitation is waiting"* banner (Task 17).
 *
 * The claim under test is as much about the EMPTY answer as the full one: a
 * person with no invitation must not be told about invitations, so the honest
 * rendering of "nothing is waiting" is nothing at all — no heading, no empty
 * state, no placeholder. Both halves are asserted here against the same page and
 * the same stub shape, differing only in what the gateway answers.
 *
 * The gateway is stubbed and the DataSource is not mocked away: `stubServices`
 * drives the REAL `Providers`/`useAppServices` pair, so the seam this page reads
 * through is the shipped one.
 */

/**
 * Run one body with the PROCESS's timezone moved, and put it back.
 *
 * This file needs it because the machine every gate runs on is already
 * `Asia/Kolkata` (owner decision; both clocks match), which makes the obvious
 * assertion a check that cannot fail: dropping `timeZone: IST_TIME_ZONE` from
 * the component renders the identical string here, so the mutation survives and
 * the case certifies nothing. Under a non-IST zone the two renderings separate.
 *
 * The delete-when-unset restore is not tidiness. `= undefined` assigns the
 * STRING "undefined", which ICU resolves to GMT — silently switching every
 * later file in this worker to UTC, and only when TZ was unset, which is the
 * default here and in CI. `test/ist-today.test.ts` records the same trap.
 */
function underZone<T>(zone: string, body: () => T): T {
  const original = process.env['TZ'];
  process.env['TZ'] = zone;
  try {
    return body();
  } finally {
    if (original === undefined) delete process.env['TZ'];
    else process.env['TZ'] = original;
  }
}

/**
 * The ASYNC form, and the reason it has to exist rather than the sync one being
 * reused with a `mount()` inside it.
 *
 * The banner renders TWICE: once with `invitations === null`, which formats no
 * date at all, and again when the read's promise resolves. The dates are
 * produced on the SECOND render, on a microtask — so a zone set only around
 * `render()` is already restored by the time any formatting happens, and the
 * mutation that deletes the component's explicit `timeZone` survives untouched.
 * Measured: with the sync wrapper the mutation left all four cases green. The
 * zone has to span the awaits, not the call.
 */
async function underZoneAsync<T>(zone: string, body: () => Promise<T>): Promise<T> {
  const original = process.env['TZ'];
  process.env['TZ'] = zone;
  try {
    return await body();
  } finally {
    if (original === undefined) delete process.env['TZ'];
    else process.env['TZ'] = original;
  }
}

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => ({}),
  usePathname: () => '/workspaces',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({
      data: { user: { id: '01J9USER000000000000000000', name: 'Kiro' } },
      isPending: false,
    }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

const WORKSPACES: WorkspaceRef[] = [];

const WAITING: PendingInvitation = {
  inviteId: 'inv1',
  workspaceId: 'ws9',
  workspaceName: 'Convenience Corner',
  role: 'member',
  invitedByName: 'Rukhang',
  // Fixed instants, and the assertions below read the IST day they fall on.
  // `2026-09-20T19:30:00.000Z` is 2026-09-21 in Asia/Kolkata — chosen ON THE FAR
  // SIDE of the date line from UTC on purpose, so a component that formatted in
  // the machine's zone instead of the product's would render 20 Sep and redden
  // this, which a same-day instant could never do.
  invitedAt: '2026-09-10T06:00:00.000Z',
  expiresAt: '2026-09-20T19:30:00.000Z',
};

/**
 * The second invitation, whose two names the server can honestly not supply.
 *
 * `invitedByName: ''` is not a hypothetical: better-auth's `"user"."name"` is
 * `NOT NULL` with no non-blank constraint, and the dev workspace's own owner
 * carries the empty string — the banner rendered *" invited you to …"* against
 * the real stack, which is how this was found. `workspaceName: null` is the
 * server's honest answer for a workspace with no naming event in its ledger.
 */
const UNNAMED: PendingInvitation = {
  inviteId: 'inv2',
  workspaceId: 'ws8',
  workspaceName: null,
  role: 'guest',
  invitedByName: '',
  invitedAt: '2026-09-11T06:00:00.000Z',
  expiresAt: '2026-09-22T06:00:00.000Z',
};

function mount(invitations: PendingInvitation[], overrides = {}) {
  render(
    <Providers
      services={stubServices(
        { getMyWorkspaces: async () => WORKSPACES },
        { myInvitations: { list: async () => invitations, ...overrides } },
      )}
    >
      <WorkspacesPage />
    </Providers>,
  );
}

describe('Workspaces page — the invitation banner (Task 17)', () => {
  /**
   * The two controls this file's date assertion rests on, run in the same file
   * as the assertion so a reader can see what makes it discriminate.
   */
  it('CONTROL — the TZ knob moves this process, and this instant really lands on two different days', () => {
    expect(underZone('UTC', () => new Date(0).getHours())).toBe(0);
    expect(underZone('Asia/Kolkata', () => new Date(0).getHours())).toBe(5);
    // Niue is a fixed −11, so 19:30Z on the 20th is 08:30 on the TWENTIETH
    // there and 01:00 on the TWENTY-FIRST in IST. Computed by arithmetic here,
    // not by the TZ database and not by anything under test, which is what
    // makes the assertion below a test rather than a tautology.
    const naiveDayAt = (offsetHours: number) =>
      new Date(new Date(WAITING.expiresAt).getTime() + offsetHours * 3600 * 1000)
        .toISOString()
        .slice(0, 10);
    expect(naiveDayAt(-11)).toBe('2026-09-20');
    expect(naiveDayAt(5.5)).toBe('2026-09-21');
  });

  it('13.378 renders the waiting invitation with its terms, and renders NOTHING when none is waiting', async () => {
    // Rendered AND SETTLED under a NON-IST zone deliberately. The gate's machine
    // is already Asia/Kolkata, so an unvaried render passes identically with the
    // component's explicit `timeZone` deleted — the mutation survives and the
    // date assertion below certifies nothing.
    const banner = await underZoneAsync('Pacific/Niue', async () => {
      mount([WAITING, UNNAMED]);
      return screen.findByRole('region', { name: '2 invitations are waiting' });
    });
    // The offer is a sentence, and the role inside it is a sentence too — never
    // the raw enum, which is a database value rather than terms being offered to
    // a person.
    expect(
      within(banner).getByText('Rukhang invited you to Convenience Corner as a member.'),
    ).toBeInTheDocument();
    expect(within(banner).queryByText('member')).toBeNull();
    // A name the server could not supply is words, never a hole in a sentence.
    // `?? 'Someone'` alone leaves `''` in place — it is neither null nor a name
    // — and that is the value the dev stack's own workspace owner carries.
    expect(
      within(banner).getByText(
        'Someone invited you to a workspace that has not been named yet as a guest.',
      ),
    ).toBeInTheDocument();
    // The product's timezone, not the machine's: 19:30Z on the 20th is the 21st
    // in Asia/Kolkata and the TWENTIETH in the `Pacific/Niue` this renders
    // under, so a component reading the machine's zone reddens exactly here.
    //
    // "Sept" and not "Sep" — that is what ICU's `en-IN` abbreviates September
    // to, read off the runtime rather than guessed from the American three
    // letters. Asserted as the whole line in one `getByText`, because the
    // component builds it as ONE interpolation: three would be three text
    // nodes, split in the accessibility tree and invisible to this query.
    expect(
      within(banner).getByText('Invited 10 Sept 2026 · lapses 21 Sept 2026'),
    ).toBeInTheDocument();
    // The accessible names carry the workspace, so two waiting invitations never
    // present two identically-named buttons.
    expect(
      within(banner).getByRole('button', { name: 'Accept the invitation to Convenience Corner' }),
    ).toBeInTheDocument();
    expect(
      within(banner).getByRole('button', { name: 'Decline the invitation to Convenience Corner' }),
    ).toBeInTheDocument();
    // Two waiting invitations, four buttons, four DIFFERENT accessible names —
    // which is the whole reason the workspace is in them.
    expect(
      within(banner).getByRole('button', {
        name: 'Accept the invitation to a workspace that has not been named yet',
      }),
    ).toBeInTheDocument();

    screen.getByRole('heading', { name: 'New workspace' });

    // ── THE EMPTY HALF, which is the same claim from the other side ──────────
    // Without it, a banner that rendered its heading unconditionally would pass
    // every assertion above.
    // `cleanup()`, not a no-op: `screen` has no `unmount`, and leaving the first
    // page mounted would make every query below ambiguous between two pages.
    cleanup();
    render(
      <Providers
        services={stubServices(
          { getMyWorkspaces: async () => WORKSPACES },
          { myInvitations: { list: async () => [] } },
        )}
      >
        <WorkspacesPage />
      </Providers>,
    );
    // Waited for rather than asserted immediately: the read resolves on a
    // microtask, so an instant `queryBy` would pass against a banner that simply
    // had not rendered yet — the check that cannot fail. The founding form is
    // the thing waited ON, because it renders unconditionally: once it is there,
    // the page has settled and a missing banner is a decision rather than a
    // pending promise.
    expect(await screen.findByRole('heading', { name: 'New workspace' })).toBeInTheDocument();
    expect(screen.queryByText(/invitation is waiting/)).toBeNull();
    expect(screen.queryByText(/invitations are waiting/)).toBeNull();
  });

  /**
   * The two actions, and the thing that separates them: Accept navigates into
   * the workspace, Decline re-reads and the invitation is gone. A page that
   * dropped the row from its own copy instead of re-reading would pass a weaker
   * assertion; this one counts the CALLS, so the re-read is the thing measured.
   */
  it('13.378 accepts into the workspace, and declines by re-reading rather than editing its own copy', async () => {
    const user = userEvent.setup();
    push.mockClear();
    const accept = vi.fn(async () => ({ workspaceId: 'ws9' }));
    mount([WAITING], { accept });

    const banner = await screen.findByRole('region', { name: 'One invitation is waiting' });
    await user.click(
      within(banner).getByRole('button', { name: 'Accept the invitation to Convenience Corner' }),
    );
    await waitFor(() => expect(accept).toHaveBeenCalledWith('inv1'));
    expect(push).toHaveBeenCalledWith('/w/ws9/my-work');

    // Decline, on a fresh mount whose list ANSWERS DIFFERENTLY the second time.
    cleanup();
    const decline = vi.fn(async () => undefined);
    let listed = 0;
    render(
      <Providers
        services={stubServices(
          { getMyWorkspaces: async () => WORKSPACES },
          {
            myInvitations: {
              list: async () => {
                listed += 1;
                return listed === 1 ? [WAITING] : [];
              },
              decline,
            },
          },
        )}
      >
        <WorkspacesPage />
      </Providers>,
    );
    const second = await screen.findByRole('region', { name: 'One invitation is waiting' });
    await user.click(
      within(second).getByRole('button', { name: 'Decline the invitation to Convenience Corner' }),
    );
    await waitFor(() => expect(decline).toHaveBeenCalledWith('inv1'));
    // The banner is gone because the SERVER's second answer said so — `listed`
    // reaching 2 is the re-read, and it is asserted rather than inferred.
    await waitFor(() => expect(listed).toBe(2));
    expect(screen.queryByText(/invitation is waiting/)).toBeNull();
  });

  /**
   * A failed invitations read must not take the page down. The founding form is
   * the thing that must survive it: a person who cannot be told which workspaces
   * they are in, and cannot be told about their invitations either, is exactly
   * the person who most needs to be able to make one.
   */
  it('13.378 keeps the page usable when the invitations read fails, and says so in one line', async () => {
    mount([], { list: async () => Promise.reject(new Error('the invitations read broke')) });

    expect(
      await screen.findByText('Your invitations could not be loaded: the invitations read broke'),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'New workspace' })).toBeInTheDocument();
    // NOT a refusal panel: this page's `<ShellRefusal>` is reserved for the read
    // the page exists to serve, and there is exactly one live region here.
    expect(screen.queryAllByRole('status')).toHaveLength(0);
  });
});

/**
 * Fix round 1 (2026-09-15 review) — the Task 8 restyle itself was untested.
 * Every case above is behaviour-only (heading text, dates, button labels,
 * empty-render, failure copy); the whole visual change — the flat
 * `--gn-tint-warning` wash replacing the raised-card surface, the removed
 * shadow and accent edge, the decorative icon — could be reverted and every
 * one of them would stay green.
 *
 * Two levels, deliberately, not one. A SOURCE scan alone (the CSS describe
 * below) pins the RULE but not whether the rule ever reaches the element —
 * this plan already produced a guard that could not fail that way: a
 * CSS-text-only test asserted a rule existed while the element had stopped
 * carrying the class. The RENDER describe below reads the actual DOM
 * `InvitationBanner` produces, which is the half a source scan cannot see.
 *
 * Exact rem values (padding/gap/etc.) are deliberately NOT pinned here —
 * that would make this a copy of the stylesheet, fighting every future
 * tweak. What regresses if this restyle is reverted is the TOKEN, the
 * ABSENT shadow/edge, and the icon's ARIA state — those are what is pinned.
 */
const CSS_TEST_DIR = dirname(fileURLToPath(import.meta.url));
const GLOBALS_CSS_PATH = resolve(CSS_TEST_DIR, '../app/globals.css');

/**
 * Full rule body, selector line through its matching closing brace — the
 * same shape `sign-in-neo-restyle.test.ts`'s `ruleFor` uses (duplicated
 * here rather than imported: no shared CSS-scan helper exists in
 * `test/helpers/` yet). `neo-card-radius.test.ts`'s single-line version
 * would truncate `.gn-invitations`, whose declarations each sit on their
 * own line.
 */
function ruleFor(css: string, selectorPattern: RegExp): string | undefined {
  const lines = css.split('\n');
  const startIndex = lines.findIndex((line) => selectorPattern.test(line));
  if (startIndex === -1) return undefined;
  const openIndex = lines.findIndex((line, i) => i >= startIndex && line.includes('{'));
  if (openIndex === -1) return undefined;
  const closeIndex = lines.findIndex((line, i) => i >= openIndex && line.includes('}'));
  if (closeIndex === -1) return undefined;
  return lines.slice(startIndex, closeIndex + 1).join('\n');
}

// Case 13.410 (test-cases/13-deployment-dogfooding.md) — minted by the
// workspaces-prototype-port plan's Task 10, catalogue consolidation.
describe('Task 8 fix round 1 — the restyle is pinned, not just the banner\'s behaviour', () => {
  describe('CSS level — apps/web/app/globals.css', () => {
    const css = readFileSync(GLOBALS_CSS_PATH, 'utf8');
    const rule = ruleFor(css, /^\.gn-invitations\s*\{/);

    it('.gn-invitations rule exists and fills with the tint token', () => {
      expect(rule, `.gn-invitations rule: ${String(rule)}`).toBeDefined();
      expect(rule).toContain('var(--gn-tint-warning)');
    });

    // The negatives are the point: these are exactly what reverting to the
    // old raised-card treatment would restore.
    it('.gn-invitations carries no box-shadow (the raised-card treatment is gone)', () => {
      expect(rule?.includes('box-shadow'), rule).toBe(false);
    });

    it('.gn-invitations carries no border-inline-start (the accent edge is gone)', () => {
      expect(rule?.includes('border-inline-start'), rule).toBe(false);
    });
  });

  describe('render level — the actual DOM InvitationBanner produces', () => {
    it('the banner root carries gn-invitations, and its icon is aria-hidden', async () => {
      mount([WAITING]);
      const banner = await screen.findByRole('region', { name: 'One invitation is waiting' });
      expect(banner).toHaveClass('gn-invitations');
      const icon = banner.querySelector('svg.gn-invitations__icon');
      expect(icon, 'no svg.gn-invitations__icon found inside the banner').not.toBeNull();
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });
  });
});

describe('20.331 one loud element on /workspaces', () => {
  it("20.331 Create workspace is the only primary; each invitation's Accept is quiet", async () => {
    mount([WAITING, UNNAMED]);
    const banner = await screen.findByRole('region', { name: '2 invitations are waiting' });
    const accepts = [
      within(banner).getByRole('button', { name: 'Accept the invitation to Convenience Corner' }),
      within(banner).getByRole('button', {
        name: 'Accept the invitation to a workspace that has not been named yet',
      }),
    ];
    // CONTROL — Accept is still a `button` with the same accessible name and text (13.378 presses it by name).
    for (const button of accepts) {
      expect(button.tagName).toBe('BUTTON');
      expect(button).toHaveTextContent('Accept');
      expect(button).toHaveClass('gn-button--ghost');
      expect(button).not.toHaveClass('gn-button--primary');
    }
    // The page's one primary is the founding form's Create workspace
    // (`workspaces/page.tsx`, rendered unconditionally).
    const primaries = [...document.querySelectorAll('.gn-button--primary')];
    expect(primaries).toHaveLength(1);
    expect(primaries[0]).toHaveTextContent('Create workspace');
  });
});
