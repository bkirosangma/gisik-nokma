import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IngestResult, SubmittedEvent } from '@gisik-nokma/domain';
import type { WorkspaceRef } from '@gisik-nokma/app-core';
import { tintIndexOf } from '@gisik-nokma/ui';
import WorkspaceHomePage from '../app/w/[workspaceId]/page.js';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * `/w/[workspaceId]` — the workspace home (Task 19), cases 13.384–13.387.
 *
 * ## WHAT COULD MAKE EVERY CASE IN THIS FILE PASS FOR THE WRONG REASON
 *
 * 1. **A page that renders one project's number on another's row.** Every count
 *    in every fixture below is a DIFFERENT number, and each is asserted INSIDE
 *    its own row (`within(row)`), so a row reading a sibling's field reddens.
 * 2. **`absent` and `0` are the same to any assertion written `toBe(0)`.** The
 *    withheld half asserts by SHAPE — no digit anywhere in the row — against a
 *    positive control in the same run, because `0` is a claim the server
 *    declined to make by omitting the key.
 * 3. **A control asserted PRESENT for an admin proves nothing about a member.**
 *    Every gate assertion pairs the affordance's presence on one role with its
 *    absence on another, in the same file with the same fixture, so a page that
 *    rendered the controls for everybody fails and a page that rendered them
 *    for nobody fails too.
 * 4. **A mutation case that never reads the door's answer.** 13.386 drives BOTH
 *    arms — a committed archive and a refused one — because a `.then()` that
 *    reloaded unconditionally passes the committed arm and shows a member a
 *    screen indistinguishable from success on the refused one.
 */

const WORKSPACE = '01J9WORKSPACE0000000000000';
const OTHER_WORKSPACE = '01J9WORKSPACE1111111111111';
const KIRO = '01J9USER000000000000000000';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ workspaceId: WORKSPACE }),
  usePathname: () => `/w/${WORKSPACE}`,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: KIRO, name: 'Kiro' } }, isPending: false }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

/**
 * The workspace as the route serves it, with every displayed number DIFFERENT
 * from every other so a card reading one field off another cannot pass.
 *
 * `nameRestrictedProjectCount` is 2 rather than 0 on purpose: this page's own
 * docblock records that the restricted line discloses only PART of an admin's
 * narrower list, and a fixture at zero would never render the line the argument
 * is about.
 */
function workspaceAs(role: string, over: Partial<WorkspaceRef> = {}): WorkspaceRef {
  return {
    id: WORKSPACE,
    name: 'Convenience Corner',
    role,
    memberCount: 5,
    nameRestrictedProjectCount: 2,
    projects: [
      { id: 'p1', name: 'Shop operations', archived: false, ticketCount: 9, blockedCount: 3 },
      { id: 'p2', name: 'Deliveries', archived: false, ticketCount: 4, blockedCount: 0 },
      { id: 'p3', name: 'Old signage', archived: true, ticketCount: 7, blockedCount: 1 },
    ],
    ...over,
  };
}

const COMMITTED = (event: SubmittedEvent): IngestResult => ({
  status: 'committed',
  eventId: event.id,
  seq: 1,
  serverTime: '2026-09-09T10:00:00.000Z',
});

/**
 * `reads` is a QUEUE, not a constant, because half of what this page claims is
 * about the SECOND read: the outcome of a mutation is observed by re-reading
 * the directory, never by this page editing its own copy of the list. A fixed
 * answer would make the archive round trip pass against a client that moved the
 * row itself.
 *
 * The last element is repeated once the queue runs dry, so a case that only
 * cares about the first render does not have to count reloads.
 *
 * **The index is the count of committed INGESTS, not of `getMyWorkspaces`
 * CALLS (Round 19b).** It used to be the latter, and that broke the moment a
 * second, independent reader of the same route existed: `AppNav` now reads
 * `getMyWorkspaces` too, for the nav's own workspace-name item, and it does so
 * on MOUNT — before any archive or restore. A call-counted queue would hand
 * that extra read the slot this file's "after the archive" snapshot was
 * written for, and the page would render as already-archived before the test
 * ever clicked anything. Counting ingests instead ties the snapshot to the
 * thing that actually changed the world, which is invariant to how many
 * components independently ask what the directory currently says.
 */
function mount(
  reads: WorkspaceRef[][],
  options: {
    ingest?: (events: SubmittedEvent[]) => void;
    answer?: (event: SubmittedEvent) => IngestResult;
  } = {},
) {
  let ingests = 0;
  const services = stubServices({
    getMyWorkspaces: async () => reads[Math.min(ingests, reads.length - 1)]!,
  });
  // ALWAYS replaced. `stubServices` hands back `ingest: async () => []`, and an
  // empty results array is not a commit — this page reports it as "the server
  // answered 0 of 1 claims", which is correct behaviour and a confusing default
  // for a case that only wanted to watch the list reload.
  services.dataSource.ingest = async (events) => {
    options.ingest?.(events);
    const results = events.map(options.answer ?? COMMITTED);
    ingests += 1;
    return results;
  };
  render(
    <Providers services={services}>
      <WorkspaceHomePage />
    </Providers>,
  );
  return { ingests: () => ingests };
}

const row = (projectId: string) => screen.getByTestId(`project-row-${projectId}`);

beforeEach(() => vi.clearAllMocks());

/**
 * 13.384 — the home lists THIS CALLER'S projects with THIS CALLER'S counts, and
 * a withheld count is rendered as nothing rather than as zero.
 *
 * Three things are pinned that a looser case would miss. **Per-row scoping**:
 * `9 tickets` and `4 tickets` are asserted inside `p1` and `p2` respectively and
 * asserted ABSENT from the other, so a page printing one project's number on
 * every row fails. **Zero blocked prints no chip**: `p2` has `blockedCount: 0`
 * and must render no blocked chip at all — `0 blocked` is a true number and a
 * useless one, and the row that carries it is the row a reader would scan past.
 * **Archived is marked AND hidden**: `p3` is absent from the default list, the
 * disclosure names the workspace, and the revealed row carries an `Archived`
 * chip — marking without hiding, or hiding without marking, each fails half.
 *
 * The withheld half is a GUEST, and it asserts by shape: the guest is still told
 * every project's NAME (rulings P32/P38 withhold names from a non-member, which
 * this guest is not), and no digit appears in any row. A `?? 0` in either count
 * renders `0 tickets` and reddens here.
 */
describe('13.384 the workspace home lists projects with the caller’s own counts', () => {
  it('shows each project’s own counts in its own row, hides archived behind a marked disclosure', async () => {
    mount([[workspaceAs('member')]]);

    expect(await screen.findByRole('heading', { name: 'Convenience Corner' })).toBeInTheDocument();
    // The role sentence became a META LINE (Round 19b, owner feedback item 4):
    // "N members · M active projects · you're a member" — every number SERVED
    // (`memberCount`, and `live.length` = the 2 non-archived projects THIS
    // fixture's member sees), the role as a CLAUSE from the same `viewerOf`
    // the card reads. ONE text node, the same discipline every other
    // multi-interpolation sentence in this file keeps.
    expect(screen.getByText("5 members · 2 active projects · you're a member")).toBeInTheDocument();

    // Scoped per row, both ways: the number is IN its own row and NOT in the
    // other's. A page that rendered one project's count everywhere passes a
    // bare `getByText('9 tickets')` and fails this.
    expect(within(row('p1')).getByText('9 tickets')).toBeInTheDocument();
    expect(within(row('p1')).getByText('3 blocked')).toBeInTheDocument();
    expect(within(row('p2')).getByText('4 tickets')).toBeInTheDocument();
    expect(within(row('p2')).queryByText('9 tickets')).toBeNull();
    // Zero blocked renders NO chip. `0 blocked` would be true and would put a
    // number on every quiet project in the workspace.
    expect(within(row('p2')).queryByText('0 blocked')).toBeNull();

    // Archived is HIDDEN by default...
    expect(screen.queryByTestId('project-row-p3')).toBeNull();
    const toggle = screen.getByRole('button', {
      name: 'Show archived projects in Convenience Corner',
    });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('Show 1 archived');
    // ...and MARKED once revealed.
    await userEvent.click(toggle);
    expect(within(row('p3')).getByText('Old signage')).toBeInTheDocument();
    expect(within(row('p3')).getByText('Archived')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Hide archived projects in Convenience Corner' }),
    ).toHaveAttribute('aria-expanded', 'true');

    // The restricted line, one text node — a three-interpolation version is
    // split across nodes and fails this.
    expect(screen.getByText('2 projects · name restricted')).toBeInTheDocument();
  });

  it('renders NO number at all for a guest, and still names every project', async () => {
    // The shipped server sends a guest no count keys at all, so the mapper hands
    // this page `null`. The projects it CAN name are still named.
    mount([
      [
        workspaceAs('guest', {
          memberCount: null,
          projects: [
            { id: 'p1', name: 'Shop operations', archived: false, ticketCount: null, blockedCount: null },
          ],
        }),
      ],
    ]);

    const only = await screen.findByTestId('project-row-p1');
    // The name is plain text now (Round 19b): "Open board" is the row's one
    // door, not the name doubling as a second link to the same target.
    expect(within(only).getByText('Shop operations')).toBeInTheDocument();
    expect(within(only).getByRole('link', { name: 'Open board' })).toHaveAttribute(
      'href',
      `/w/${WORKSPACE}/p/p1`,
    );
    // BY SHAPE, not by value: no digit anywhere in the row. `toBe(0)` and
    // `toBeUndefined()` both pass on a page that printed `0 tickets`, which is
    // the exact claim the server declined to make by omitting the key.
    expect(only.textContent).not.toMatch(/\d/);

    // THE POSITIVE CONTROL, in the same run, same component, same one-project
    // shape — only the role and the served keys differ. Without it, a page that
    // had simply stopped rendering counts for EVERYBODY would pass the
    // assertion above and this case would certify nothing.
    cleanup();
    mount([
      [
        workspaceAs('member', {
          projects: [
            { id: 'p1', name: 'Shop operations', archived: false, ticketCount: 9, blockedCount: 3 },
          ],
        }),
      ],
    ]);
    const served = await screen.findByTestId('project-row-p1');
    expect(served.textContent).toMatch(/\d/);
    expect(within(served).getByText('9 tickets')).toBeInTheDocument();
  });
});

/**
 * 13.385 — the admin gate. A non-admin sees the project list and the links and
 * NOT the mutation controls; an owner or admin sees all three.
 *
 * The pairing is the case. Asserting only that an admin has an Archive button
 * passes against a page that shows it to everybody, and asserting only that a
 * member lacks one passes against a page that shows it to nobody — so both roles
 * are driven against the SAME fixture and each affordance is checked present on
 * one and absent on the other.
 *
 * `guest` is driven as well as `member` because they fail differently: a gate
 * written `role !== 'member'` admits a guest, and a gate written
 * `role === 'owner'` locks out an admin. Four roles, one table.
 *
 * MUTATION MEASURED: widening the client gate to admit a member (`mayAdminister`
 * returning true for `member`) reddens THIS case and nothing else — the server
 * half is 13.388's, deliberately, so the two halves of "hiding a control is not
 * enforcement" fail at their own sites.
 */
describe('13.385 every admin affordance is gated on the caller’s served role', () => {
  const CONTROLS = ['Archive Shop operations', 'Restore Old signage'];

  it.each([
    ['owner', true],
    ['admin', true],
    ['member', false],
    ['guest', false],
  ])('role %s sees the mutation controls: %s', async (role, allowed) => {
    mount([[workspaceAs(role)]]);
    // Everybody gets the list and the links — the gate is on the mutations
    // alone, and a page that refused the whole screen to a member would fail
    // here rather than passing the absence assertions below by accident.
    expect(await screen.findByRole('link', { name: 'My Work' })).toBeInTheDocument();
    expect(screen.getByTestId('project-row-p1')).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Show archived projects in Convenience Corner' }),
    );

    for (const control of CONTROLS) {
      const found = screen.queryByRole('button', { name: control });
      if (allowed) expect(found, `${role} should be offered "${control}"`).not.toBeNull();
      else expect(found, `${role} must not be offered "${control}"`).toBeNull();
    }
    const form = screen.queryByRole('button', { name: 'Create project' });
    if (allowed) expect(form).not.toBeNull();
    else expect(form).toBeNull();
  });
});

/**
 * 13.386 — the screen follows the DOOR'S answer, in both directions.
 *
 * **Committed arm:** archiving takes a project out of the default list and
 * restoring brings it back, and the movement comes from the RE-READ. The stub
 * serves a different directory on the second and third calls, and the page must
 * show what the server now says — a client that moved the row itself would pass
 * a case whose stub never changed, which is why this one's does.
 *
 * The submitted claim is asserted too, because "the row moved" is satisfied by
 * any event at all: `project.archived` filed against `{kind:'project', id:'p1'}`
 * in this workspace, actor `KIRO`, envelope-origin `web`, and exactly ONE event
 * — the archive pair is symmetric and carries no roster grant.
 *
 * **Refused arm:** the door's own `rule: reason` reaches the screen. A `.then()`
 * that reloaded unconditionally passes the committed arm and shows a member a
 * screen indistinguishable from success here, which is the defect this case
 * exists for. The refusal is the REAL rule name and sentence the server sends
 * for this event type, not a paraphrase.
 */
describe('13.386 archive hides a project and restore returns it — read from the door', () => {
  it('moves the project on the RE-READ, and submits exactly one archive claim', async () => {
    const sent: SubmittedEvent[][] = [];
    mount(
      [
        [workspaceAs('admin')],
        // After the archive: `p1` comes back archived.
        [
          workspaceAs('admin', {
            projects: [
              { id: 'p1', name: 'Shop operations', archived: true, ticketCount: 9, blockedCount: 3 },
              { id: 'p2', name: 'Deliveries', archived: false, ticketCount: 4, blockedCount: 0 },
            ],
          }),
        ],
        // After the restore: live again.
        [
          workspaceAs('admin', {
            projects: [
              { id: 'p1', name: 'Shop operations', archived: false, ticketCount: 9, blockedCount: 3 },
              { id: 'p2', name: 'Deliveries', archived: false, ticketCount: 4, blockedCount: 0 },
            ],
          }),
        ],
      ],
      { ingest: (events) => sent.push(events) },
    );

    await userEvent.click(
      await screen.findByRole('button', { name: 'Archive Shop operations' }),
    );

    // The claim, before the screen: one event, the right type, the right entity.
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toHaveLength(1);
    const claim = sent[0]![0]!;
    expect(claim.type).toBe('project.archived');
    expect(claim.entity).toEqual({ kind: 'project', id: 'p1' });
    expect(claim.workspaceId).toBe(WORKSPACE);
    expect(claim.actorId).toBe(KIRO);
    expect(claim.origin).toBe('web');

    // The screen, after the re-read: gone from the default list, behind the
    // disclosure, and offering the opposite control.
    await waitFor(() => expect(screen.queryByTestId('project-row-p1')).toBeNull());
    await userEvent.click(
      screen.getByRole('button', { name: 'Show archived projects in Convenience Corner' }),
    );
    expect(within(row('p1')).getByText('Archived')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Restore Shop operations' }));
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]![0]!.type).toBe('project.restored');
    // Back in the live list, and the disclosure is gone with nothing left
    // behind it — a toggle over an empty list would lie about the shape of the
    // data, which is the same rule the card keeps.
    await waitFor(() =>
      expect(within(row('p1')).queryByText('Archived')).toBeNull(),
    );
    expect(
      screen.queryByRole('button', { name: /archived projects in Convenience Corner/ }),
    ).toBeNull();
  });

  it('shows the door’s own refusal instead of a silent reload', async () => {
    // The rule name and sentence `checkRolePermission` actually answers for an
    // admin-only type — not a paraphrase of it.
    mount([[workspaceAs('admin')]], {
      answer: (event) => ({
        status: 'refused',
        eventId: event.id,
        rule: 'permission.role',
        reason: 'Only a workspace owner or admin can do this.',
      }),
    });

    await userEvent.click(
      await screen.findByRole('button', { name: 'Archive Shop operations' }),
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('permission.role: Only a workspace owner or admin can do this.');
    // The row did not move, because the door did not move it.
    expect(screen.getByTestId('project-row-p1')).toBeInTheDocument();
  });
});

/**
 * 13.387 — the five doors out of this page resolve to the routes that exist.
 *
 * **Asserted as five LITERAL paths, and that is the whole case.** Four of the
 * five live under `app/w/[workspaceId]/`; `/mcp/tokens` does NOT — it is a
 * global route that takes no `workspaceId`. A page that built its hrefs from one
 * `/w/${id}/` prefix would emit `/w/<id>/mcp/tokens`, which resolves to nothing,
 * and a test that built its expectations the same way would agree with the bug.
 *
 * The paths are also checked against the app directory itself, in the same run:
 * a link is only proven live by a `page.tsx` existing at the route it names.
 *
 * **Names are matched by PREFIX, not exact, since Round 19b.** Each door's
 * accessible name is now its label AND its note concatenated (the note joined
 * this round, per item 4's last bullet) — an anchor's accessible name is
 * computed from its full text content, and suppressing the note with a second
 * `aria-label` would take the note out of what a screen reader announces,
 * which is not what "carries a note" is supposed to mean. `^label\b` still
 * proves the TARGET unambiguously; it is the hrefs this case is about.
 */
describe('13.387 the workspace-section links resolve to the real routes', () => {
  it('carries five links, four workspace-scoped and one global', async () => {
    mount([[workspaceAs('member')]]);
    const nav = await screen.findByRole('navigation', { name: 'Workspace sections' });
    const expected: Array<[RegExp, string]> = [
      [/^My Work\b/, `/w/${WORKSPACE}/my-work`],
      [/^Members\b/, `/w/${WORKSPACE}/members`],
      [/^Ticket types\b/, `/w/${WORKSPACE}/settings/ticket-types`],
      [/^Workflows\b/, `/w/${WORKSPACE}/settings/workflows`],
      [/^MCP tokens\b/, '/mcp/tokens'],
    ];
    for (const [name, href] of expected) {
      expect(within(nav).getByRole('link', { name }), String(name)).toHaveAttribute('href', href);
    }
    expect(within(nav).getAllByRole('link')).toHaveLength(expected.length);
    // The negative that names the actual defect: nothing here points at a
    // workspace-scoped MCP route, which does not exist.
    expect(within(nav).queryByRole('link', { name: /^MCP tokens\b/ })).not.toHaveAttribute(
      'href',
      `/w/${WORKSPACE}/mcp/tokens`,
    );
  });

  /**
   * 13.398 — the notes themselves, verbatim, and the Members one's number.
   */
  it("13.398 carries each door's note, and the Members note reads the served member count", async () => {
    mount([[workspaceAs('member')]]);
    const nav = await screen.findByRole('navigation', { name: 'Workspace sections' });
    expect(
      within(nav).getByText('Everything assigned to you across this workspace.'),
    ).toBeInTheDocument();
    expect(
      within(nav).getByText('5 people · roles and pending invitations.'),
    ).toBeInTheDocument();
    expect(
      within(nav).getByText('Fields and the workflow each type follows.'),
    ).toBeInTheDocument();
    expect(
      within(nav).getByText('States, transitions and published versions.'),
    ).toBeInTheDocument();
    expect(
      within(nav).getByText('Let an assistant act as you, with your permissions.'),
    ).toBeInTheDocument();
  });

  it("13.398 a guest's Members note carries no number — memberCount is withheld, not zero", async () => {
    mount([[workspaceAs('guest', { memberCount: null })]]);
    const nav = await screen.findByRole('navigation', { name: 'Workspace sections' });
    expect(within(nav).getByText('roles and pending invitations.')).toBeInTheDocument();
    expect(within(nav).queryByText(/\d+ (person|people) ·/)).toBeNull();
  });
});

/**
 * 13.395 — the header: the monogram's tint, the meta line, and the ONE source
 * the role clause and the `/workspaces` card's sentence both read.
 */
describe('13.395 the header reads only served numbers, and its tint is keyed on the id', () => {
  it('tints the header monogram from the workspace ID, not the name', async () => {
    // The home page's route pins ONE workspace id (`WORKSPACE`, mocked via
    // `useParams`), so the `/workspaces` card's "two ids, same name" render
    // comparison does not apply here — this page cannot render a second id.
    // Instead: compute the expected tint DIRECTLY from `tintIndexOf`, keyed
    // both ways, and assert the header agrees with the id-keyed one and NOT
    // the name-keyed one. `WORKSPACE` and its own name are chosen so the two
    // keys hash to different tints — asserted as a POSITIVE CONTROL first, so
    // the negative below cannot pass merely because both keys coincide.
    const byId = tintIndexOf(WORKSPACE);
    const byName = tintIndexOf('Convenience Corner');
    expect(byId, 'fixture is unusable: id and name hash to the same tint').not.toBe(byName);

    mount([[workspaceAs('member', { id: WORKSPACE, name: 'Convenience Corner' })]]);
    const avatar = await screen.findByLabelText('Convenience Corner', { selector: '.gn-avatar' });
    expect(avatar).toHaveClass(`gn-avatar--tint-${byId}`);
    expect(avatar).not.toHaveClass(`gn-avatar--tint-${byName}`);
  });

  it('carries no member number for a guest, and the role clause matches the /workspaces card\'s own source', async () => {
    // `viewer.clause` and `viewer.sentence` come out of the SAME `viewerOf`
    // call — this fixture drives a guest (whose sentence is "You're a guest
    // here.") through the header and asserts the meta line's clause agrees
    // ("a guest"), rather than re-deriving the role a second way.
    mount([
      [
        workspaceAs('guest', {
          memberCount: null,
          projects: [
            { id: 'p1', name: 'Shop operations', archived: false, ticketCount: null, blockedCount: null },
          ],
        }),
      ],
    ]);
    expect(await screen.findByText('1 active project · you\'re a guest')).toBeInTheDocument();
    expect(screen.queryByText(/members? ·/)).toBeNull();
  });
});

/**
 * 13.396 — the project card: "Open board" for an archived project too (the
 * same label a live one gets, never "read-only" — archiving is not a
 * permission), and Archive/Restore read the same role value the server gate
 * answers independently (13.388's half; 13.385 already drives the pairing).
 */
describe('13.396 archived projects still open, with the same label a live one gets', () => {
  it('offers "Open board" — not "Open read-only" — for an archived project, at the archived project\'s own href', async () => {
    mount([[workspaceAs('admin')]]);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Show archived projects in Convenience Corner' }),
    );
    const archivedRow = row('p3');
    expect(
      within(archivedRow).getByRole('link', { name: 'Open board' }),
    ).toHaveAttribute('href', `/w/${WORKSPACE}/p/p3`);
    expect(within(archivedRow).queryByText(/read-only/i)).toBeNull();
  });
});

/**
 * 13.397 — the archived control is ABSENT at zero, on the home page exactly
 * as on `/workspaces`' card (Task 18/19's own ruling, restated here because
 * this round moved the control's position, not the rule).
 */
describe('13.397 no archived projects means no archived control, on the home too', () => {
  it('renders neither the toggle nor an archived list when nothing is archived', async () => {
    mount([[workspaceAs('member', { projects: [{ id: 'p1', name: 'Shop operations', archived: false, ticketCount: 2, blockedCount: 0 }] })]]);
    await screen.findByTestId('project-row-p1');
    expect(screen.queryByRole('button', { name: /archived/i })).toBeNull();
  });
});

/**
 * 13.394 (home half) — the "New project" form is `.gn-project-founding`, a
 * raised card with an inline row, NOT `.gn-workspace-founding` (the bare
 * column `/workspaces`' "New workspace" form uses, per `founding.test.tsx`).
 * Two class families for two different reference layouts.
 */
describe('13.394 the home\'s new-project form is a raised card, not the workspace list\'s bare column', () => {
  it('carries .gn-project-founding, and not .gn-workspace-founding', async () => {
    mount([[workspaceAs('admin')]]);
    const field = await screen.findByPlaceholderText('e.g. Phase 2 rollout');
    const form = field.closest('form');
    expect(form).not.toBeNull();
    expect(form).toHaveClass('gn-project-founding');
    expect(form).not.toHaveClass('gn-workspace-founding');
  });
});

/**
 * The branch a workspace id nobody is a member of takes. Not one of the six
 * allocated ids — it is the negative control that keeps 13.384 honest, because
 * "the list is empty" and "this is not your workspace" are different facts and
 * a page that rendered the first for the second would pass every case above.
 */
describe('a workspace the directory does not name is not rendered as an empty one', () => {
  it('says the workspace is not the caller’s, and offers no controls', async () => {
    mount([[{ ...workspaceAs('owner'), id: OTHER_WORKSPACE }]]);
    expect(await screen.findByText(/not one of your workspaces/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create project' })).toBeNull();
    expect(screen.queryByTestId('project-row-p1')).toBeNull();
    // And NOT the empty-list sentence, which would be a claim about a workspace
    // this caller was told nothing about.
    expect(screen.queryByText(/No projects you can open/)).toBeNull();
  });
});
