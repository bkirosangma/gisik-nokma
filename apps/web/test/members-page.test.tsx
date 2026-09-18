import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IngestResult, SubmittedEvent } from '@gisik-nokma/domain';
import type { DataSourceQuery, RosterMember, WorkspaceRef } from '@gisik-nokma/app-core';
import { InviteAdminError, type PendingInvite } from '@gisik-nokma/app-core/online';
import MembersPage, { COPY_IT_NOW } from '../app/w/[workspaceId]/members/page.js';
import { Providers } from '../src/providers.js';
import { clearWorkspaceNameCache } from '../src/use-workspace-name.js';
import { stubServices, type GatewayStubs } from './helpers/stub-services.js';

/**
 * The roster, the invite mint, the pending list, and the role gate (Plan 6
 * Task 15b item 2 for everything from 3.129 down; 2026-09-18 for the roster
 * surface, 13.761–13.766).
 *
 * The three doors these cases stand in for, each verified at source:
 * `GET /v1/workspaces/:workspaceId/members` (`routes/builder-reads.ts:547`),
 * `POST /v1/workspaces/:workspaceId/invites` (`routes/invites.ts:285`) and
 * `GET /v1/workspaces/:workspaceId/invites` (`routes/invites.ts:542`).
 */
const WS = '01J9WORKSPACE0000000000000';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ workspaceId: WS }),
  usePathname: () => `/w/${WS}/members`,
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

/**
 * The roster `GET /v1/workspaces/:id/members` serves — a `displayName` and a
 * `role` per person (`routes/builder-reads.ts:247`), adapted to `RosterMember`
 * by `mapActors`.
 *
 * `role` is REQUIRED on every row and that is not incidental: the members
 * screen DRAWS it, so a fixture without one would be a body the server cannot
 * send (case 13.760 asserts the mapper refuses exactly that). The roles here
 * are the two the cases below read — one owner, one plain member — and 13.763
 * mounts a different roster to show the summary line follows the data rather
 * than a literal.
 */
const ROSTER: RosterMember[] = [
  { id: '01J9USER000000000000000000', name: 'Kiro', role: 'owner' },
  { id: '01J9USER000000000000000001', name: 'Anselma Marak', role: 'member' },
];

/** A `WorkspaceRef` for the name lookup only — the summary line is its one caller here. */
function workspaceRef(name: string): WorkspaceRef {
  return { id: WS, name, role: 'owner', memberCount: 2, nameRestrictedProjectCount: 0, projects: [] };
}

const PENDING: PendingInvite = {
  inviteId: '01J9INVITE00000000000000AB',
  address: 'anselma@example.test',
  channel: 'email',
  role: 'member',
  projectIds: [],
  invitedBy: '01J9USER000000000000000000',
  invitedAt: '2026-09-01T10:00:00.000Z',
  expiresAt: '2026-09-08T10:00:00.000Z',
};

/** The refusal a plain member actually meets — `INVITE_ADMIN_ONLY_BODY`. */
const ADMIN_ONLY = 'Only a workspace owner or admin can see or manage this workspace’s invitations.';

/**
 * `answer` is a PARAMETER and not a fixed `committed`, and that is the point of
 * this helper rather than a convenience. A stub that answered `committed` to
 * every ingest would make the revoke's whole refusal path unreachable — and
 * that path is the one a MEMBER actually takes, since `invite.revoked` is in
 * `ADMIN_ONLY_TYPES`.
 */
function mount(
  invitesAdmin: GatewayStubs['invitesAdmin'],
  ingest?: (events: SubmittedEvent[]) => void,
  answer: (event: SubmittedEvent) => IngestResult = (event) => ({
    status: 'committed',
    eventId: event.id,
    seq: 1,
    serverTime: '2026-09-02T10:00:00.000Z',
  }),
  /**
   * Any other read a case needs, spread AFTER `getMembers` so it can also
   * replace the roster. `getMyWorkspaces` is the one the roster cases use it
   * for: it is what `useWorkspaceName` calls, and left un-stubbed it REJECTS by
   * name — which is the null-name reading 13.764's second half needs.
   */
  query: Partial<DataSourceQuery> = {},
) {
  const services = stubServices({ getMembers: async () => ROSTER, ...query }, { invitesAdmin });
  // ALWAYS replaced, whether or not a recorder was asked for. `stubServices`
  // hands back `ingest: async () => []`, and an empty results array is not a
  // commit — the page reports it as "the server returned no answer", which is
  // correct behaviour and a confusing default for a case that only wanted to
  // watch the list reload. Measured: it made the committed-withdrawal control
  // below fail on an alert nobody in that case had asked for.
  services.dataSource.ingest = async (events) => {
    ingest?.(events);
    return events.map(answer);
  };
  return render(
    <Providers services={services}>
      <MembersPage />
    </Providers>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // `use-workspace-name.ts` caches SUCCESSFUL lookups in a module-scoped map
  // that every case in this file shares, so a case that serves a name would
  // otherwise hand it to the next one. Only successes are cached — a refused
  // read is not a fact about the workspace's name — which is why 13.764 can
  // rely on the un-stubbed default being `null`.
  clearWorkspaceNameCache();
});

/**
 * 3.129 THE PLANTED DEFECT TASK 15b NAMES — a member sees the roster and no
 * invite machinery.
 *
 * The gate is the server's 403 and not a client-side role read, and that is an
 * ADAPTATION rather than a shortcut: 15b feature-gates on the caller's role
 * "from `/v1/me/workspaces`", but `getMyWorkspaces` refuses whole
 * (`mapWorkspaceRefs`), so no client on this branch can read that role, and a
 * role-only mapper over the same route would be routing around a refusal.
 * `GET /v1/workspaces/:id/invites` already answers 403 to a non-admin because
 * an invitation's address is PII — so the pending read IS the role question,
 * asked of the one thing that knows.
 *
 * RE-READ 2026-09-18 against the roster table (`13.761`), because that change
 * rewrote the markup this case asserted through: the roster went from a `<ul>`
 * of names to a `<table>` with a Person and a Role column. Neither arm here was
 * written against the OLD element shape — both read the person's name, the
 * door's own sentence, and the ABSENCE of the invite machinery — so both still
 * hold as they stand and neither was re-pointed or weakened. What changed in
 * this file is the fixture: `ROSTER` carries a `role` per person now, because
 * the widened `RosterMember` requires one (13.760).
 */
describe('3.129 a member sees the roster and none of the invite machinery', () => {
  it('renders the people, and NO mint form, when the pending read answers 403', async () => {
    mount({ listPending: async () => Promise.reject(new InviteAdminError(403, ADMIN_ONLY)) });
    expect(await screen.findByText('Anselma Marak')).toBeInTheDocument();
    // Both halves in one case: the absence AND the explanation. Asserting only
    // the absence passes against a page that silently renders nothing, which
    // leaves a member guessing whether invitations are broken or not theirs.
    await waitFor(() => expect(screen.getByText(ADMIN_ONLY)).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'Invite somebody' })).toBeNull();
    expect(screen.queryByLabelText('Address')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send invitation' })).toBeNull();
  });

  it('3.130 CONTROL — an owner or admin gets the roster AND the mint form', async () => {
    mount({ listPending: async () => [PENDING] });
    expect(await screen.findByRole('heading', { name: 'Invite somebody' })).toBeInTheDocument();
    expect(screen.getByText('Anselma Marak')).toBeInTheDocument();
    expect(screen.queryByText(ADMIN_ONLY)).toBeNull();
  });

  /**
   * 3.131 — a failed read is neither answer. A page that treated any rejection
   * as "not an admin" would tell an admin they lacked a power they hold, and
   * would do it in the words of a refusal the server never sent.
   */
  it('3.131 renders a refusal for a read that failed for any other reason', async () => {
    mount({ listPending: async () => Promise.reject(new InviteAdminError(500, null)) });
    await waitFor(() =>
      expect(screen.getByText(/cannot be shown yet/)).toBeInTheDocument(),
    );
    expect(screen.queryByText(ADMIN_ONLY)).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Invite somebody' })).toBeNull();
  });
});

describe('3.132 the mint form honours the two refusals the door would give', () => {
  it('offers admin, member and guest — and never owner', async () => {
    const user = userEvent.setup();
    mount({ listPending: async () => [] });
    await user.click(await screen.findByRole('button', { name: /Role/ }));
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'admin',
      'member',
      'guest',
    ]);
  });

  /**
   * 3.133 PLANTED DEFECT — `projectIds` on a GUEST invitation.
   *
   * `inviteSentPayload` refuses the key entirely on a guest ("a guest reaches
   * work through visibility.set explicit lists, so a project association would
   * promise something membership no longer means"). The field is hidden AND the
   * key is omitted — asserting only that the field is hidden passes against a
   * page that still sends whatever was typed before the role changed.
   */
  it('3.133 hides the projects field on guest, and omits the KEY from the body', async () => {
    const bodies: unknown[] = [];
    mount({
      listPending: async () => [],
      mintInvite: async (_workspaceId, request) => {
        bodies.push(request);
        return { inviteId: 'i_1', url: 'http://localhost:3001/invite/tok', expiresAt: 'later' };
      },
    });
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Address'), 'anselma@example.test');
    // Type a project id FIRST, then switch to guest — the state survives the
    // switch, so this is the shape that would leak the key.
    await user.type(screen.getByLabelText(/^Projects/), '01J9PROJECT000000000000000');
    await user.click(screen.getByRole('button', { name: /Role/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'guest' }));
    expect(screen.queryByLabelText(/^Projects/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Send invitation' }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(Object.keys(bodies[0] as object).sort()).toEqual(['address', 'channel', 'role']);
  });

  it('3.133 sends projectIds for a MEMBER who named some', async () => {
    const bodies: unknown[] = [];
    mount({
      listPending: async () => [],
      mintInvite: async (_workspaceId, request) => {
        bodies.push(request);
        return { inviteId: 'i_1', url: 'http://localhost:3001/invite/tok', expiresAt: 'later' };
      },
    });
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Address'), 'anselma@example.test');
    await user.type(screen.getByLabelText(/^Projects/), '01J9PROJECT000000000000000');
    await user.click(screen.getByRole('button', { name: 'Send invitation' }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      address: 'anselma@example.test',
      channel: 'email',
      role: 'member',
      projectIds: ['01J9PROJECT000000000000000'],
    });
  });

  it('3.134 renders the door’s own 422 refusal verbatim', async () => {
    const reason = 'cannot put a guest on a project; share tickets with visibility.set instead';
    mount({
      listPending: async () => [],
      mintInvite: async () => Promise.reject(new InviteAdminError(422, reason)),
    });
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Address'), 'a@b.test');
    await user.click(screen.getByRole('button', { name: 'Send invitation' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(reason);
  });
});

/**
 * 3.135 THE OTHER PLANTED DEFECT TASK 15b NAMES — the minted token is shown
 * ONCE and is absent from the pending list.
 *
 * The server stores only a sha256 hash; the raw link leaves in that one
 * response and there is no door that re-serves it. A UI implying a re-read
 * exists would promise something nothing can deliver.
 */
describe('3.135 the minted link is shown once, and the list never carries one', () => {
  it('shows the link with the copy that says so, and the list beside it has no token', async () => {
    const url = 'http://localhost:3001/invite/tok_raw_secret';
    mount({
      listPending: async () => [PENDING],
      mintInvite: async () => ({
        inviteId: PENDING.inviteId,
        url,
        expiresAt: '2026-09-08T10:00:00.000Z',
      }),
    });
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Address'), 'anselma@example.test');
    await user.click(screen.getByRole('button', { name: 'Send invitation' }));

    expect(await screen.findByText(url)).toBeInTheDocument();
    expect(screen.getByText(COPY_IT_NOW)).toBeInTheDocument();
    expect(COPY_IT_NOW).toBe('Copy it now — it is not stored and cannot be shown again');

    // The pending row for the SAME invitation is on screen, and the token is
    // not in it. Scoped to the list, so the minted link above cannot satisfy it.
    const row = screen.getByText('anselma@example.test').closest('li');
    expect(row).not.toBeNull();
    expect(row?.textContent).not.toContain('tok_raw_secret');
    // And no affordance promising a second look.
    expect(screen.queryByRole('button', { name: /show|reveal|copy again/i })).toBeNull();
  });

  it('3.136 names a pending row with no credential behind it as dead, not as never-lapsing', async () => {
    mount({ listPending: async () => [{ ...PENDING, expiresAt: null }] });
    expect(
      await screen.findByText('No link behind this one — withdraw it and invite again.'),
    ).toBeInTheDocument();
  });
});

/**
 * 3.136 — revoke goes through the ORDINARY ingest door.
 *
 * `invite.revoked` is a registered domain event, and it is in
 * `ADMIN_ONLY_TYPES`, so this page performs no role check of its own. What it
 * must get right is the shape: `parse-event.ts` refuses an invite event whose
 * `entity.id` and `payload.inviteId` disagree, because three events about one
 * invitation must land on one stream.
 */
describe('3.136 withdrawing an invitation', () => {
  it('submits invite.revoked against the invite entity, with the id restated in the payload', async () => {
    const submitted: SubmittedEvent[] = [];
    mount({ listPending: async () => [PENDING] }, (events) => submitted.push(...events));
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Withdraw' }));
    await waitFor(() => expect(submitted).toHaveLength(1));
    const event = submitted[0];
    expect(event?.type).toBe('invite.revoked');
    expect(event?.entity).toEqual({ kind: 'invite', id: PENDING.inviteId });
    expect(event?.payload).toEqual({ inviteId: PENDING.inviteId });
    expect(event?.entity.id).toBe((event?.payload as { inviteId: string }).inviteId);
    // Envelope-origin 'web': the admin's own claim, not the server's record.
    expect(event?.origin).toBe('web');
  });
});

/**
 * 3.138 THE REFUSAL THIS PAGE COULD MOST EASILY HAVE SWALLOWED.
 *
 * The natural spelling is `ingest([...]).then(() => loadPending())`, and it is
 * wrong in the worst possible place: a member's revoke IS refused
 * (`invite.revoked` is in `ADMIN_ONLY_TYPES`), so that spelling re-fetches the
 * list, redraws the same row, and says nothing — the invitation still live and
 * the screen indistinguishable from success. Absence rendered as fact, on the
 * surface whose whole subject is who may do what.
 *
 * Both halves in one case: the reason PRESENT, and the row it failed to remove
 * STILL LISTED. Asserting only the first passes against a page that shows the
 * refusal and drops the row anyway.
 */
describe('3.138 a refused withdrawal is said out loud, and the invitation stays listed', () => {
  it('renders the rule and the engine’s reason, and does not re-read the list', async () => {
    const reason = 'Only a workspace owner or admin can withdraw an invitation.';
    /**
     * The list ANSWERS DIFFERENTLY the second time, and that is what makes the
     * "row still listed" assertion below a measurement rather than a
     * restatement of the stub. MEASURED: with a constant `[PENDING]` stub, a
     * mutation that reloaded on a refusal killed NOTHING — the row was still
     * there because the stub always said so, and the case asserted the fixture
     * rather than the page. A second read that empties the list is what the
     * unconditional reload would put on screen, and it is exactly the harm:
     * the person clicks Withdraw, is refused, and watches the row vanish
     * anyway — the page telling them the opposite of what the server said.
     */
    let reads = 0;
    mount(
      {
        listPending: async () => {
          reads += 1;
          return reads === 1 ? [PENDING] : [];
        },
      },
      () => undefined,
      (event) => ({ status: 'refused', eventId: event.id, rule: 'permission.role', reason }),
    );
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Withdraw' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('permission.role');
    expect(alert).toHaveTextContent(reason);
    expect(screen.getByText('anselma@example.test')).toBeInTheDocument();
    expect(reads).toBe(1);
  });

  /**
   * CONTROL, same shape, same stub: a COMMITTED withdrawal DOES re-read, and
   * the row goes. Without it the case above passes for a page that never
   * reloads at all, which would leave a withdrawn invitation on screen forever.
   */
  it('3.138 CONTROL — a committed withdrawal re-reads the list and the row goes', async () => {
    let reads = 0;
    mount({
      listPending: async () => {
        reads += 1;
        return reads === 1 ? [PENDING] : [];
      },
    });
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Withdraw' }));
    await waitFor(() => expect(screen.queryByText('anselma@example.test')).toBeNull());
    expect(reads).toBe(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('3.138 renders an INVALID’s code and message, which are different fields', async () => {
    mount({ listPending: async () => [PENDING] }, () => undefined, () => ({
      status: 'invalid',
      eventId: null,
      code: 'invalid-payload',
      message: 'the payload did not parse',
    }));
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Withdraw' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('invalid-payload');
    expect(alert).toHaveTextContent('the payload did not parse');
  });

  /**
   * 3.139 ONE CLOCK. `expiresAt` is a UTC ISO instant off the wire, and
   * printing it verbatim puts a second clock in front of an IST reader — the
   * thing `src/ist-today.ts` and the ticket sheet's provenance lines both exist
   * to prevent. Asserted on the ABSENCE of the raw string as well as the
   * presence of the rendered one, because a page showing both would pass on the
   * second assertion alone.
   */
  it('3.139 renders an expiry through the product’s one clock, never as a raw UTC instant', async () => {
    mount({ listPending: async () => [PENDING] });
    const row = (await screen.findByText('anselma@example.test')).closest('li');
    expect(row?.textContent).toContain('IST');
    expect(row?.textContent).not.toContain('2026-09-08T10:00:00.000Z');
  });
});

/**
 * 13.761 THE ROSTER TABLE (2026-09-18).
 *
 * Ported from `desktop.dc.html@6d7b67c0a52c:658-698`, and ported PARTIALLY on
 * purpose: the prototype draws five columns (Person, Role, Project access,
 * Assigned, Last seen) and the route serves three fields (`user_id`,
 * `u."name"`, `role` — `routes/builder-reads.ts:247`). The four it draws with
 * nothing behind them are named as deliberate absences in the page's own file
 * docblock; this case is the other half of that statement — it pins what IS
 * drawn, so "we left a column out" cannot quietly become "we left the table
 * out".
 *
 * The role is asserted as the WIRE'S OWN TOKEN and not as a prettified label,
 * because that is what the row carries: `role` is a plain `string` on
 * `RosterMember` (see that type's docblock for why it is not `WorkspaceRole`),
 * and a case that expected "Owner" would be asserting a mapping nobody wrote.
 */
describe('13.761 the roster is a table with a Person and a Role column', () => {
  it('renders one row per person, each wearing the role the server spelled', async () => {
    mount({ listPending: async () => [] });
    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Person',
      'Role',
    ]);
    // The header is a row too, so two people are three rows in total.
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(within(rows[1]!).getByText('Kiro')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('owner')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('Anselma Marak')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('member')).toBeInTheDocument();
    // NO control per row. The prototype's role cell is an `<select>` under
    // `canEditRole` (`:679-685`) and the product has no per-member role-change
    // door: no route accepts one and `role` is written only at membership
    // creation. A picker here would be a control that cannot be honoured.
    expect(within(table).queryByRole('combobox')).toBeNull();
    expect(within(table).queryByRole('button')).toBeNull();
  });
});

/**
 * 13.762 THE MONOGRAM, and the one accessibility trap in it.
 *
 * The prototype's disc repeats the person's first letter BESIDE their name
 * (`:674-675`), so a cell read out loud would say "A Anselma Marak" unless the
 * disc is hidden from assistive tech. Both halves are asserted: the letter IS
 * drawn, and it is NOT part of the row's accessible name. Asserting only the
 * first passes on a screen that reads the letter twice; asserting only the
 * second passes on a screen that draws no disc at all — which is the whole
 * port.
 */
describe('13.762 the monogram draws one capital, and does not repeat it to a screen reader', () => {
  it('shows the person’s first letter, hidden from the row’s accessible name', async () => {
    mount({ listPending: async () => [] });
    const row = (await screen.findByText('Anselma Marak')).closest('tr');
    expect(row).not.toBeNull();
    const disc = row?.querySelector('.gn-members__initial');
    expect(disc).not.toBeNull();
    expect(disc).toHaveTextContent('A');
    expect(disc).toHaveAttribute('aria-hidden', 'true');
    // The positive half: the row IS reachable by the person's name.
    expect(screen.getByRole('row', { name: /Anselma Marak/ })).toBeInTheDocument();
    // And the negative half, which is what fails if the disc is ever unhidden:
    // an accessible name that had swallowed the monogram would read "A Anselma
    // Marak". The pattern cannot match the name on its own — "Anselma" does not
    // contain "A Anselma".
    expect(screen.queryByRole('row', { name: /A Anselma/ })).toBeNull();
  });

  /**
   * The initial is taken by CODE POINT, and both halves of this were MEASURED
   * against the shipped helper rather than reasoned about.
   *
   * `name.slice(0, 1)` splits a surrogate pair: on Node v22.22.2 it returns the
   * LONE HIGH SURROGATE `'\ud83d'` for this input, which a browser renders as
   * U+FFFD — a replacement glyph in the disc beside a real person's name. The
   * assertion is written against the whole character, which is what makes it a
   * control: a lone surrogate is a perfectly valid JS string, so a case that
   * only asserted "some text is there" would pass on the broken helper.
   */
  it('takes the initial by code point, so an astral-plane name is not split in half', async () => {
    mount({ listPending: async () => [] }, undefined, undefined, {
      getMembers: async () => [
        { id: '01J9USER000000000000000009', name: '🐧 Penguin Team', role: 'member' },
      ],
    });
    const row = (await screen.findByText('🐧 Penguin Team')).closest('tr');
    const disc = row?.querySelector('.gn-members__initial');
    expect(disc).not.toBeNull();
    expect(disc).toHaveTextContent('🐧');
    // NO SECOND ASSERTION HERE, deliberately, and it was tried and REMOVED on
    // review. A `not.toContain('�')` guard was written here to "name the
    // failure mode"; it CANNOT FAIL for the mutation it looks like it names.
    // Measured: the broken helper's `textContent` is the lone surrogate
    // `"\ud83d"`, which does not contain U+FFFD at all — U+FFFD is what a
    // BROWSER paints for an unpaired surrogate, not what the string holds. A
    // guard that cannot fire reads as coverage and is worse than no guard. The
    // whole-character assertion above is the control, and it is the only one
    // that fires (mutation-verified: 2 failed / 21 passed).
  });

  /**
   * And the sibling fault on the same line: a name entered with leading
   * whitespace took the SPACE as its initial and drew a blank disc. Measured —
   * `initialOf('  Kiro')` returned `' '` before this was fixed. A blank disc is
   * indistinguishable from a broken monogram, which is the reading the whole
   * case exists to prevent.
   */
  it('does not take leading whitespace as a person’s initial', async () => {
    mount({ listPending: async () => [] }, undefined, undefined, {
      getMembers: async () => [
        { id: '01J9USER00000000000000000A', name: '  Kiro', role: 'owner' },
      ],
    });
    const row = (await screen.findByText('Kiro')).closest('tr');
    const disc = row?.querySelector('.gn-members__initial');
    expect(disc).not.toBeNull();
    expect(disc).toHaveTextContent('K');
  });
});

/**
 * 13.763 THE SUMMARY LINE IS DERIVED, and this case is built so that a
 * hardcoded one cannot pass it.
 *
 * The prototype's own data (`desktop.dc.html@6d7b67c0a52c:3032`) is
 * `` `${n} people in ${ws.name} · one owner, ${adminN} admins. Membership and
 * roles are per workspace.` `` Two of its pieces are claims a client can only
 * make with a qualification, and the page's `memberSummary` docblock carries
 * the reasoning: "one owner" is COUNTED rather than asserted (the roster
 * carries every visible person's role), and "N people" is VIEWER-SCOPED —
 * `readMembers` hides guests from a non-admin caller, so this is the people
 * THIS viewer may be told about, not the workspace's membership.
 *
 * The control is a SECOND mount with a different roster. A summary that were a
 * constant, or that counted a fixture, passes the first assertion and fails the
 * second; that is the pair's whole job.
 */
describe('13.763 the summary line is counted from the roster this viewer was served', () => {
  it('counts people, owners and admins — and follows the roster, not a literal', async () => {
    const first = mount({ listPending: async () => [] });
    expect(
      await screen.findByText(
        'You can see 2 people · 1 owner, 0 admins. Membership and roles are per workspace.',
      ),
    ).toBeInTheDocument();
    first.unmount();

    mount({ listPending: async () => [] }, undefined, undefined, {
      getMembers: async () => [
        { id: 'u1', name: 'Kiro', role: 'owner' },
        { id: 'u2', name: 'Anselma Marak', role: 'admin' },
        { id: 'u3', name: 'Biren Sangma', role: 'guest' },
      ],
    });
    // Three people, because a GUEST is still somebody this viewer can see; one
    // admin, counted rather than assumed; and the guest is neither owner nor
    // admin, so it lands in the total and in neither count.
    expect(
      await screen.findByText(
        'You can see 3 people · 1 owner, 1 admin. Membership and roles are per workspace.',
      ),
    ).toBeInTheDocument();
  });
});

/**
 * 13.764 THE WORKSPACE NAME IS OPTIONAL, and the two readings are both true.
 *
 * `ws.name` comes from `GET /v1/me/workspaces`, and `getMyWorkspaces` REFUSES
 * whole on this branch (`mapWorkspaceRefs` throws a `ServingGapError`) — so the
 * name is genuinely unavailable far more often than it is missing. The product
 * already has the handler: `useWorkspaceName` answers `string | null` and fails
 * silently to `null`, "never the raw id or a stale guess".
 *
 * So the sentence is ADAPTED rather than filled: the `in <name>` clause is
 * omitted, the rest of the prototype's wording stands, and the case asserts the
 * whole string EXACTLY — which is what catches a placeholder (`undefined`,
 * `in null`) that a substring assertion on the front half would sail past.
 */
describe('13.764 the summary names the workspace when it can, and omits the clause when it cannot', () => {
  it('names the workspace once `getMyWorkspaces` serves it', async () => {
    mount({ listPending: async () => [] }, undefined, undefined, {
      getMyWorkspaces: async () => [workspaceRef('Convenience Corner')],
    });
    expect(
      await screen.findByText(
        'You can see 2 people in Convenience Corner · 1 owner, 0 admins. Membership and roles are per workspace.',
      ),
    ).toBeInTheDocument();
  });

  it('omits the clause rather than printing a placeholder or the raw workspace id', async () => {
    // `stubServices` rejects an un-stubbed read BY NAME, and
    // `getMyWorkspaces` is left un-stubbed here — which is the shape of the
    // real refusal, not a stand-in for it.
    mount({ listPending: async () => [] });
    const summary = await screen.findByText(/You can see 2 people/);
    expect(summary.textContent).toBe(
      'You can see 2 people · 1 owner, 0 admins. Membership and roles are per workspace.',
    );
    expect(summary.textContent).not.toContain(WS);
    expect(summary.textContent).not.toContain('undefined');
  });
});

/**
 * 13.765 THE EMPTY ROSTER IS TWO READINGS WEARING ONE SHAPE, and this is the
 * case that keeps the screen from picking one.
 *
 * `online-data-source.ts` answers `[]` BOTH for a body whose `members` array is
 * empty AND for the 404 this route sends a guest (`door(..., 'no-guests')`) —
 * and since a workspace always has an owner, `[]` in practice means "you may
 * not read this roster" rather than "nobody is here". "Nobody is in this
 * workspace" would be a confident claim about the world drawn from an absence,
 * so the page says "No members are listed here.", which is true either way.
 *
 * The second half is the count: no summary line is drawn over an empty roster,
 * because "You can see 0 people" is a number nobody counted and the
 * qualification that makes the non-empty line honest has nothing to qualify.
 */
describe('13.765 an empty roster says what is listed, not who exists', () => {
  it('states the absence, and draws no table and no count over it', async () => {
    mount({ listPending: async () => [] }, undefined, undefined, { getMembers: async () => [] });
    expect(await screen.findByText('No members are listed here.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText(/You can see/)).toBeNull();
  });
});

/**
 * 13.766 THE HEADING AND THE LOADING STATE.
 *
 * The heading is the prototype's own `Members` (`:654`); this route's `<h1>`
 * read `People` until 2026-09-18, and the rename is deliberate rather than a
 * tidy-up — the prototype is the spec, and the nav item that reaches this page
 * says Members too.
 *
 * The loading arm is asserted with a read that NEVER settles, which is the only
 * way to hold the page in that state: with a resolved stub the assertion races
 * the microtask queue. Both absence halves matter — a table or a summary drawn
 * before the read answered would be a roster and a count nobody has been served
 * yet.
 */
describe('13.766 the heading is Members, and nothing is counted before the roster answers', () => {
  it('shows the heading and a loading line while the read is in flight, and no roster', () => {
    mount({ listPending: async () => [] }, undefined, undefined, {
      getMembers: () => new Promise<RosterMember[]>(() => undefined),
    });
    expect(screen.getByRole('heading', { level: 1, name: 'Members' })).toBeInTheDocument();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText(/You can see/)).toBeNull();
  });
});
