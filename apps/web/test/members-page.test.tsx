import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { membershipId, type IngestResult, type SubmittedEvent } from '@gisik-nokma/domain';
import type { DataSourceQuery, RosterMember, WorkspaceRef } from '@gisik-nokma/app-core';
import { InviteAdminError, type PendingInvite } from '@gisik-nokma/app-core/online';
import MembersPage, { COPY_IT_NOW } from '../app/w/[workspaceId]/members/page.js';
import { Providers } from '../src/providers.js';
import { clearWorkspaceNameCache } from '../src/use-workspace-name.js';
import { stubServices, type GatewayStubs } from './helpers/stub-services.js';
import { shellRefusalCopy } from '../src/shell-refusal.js';

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
  return { id: WS, name, prefix: 'CC', role: 'owner', memberCount: 2, nameRestrictedProjectCount: 0, projects: [] };
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
 * "from `/v1/me/workspaces`". **⚠ CORRECTED 2026-09-20:** this read *"but
 * `getMyWorkspaces` refuses whole (`mapWorkspaceRefs`), so no client on this branch
 * can read that role, and a role-only mapper over the same route would be routing
 * around a refusal."* `getMyWorkspaces` ANSWERS — rulings P32/P38 served it and the
 * register has been empty since 2026-09-19 — so there is no refusal to route
 * around. **The decision below is unchanged:** the gate is the server's 403.
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
      expect(screen.getByText(/could not be loaded/)).toBeInTheDocument(),
    );
    expect(screen.queryByText(ADMIN_ONLY)).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Invite somebody' })).toBeNull();
  });
});

describe('3.132 the mint form honours the two refusals the door would give', () => {
  it('offers admin, member and guest — and never owner', async () => {
    const user = userEvent.setup();
    mount({ listPending: async () => [] });
    // SCOPED TO THE FORM 2026-09-18, when the roster gained a role control of
    // its own. The query above was `findByRole('button', { name: /Role/ })`,
    // and it was unambiguous only by accident: it worked while the mint form's
    // picker was the page's ONLY control whose accessible name contained
    // "Role". The roster's control is named `Role for Anselma Marak`, so the
    // unscoped regex now matches two elements and throws. This case is about
    // the MINT form's picker, so its query says so.
    const form = (await screen.findByRole('heading', { name: 'Invite somebody' })).closest('form');
    expect(form).not.toBeNull();
    await user.click(within(form!).getByRole('button', { name: /Role/ }));
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
    // Scoped for the same reason as the case above: the roster's own role
    // control also matches `/Role/` since 2026-09-18, and this case is about the
    // mint form's picker.
    const form = (await screen.findByRole('heading', { name: 'Invite somebody' })).closest('form');
    expect(form).not.toBeNull();
    await user.click(within(form!).getByRole('button', { name: /Role/ }));
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
 * E6-9 — the Channel select used to offer `email`/`sms`/`whatsapp` while the
 * door (`INVITE_CHANNELS`, `@gisik-nokma/domain`) accepts only
 * `email`/`phone`: two offered channels were refused at the door, 422, and
 * `phone` — the one the door accepts — was never offered. Built from
 * `INVITE_CHANNELS` (`CHANNEL_LABELS`, `page.tsx`) so the two cannot drift
 * again; `sms`/`whatsapp` both reach a phone, so the option reads
 * "Phone (SMS)" for the person filling the form.
 */
describe('3.902 the Channel select offers exactly what the door accepts (E6-9)', () => {
  it('renders email and Phone (SMS) — never sms or whatsapp', async () => {
    const user = userEvent.setup();
    mount({ listPending: async () => [] });
    const form = (await screen.findByRole('heading', { name: 'Invite somebody' })).closest('form');
    expect(form).not.toBeNull();
    await user.click(within(form!).getByRole('button', { name: /Channel/ }));
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'email',
      'Phone (SMS)',
    ]);
  });

  /**
   * 3.903 — the assertion the role select already has (3.133/3.134's sibling):
   * submitting each OFFERED option sends the door the WIRE VALUE it accepts,
   * not the display label. `INVITE_CHANNELS` is `['email', 'phone']`, in that
   * order, which is the order the picker renders them and the order this
   * table submits them.
   */
  it.each([
    ['email', 'email'],
    ['Phone (SMS)', 'phone'],
  ])('submitting "%s" sends channel: "%s" to the door', async (optionLabel, wireValue) => {
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
    const form = (await screen.findByRole('heading', { name: 'Invite somebody' })).closest('form');
    expect(form).not.toBeNull();
    await user.click(within(form!).getByRole('button', { name: /Channel/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: optionLabel }));
    await user.click(screen.getByRole('button', { name: 'Send invitation' }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect((bodies[0] as { channel: string }).channel).toBe(wireValue);
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

  /**
   * RULING V2, CRITICAL. Before this ruling, `minted` was `MintForm`'s own
   * local state, set on a successful mint and then passed to `onMinted` —
   * `loadPending`, a network re-read. `loadPending`'s FAILURE arm flips
   * `adminGate` away from `'admin'`, the only state that mounts `MintForm`
   * at all: the form unmounted and the just-minted, one-time URL — the
   * thing `COPY_IT_NOW` had just said "cannot be shown again" — died with
   * it, unrecoverable. `listPending` here answers successfully on the
   * FIRST call (mount's own read) and rejects on the SECOND (the
   * post-mint re-read `onMinted` triggers), reproducing exactly that
   * sequence.
   */
  it('E5-V2 a rejected post-mint re-read does not take the just-minted URL with it', async () => {
    const url = 'http://localhost:3001/invite/tok_raw_secret';
    let listCalls = 0;
    mount({
      listPending: async () => {
        listCalls += 1;
        if (listCalls === 1) return [];
        throw new InviteAdminError(500, null);
      },
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
    // The re-read's own refusal renders too — proving the failure actually
    // happened, not merely that this case forgot to trigger it — and the
    // URL survives it standing right beside that refusal.
    await waitFor(() => expect(listCalls).toBe(2));
    // The sentence every read refusal carries is `shellRefusalCopy`'s — E5-30
    // (B09) replaced "cannot be shown yet" product-wide and exported the copy so
    // a spec asserts what renders rather than re-typing it.
    await waitFor(() =>
      expect(screen.getByText(shellRefusalCopy('The invitations for this workspace'))).toBeInTheDocument(),
    );
    expect(screen.getByText(url)).toBeInTheDocument();
    expect(screen.getByText(COPY_IT_NOW)).toBeInTheDocument();
  });

  it('3.136 names a pending row with no credential behind it as dead, not as never-lapsing', async () => {
    mount({ listPending: async () => [{ ...PENDING, expiresAt: null }] });
    expect(
      await screen.findByText('No link behind this one — withdraw it and invite again.'),
    ).toBeInTheDocument();
  });
});

/**
 * 16.46 THE PENDING-INVITATIONS HEADING — the count and the list are one
 * reading, and the heading is the authority's own.
 *
 * `desktop.dc.html:725` draws `<p>{{ inviteHeading }}</p>` and `:3091` defines
 * it as `"Pending invitations · " + s.invites.length`. The product drew no
 * heading for this list at all, which `test-cases/16` recorded as an
 * unrecorded omission rather than a scope decision — this change is that
 * dispatch, and the case is where the omission was recorded.
 *
 * ⚠ THE EXPECTATIONS ARE LITERAL STRINGS ON PURPOSE, and neither is built by
 * calling the component's own code. An expectation the implementation also
 * produces cannot fail when that implementation changes — this repo's most
 * frequently recorded shape of a check that cannot fail. The middot is pinned
 * as a character, so a transcription that reached for a hyphen or a lookalike
 * dot reddens here rather than shipping.
 */
describe('16.46 the pending list carries its heading, and its count is the list it heads', () => {
  const SECOND: PendingInvite = {
    ...PENDING,
    inviteId: '01J9INVITE00000000000000CD',
    address: 'tengsak@example.test',
  };

  it('names the section with the count the list renders — two rows, two', async () => {
    mount({ listPending: async () => [PENDING, SECOND] });
    const heading = await screen.findByRole('heading', {
      level: 2,
      name: 'Pending invitations · 2',
    });
    // ONE text node, asserted STRUCTURALLY — and this is not decoration, it is
    // the only instrument that can see the composition. MEASURED: rebuilding the
    // string as `{'Pending invitations · '}<span>{n}</span>` leaves the
    // accessible-name assertion above AND every other arm in this case GREEN.
    // WHY the name survives the element boundary is NOT distinguished by that
    // measurement — a boundary adding no separator and whitespace collapsing
    // both fit it — so the structural assertion is what holds the property. A
    // docblock cannot hold a property no assertion can see.
    expect(heading.childNodes).toHaveLength(1);
    expect(heading.querySelector('*')).toBeNull();
    // This arm asserts the LIST against the FIXTURE — not the heading against
    // the list, and the difference is measurable rather than pedantic: pinning
    // the component's count to a constant `2` leaves this assertion green
    // (recorded as that mutation, which is why the one-row arm below exists).
    // What it does catch is the list drawing FEWER rows than the fixture holds.
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('and one row reads one — the number is a count rather than a constant', async () => {
    mount({ listPending: async () => [PENDING] });
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Pending invitations · 1' }),
    ).toBeInTheDocument();
  });

  /**
   * THE EMPTY CASE IS A DECISION, not an accident, and this is the arm that
   * records which one was taken. The authority draws the heading
   * unconditionally inside its `isInviteAdmin` block (`:722`–`:725`), above
   * the `noInvites` sentence (`:741`); and the sentence below ALREADY claims
   * the list is empty, so `· 0` repeats a claim the list was making rather
   * than making a new one. Hiding the heading at zero would instead leave the
   * section unnamed exactly when a reader needs to know what the empty thing
   * is. Both halves are asserted, so "the heading is gone" and "the heading is
   * there over the empty sentence" cannot be confused for one another.
   */
  it('renders `· 0` with no invitations, over the sentence that says so', async () => {
    mount({ listPending: async () => [] });
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Pending invitations · 0' }),
    ).toBeInTheDocument();
    expect(screen.getByText('No invitations are outstanding.')).toBeInTheDocument();
  });

  /**
   * The heading sits INSIDE the same gate as the list it heads. A heading that
   * outlived its list would name a section a member cannot see — and the gate
   * is the door's own 403, not a client-side role read (3.129).
   */
  it('is absent for a member, along with the list it heads', async () => {
    mount({ listPending: async () => Promise.reject(new InviteAdminError(403, ADMIN_ONLY)) });
    await waitFor(() => expect(screen.getByText(ADMIN_ONLY)).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: /^Pending invitations/ })).toBeNull();
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
/**
 * `hig-per-screen/3b` (Members states), 2026-09-20 — case `16.61`.
 *
 * The prototype's Person cell is a TWO-LINE identity
 * (`desktop.dc.html@6d7b67c0a52c:675`): the name at weight 600 over the address
 * at 13px/18px in `label2`. This build had the name only, with the address kept
 * as a FALLBACK — so a member who has a name never showed one. The wire gained
 * the address on 2026-09-19, which is what made the second line buildable.
 *
 * **The case is TWO ARMS because the second line is only honest in one of
 * them.** `memberLabel` falls back name → email → id, so the NAMELESS population — a magic-link sign-up with no name — is labelled by their address (**corrected 2026-09-20**: this read "a phone-only member", which contradicts `memberLabel`'s own docblock, where a phone sign-up's `displayName` IS the phone and the fallback never fires) is
 * LABELLED by their address; drawing a second line for them would print one
 * string twice inside one cell. A case that asserted only the drawn arm would
 * pass against an implementation that printed the address twice for exactly the
 * population the product says it does not.
 */
describe('16.61 the Person cell carries the address on a second line, and only when it is not the label', () => {
  it('draws it for a person whose NAME is the label', async () => {
    // `query` is the FOURTH parameter (`mount(invitesAdmin, ingest?, answer?,
    // query?)`) — passing it second puts it in the `ingest` slot, where it is
    // silently ignored and the default roster renders instead. Measured here
    // rather than assumed: the first version of this case did exactly that and
    // failed on the DEFAULT roster's names.
    mount({ listPending: async () => [] }, undefined, undefined, {
      getMembers: async () => [
        {
          id: '01J9USER000000000000000009',
          name: 'Anselma Marak',
          role: 'member',
          email: 'anselma@example.test',
        },
      ],
    });
    const table = await screen.findByRole('table');
    const row = within(table).getAllByRole('row')[1]!;
    expect(within(row).getByText('Anselma Marak')).toBeInTheDocument();
    expect(within(row).getByText('anselma@example.test')).toBeInTheDocument();
  });

  it('draws NO second line when the label IS the address — one string, once', async () => {
    mount({ listPending: async () => [] }, undefined, undefined, {
      getMembers: async () => [
        { id: '01J9USER000000000000000010', name: '', role: 'member', email: 'phone@example.test' },
      ],
    });
    const table = await screen.findByRole('table');
    const row = within(table).getAllByRole('row')[1]!;
    // The label falls back to the address, so the cell names this person ONCE.
    // Counted rather than queried: `getByText` would find the first and pass.
    expect(within(row).getAllByText('phone@example.test')).toHaveLength(1);
  });
});

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
    // RE-POINTED 2026-09-18, when the role control landed (13.824–13.828), and
    // the REPLACEMENT asserts the same property rather than a weaker one. This
    // case used to end with `queryByRole('combobox')`/`queryByRole('button')`
    // both null — "NO control per row" — and that absence was a PROXY for the
    // thing the case is actually about: that no role is prettified, and that
    // nothing on this screen offers a change it cannot honour. The proxy was
    // true only while the guards Task 1 added did not exist, so it is replaced
    // by the property itself, asserted in BOTH arms at once: the owner's row
    // chips the wire token, and the row the control can edit announces itself
    // and displays that same token. A capitalised label anywhere in either arm
    // fails this line.
    expect(within(rows[1]!).queryByRole('button')).toBeNull();
    expect(
      within(rows[2]!).getByRole('button', { name: /Role for Anselma Marak/ }),
    ).toHaveTextContent('member');
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
 * `ws.name` comes from `GET /v1/me/workspaces`. **⚠ CORRECTED 2026-09-20:** this
 * read *"and `getMyWorkspaces` REFUSES whole on this branch (`mapWorkspaceRefs`
 * throws a `ServingGapError`) — so the name is genuinely unavailable far more often
 * than it is missing."* It does not refuse (rulings P32/P38; register empty since
 * 2026-09-19), so the name is now unavailable only when it is genuinely missing —
 * which makes the OPTIONALITY below more load-bearing, not less. The product
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

/**
 * 13.824–13.828 THE ROLE CONTROL (2026-09-18; plan
 * `2026-09-18-membership-role-guard` Task 2, executor 2).
 *
 * The prototype's role cell has two arms (`desktop.dc.html@6d7b67c0a52c:679-690`):
 * an `<select>` under `canEditRole` and a static chip otherwise. Only the chip
 * shipped in #443, because the door behind a picker did not exist — `POST
 * /events` accepts a `membership.granted` with a role, but until Task 1 nothing
 * refused an admin demoting the sole owner or promoting themselves. Task 1
 * closed that; this is the control, and it is the FIRST case set here that can
 * say a role change is possible at all.
 *
 * ## Why every case below addresses the OTHER person's row and not the viewer's
 *
 * The fixture's signed-in user IS `ROSTER[0]` — Kiro, the workspace owner — so
 * the owner arm of the control is the viewer's own row. A case that reached for
 * "the role control" without scoping would be reaching for the one row this
 * design deliberately does not put a control on (13.828), and would pass or fail
 * for a reason unrelated to what it names.
 *
 * ## The query shape is the shared `Select`'s, MEASURED rather than assumed
 *
 * `packages/ui/src/select/select.tsx:253` renders a `HiddenSelect` alongside the
 * visible trigger: a visually-hidden (not `display:none`) native `<select>` that
 * carries the caller's `aria-label` too. **`getByRole` RESPECTS `aria-hidden`
 * and therefore cannot see it** — `queries/role.js` defaults `hidden` to
 * `config.defaultHidden` (false) and filters on `isInaccessible`, which returns
 * true for `aria-hidden="true"` (`role-helpers.js:37`); react-aria wraps that
 * subtree in `aria-hidden` — in the installed `react-aria@3.52.1`, at
 * `dist/private/select/HiddenSelect.mjs:58`. (Those two are package-internal
 * paths inside `node_modules`, so they are named with their package rather than
 * as repo-relative paths; the testing-library ones below are likewise.) Which is
 * precisely why the cases below query the trigger `button` by name and then read
 * options out of the `listbox` (the pattern
 * `apps/web/test/list-prefs-wiring.test.tsx:69` established, and what a person
 * does).
 * The duplication that bites is `getByLabelText`, whose label association does
 * NOT go through the accessibility tree: `HiddenSelect` wraps its native
 * `<select>` in a `<label>` carrying the caller's text (same package, `:100`),
 * so the label TEXT matches that `<select>` while the trigger's own `aria-label`
 * matches the button — two elements, hence "Found multiple elements".
 * **An earlier draft of this paragraph had the direction BACKWARDS** — it said
 * `getByRole` ignores `aria-hidden`, which is the opposite of what the installed
 * version does and of what this repo already states at `packages/ui/src/select/select.tsx:221-222`
 * ("`getByText`, unlike `getByRole`, does not respect `aria-hidden`"). Corrected
 * after the independent review measured it; the queries below never depended on
 * the wrong version, but the sentence would have misled the next reader.
 *
 * ## EVERY NAME QUERY BELOW IS A REGEX, and that is a measurement, not a style
 *
 * **The trigger's accessible name is `<its current value> <the caller's
 * aria-label>`** — for the second person's control, `member Role for Anselma
 * Marak`. Measured by probing `queryAllByRole('button', { name })` against the
 * rendered page: the exact strings `'Role for Anselma Marak'` and `'member'`
 * each return **0**, the concatenation `'member Role for Anselma Marak'`
 * returns **1**, and the regex `/Role/` returns **2** (this control and the mint
 * form's). The cause is `useSelect`'s own wiring: react-aria sets
 * `aria-labelledby="<the value span's id> <the trigger's own id>"` on the
 * trigger, and the accessible-name algorithm resolves those references and
 * concatenates them, so the caller's `aria-label` is APPENDED to the value
 * rather than being the name.
 *
 * Two consequences are load-bearing here. First, a case that queried the
 * control by its exact `aria-label` would fail against a control that is
 * present and correct, for a reason unrelated to what it names — which is how
 * this was found. Second, and worse, the mirror-image case: an ABSENCE
 * assertion anchored to the start of that name (`/^Role for /`) can never
 * match, so it holds whether or not the control is rendered. 13.826's absence
 * arm is unanchored for exactly that reason.
 *
 * **Recorded rather than fixed, with a named owner:** this is the shared
 * component's behaviour on every `Select` in the product, its trigger being
 * announced as its value with the caller's label trailing it. Changing it means
 * changing `packages/ui/src/select/select.tsx` and every call site that was
 * written against the current names — outside this task's scope. Owner: whoever
 * next touches that file.
 */
const MEMBER_ID = '01J9USER000000000000000001';

describe('13.824 the roster’s role control, and the option it deliberately does not offer', () => {
  it('13.824 an admin sees a role control offering admin, member and guest — and NOT owner', async () => {
    const user = userEvent.setup();
    mount({ listPending: async () => [] });
    await user.click(await screen.findByRole('button', { name: /Role for Anselma Marak/ }));
    const listbox = await screen.findByRole('listbox');
    // `owner` is absent, and that is the whole decision this case carries: the
    // prototype offers it, the invite door refuses it, and there is no
    // ownership-transfer flow — so minting an owner from a roster row would be
    // a transfer with no door designed for it.
    expect(within(listbox).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'admin',
      'member',
      'guest',
    ]);
  });

  /**
   * 13.825 THE WRITE. Three claims in one case, and each of the three is there
   * because a different defect satisfies the other two:
   *
   * - **exactly one event** — a control that submitted on every render, or that
   *   sent a batch, would pass a "something was sent" assertion;
   * - **the right event** — entity id, payload `userId` and payload `role`.
   *   `membershipId(workspaceId, userId)` is the key the projection upserts on
   *   and the id Task 1's guard reads the target's current role through, so an
   *   entity id that merely looks right addresses a different row of the world;
   * - **the roster re-read** — without it the control would ingest and leave the
   *   old role on screen, which is a write the person cannot see land.
   */
  it('13.825 changing a role ingests exactly one membership.granted, and re-reads the roster', async () => {
    const user = userEvent.setup();
    const ingest = vi.fn();
    let rosterReads = 0;
    mount({ listPending: async () => [] }, ingest, undefined, {
      getMembers: async () => {
        rosterReads += 1;
        return ROSTER;
      },
    });
    await user.click(await screen.findByRole('button', { name: /Role for Anselma Marak/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'guest' }));

    await waitFor(() => expect(ingest).toHaveBeenCalledTimes(1));
    const events = ingest.mock.calls[0]![0] as SubmittedEvent[];
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      workspaceId: WS,
      type: 'membership.granted',
      entity: { kind: 'membership', id: membershipId(WS, MEMBER_ID) },
      payload: { userId: MEMBER_ID, role: 'guest' },
    });
    await waitFor(() => expect(rosterReads).toBe(2));
  });

  /**
   * 13.826 THE GATE, witnessed rather than inferred. The viewer is the same
   * fixture and the same roster; the only thing that changed is the door's
   * answer, because the pending read is this page's one readable role signal —
   * and for a member that read 403s.
   *
   * Both halves: the control is ABSENT, and the role is still SAID. A case that
   * asserted only the absence would pass on a page that drew no role at all,
   * which is a roster that no longer answers the question it exists to answer.
   */
  it('13.826 a member sees the role as text and no control at all', async () => {
    mount({ listPending: async () => Promise.reject(new InviteAdminError(403, ADMIN_ONLY)) });
    expect(await screen.findByText('Anselma Marak')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(ADMIN_ONLY)).toBeInTheDocument());
    // UNANCHORED, and the anchor was a check that could not have failed: the
    // trigger's accessible name is `<value> <aria-label>`
    // (`member Role for Anselma Marak`, measured below), so a `/^Role for /`
    // pattern can never match it and the absence assertion would have held on a
    // page that rendered the control to a member. The pattern now matches the
    // string that is actually there.
    expect(screen.queryByRole('button', { name: /Role for / })).toBeNull();
    expect(screen.getByText('member')).toBeInTheDocument();
  });

  /**
   * 13.827 THE REFUSAL, and this is the case the surface most needs. A control
   * that swallowed the answer would show the click as having worked — the person
   * reads their own intent as fact while the server holds the old role. That is
   * the same defect 3.138 pins on Withdraw, on the same page.
   *
   * **This docblock first named `last-owner` and `grant-owner-requires-owner` as
   * the refusals to expect, and an independent review showed both were wrong for
   * THIS control** — `grant-owner-requires-owner` needs a payload granting
   * `owner`, which the options cannot build, and `last-owner` needs the server's
   * row to hold `owner` while the rendered row is editable, which the row
   * predicate suppresses. The reachable refusals are a stale-read `last-owner`,
   * the ordinary `permission.role`, a malformed payload, and transport
   * failures; the page's `changeRole` docblock carries the full analysis. The
   * CASE is unchanged by that correction — it drives a refusal through the stub
   * and asserts the rendering — which is the point worth keeping: the assertion
   * was never the part that was wrong.
   *
   * Both halves again, and the second is the one that is easy to lose: the
   * refusal is on screen, AND the cell still says the role the server actually
   * holds. The control is driven by the roster and not by local state, so a
   * refused change cannot leave `guest` sitting in the cell — and `rosterReads`
   * stays at 1, because a refused write must not re-read either.
   */
  it('13.827 a REFUSED role change is said out loud, and the cell does not move', async () => {
    const user = userEvent.setup();
    const reason = 'This change would leave the workspace with no owner.';
    let rosterReads = 0;
    mount(
      { listPending: async () => [] },
      () => undefined,
      (event) => ({ status: 'refused', eventId: event.id, rule: 'last-owner', reason }),
      {
        getMembers: async () => {
          rosterReads += 1;
          return ROSTER;
        },
      },
    );
    await user.click(await screen.findByRole('button', { name: /Role for Anselma Marak/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'guest' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('last-owner');
    expect(alert).toHaveTextContent(reason);
    const control = screen.getByRole('button', { name: /Role for Anselma Marak/ });
    expect(control).toHaveTextContent('member');
    expect(control).not.toHaveTextContent('guest');
    expect(rosterReads).toBe(1);
  });

  /**
   * 13.828 THE ARM THE PROTOTYPE DRAWS AND THIS PRODUCT CANNOT.
   *
   * The prototype gates its select on the VIEWER alone (`desktop.dc.html:3061`,
   * `canEditRole: myRoleIsAdmin`) and offers `Owner` in the option list, so its
   * owner rows are editable like any other. This product removed `Owner` from
   * the options — and the two halves do not compose: a `Select` whose `value`
   * matches no option renders its PLACEHOLDER (`packages/ui/src/select/select.tsx:255`,
   * `selected ? selected.label : placeholder`), so an owner's cell would read
   * `Select…` — a cell that does not say what that person's role is, on the
   * screen whose whole subject is who holds what. Offering the row a control
   * would also be a demotion door with no designed flow, which is the mirror of
   * the promotion this plan refuses to add.
   *
   * So the control is offered where it can state the value it would change, and
   * the chip stays where it cannot. This was a CONSERVATIVE DEFAULT taken here
   * and has since been RULED ON: the controller confirmed it on 2026-09-18,
   * answering `gisik-nokma-lanes/EXEC2-2026-09-18-owner-row-editability.md`. If
   * that decision is ever revisited, this arm and this case change together.
   */
  it('13.828 an OWNER’s row keeps the chip, because the control cannot state the value it holds', async () => {
    mount({ listPending: async () => [] });
    const table = await screen.findByRole('table');
    const ownerRow = within(table).getAllByRole('row')[1]!;
    expect(within(ownerRow).getByText('owner')).toBeInTheDocument();
    expect(within(ownerRow).queryByRole('button')).toBeNull();
  });
});

/**
 * 13.886 THE INVITE FORM'S TWO NATIVE FIELDS WEAR THE PRODUCT'S OWN FIELD
 * PATTERN (executor 2, 2026-09-18).
 *
 * They were the screen's one place still rendering a bare `<label>` beside a
 * UA-default `<input>` — a shape no other field in the product has — and the
 * prototype draws the same pair the product's `.gn-field` ports: a label stacked
 * over its control, `gap:7px`, label `13px/18px` in `--label2`, control
 * `min-height:44px` (`desktop.dc.html:748-751`, `.gn-field` at
 * `packages/ui/src/ui.css:3843-3875`). The wrapper is copied from the sibling
 * that already wears it rather than invented (`page.tsx:812-821`).
 *
 * This case is deliberately about the WRAPPER AND NOT THE VALUES: the resolver
 * over `.gn-members`'s own family lives in `members-styling.test.ts` (13.887,
 * 13.888), because `globals.css` is not loaded here and a rendered reading could
 * only restate classes. What THIS case has to catch is the way a wrapper breaks
 * a form — a label that no longer labels, a value that stops reaching the
 * handler — so it drives the real path end to end: type through the LABEL
 * association, submit, and read what the door was handed.
 *
 * THE TWO SELECT FIELDS ARE UNTOUCHED, and the reason first written here for it
 * was FALSE — kept, corrected, because the shape recurs on this screen.
 *
 * It said: `Channel` and `Role` are the shared `Select` (migrated 2026-09-14,
 * cases 13.824–13.828) and `.gn-field__input` "is a class for NATIVE controls —
 * a `Select` wears its own trigger and cannot take it", so wrapping them would
 * mean "inventing a class for a non-native control or wrapping a `Select` in a
 * class declared for native ones". **Neither horn exists.** The shared component
 * puts that exact class on its own trigger — `packages/ui/src/select/select.tsx:254`
 * (`gn-select__trigger gn-field__input`), and `:231` / `:432` for the multiple
 * and searchable variants — so nothing needs inventing and no `Select` needs
 * wrapping in anything: `.gn-field` is `flex-direction: column; gap` and
 * `.gn-field__label` is the 13px label, both of which a `Select` sits inside
 * happily. That is what the prototype draws (`desktop.dc.html:752-753`).
 *
 * **So the honest state is "alignable and not aligned", not "not alignable".**
 * The wrapping is left undone HERE because the amendment reserved this exact
 * decision and asked for it to be reported rather than settled — it is on the
 * change's report to the controller, with a recommendation. The two labels
 * therefore still carry the UA default rather than the prototype's 13px/18px,
 * and this paragraph is the correction an independent review forced.
 */
describe('13.886 the invite form’s fields wear the shared .gn-field pattern', () => {
  it('13.886 the address and projects fields are .gn-field/__label/__input, and still submit', async () => {
    const bodies: unknown[] = [];
    mount({
      listPending: async () => [],
      mintInvite: async (_workspaceId, request) => {
        bodies.push(request);
        return { inviteId: 'i_1', url: 'http://localhost:3001/invite/tok', expiresAt: 'later' };
      },
    });
    const user = userEvent.setup();

    // Read THROUGH the label association rather than by id: that is what the
    // wrapper could break, and `getByLabelText` is the query a person's
    // screen-reader path takes.
    const address = await screen.findByLabelText('Address');
    expect(address.tagName).toBe('INPUT');
    expect(address.className).toContain('gn-field__input');
    const addressWrap = address.closest('label');
    expect(addressWrap?.className).toContain('gn-field');
    expect(addressWrap?.querySelector('.gn-field__label')?.textContent).toBe('Address');

    const projects = screen.getByLabelText(/^Projects/);
    expect(projects.className).toContain('gn-field__input');
    const projectsWrap = projects.closest('label');
    expect(projectsWrap?.className).toContain('gn-field');
    expect(projectsWrap?.querySelector('.gn-field__label')?.textContent).toBe(
      'Projects (comma-separated ids, optional)',
    );

    // And the wrapper moves no behaviour: what was typed still reaches the door.
    await user.type(address, 'anselma@example.test');
    await user.click(screen.getByRole('button', { name: 'Send invitation' }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ address: 'anselma@example.test' });
  });
});

/**
 * 13.889 THE TWO `Select` FIELDS WEAR THE FIELD PATTERN'S LABEL HALF — and no
 * native-control class is passed to them (AMENDMENT 2, ruled 2026-09-18).
 *
 * The prototype wraps Channel and Role in the same label-over-control pair it
 * uses for the text fields (`desktop.dc.html:752-753`, `:759`), so the label
 * scale is the field pattern's and belongs on them. What the ruling withholds
 * is `.gn-field__input`: those two pickers have been the shared `Select` since
 * 2026-09-14 (Phase 2 Wave A, cases 13.824–13.828) and its trigger renders as a
 * `role="button"`, not a control element.
 *
 * WHAT THIS CASE CAN AND CANNOT SEE, measured rather than assumed. It asserts
 * the LABEL half — a `.gn-field` ancestor whose `.gn-field__label` reads the
 * field's name — and that the control inside is still the shared component's
 * trigger (`button.gn-select__trigger`) carrying its own `aria-label`, which is
 * the "do not convert it back" half of amendment 1. **It does NOT assert the
 * absence of `.gn-field__input` on the trigger, because that class is on every
 * `Select` in the product: the shared component puts it there itself
 * (`packages/ui/src/select/select.tsx:254`).** An absence assertion would be red
 * against correct code, which is the failure mode this repo records most — so
 * what the page controls, and what is asserted, is the label half.
 *
 * NOR does it assert that no `<select>` element is inside the wrapper: the shared
 * component renders a `HiddenSelect` — a visually hidden native `<select>` — on
 * purpose (`select.tsx:253`), so that assertion would be red against correct
 * code too. The trigger's tag and class are the honest signal.
 */
describe('13.889 the Select fields are labelled by the field pattern, and stay the shared Select', () => {
  it('13.889 Channel and Role sit inside a .gn-field label, and their triggers keep their names', async () => {
    mount({ listPending: async () => [] });
    const form = (await screen.findByRole('heading', { name: 'Invite somebody' })).closest('form');
    expect(form).not.toBeNull();

    for (const name of ['Channel', 'Role'] as const) {
      // Scoped to the form: the roster's own role control also matches `/Role/`.
      const labelSpan = within(form!).getByText(name, { selector: '.gn-field__label' });
      const wrapper = labelSpan.closest('.gn-field');
      expect(wrapper, `${name} is not inside a .gn-field`).not.toBeNull();
      // THE TAG AND THE ORDER, both of which the first version left to prose and
      // an independent review then defeated: `<label className="gn-field">`
      // swapped for `<div className="gn-field">` stayed 30/30 green, and moving
      // the span AFTER the control did too — while `.gn-field` is
      // `flex-direction: column`, so DOM order IS visual order and the
      // prototype's label-over-control would have been inverted on screen.
      expect(wrapper!.tagName, `${name}'s field is not a <label>`).toBe('LABEL');
      expect(wrapper!.firstElementChild, `${name}'s label no longer precedes its control`).toBe(labelSpan);

      const trigger = wrapper!.querySelector('button.gn-select__trigger');
      expect(trigger, `${name}'s control is no longer the shared Select`).not.toBeNull();
      // The name every existing case on this form queries by — losing it would
      // be an invisible accessibility regression that the role queries above
      // would not notice.
      expect(trigger!.getAttribute('aria-label')).toBe(name);
    }
  });
});

/**
 * THE NAME FALLBACK — the owner's instruction, and the three sites that were all
 * reading the same possibly-empty string.
 *
 * *"on the member's page, member list, if the name is absent, show the email
 * instead."*
 *
 * ## "Absent" is the ORDINARY case for an email sign-up, not an edge case
 *
 * better-auth's magic-link plugin creates the user with `name: name || ""` and
 * this product's sign-in page sends no name (`app/sign-in/page.tsx`), so **an
 * email sign-up has `name === ''`**. Before this change that row rendered an
 * empty cell, a BLANK monogram disc, and a control whose accessible name was
 * `"Role for "` — a name that identifies nobody. All three read `member.name`
 * independently, which is how they came to be broken together.
 *
 * ## Two populations, and neither can be inferred from the other
 *
 * The fixture holds both, because a case with only the first would not notice a
 * fallback that fired unconditionally:
 *
 * - **An email sign-up** — an EMPTY name and a REAL address. The fallback fires.
 * - **A phone sign-up** — a non-empty name (the phone itself, `getTempName`)
 *   and **no `email` key**, because the server withholds the synthetic address
 *   (`apps/server/src/auth/synthetic-address.ts` carries the measurement). The
 *   fallback must NOT fire, and there is nothing for it to fall back TO.
 *
 * The `aria-label` is asserted through the ATTRIBUTE rather than by role name,
 * and that is deliberate: the control's accessible name is a CONCATENATION (its
 * own value text plus this label — measured in this file's `13.828`), so an
 * exact-string `getByRole` would fail for a reason unrelated to this case.
 */
describe('13.960 the roster shows the address when the name is absent, and names the control after the same label', () => {
  const NAMELESS: RosterMember[] = [
    { id: '01J9USER000000000000000001', name: '', role: 'member', email: 'anselma@example.test' },
    { id: '01J9USER000000000000000002', name: '+919000700001', role: 'member' },
  ];

  it('one resolved label reaches the cell, the monogram and the accessible name', async () => {
    mount({ listPending: async () => [] }, undefined, undefined, {
      getMembers: async () => NAMELESS,
    });

    const rows = await screen.findAllByRole('row');
    // rows[0] is the header; the roster follows it in fixture order.
    const emailRow = rows[1]!;
    const phoneRow = rows[2]!;

    // ─── THE FALLBACK: the address is what the person is shown AS ────────────
    expect(within(emailRow).getByText('anselma@example.test')).toBeInTheDocument();
    // The monogram is no longer a blank disc: it is the first code point of the
    // SAME resolved label (the rule `initialOf` already documented, applied to
    // the label instead of to a name that may be empty).
    expect(
      within(emailRow).getByText('A', { selector: '.gn-members__initial' }),
    ).toBeInTheDocument();

    // ─── THE DEFECT: the control names the person, in both populations ───────
    expect(within(emailRow).getByRole('button').getAttribute('aria-label')).toBe(
      'Role for anselma@example.test',
    );
    // The phone member keeps their name — the fallback is conditional, and this
    // is the arm that reddens if it ever stops being.
    expect(within(phoneRow).getByText('+919000700001')).toBeInTheDocument();
    expect(within(phoneRow).getByRole('button').getAttribute('aria-label')).toBe(
      'Role for +919000700001',
    );

    // The form of the defect itself, asserted directly rather than by example:
    // NO control on this screen announces the fragment. `"Role for "` with an
    // empty tail is what an absent name produced, and it is a well-formed
    // accessible name — which is why nothing else notices it.
    for (const row of [emailRow, phoneRow]) {
      const label = within(row).getByRole('button').getAttribute('aria-label') ?? '';
      expect([label, label.startsWith('Role for '), label.slice('Role for '.length).trim() !== '']).toEqual([
        label,
        true,
        true,
      ]);
    }
  });
});
