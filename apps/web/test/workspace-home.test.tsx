import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IngestResult, SubmittedEvent } from '@gisik-nokma/domain';
import type { WorkspaceRef } from '@gisik-nokma/app-core';
import { tintIndexOf } from '@gisik-nokma/ui';
import WorkspaceHomePage from '../app/w/[workspaceId]/page.js';
import { Providers } from '../src/providers.js';
import { ruleFor } from './helpers/css-rule-scan.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * `/w/[workspaceId]` — the workspace home (Task 19), cases 13.384–13.387, 13.673.
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

/** The stylesheet the project card's rules live in, read as SOURCE — see
 * 13.1297 at the foot of this file for why that is the only available
 * instrument here. */
const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const GLOBALS_CSS_PATH = resolve(TEST_DIR, '../app/globals.css');

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
    prefix: 'CC',
    role,
    archived: false,
    memberCount: 5,
    nameRestrictedProjectCount: 2,
    projects: [
      { id: 'p1', name: 'Shop operations', prefix: 'SO', archived: false, ticketCount: 9, blockedCount: 3 },
      { id: 'p2', name: 'Deliveries', prefix: 'DL', archived: false, ticketCount: 4, blockedCount: 0 },
      { id: 'p3', name: 'Old signage', prefix: 'OS', archived: true, ticketCount: 7, blockedCount: 1 },
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
    // Round 20: the VISIBLE text is the reference's ("1 archived · show"), while
    // the accessible name above stays the sentence that names the workspace —
    // deliberately two different strings, argued at the control's own call site.
    expect(toggle).toHaveTextContent('1 archived · show');
    // ...and MARKED once revealed.
    await userEvent.click(toggle);
    expect(within(row('p3')).getByText('Old signage')).toBeInTheDocument();
    expect(within(row('p3')).getByText('Archived')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Hide archived projects in Convenience Corner' }),
    ).toHaveAttribute('aria-expanded', 'true');

    // The restricted line, one text node — a three-interpolation version is
    // split across nodes and fails this.
    const restrictedLine = screen.getByText('2 projects · name restricted');
    expect(restrictedLine).toBeInTheDocument();
    // IMPORTANT 2 (Task 7 fix round 1): the CSS-scan tests in
    // `workspace-restricted-spacing.test.ts` only prove the STYLESHEET rule
    // exists for `.gn-workspace-home__restricted`; nothing anywhere proved
    // this element actually CARRIES the class the rule targets. A JSX edit
    // that dropped it — silently losing the 0.55rem offset again — would
    // have left every one of those four scan tests green.
    expect(restrictedLine).toHaveClass('gn-workspace-card__restricted', 'gn-workspace-home__restricted');
  });

  it('renders NO number at all for a guest, and still names every project', async () => {
    // The shipped server sends a guest no count keys at all, so the mapper hands
    // this page `null`. The projects it CAN name are still named.
    mount([
      [
        workspaceAs('guest', {
          memberCount: null,
          projects: [
            { id: 'p1', name: 'Shop operations', prefix: 'SO', archived: false, ticketCount: null, blockedCount: null },
          ],
        }),
      ],
    ]);

    const only = await screen.findByTestId('project-row-p1');
    // Round 20 (owner ruling): the card's BODY is the door and "Open board" is
    // gone — the name is inside that one link, named by it, rather than plain
    // text beside a second link to the same target.
    expect(within(only).getByText('Shop operations')).toBeInTheDocument();
    expect(within(only).getByRole('link', { name: 'Shop operations' })).toHaveAttribute(
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
            { id: 'p1', name: 'Shop operations', prefix: 'SO', archived: false, ticketCount: 9, blockedCount: 3 },
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
              { id: 'p1', name: 'Shop operations', prefix: 'SO', archived: true, ticketCount: 9, blockedCount: 3 },
              { id: 'p2', name: 'Deliveries', prefix: 'DL', archived: false, ticketCount: 4, blockedCount: 0 },
            ],
          }),
        ],
        // After the restore: live again.
        [
          workspaceAs('admin', {
            projects: [
              { id: 'p1', name: 'Shop operations', prefix: 'SO', archived: false, ticketCount: 9, blockedCount: 3 },
              { id: 'p2', name: 'Deliveries', prefix: 'DL', archived: false, ticketCount: 4, blockedCount: 0 },
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
 * 13.673 — the four doors out of this page resolve to the routes that exist.
 *
 * **Asserted as four LITERAL paths, and that is the whole case.** Two of the
 * four live under `app/w/[workspaceId]/`; Ticket types and Workflows do NOT —
 * both carry their workspace as a QUERY PARAM on the global `/settings` route. A
 * page that built its hrefs from one `/w/${id}/` prefix would emit
 * `/w/<id>/settings?…`, which resolves to nothing, and a test that built its
 * expectations the same way would agree with the bug.
 *
 * **Five until Round 21 (owner: "move MCP tokens to the account page. as this
 * should not be scoped to a workspace").** `/mcp/tokens` used to be the obvious
 * non-`/w/` door and carried this case's whole argument; the argument SURVIVES
 * it, which is why the literals stay. Its absence is now asserted here too, so
 * restoring the link reddens this case rather than passing unnoticed — and
 * `account-page.test.tsx` holds the other half, that the screen actually landed
 * where it went. A removal nobody asserts is a removal that comes back.
 *
 * **Ticket types became a non-`/w/<id>/…` door with owner feedback 2026-09-09
 * ("the ticket type edit is opening in a separate route... repoint it").** It
 * targets `/settings?workspaceId=<id>&tab=ticket-types` now, not
 * `/w/<id>/settings/ticket-types` — that bare list page's own Edit button
 * opened the ticket-type editor as a THIRD, sidebar-less route, the exact
 * defect `/settings` itself was just fixed to close; leaving this link
 * pointed at the page that bypasses the fix would have kept the bug
 * reachable a second way.
 *
 * **Workflows joined it in Round 22** (owner: "clicking workflows from the
 * project screen opens up a separate page. it should open up the workflows tab
 * in the settings page"). Round 19e had left it pointed at
 * `/w/<id>/settings/workflows` on the reasoning that repointing it closed no
 * equivalent defect — the workflow BUILDER was never inlined into `/settings`
 * either, so the move would be cosmetic. The owner asked for it on its own
 * merits: the bare page has no sidebar, so following this card dropped you out
 * of the settings shell with no way back to the other sections. The bare route
 * still resolves and `authoring-routes.test.tsx` still drives it.
 *
 * **These paths are NOT checked against the app directory, and this docblock
 * used to claim they were** ("in the same run: a link is only proven live by a
 * `page.tsx` existing at the route it names") — corrected in Round 22 after a
 * grep for `existsSync` found the only such check in the repo is 13.392's, in
 * `app-nav.test.tsx`, over the NAV's targets. These four doors are not nav
 * targets and no filesystem assertion has ever covered them. The sentence read
 * as measured and was not, which is worse than its absence: it invited a reader
 * to trust that a typo'd href here would be caught, when what actually catches
 * one is the literal expected in this case and nothing else. Three of the four
 * targets happen to coincide with routes 13.392 does check (`/w/<id>/my-work`,
 * `/w/<id>/members`, `/settings`), so the gap is narrow — but it is a gap, and
 * naming it is what stops the next reader inheriting the wrong confidence.
 *
 * **Names are EXACT, unchanged by Round 19b's notes.** The first draft folded
 * each note into its link's content and let the accessible name become the
 * label and the note concatenated; `e2e-stack/viewport.spec.ts`'s MUST_NAME
 * sweep (13.389's own witness on this exact route) caught it within the hour —
 * its floor names a link `/^Ticket types$/`, exactly, and a name that grew a
 * note no longer matched. Fixed with `aria-label` (pins the name to the label)
 * plus `aria-describedby` (links the note as a DESCRIPTION, which is the
 * correct ARIA shape for "a control with a name and a supplementary note" and
 * is still announced by most assistive tech, as a description read after the
 * name rather than folded into it) — see `page.tsx`'s own docblock on
 * `WorkspaceLinks`. The floor holds exactly as it did before this round.
 */
describe('13.673 the workspace-section links resolve to the real routes', () => {
  it('carries four links, two workspace-scoped and two query-scoped', async () => {
    mount([[workspaceAs('member')]]);
    const nav = await screen.findByRole('navigation', { name: 'Workspace sections' });
    const expected: Array<[string, string]> = [
      ['My Work', `/w/${WORKSPACE}/my-work`],
      ['Members', `/w/${WORKSPACE}/members`],
      ['Ticket types', `/settings?workspaceId=${WORKSPACE}&tab=ticket-types`],
      ['Workflows', `/settings?workspaceId=${WORKSPACE}&tab=workflows`],
    ];
    for (const [name, href] of expected) {
      expect(within(nav).getByRole('link', { name }), name).toHaveAttribute('href', href);
    }
    expect(within(nav).getAllByRole('link')).toHaveLength(expected.length);
    // The negative that names the actual defect the literals exist to prevent:
    // nothing here points at a workspace-scoped `/settings` PATH, which does not
    // exist — the workspace rides as a query param or the route resolves to
    // nothing.
    expect(within(nav).getByRole('link', { name: 'Ticket types' })).not.toHaveAttribute(
      'href',
      `/w/${WORKSPACE}/settings?tab=ticket-types`,
    );
    // Round 21: MCP tokens is GONE from this workspace-scoped nav. Asserted
    // rather than left to the length check above, so the failure names the
    // reason instead of reading "expected 5 to be 4".
    //
    // 13.672 — the superseded middle revision of this case ("REVISED from five
    // doors to four"), re-minted out of the 13.387 triple. Its own claim is
    // exactly this line: /mcp/tokens left the nav for /account, and its
    // absence is asserted BY NAME rather than left to the length check.
    expect(within(nav).queryByRole('link', { name: 'MCP tokens' })).toBeNull();
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
    // The MCP tokens note ("Let an assistant act as you, with your
    // permissions.") is NOT asserted here any more — Round 21 moved that door to
    // `/account`, and its own note travelled with it. Named rather than silently
    // dropped, so a reader comparing this list to the four links above can see
    // the fifth left on purpose.
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

  /**
   * IMPORTANT 3 (Task 7 fix round 1) — the CSS-scan tests for
   * `.gn-workspace-list__role--pinned` (`workspace-list-role-pin.test.ts`)
   * only ever proved the RULE exists in `globals.css`; nothing anywhere
   * proved this page's header meta line actually CARRIES the class. A JSX
   * edit that dropped the modifier — restoring the card head's 0.9375rem
   * type here by accident — would have left every existing test in this file
   * green, because none of them reads `className`.
   */
  it('the header meta line carries the pinned-size modifier class, not just the base role class', async () => {
    mount([[workspaceAs('member', { id: WORKSPACE, name: 'Convenience Corner' })]]);
    const meta = await screen.findByText(/active project/);
    expect(meta).toHaveClass('gn-workspace-list__role', 'gn-workspace-list__role--pinned');
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
            { id: 'p1', name: 'Shop operations', prefix: 'SO', archived: false, ticketCount: null, blockedCount: null },
          ],
        }),
      ],
    ]);
    expect(await screen.findByText('1 active project · you\'re a guest')).toBeInTheDocument();
    expect(screen.queryByText(/members? ·/)).toBeNull();
  });

  /**
   * The discriminating body, same technique `workspaces-cards.test.tsx`'s
   * 13.381 uses on the sibling card: **`role: 'guest'` WITH `memberCount`
   * served.** The shipped server never sends this combination — it withholds
   * the count BY ROLE, in the same expression — which is exactly why it is
   * the fixture that separates the two possible implementations. A review
   * caught the first draft of this header (and the Members door-note) gating
   * on `memberCount === null` instead of `viewer.countsWithheld`: that second
   * source agrees with the role gate on every real body and disagrees only
   * on a malformed or unrecognised-role one, which is precisely the case
   * `viewerOf` exists to settle once rather than let two call sites answer
   * separately.
   */
  it('gates the member number and the Members note on the ROLE, not on whether memberCount happens to be served', async () => {
    mount([
      [
        workspaceAs('guest', {
          memberCount: 7,
          projects: [
            { id: 'p1', name: 'Shop operations', prefix: 'SO', archived: false, ticketCount: null, blockedCount: null },
          ],
        }),
      ],
    ]);
    expect(await screen.findByText('1 active project · you\'re a guest')).toBeInTheDocument();
    expect(screen.queryByText(/7 members?/)).toBeNull();
    const nav = screen.getByRole('navigation', { name: 'Workspace sections' });
    expect(within(nav).getByText('roles and pending invitations.')).toBeInTheDocument();
    expect(within(nav).queryByText(/7 (person|people) ·/)).toBeNull();
  });
});

/**
 * 13.396 — an archived project's card opens exactly like a live one's: the same
 * door, at its own href, and never "read-only". Archiving is a workspace
 * decision, not a permission (Task 16), so the board underneath stays writable
 * and the prototype's "Open read-only" would be a false claim about this
 * product's own rule.
 *
 * Round 20 rewrote the ASSERTION and not the claim. The label this used to read
 * ("Open board") no longer exists — the owner ruled the card's body into the
 * door — so the case now names the door the way a screen reader reaches it.
 *
 * The accessible name is asserted to CARRY "archived", and that is the half
 * with teeth: `aria-label` overrides everything inside the anchor, so the
 * visible "Archived" chip is invisible to assistive tech, and a non-admin gets
 * no Archive/Restore button to infer the state from either. A door named
 * plainly "Old signage" would leave an archived project indistinguishable from
 * a live one for exactly the callers who cannot see the chip.
 */
describe('13.396 archived projects still open, through the same door a live one gets', () => {
  it("names the archived project's door with its archived state, at its own href, and never read-only", async () => {
    mount([[workspaceAs('admin')]]);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Show archived projects in Convenience Corner' }),
    );
    const archivedRow = row('p3');
    expect(
      within(archivedRow).getByRole('link', { name: 'Old signage, archived' }),
    ).toHaveAttribute('href', `/w/${WORKSPACE}/p/p3`);
    expect(within(archivedRow).queryByText(/read-only/i)).toBeNull();
    // The POSITIVE CONTROL for the name above: a LIVE project in the same
    // render is named WITHOUT the suffix. Asserting only the archived name
    // passes against a page that appended ", archived" to every project.
    expect(within(row('p1')).getByRole('link', { name: 'Shop operations' })).toBeInTheDocument();
    expect(within(row('p1')).queryByRole('link', { name: /archived/ })).toBeNull();
  });
});

/**
 * 13.413 — THE CARD IS THE DOOR, and the admin control is not inside it
 * (Round 20, owner ruling reversing Round 19b's "Open board" button).
 *
 * Three things, and each fails a different plausible implementation:
 *
 * 1. **Exactly ONE link per card.** The ruling removes "Open board" rather than
 *    leaving it beside the new door — a card that was a link AND held an "Open
 *    board" button would be the two-doors-to-one-target failure 19b named,
 *    arrived at from the other side. An implementation that merely wrapped the
 *    existing row in a link passes every other assertion here and fails this.
 *
 * 2. **Archive/Restore is NOT a descendant of the anchor.** `<a>` may not
 *    contain `<button>`; a nested one is invalid HTML that renders, so nothing
 *    would look wrong. jsdom will not complain either — the containment is
 *    asserted directly.
 *
 * 3. **The archived cards sort to the END of the disclosed grid** (Round 21,
 *    owner: "always sort the archived projects to the end"), rather than
 *    appearing in the position the server served them.
 *
 *    **THIS ASSERTION WAS REVERSED IN ROUND 21, and it is the same check
 *    pointing the other way — not a deleted one.** Round 20 asserted the served
 *    order and named `[...live, ...archived]` as the implementation to rule out;
 *    that expression is now the REQUIREMENT, and the single filter it replaced
 *    is what this case rules out. The cost Round 20 argued from is unchanged and
 *    was accepted, not refuted: a disclosed project does move twice on one click
 *    (in, and down). The owner weighed that against grouping retired work and
 *    chose the grouping.
 *
 *    **That third assertion needs its OWN fixture, and the shared one would
 *    make it vacuous IN EITHER DIRECTION.** `workspaceAs` serves p1, p2, p3 with
 *    p3 archived — already last — so the single filter and the concatenation
 *    produce the identical order, and the check could not fail against whichever
 *    implementation it exists to rule out. The fixture below puts the archived
 *    project in the MIDDLE, the only arrangement where the two expressions
 *    disagree. It was built that way in Round 20 and it is what let this case be
 *    turned around here by flipping one expected array.
 */
describe('13.413 each project card is one door, with the admin control outside the anchor', () => {
  it('carries exactly one link and does not nest the archive button in it', async () => {
    mount([[workspaceAs('admin')]]);
    const liveCard = await screen.findByTestId('project-row-p1');

    // 1 — one door, and no "Open board" anywhere on the page any more.
    expect(within(liveCard).getAllByRole('link')).toHaveLength(1);
    expect(screen.queryByRole('link', { name: 'Open board' })).toBeNull();

    // 2 — the button exists, and the anchor does not contain it.
    const door = within(liveCard).getByRole('link', { name: 'Shop operations' });
    const archiveButton = within(liveCard).getByRole('button', { name: 'Archive Shop operations' });
    expect(door.contains(archiveButton)).toBe(false);
    expect(archiveButton.closest('a')).toBeNull();
  });

  /**
   * 13.674 — REVERSED, not deleted: the archived cards now sort to the END of
   * the disclosed grid (owner: "always sort the archived projects to the end").
   * `[...live, ...archived]` was the implementation Round 20 named as the thing
   * to rule out; it is the requirement now. The other assertions in 13.413
   * (exactly one link per card; Archive/Restore not nested in the anchor) stay
   * with 13.413 itself, which the test above carries.
   */
  it('sorts a revealed archived project to the END, after every live one', async () => {
    // Archived in the MIDDLE — see the docblock. Under `[...live, ...archived]`
    // the disclosed grid reads p1, p3, p2; under a single filter over the served
    // array it reads p1, p2, p3. Only this arrangement tells them apart.
    mount([
      [
        workspaceAs('admin', {
          projects: [
            { id: 'p1', name: 'Shop operations', prefix: 'SO', archived: false, ticketCount: 9, blockedCount: 3 },
            { id: 'p2', name: 'Old signage', prefix: 'OS', archived: true, ticketCount: 7, blockedCount: 1 },
            { id: 'p3', name: 'Deliveries', prefix: 'DL', archived: false, ticketCount: 4, blockedCount: 0 },
          ],
        }),
      ],
    ]);

    // POSITIVE CONTROL: collapsed, the archived one is absent and the two live
    // ones are in served order — so a failure below is about where disclosure
    // PUTS the archived card, and not about the grid never having been ordered
    // at all. It also pins that the live projects keep the served order among
    // themselves, which is what makes "archived last" a reordering of the two
    // GROUPS rather than a sort of the whole list.
    await screen.findByTestId('project-row-p1');
    expect(
      screen.getAllByTestId(/^project-row-/).map((node) => node.getAttribute('data-testid')),
    ).toEqual(['project-row-p1', 'project-row-p3']);

    await userEvent.click(
      screen.getByRole('button', { name: 'Show archived projects in Convenience Corner' }),
    );
    expect(
      screen.getAllByTestId(/^project-row-/).map((node) => node.getAttribute('data-testid')),
    ).toEqual(['project-row-p1', 'project-row-p3', 'project-row-p2']);
  });
});

/**
 * 13.397 — the archived control is ABSENT at zero, on the home page exactly
 * as on `/workspaces`' card (Task 18/19's own ruling, restated here because
 * this round moved the control's position, not the rule).
 */
describe('13.397 no archived projects means no archived control, on the home too', () => {
  it('renders neither the toggle nor an archived list when nothing is archived', async () => {
    mount([[workspaceAs('member', { projects: [{ id: 'p1', name: 'Shop operations', prefix: 'SO', archived: false, ticketCount: 2, blockedCount: 0 }] })]]);
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
 * 13.984-13.985 (door A, 2026-09-19) — the project card draws the description,
 * and draws NOTHING when the project has none.
 *
 * The prototype draws `p.desc` as a muted 15px line inside the card's own click
 * target (`desktop.dc.html:264`). The second case is the one worth having: the
 * failure mode is not a missing line, it is an EMPTY line — a card that renders
 * a description slot for a project nobody described is claiming something no
 * event ever said, and it looks identical to a correct card.
 */
describe('13.984-13.985 the project card draws the description, and draws nothing when there is none', () => {
  it('13.984 — draws it inside the card’s own door', async () => {
    mount([
      [
        workspaceAs('member', {
          projects: [
            {
              id: 'p1',
              name: 'Delivery',
              prefix: 'DL',
              archived: false,
              ticketCount: 2,
              blockedCount: 0,
              description: 'Sprint work for the rollout',
            },
          ],
        }),
      ],
    ]);

    const card = await screen.findByTestId('project-row-p1');
    expect(within(card).getByText('Sprint work for the rollout')).toBeInTheDocument();
    // INSIDE THE DOOR, as the prototype draws it — asserted by containment
    // rather than by presence, because a description placed outside the anchor
    // would be text that looks right and cannot be clicked through.
    const drawn = card.querySelector('.gn-project-card__description');
    expect(drawn).not.toBeNull();
    expect(card.querySelector('.gn-project-card__door')?.contains(drawn!)).toBe(true);
  });

  it('13.985 — a project nobody described draws no description element, while its sibling draws one', async () => {
    mount([
      [
        workspaceAs('member', {
          projects: [
            { id: 'p1', name: 'Delivery', prefix: 'DL', archived: false, ticketCount: 2, blockedCount: 0 },
            {
              id: 'p2',
              name: 'Site readiness',
              prefix: 'SR',
              archived: false,
              ticketCount: 1,
              blockedCount: 0,
              description: 'Pre-visit checks per site',
            },
          ],
        }),
      ],
    ]);

    const undescribed = await screen.findByTestId('project-row-p1');
    // NO ELEMENT AT ALL — not an empty one. `toBeNull` on the query, rather
    // than a text assertion, because an empty `<span>` has no text to assert
    // against and would therefore pass any check written on content.
    expect(undescribed.querySelector('.gn-project-card__description')).toBeNull();

    // THE CONTROL, same page, same render: the sibling card DOES carry one, so
    // the null above is this card's answer and not a class that never renders.
    const described = await screen.findByTestId('project-row-p2');
    expect(described.querySelector('.gn-project-card__description')?.textContent).toBe(
      'Pre-visit checks per site',
    );
  });
});

/**
 * 13.986 (door A, 2026-09-19) — the OPTIONAL description input on the
 * New-project form. Owner ruling, verbatim: *"New-project form gains an
 * optional description input: go with this."*
 *
 * **Two submissions in one case, and the second is the important one.** The
 * schema has no `''` spelling for "no description" — `min(1)` refuses it — so an
 * untouched box must produce a payload with the key ABSENT. A form that sent
 * `description: ''` would be refused by the domain for a field the person
 * deliberately left alone, and the create form would be unusable without a
 * description.
 */
describe('13.986 the new-project form authors an optional description', () => {
  const created = (events: SubmittedEvent[]) =>
    events.find((event) => event.type === 'project.created')!;

  it('sends the description as typed, and OMITS the key when the box is left untouched', async () => {
    const events: SubmittedEvent[] = [];
    mount([[workspaceAs('admin')]], { ingest: (sent) => events.push(...sent) });

    await userEvent.type(await screen.findByPlaceholderText('e.g. Phase 2 rollout'), 'Delivery');
    await userEvent.type(
      screen.getByPlaceholderText('e.g. Sprint work for the rollout'),
      'Sprint work for the rollout',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }));
    await waitFor(() => expect(events.some((e) => e.type === 'project.created')).toBe(true));

    expect(created(events).payload).toEqual({
      name: 'Delivery',
      description: 'Sprint work for the rollout',
    });

    // SECOND SUBMISSION — the description box left untouched. The form clears
    // both fields on success, so only the name is typed this time.
    events.length = 0;
    await userEvent.type(await screen.findByPlaceholderText('e.g. Phase 2 rollout'), 'Site readiness');
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }));
    await waitFor(() => expect(events.some((e) => e.type === 'project.created')).toBe(true));

    const payload = created(events).payload as Record<string, unknown>;
    expect(payload['name']).toBe('Site readiness');
    // ABSENT, asserted with `in`. `toEqual({name})` would NOT catch this: a
    // `description: undefined` left on the object compares equal to a missing
    // key, so the shape this case exists to forbid would pass the obvious
    // assertion and fail only on the server, as a refusal of a field the person
    // never filled in.
    expect('description' in payload).toBe(false);
  });

  it('13.1031 — the new-project form authors the PREFIX, upper-cases it as typed, and omits the key when untouched', async () => {
    // Owner spec 2026-09-20: *"during project creation up to 3 letters for it"*
    // — `SO` in `CCSO-1183`.
    const events: SubmittedEvent[] = [];
    mount([[workspaceAs('admin')]], { ingest: (sent) => events.push(...sent) });

    await userEvent.type(await screen.findByPlaceholderText('e.g. Phase 2 rollout'), 'Shop operations');
    // LOWER CASE TYPED ON PURPOSE. `prefixSchema` REFUSES lower case rather than
    // normalising it, so a form that passed the keystrokes through would earn a
    // refusal whose remedy is "type it again in capitals". The upper-casing is
    // the form's job, and this line is what holds it there — remove it from the
    // `onChange` and this case fails on `so` rather than passing on `SO`.
    await userEvent.type(screen.getByPlaceholderText('e.g. SO'), 'so');
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }));
    await waitFor(() => expect(events.some((e) => e.type === 'project.created')).toBe(true));

    expect(created(events).payload).toEqual({ name: 'Shop operations', prefix: 'SO' });

    // SECOND SUBMISSION — the prefix box left untouched. The form clears every
    // field on success, and an untouched optional box makes NO CLAIM: the key
    // must be absent, so that the half is derived from the name rather than the
    // project being founded with an empty prefix.
    events.length = 0;
    await userEvent.type(await screen.findByPlaceholderText('e.g. Phase 2 rollout'), 'Site readiness');
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }));
    await waitFor(() => expect(events.some((e) => e.type === 'project.created')).toBe(true));

    const payload = created(events).payload as Record<string, unknown>;
    expect(payload['name']).toBe('Site readiness');
    // ABSENT, asserted with `in` — for the reason the description case above
    // gives in its own words: `toEqual({name})` does not catch a key left on the
    // object as `undefined`.
    expect('prefix' in payload).toBe(false);
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

/**
 * The rename ruling, 2026-09-19 — cases 13.962–13.965.
 *
 * `workspace.renamed` has been in the vocabulary since Plan 1 and has had **no
 * client UI at all**; until the ruling the server asked nobody who may emit it,
 * so a workspace GUEST was admitted — measured at Task 9 and pinned until today
 * in `check-visibility-permission.test.ts`, whose case has now been inverted by
 * the ruling. These cases pin the CONTROL side of the same change.
 *
 * **The paired-role shape is this file's own rule**, stated in its header above:
 * a control asserted PRESENT for an admin proves nothing about a member. Every
 * gate assertion below is therefore paired with its absence on another role, on
 * the same fixture, in the same file.
 */
describe('the rename control (13.962–13.965)', () => {
  it('13.962 is offered to an owner and an admin, and to NOBODY else', async () => {
    for (const role of ['owner', 'admin']) {
      cleanup();
      mount([[workspaceAs(role)]]);
      expect(await screen.findByRole('button', { name: /^Rename / })).toBeInTheDocument();
    }
    // The other half, and the reason the loop above is not sufficient alone. It
    // is also the half the ORIGINAL absence was measured on: a guest could
    // rename, and this control must now say so by not being there.
    for (const role of ['member', 'guest']) {
      cleanup();
      mount([[workspaceAs(role)]]);
      // The NAME still renders — this asserts the control's absence, not that
      // the workspace is hidden from them.
      // (`findAllBy…`: the nav now paints the name twice — the bar's own label and, from
      // mobile-web Task 2, the phone switcher's, one of them `display: none` at any width.)
      expect((await screen.findAllByText('Convenience Corner')).length).toBeGreaterThan(0);
      expect(screen.queryByRole('button', { name: /^Rename / })).toBeNull();
    }
  });

  it('13.963 submits workspace.renamed through the ordinary ingest door, carrying the typed name', async () => {
    const sent: SubmittedEvent[] = [];
    mount([[workspaceAs('admin')]], { ingest: (events) => void sent.push(...events) });

    await userEvent.click(await screen.findByRole('button', { name: /^Rename / }));
    const input = screen.getByLabelText('New workspace name');
    await userEvent.clear(input);
    await userEvent.type(input, 'Corner HQ');
    await userEvent.click(screen.getByRole('button', { name: 'Save name' }));

    // The event, the entity and the payload — not merely "something was sent".
    // `workspace.renamed` is filed against the WORKSPACE, which is what
    // `workspace-name.ts` folds to decide the directory's answer.
    await waitFor(() => expect(sent.length).toBe(1));
    expect(sent[0]?.type).toBe('workspace.renamed');
    expect(sent[0]?.entity).toEqual({ kind: 'workspace', id: WORKSPACE });
    expect(sent[0]?.payload).toEqual({ name: 'Corner HQ' });
  });

  it('13.964 will not send a BLANK name — the schema refuses it, so the round trip would teach the form nothing', async () => {
    const sent: SubmittedEvent[] = [];
    mount([[workspaceAs('admin')]], { ingest: (events) => void sent.push(...events) });

    await userEvent.click(await screen.findByRole('button', { name: /^Rename / }));
    await userEvent.clear(screen.getByLabelText('New workspace name'));

    // Both halves on purpose: a form that disabled the button but still
    // submitted on Enter would pass the first assertion alone.
    expect(screen.getByRole('button', { name: 'Save name' })).toBeDisabled();
    expect(sent).toEqual([]);
    // And the whitespace case, which is the one `displayName`'s refine names in
    // its own words: "a name of only spaces names nothing".
    await userEvent.type(screen.getByLabelText('New workspace name'), '   ');
    expect(screen.getByRole('button', { name: 'Save name' })).toBeDisabled();
    expect(sent).toEqual([]);
  });

  it('13.965 the control names the WORKSPACE, so the page is not a column of identical buttons', async () => {
    mount([[workspaceAs('owner')]]);
    expect(
      await screen.findByRole('button', { name: 'Rename Convenience Corner' }),
    ).toBeInTheDocument();
  });
});

/**
 * **13.969 — THE NAME ITSELF IS THE RENAME'S CONTROL, and nothing stands beside it.**
 *
 * The owner, 2026-09-19: *"have the rename be there right on the header. THE
 * CLICK TO RENAME."* The four cases above (13.962–13.965) all still hold of the
 * new shape — they query `button[name^="Rename "]`, which the name-control
 * carries — but **not one of them would notice the shape changing**, because
 * every property they assert is also true of a separate button labelled
 * `Rename` standing beside the title. These three do.
 *
 * ## What each arm is the only witness of
 *
 * 1. **The visible text is the NAME.** A control labelled `Rename` passes
 *    13.962–13.965 and fails this, which is exactly the discrimination the
 *    change needs.
 * 2. **It is a real `<button>` and not an `h1` carrying an `onClick`** — the
 *    trap this shape invites, and the reason the ruling says so in terms. A
 *    heading with a click handler is reachable by pointer only: not focusable,
 *    not in the tab order, and announced as a heading rather than as something
 *    that does anything. The `.focus()` arm below is what fails for it.
 * 3. **There is exactly ONE rename control.** The old shape had two — the name
 *    and a button meaning the same thing — which is the duplication this
 *    header's own comment argues against.
 * 4. **Escape cancels**, which nothing above covers: 13.963 covers commit and
 *    13.964 covers the blank guard.
 */
describe('13.969 the NAME is the rename’s control', () => {
  it('13.969 the control a person clicks IS the workspace name, and it is focusable', async () => {
    mount([[workspaceAs('admin')]]);
    const control = await screen.findByRole('button', { name: 'Rename Convenience Corner' });

    // THE VISIBLE TEXT IS THE NAME. This is the change: a control whose label
    // were the word "Rename" would satisfy every case above and fail here.
    expect(control).toHaveTextContent('Convenience Corner');

    // AND IT IS A REAL BUTTON. An `h1` with an `onClick` cannot take focus, so
    // this arm is what distinguishes the ruling's shape from the trap it names.
    control.focus();
    expect(document.activeElement).toBe(control);
  });

  it('13.969 exactly ONE rename control exists in the header — the second button is gone', async () => {
    mount([[workspaceAs('admin')]]);
    await screen.findByRole('button', { name: /^Rename / });
    expect(screen.getAllByRole('button', { name: /^Rename / })).toHaveLength(1);
    // ...and no bare `Rename` control survives anywhere on the page.
    expect(screen.queryByRole('button', { name: 'Rename' })).toBeNull();
  });

  it('13.969 ESCAPE cancels the edit, and the name is the heading again', async () => {
    mount([[workspaceAs('admin')]]);
    await userEvent.click(await screen.findByRole('button', { name: /^Rename / }));
    const input = screen.getByLabelText('New workspace name');
    await userEvent.clear(input);
    await userEvent.type(input, 'Discarded');
    await userEvent.keyboard('{Escape}');

    // The field is gone and the name is back — with the DRAFT discarded rather
    // than committed: nothing was sent, which is the half a "the input closed"
    // assertion would miss.
    expect(screen.queryByLabelText('New workspace name')).toBeNull();
    expect(screen.getByRole('button', { name: 'Rename Convenience Corner' })).toHaveTextContent(
      'Convenience Corner',
    );
  });
});

/**
 * **13.995 — E4-5 (exec4) — the level-1 heading NAMES THE PAGE.**
 *
 * The finding, measured on the painted page: `document.querySelector('h1')
 * .outerHTML` was `<h1 class="gn-page-title"><button … aria-label="Rename
 * Convenience Corner">Convenience Corner</button></h1>` — the heading's only
 * child was the rename control — so the verbose a11y snapshot read
 * `heading "Rename Convenience Corner" level="1"` on line 40 and `button "Rename
 * Convenience Corner"` on line 41. Headings are the primary navigation structure
 * for a screen-reader user, and the level-1 heading is supposed to name the
 * page; here it named an action, while every other route names its page (`/workspaces`
 * → `Workspaces — …`, the board → `Shop operations`).
 *
 * ## Why this is `aria-labelledby` and NOT the two-element shape the finding's own remedy proposes
 *
 * The reviewer's remedy was `<h1>Convenience Corner</h1>` plus an ADJACENT
 * rename button. **That shape is foreclosed here by a recorded OWNER ruling and
 * the case that enforces it.** The owner, 2026-09-19: *"have the rename be there
 * right on the header. THE CLICK TO RENAME."* — and `test-cases/13-neomorphism-and-workspace-screens.md:2125`
 * records what "deliberately did not" change, including *"The separate `Rename`
 * button is GONE … there is no longer a second control in this header"*.
 * `13.969`'s three arms pin exactly that, one of them asserting the control's
 * VISIBLE TEXT is the name and another that no bare `Rename` control survives.
 * The reviewer's own objection to the single-element alternative was
 * `<h1 aria-label="…">` *"hides the button's purpose"* — and that objection does
 * not reach `aria-labelledby`, which takes the heading's name from the visible
 * text and leaves the BUTTON's own name untouched.
 *
 * So: the defect the finding measured — an inverted heading name — is closed
 * here, and the owner's shape is not reversed. **The two-element remedy is a
 * product decision that belongs to the owner, not to this batch**; it is flagged
 * for the controller rather than taken.
 */
describe('13.995 E4-5 the level-1 heading names the page, not the action', () => {
  it('13.995 the h1 takes its name from the visible workspace name, and the rename control keeps its own', async () => {
    mount([[workspaceAs('admin')]]);

    // POSITIVE CONTROL FIRST, so a green below cannot be "there was no heading
    // and no control". The control is present and is still the shape 13.969
    // rules on.
    const control = await screen.findByRole('button', { name: 'Rename Convenience Corner' });
    const h1 = screen.getByRole('heading', { level: 1 });

    // ⚠ WHAT THIS ARM DOES **NOT** WITNESS, stated because its green is
    // misleading otherwise. `@testing-library`'s accessible-name computation
    // answers `Convenience Corner` for the DEFECTIVE shape too — measured
    // against an isolated `<h1><button aria-label="Rename X">X</button></h1>`,
    // where it reports `Name "Convenience Corner"` for the h1 and
    // `Name "Rename Convenience Corner"` for the button. jsdom diverges from a
    // real browser here, so this assertion was GREEN BEFORE the fix ran. It is
    // kept because it pins the SHAPE the browser measurement depends on, not
    // because it can redden on the defect.
    expect(screen.getByRole('heading', { level: 1, name: 'Convenience Corner' })).toBeInTheDocument();

    // THE WITNESS — the only arm here that can redden. In Chrome the heading's
    // name is inherited from the button's label, and the fix is to give the
    // `h1` its own source: an `aria-labelledby` that resolves to the element
    // holding the visible name. Chrome renders this as
    // `heading "Convenience Corner" level="1"` beside
    // `button "Rename Convenience Corner"` (the reading is recorded in
    // `page.tsx`'s `RENAME_NAME_ID` docblock); the browser reading is the
    // outcome witness, and this is the mechanism it rests on.
    const ref = h1.getAttribute('aria-labelledby');
    expect(ref, 'the h1 must name itself from the visible workspace name').not.toBeNull();
    const named = document.getElementById(ref as string);
    expect(named, `aria-labelledby points at nothing: ${String(ref)}`).not.toBeNull();
    // It resolves to the text the reader SEES on the button, so a heading and a
    // control cannot drift apart about the workspace's name.
    expect(named).toHaveTextContent('Convenience Corner');
    expect(control).toHaveTextContent('Convenience Corner');

    // ...and the heading does not OVERRIDE with a label of its own. That
    // mechanism (`<h1 aria-label="…">`) is the one the finding rejected for
    // hiding the control's purpose, and it is the one a later change is most
    // likely to reach for.
    expect(h1).not.toHaveAttribute('aria-label');

    // THE OWNER'S SHAPE IS INTACT — one control, a real button, still inside the
    // heading, and its own accessible name unchanged. These three are `13.969`'s
    // arms restated where an E4-5-shaped change would break them, so a future
    // move to the two-element remedy is a deliberate act with a red case rather
    // than a silent one.
    expect(screen.getAllByRole('button', { name: /^Rename / })).toHaveLength(1);
    expect(h1).toContainElement(control);
    expect(screen.queryByRole('button', { name: 'Rename' })).toBeNull();
  });
});

/**
 * E5-23 (round-2 ruling, MINOR, 2026-09-21) — the workspace home's empty sentence
 * is written for the EXCLUDED MEMBER and was read by the FOUNDER.
 *
 * `page.tsx:887` renders *"No projects you can open are active here."* whenever
 * the caller's live list is empty, and the comment above it says why that shape
 * was chosen: *"A member outside every project has an empty live list in a
 * workspace full of them, and 'there are no projects' would be a claim about the
 * workspace."* **Correct for that member.** An owner who founded the workspace
 * seconds ago has an empty live list for the other reason — the workspace has
 * none — and the sentence they read says the opposite: *"you can open"*
 * presupposes projects they cannot, and it sits directly above the New-project
 * form that would fix it.
 *
 * Two different facts reach ONE arm, and `shown.length === 0` cannot separate
 * them on its own. `isAdmin` plus the SERVED project count can.
 */
describe('E5-23 the empty workspace home speaks to whoever is actually reading it', () => {
  it('13.1165 a founder with no projects is told to create the first one, not that they cannot open any', async () => {
    mount([[workspaceAs('owner', { projects: [] })]]);

    expect(
      await screen.findByText('No projects yet — create the first one below.'),
    ).toBeInTheDocument();
    // And NOT the member's sentence, which is the claim the ruling is about —
    // asserted as an absence, because a page drawing both would satisfy the
    // assertion above on its own.
    expect(screen.queryByText(/No projects you can open/)).toBeNull();
    // The form the sentence points at really is on screen: a sentence naming a
    // control that is not rendered is the same defect one line over.
    expect(screen.getByRole('button', { name: 'Create project' })).toBeInTheDocument();
  });

  it('13.1165 CONTROL — a member with the same empty list keeps the member’s sentence', async () => {
    // **THE TWO FIXTURES ARE DELIBERATELY IDENTICAL EXCEPT FOR THE ROLE**, which
    // is the honest shape of the problem rather than a shortcut: the server
    // serves a member only the projects they may see (`visible-projects.ts`), so
    // "outside every project of a busy workspace" and "a workspace with none"
    // BOTH arrive here as `projects: []`. The count cannot separate them; the role
    // can, and it is the only signal the ruling's remedy uses.
    mount([[workspaceAs('member', { projects: [] })]]);
    expect(
      await screen.findByText('No projects you can open are active here.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/create the first one below/)).toBeNull();
  });
});

/**
 * 13.1217 — the bar's project item and the project card's door do not share one
 * accessible name, so "the project's link" is a UNIQUE query on this page.
 *
 * `e2e-stack/helpers/board.ts` asks for the seeded project with
 * `getByRole('link', { name: 'Shop operations', exact: true })` and asserts
 * `toHaveCount(1)` — deliberately, because that file's docblock records that a
 * positional pick is how it measured the WRONG board once already. The deployed
 * stack answered **2** (`measured 2026-09-22, the desktop viewport the stack
 * suite runs at`): the card's door, which carries the project's name because it
 * IS the project's row, and the bar's "last open project" item, which carried
 * the same name because nothing had ever needed them to differ.
 *
 * **The fix is on the BAR's side, and this case is what holds the direction.**
 * The card door's name is the project's — that is the identity every
 * `within(card)` query in this file and the stack suite's exact-name query are
 * built on. The bar item is a second, contextual door, so it is the one that
 * says which it is. Renaming the card instead was rejected in the component's
 * docblock for a measured reason: the exact-name query would then match the bar
 * item, whose project is `routeProject ?? rememberedLive ?? live[0]` — a
 * POSITION, and a silently different board on any database that sorts another
 * project first.
 *
 * The assertion is the SAME QUERY the suite makes, over a render that carries
 * both surfaces: `getAllByRole` (not `within(row)`) is what makes this a
 * measurement of the page rather than of one card, and it is why the case fails
 * on the pre-fix tree with two links rather than one.
 */
describe('13.1217 the bar’s project item and the card door do not share one name', () => {
  it('names the door after the project, and the bar item after itself', async () => {
    mount([[workspaceAs('member')]]);

    // WAIT FOR BOTH SURFACES FIRST, on the two reads that carry them: the page's
    // own list and `AppNav`'s project read. `getAllByRole` is a whole-page query,
    // and one run before the bar has rendered would report ONE link whether or
    // not the collision is there — the assertion below has to be made over the
    // finished page or it is not about the page.
    await screen.findByTestId('project-row-p1');
    await screen.findByRole('link', { name: 'Shop operations, projects menu' });

    // The door, pinned to the project's own name and its own href.
    const door = within(row('p1')).getByRole('link', { name: 'Shop operations' });
    expect(door).toHaveAttribute('href', `/w/${WORKSPACE}/p/p1`);

    // THE WHOLE PAGE, not the row: exactly one link answers to the project's
    // name, and it is the door. Two would be the defect this case exists for.
    expect(screen.getAllByRole('link', { name: 'Shop operations' })).toEqual([door]);
  });
});

/**
 * 13.1297 — the project card's Archive/Restore strip is the BUTTON's size, not
 * the card's width (owner request, 2026-09-22, one screenshot).
 *
 * ## What the owner measured
 *
 * On this page the card's actions container `div.gn-project-card__actions`
 * measured **362.66 × 44** while the Archive button inside it is about **186**
 * wide, and the instruction was *"make the container size be the same as the
 * button size"*. The 176px between them is not cosmetic. `.gn-project-card` is
 * a column flex container, so its default `align-items: stretch` widened every
 * item to the card's inner width — and this strip is the ONE child also raised
 * above the door's stretched `::after` (`position: relative; z-index: 1`, the
 * very lift the control arm below holds). So every pixel of the strip that was
 * NOT the button sat over the door rather than under it: the pointer there hit
 * the strip, not the overlay, and the card neither lit nor navigated. The
 * card's clickable area was a rectangle with a 176px hole in it.
 *
 * ## Why a source scan rather than a render
 *
 * These component tests never load the real stylesheet into jsdom, so nothing
 * rendered here could observe a flex stretch — the same reason
 * `workspace-restricted-spacing.test.ts` (13.408) reads the source. The fix is
 * one declaration, so the source text is the whole claim.
 *
 * ## The control arm, and why it is in the same `it`
 *
 * `align-self: flex-start` is what makes a child of a column container
 * shrink-to-fit. The control asserts `position: relative` and `z-index: 1` are
 * STILL declared, because the shrink only helps while the strip also stays
 * above the door: a "fix" that bought the width by dropping the lift would put
 * the door's transparent overlay back over Archive/Restore and eat the click on
 * exactly the pixels this change rescues. The two are one assertion about one
 * shape — a separate `it` would let the destructive variant report green on the
 * arm that matters.
 *
 * The selector is ANCHORED (`^`) and the rule is a single line, both
 * deliberately: `globals.css:1248`–`:1256` open three further rules beginning
 * with `.gn-project-card__actions ` (then a space and `.gn-button`), so an
 * unanchored substring match would find one of those on a LATER line first —
 * the first-match landmine 3.974 records.
 */
describe('13.1297 the project card’s actions strip is content-sized', () => {
  it('13.1297 declares align-self: flex-start, keeping the lift above the door', () => {
    const css = readFileSync(GLOBALS_CSS_PATH, 'utf8');
    const rule = ruleFor(css, /^\.gn-project-card__actions\s*\{/);
    expect(rule, 'no rule found for .gn-project-card__actions').toBeDefined();

    // The fix: shrink-to-fit, so the strip is the button's box, not the card's.
    expect(rule).toMatch(/align-self:\s*flex-start/);

    // The control: the lift that keeps Archive/Restore above the door is
    // unmoved. See the docblock — an `align-self` that arrived by deleting
    // either of these is not a fix.
    expect(rule, 'the lift that keeps the button above the door is missing').toMatch(
      /position:\s*relative/,
    );
    expect(rule, 'the lift that keeps the button above the door is missing').toMatch(
      /z-index:\s*1\b/,
    );
  });
});
