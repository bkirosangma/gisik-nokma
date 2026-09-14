import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IngestResult, SubmittedEvent } from '@gisik-nokma/domain';
import { InviteAdminError, type PendingInvite } from '@gisik-nokma/app-core/online';
import MembersPage, { COPY_IT_NOW } from '../app/w/[workspaceId]/members/page.js';
import { Providers } from '../src/providers.js';
import { stubServices, type GatewayStubs } from './helpers/stub-services.js';

/**
 * The invite mint, the pending list, and the role gate (Plan 6 Task 15b, item
 * 2). Cases 3.129–3.136.
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

const ROSTER = [
  { id: '01J9USER000000000000000000', name: 'Kiro' },
  { id: '01J9USER000000000000000001', name: 'Anselma Marak' },
];

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
) {
  const services = stubServices({ getMembers: async () => ROSTER }, { invitesAdmin });
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
  render(
    <Providers services={services}>
      <MembersPage />
    </Providers>,
  );
}

beforeEach(() => vi.clearAllMocks());

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
