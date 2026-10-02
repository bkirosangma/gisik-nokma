import { cleanup, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectRef, WorkspaceRef } from '@gisik-nokma/app-core';
import WorkspacesPage from '../app/workspaces/page.js';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * 3.153 — the `data-testid` hook Plan 11 T13's E2E needs to address one
 * specific workspace card among structurally identical siblings (house style
 * `mapping-row-${state.id}` / `state-node-${data.stateId}`): the id goes on
 * the entity's own container, disambiguation only — every interaction here
 * still goes through the accessible `name`/role, never the testid itself.
 *
 * 3.154 (the sibling per-project hook) drove this page until the 2026-09-15
 * prototype port (Task 7) replaced the per-project `<ul>` rows with one
 * joined project line — the `project-card-<id>` testid it asserted no longer
 * exists anywhere in the app (the workspace-home project rows use their own,
 * unrelated `project-row-<id>` testid). Its assertions are removed here per
 * that task's brief rather than repointed at a subject that no longer
 * exists; the case NUMBER is left unused, not reassigned. A later task owns
 * marking it 🚫 in `test-cases/` and `Features.md` — out of scope here.
 */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
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

const WORKSPACES: WorkspaceRef[] = [
  {
    id: 'ws1',
    name: 'Convenience Corner',
    prefix: 'CC',
    role: 'owner',
    archived: false,
    // Task 16's fields, filled with what an OWNER is served: counts present
    // (an owner is never withheld from) and nothing archived. This suite is
    // about the card's data-testid keying, not the counts, so the values are
    // held constant across both workspaces on purpose.
    memberCount: 3,
    // Task 18. An OWNER's is 0 by construction — `visibleProjects` names every
    // project for an owner, so nothing survives the subtraction. Held at 0 here
    // deliberately: this suite is about testid keying and the role label, and a
    // non-zero would put a string on the card that its own cases do not own.
    nameRestrictedProjectCount: 0,
    projects: [
      { id: 'p1', name: 'Shop operations', prefix: 'SO', archived: false, ticketCount: 4, blockedCount: 1 },
      { id: 'p2', name: 'Deliveries', prefix: 'DL', archived: false, ticketCount: 0, blockedCount: 0 },
    ],
  },
  {
    id: 'ws2',
    name: 'Second Workspace',
    prefix: 'SW',
    role: 'member',
    archived: false,
    memberCount: 2,
    nameRestrictedProjectCount: 0,
    projects: [{ id: 'p3', name: 'Only project', prefix: 'OP', archived: false, ticketCount: 2, blockedCount: 0 }],
  },
];

function mountWith(workspaces: WorkspaceRef[]) {
  render(
    <Providers services={stubServices({ getMyWorkspaces: async () => workspaces }, {})}>
      <WorkspacesPage />
    </Providers>,
  );
}

function mount() {
  mountWith(WORKSPACES);
}

/**
 * Task 4's refusal fixture, built the same way `page-refusals.test.tsx`
 * builds one for this same page (`getMyWorkspaces` rejecting), rather than
 * inventing a second helper for one branch this file already knows how to
 * reach: `ShellRefusal` renders whatever `Error#message` the read rejects
 * with, unparaphrased.
 */
function mountRefusing(message: string) {
  render(
    <Providers services={stubServices({ getMyWorkspaces: () => Promise.reject(new Error(message)) })}>
      <WorkspacesPage />
    </Providers>,
  );
}

describe('Workspaces page — entity-keyed data-testid hooks (Plan 11 T13)', () => {
  it('3.153 keys each workspace card by its own workspaceId, distinguishing two siblings', async () => {
    mount();
    const ws1 = await screen.findByTestId('workspace-card-ws1');
    const ws2 = screen.getByTestId('workspace-card-ws2');
    expect(ws1).not.toBe(ws2);
    expect(within(ws1).getByRole('heading', { name: 'Convenience Corner' })).toBeInTheDocument();
    expect(within(ws2).getByRole('heading', { name: 'Second Workspace' })).toBeInTheDocument();
  });

  /**
   * 13.357 — the role label, the one owner-approved invented row on this
   * screen: real backing data (`GET /v1/me/workspaces` has disclosed `role`
   * since it first answered), only the DISPLAY was missing. Two different
   * roles on two cards, scoped by card, so a mutation that renders the wrong
   * workspace's role — or the same role on both — reddens this rather than a
   * looser "the word owner appears somewhere" check.
   *
   * **Task 18 turned the label into a SENTENCE** and this case moved with it,
   * rather than being left asserting a string the card no longer renders. The
   * negative halves are what keep it honest: each card must NOT carry the
   * other's sentence, so a card that rendered one role for every workspace
   * still reddens. The raw enum is asserted ABSENT as well — it is the exact
   * regression the sentence exists to prevent, and a card printing both would
   * pass a presence-only check.
   */
  it("13.357 each card shows its OWN caller role as a sentence, never the raw enum", async () => {
    mount();
    const ws1 = await screen.findByTestId('workspace-card-ws1');
    const ws2 = screen.getByTestId('workspace-card-ws2');
    expect(within(ws1).getByText("You're an owner here.")).toBeInTheDocument();
    expect(within(ws1).queryByText("You're a member here.")).toBeNull();
    expect(within(ws2).getByText("You're a member here.")).toBeInTheDocument();
    expect(within(ws2).queryByText("You're an owner here.")).toBeNull();
    // The database value itself is gone from the card, not merely joined by a
    // sentence beside it.
    expect(within(ws1).queryByText('owner')).toBeNull();
    expect(within(ws2).queryByText('member')).toBeNull();

    // ROUTED 4(ii) (Task 7 review): everything above asserts the sentence's
    // TEXT, so none of it would fail if Task 6's relocation of this sentence
    // — from the card head, under the name, to below the chip row — were
    // ever reverted; the sentence reads the same either way. This is a
    // DOM-POSITION assertion instead: the chip row must PRECEDE the role
    // sentence in document order, which is true only at the current
    // position.
    const chips = within(ws1).getByText('3 members').closest('.gn-workspace-card__chips');
    expect(chips, 'no .gn-workspace-card__chips ancestor found for the "3 members" chip').not.toBeNull();
    const role = within(ws1).getByText("You're an owner here.");
    const position = chips!.compareDocumentPosition(role);
    // m2 (Task 7 fix round 1): `& FOLLOWING` alone also passes if `role` sat
    // INSIDE `chips` — `compareDocumentPosition` sets both FOLLOWING and
    // CONTAINED_BY on a descendant, so a version of this test that only
    // checked FOLLOWING would not catch the sentence being nested inside the
    // chip row, only moved before it. Masking out CONTAINED_BY makes the
    // assertion test what its own name claims: a SIBLING that comes after,
    // not a descendant.
    expect(
      position & Node.DOCUMENT_POSITION_FOLLOWING,
      'the role sentence no longer follows the chip row in document order',
    ).toBeTruthy();
    expect(
      position & Node.DOCUMENT_POSITION_CONTAINED_BY,
      'the role sentence is nested INSIDE the chip row, not merely following it',
    ).toBe(0);
  });
});

/**
 * Task 18 — the neo workspace card, cases 13.379–13.381.
 *
 * The fixtures below are hand-built rather than reused from `WORKSPACES` above,
 * because the two suites want opposite things: that one holds its values
 * constant so a testid assertion cannot pass on the wrong card, and these need
 * every number DIFFERENT from every other number on the card. A card where the
 * member count, the ticket total and the blocked count are all `2` passes every
 * check that reads any of them off the wrong field.
 */
function project(over: Partial<ProjectRef> & { id: string }): ProjectRef {
  return {
    name: `Project ${over.id}`,
    prefix: 'PJ',
    archived: false,
    ticketCount: 0,
    blockedCount: 0,
    ...over,
  };
}

function workspace(over: Partial<WorkspaceRef> & { id: string }): WorkspaceRef {
  return {
    name: 'Convenience Corner',
    prefix: 'CC',
    role: 'owner',
    archived: false,
    memberCount: 0,
    nameRestrictedProjectCount: 0,
    projects: [],
    ...over,
  };
}

describe('13.379 the card renders every element from data the route served', () => {
  it('shows the monogram, the member count, all three chips, the per-project count and the restricted line', async () => {
    mountWith([
      workspace({
        id: 'ws1',
        name: 'Convenience Corner',
        role: 'admin',
        memberCount: 5,
        nameRestrictedProjectCount: 2,
        projects: [
          project({ id: 'p1', name: 'Shop operations', ticketCount: 9, blockedCount: 3 }),
          project({ id: 'p2', name: 'Deliveries', ticketCount: 4, blockedCount: 1 }),
          project({ id: 'p3', name: 'Last winter', archived: true, ticketCount: 7, blockedCount: 2 }),
        ],
      }),
    ]);
    const card = await screen.findByTestId('workspace-card-ws1');

    // The monogram. `Avatar` names itself with the workspace's own name, which
    // is what makes two cards' avatars distinguishable to a screen reader —
    // the tint alone is not available to one.
    //
    // `{ selector: '.gn-avatar' }` disambiguates from the card's own door
    // (Round 19b/19c): the whole card is now a `<Link aria-label={workspace.name}>`
    // wrapping the avatar, so TWO elements share this accessible name — the
    // door and the monogram inside it — and a bare `getByLabelText` cannot
    // tell them apart. Two elements sharing a name is not itself a defect;
    // only this query needed to say which one it means.
    expect(
      within(card).getByLabelText('Convenience Corner', { selector: '.gn-avatar' }),
    ).toHaveTextContent('CC');

    // The meta line: `live.length` alone. Two live projects here (p3 is
    // archived), so a sum that folded in `nameRestrictedProjectCount` (2) would
    // print "4 projects" and redden.
    expect(within(card).getByText('2 projects')).toBeInTheDocument();

    // The chip set is UNCHANGED by the prototype port — the built labels stay.
    expect(within(card).getByText('5 members')).toBeInTheDocument();
    // THE TWO CHIP NUMBERS, and every input to them is a different number so
    // neither can be the other by accident: 9+4+7 tickets, 3+1+2 blocked, over
    // the projects the card NAMES. `20 − 6 = 14` active, `6` blocked.
    expect(within(card).getByText('14 active')).toBeInTheDocument();
    expect(within(card).getByText('6 blocked')).toBeInTheDocument();

    // Task 7: the two live projects, joined into ONE line. `getByText` on the
    // whole sentence is the assertion a multi-interpolation version fails.
    expect(within(card).getByText('Shop operations, Deliveries')).toBeInTheDocument();
    // The archived project is named nowhere — its only trace is the chip.
    expect(within(card).queryByText(/Last winter/)).toBeNull();
    expect(within(card).queryByTestId('project-card-p1')).toBeNull();

    // Round 19c: archived is no longer a disclosure — the card renders LIVE
    // projects only, and the sole trace of the archived one is a count chip.
    expect(within(card).queryByTestId('project-card-p3')).toBeNull();
    expect(within(card).getByText('1 archived')).toBeInTheDocument();
    expect(within(card).queryByRole('button')).toBeNull();

    // ONE text node, plural. `getByText` on the whole sentence is the assertion
    // that a three-interpolation version would fail.
    expect(within(card).getByText('2 projects, name restricted')).toBeInTheDocument();
  });

  // Case 13.407 (test-cases/13-deployment-dogfooding.md) — minted by the
  // workspaces-prototype-port plan's Task 10, catalogue consolidation.
  // Task 7: a truncation case at the card level, so `projectLine`'s own rule
  // (`PROJECT_LINE_CAP`, `src/workspace-viewer.ts`) is pinned where it
  // actually renders too, not only inside the helper's own unit tests.
  it('names three projects and counts the rest, so a wide workspace does not grow the card', async () => {
    mountWith([
      workspace({
        id: 'ws1',
        memberCount: 3,
        projects: ['Delivery', 'Site readiness', 'Winter stock', 'Payroll'].map((name, i) =>
          project({ id: `p${i}`, name, ticketCount: 1, blockedCount: 0 }),
        ),
      }),
    ]);
    const card = await screen.findByTestId('workspace-card-ws1');
    expect(
      within(card).getByText('Delivery, Site readiness, Winter stock, +1 more'),
    ).toBeInTheDocument();
    // The meta line still counts ALL four, so the truncation never becomes
    // the card's answer to "how many projects are in here".
    expect(within(card).getByText('4 projects')).toBeInTheDocument();
  });

  it('renders no restricted line and no archived chip when there is nothing to say', async () => {
    // THE NEGATIVE CONTROL for both, and it is not decoration: `0 projects ·
    // name restricted` would appear on every owner's card, where the count is
    // zero by construction, and an "archived" chip with nothing behind it
    // would claim a split in the data that is not there.
    mountWith([
      workspace({
        id: 'ws1',
        nameRestrictedProjectCount: 0,
        memberCount: 1,
        projects: [project({ id: 'p1', ticketCount: 2, blockedCount: 0 })],
      }),
    ]);
    const card = await screen.findByTestId('workspace-card-ws1');
    expect(within(card).queryByText(/name restricted/)).toBeNull();
    expect(within(card).queryByText(/archived/)).toBeNull();
    // And the singular, on a card that HAS one — so the plural above is a
    // choice the code makes rather than the only string it can produce.
    expect(within(card).getByText('1 member')).toBeInTheDocument();
  });

  /**
   * The monogram's TINT, which the rest of 13.379 does not reach: `getByLabelText`
   * finds the avatar and asserts its initials, and the initials are a function of
   * the NAME. A tint keyed on the name instead of the id therefore survives every
   * other assertion in this suite — measured, not supposed: that mutation was run
   * and passed 235/235 in `packages/ui` and every case here.
   *
   * Two workspaces sharing a name is the fixture that separates the two keys, and
   * it is not a contrived one — nothing in the product refuses a duplicate
   * workspace name, and `initialsOf` gives both cards the same two letters. The
   * colour is the only thing left that can tell them apart at a glance.
   *
   * The exact index is deliberately NOT asserted. That would pin the hash
   * function rather than the property, and the property is what the docblock
   * claims: same id ⇒ same tint, different id ⇒ (here) a different one.
   */
  it('tints the monogram from the workspace ID, so two workspaces with one name still differ', async () => {
    mountWith([
      workspace({ id: 'ws-alpha', name: 'Convenience Corner', memberCount: 1 }),
      workspace({ id: 'ws-beta', name: 'Convenience Corner', memberCount: 1 }),
    ]);
    const first = await screen.findByTestId('workspace-card-ws-alpha');
    const second = screen.getByTestId('workspace-card-ws-beta');
    const tintOf = (card: HTMLElement): string => {
      // `{ selector: '.gn-avatar' }` — see the docblock a few lines above this
      // describe block's sibling case for why a bare `getByLabelText` is now
      // ambiguous (the card's head door shares this accessible name).
      const avatar = within(card).getByLabelText('Convenience Corner', { selector: '.gn-avatar' });
      const tint = [...avatar.classList].find((c) => c.startsWith('gn-avatar--tint-'));
      expect(tint, `the avatar carries no tint class: ${avatar.className}`).toBeDefined();
      return tint!;
    };
    // The POSITIVE CONTROL first: both cards do carry a tint at all, so the
    // inequality below cannot pass by both being undefined.
    expect(tintOf(first)).toMatch(/^gn-avatar--tint-\d+$/);
    expect(tintOf(second)).toMatch(/^gn-avatar--tint-\d+$/);
    // Identical names, identical initials, different ids — so a tint keyed on
    // the name gives these two the same class and reddens here.
    expect(tintOf(first)).not.toBe(tintOf(second));
  });

  it('keeps a workspace\'s tint across a rename, because the key is the id', async () => {
    mountWith([workspace({ id: 'ws1', name: 'Convenience Corner', memberCount: 1 })]);
    const before = within(await screen.findByTestId('workspace-card-ws1'))
      .getByLabelText('Convenience Corner', { selector: '.gn-avatar' })
      .className;
    cleanup();
    mountWith([workspace({ id: 'ws1', name: 'The Corner Shop', memberCount: 1 })]);
    const after = within(await screen.findByTestId('workspace-card-ws1'))
      .getByLabelText('The Corner Shop', { selector: '.gn-avatar' })
      .className;
    // A colour a person has learned must survive somebody editing the name.
    expect(after).toBe(before);
  });

  it('says "1 project" in the singular, which a plural-only implementation cannot', async () => {
    mountWith([workspace({ id: 'ws1', nameRestrictedProjectCount: 1, memberCount: 2 })]);
    const card = await screen.findByTestId('workspace-card-ws1');
    expect(within(card).getByText('1 project, name restricted')).toBeInTheDocument();
  });
});

describe('13.380 a guest card shows one "Restricted" chip and no number outside the owner-ruled restricted sentence', () => {
  it('prints no count, and prints "Restricted" instead — while still naming the project and its restricted total', async () => {
    mountWith([
      workspace({
        id: 'ws1',
        role: 'guest',
        // The wire shape a guest really gets: the count keys are ABSENT
        // server-side and the mapper turns that into `null`. The restricted
        // count is NOT withheld — that is the owner's 2026-09-09 ruling, and
        // this fixture is the client half of it.
        memberCount: null,
        nameRestrictedProjectCount: 1,
        // ROUTED 1 (Task 7 review): FOUR live projects — one past
        // `PROJECT_LINE_CAP` (3) — so the truncation branch actually runs
        // for a guest. With only a single project (the original fixture)
        // `projectLine`'s `hidden` count is negative and no suffix ever
        // renders, regardless of which branch a bug takes; the mutation
        // proof below would have been a silent no-op against that fixture.
        // Every name here is deliberately digit-free, so the scan below
        // cannot pass by accident.
        projects: [
          project({ id: 'p1', name: 'Shared with a guest', ticketCount: null, blockedCount: null }),
          project({ id: 'p2', name: 'Second guest errand', ticketCount: null, blockedCount: null }),
          project({ id: 'p3', name: 'Third guest errand', ticketCount: null, blockedCount: null }),
          project({ id: 'p4', name: 'Fourth guest errand', ticketCount: null, blockedCount: null }),
        ],
      }),
    ]);
    const card = await screen.findByTestId('workspace-card-ws1');

    expect(within(card).getByText('Restricted')).toBeInTheDocument();
    // THE POINT OF THE CASE, and the reason "'Restricted' is present" alone
    // would certify nothing: a card that printed BOTH the chip and a zero
    // passes a presence check and fails this one. `0` is a claim — "no work
    // you can see" — and it is the claim the server declined to make by
    // omitting the key.
    expect(within(card).queryByText(/\b0\b/)).toBeNull();
    expect(within(card).queryByText(/members?$/)).toBeNull();
    expect(within(card).queryByText(/active/)).toBeNull();
    expect(within(card).queryByText(/blocked/)).toBeNull();
    expect(within(card).queryByText(/tickets?$/)).toBeNull();
    // 13.380's own name is "no number anywhere", and the meta line is a number.
    expect(within(card).queryByText(/\d+ projects?$/)).toBeNull();

    // The names are still served (rulings P32/P38 withhold names, not this
    // one) — all four, joined and truncated to the SAFE "and more" form, not
    // the numeric "+1 more" a non-withheld viewer would get.
    expect(
      within(card).getByText(
        'Shared with a guest, Second guest errand, Third guest errand, and more',
      ),
    ).toBeInTheDocument();
    expect(within(card).getByText('1 project, name restricted')).toBeInTheDocument();

    // ROUTED 1 (Task 7 review, load-bearing): none of the shape-specific
    // regexes above matches "+1 more" — the exact suffix `projectLine` would
    // print if it ever ignored `countsWithheld` — so a leaked truncation
    // count would have sailed through every check above and left this case
    // green. This is a card-wide digit scan instead of one more shape: ANY
    // digit anywhere on the card fails it, minus the one digit this card IS
    // allowed to show — the restricted count above, never withheld (see
    // `restrictedLine`'s own docblock) — which is stripped out by its exact
    // text rather than excluded by yet another pattern.
    const restrictedSentence = '1 project, name restricted';
    const fullText = card.textContent ?? '';
    const withoutRestrictedSentence = fullText.replace(restrictedSentence, '');
    // Proves the strip actually fired, rather than silently no-op-ing if the
    // sentence text ever drifted from what is asserted two lines above.
    expect(withoutRestrictedSentence, 'the restricted sentence text was not found to strip').not.toBe(
      fullText,
    );
    expect(withoutRestrictedSentence).not.toMatch(/\d/);
  });
});

describe('13.381 the role sentence and every gated affordance read ONE value', () => {
  /**
   * The discriminating body: **`role: 'guest'` WITH counts present.** The
   * shipped server never sends it — it withholds the counts by role, in the
   * same expression — which is exactly why it is the fixture that separates the
   * two possible implementations:
   *
   * - reading `role` (what ships): the chip says Restricted, no number appears.
   * - reading `memberCount === null` (the second source that suggests itself,
   *   and agrees on every body the server actually sends): the counts are
   *   present, so it prints `7 members` and two chip numbers.
   *
   * A fixture built from a real guest response cannot tell these apart, and
   * that is the whole reason this one is unrealistic on purpose.
   */
  it('gates the chips on the ROLE, not on whether the server happened to send a count', async () => {
    mountWith([
      workspace({
        id: 'ws1',
        role: 'guest',
        memberCount: 7,
        nameRestrictedProjectCount: 0,
        projects: [project({ id: 'p1', ticketCount: 8, blockedCount: 2 })],
      }),
    ]);
    const card = await screen.findByTestId('workspace-card-ws1');
    expect(within(card).getByText("You're a guest here.")).toBeInTheDocument();
    expect(within(card).getByText('Restricted')).toBeInTheDocument();
    // The numbers the second source WOULD have printed, named individually so
    // the failure says which one leaked rather than "something is present".
    expect(within(card).queryByText('7 members')).toBeNull();
    expect(within(card).queryByText('6 active')).toBeNull();
    expect(within(card).queryByText('2 blocked')).toBeNull();
    expect(within(card).queryByText('8 tickets')).toBeNull();
  });

  it('greets a role it has never heard of, and withholds from it — the conservative direction', async () => {
    // `WorkspaceRef.role` is a `string` on the wire, not a union: the server
    // sends `proj_memberships.role` verbatim, so a role this build does not
    // know is reachable. The sentence must still be a sentence, and the counts
    // must NOT be served — being wrong in that direction is recoverable.
    mountWith([
      workspace({ id: 'ws1', role: 'auditor', memberCount: 4, nameRestrictedProjectCount: 0 }),
    ]);
    const card = await screen.findByTestId('workspace-card-ws1');
    expect(within(card).getByText('Your role here is auditor.')).toBeInTheDocument();
    expect(within(card).getByText('Restricted')).toBeInTheDocument();
    expect(within(card).queryByText('4 members')).toBeNull();
  });
});

/**
 * 13.390 — the WHOLE card is a door to `/w/<id>` (Round 19c, owner feedback:
 * *"the entire workspace card should be clickable ... everything else on the
 * card should just be info, nothing clickable"*).
 *
 * The accessible name is asserted to be EXACTLY the workspace's name, not that
 * name padded with the role sentence or repeated — the failure a naive
 * `aria-label` built from the card's full text content would produce, since
 * the avatar carries its own `aria-label` and the role sentence, every
 * project name/count and the restricted line all sit inside the same link.
 *
 * Round 19b's version of this case proved "no nested interactive content"
 * indirectly, by showing every other control was still reachable as its own
 * top-level role — the only way to prove it when some of the card WAS meant to
 * stay outside the door. Round 19c removed those controls instead of keeping
 * them beside the door, so the direct proof is now the stronger one: exactly
 * one link and zero buttons anywhere in the card.
 */
describe('13.390 the card is a door to /w/<id>', () => {
  it('the whole card is one link named by the workspace, with no nested interactive content', async () => {
    mountWith([
      workspace({
        id: 'ws1',
        name: 'Convenience Corner',
        // Admin, not owner: an owner's card also has the overflow trigger (19.245, trash Plan 4); every other role's card has zero buttons.
        role: 'admin',
        memberCount: 3,
        projects: [
          project({ id: 'p1', name: 'Shop operations', ticketCount: 2, blockedCount: 0 }),
          project({ id: 'p2', name: 'Old signage', archived: true, ticketCount: 1, blockedCount: 0 }),
        ],
      }),
    ]);
    const card = await screen.findByTestId('workspace-card-ws1');

    // EXACTLY ONE link in the whole card, and it is the door — a project link
    // or a "My Work" link surviving the refactor would fail this count even if
    // every other assertion here still passed.
    const links = within(card).getAllByRole('link');
    expect(links).toHaveLength(1);
    const door = links[0];
    expect(door).toHaveAttribute('href', '/w/ws1');
    expect(door).toHaveAccessibleName('Convenience Corner');
    // Not padded with the role sentence, which sits inside the same link
    // visually but must not join its accessible name.
    expect(door).not.toHaveAccessibleName(/owner/i);

    // No button anywhere — the archived-disclosure toggle is gone, replaced
    // by the plain "1 archived" chip in ChipRow.
    expect(within(card).queryAllByRole('button')).toHaveLength(0);

    // The info that used to live behind separate controls is still ON the
    // card, just not clickable: the live project by name, and the archived
    // one as a count rather than a revealed row.
    expect(within(card).getByText('Shop operations')).toBeInTheDocument();
    expect(within(card).queryByText('Old signage')).toBeNull();
    expect(within(card).getByText('1 archived')).toBeInTheDocument();
  });

  it('keeps the door\'s target current when the caller belongs to more than one workspace', async () => {
    mountWith([
      workspace({ id: 'ws1', name: 'Convenience Corner', memberCount: 1 }),
      workspace({ id: 'ws2', name: 'Second Workspace', memberCount: 1 }),
    ]);
    const card1 = await screen.findByTestId('workspace-card-ws1');
    const card2 = screen.getByTestId('workspace-card-ws2');
    expect(within(card1).getByRole('link', { name: 'Convenience Corner' })).toHaveAttribute(
      'href',
      '/w/ws1',
    );
    expect(within(card2).getByRole('link', { name: 'Second Workspace' })).toHaveAttribute(
      'href',
      '/w/ws2',
    );
  });
});

/**
 * Case 13.406 (test-cases/13-deployment-dogfooding.md) — minted by the
 * workspaces-prototype-port plan's Task 10, catalogue consolidation.
 *
 * Task 4 — the page head's one-line summary, gated on `workspaces !== null &&
 * workspaces.length > 0`. The `!== null` term is the withholding half: a
 * REFUSED read is `null` at this point in the component exactly like an
 * in-flight one is, so a naive `workspaces.length` gate would print "0
 * workspaces you belong to." — a count of a list nobody managed to read — and
 * it stays FIRST so it short-circuits before `.length` is ever read on a
 * refusal. The `length > 0` term (fix round 1) is a copy judgement, not a
 * withholding one: a SUCCESSFUL empty read is a real, counted zero, and the
 * summary would sit redundantly on top of the page's own "No workspaces
 * yet…" sentence, which already says it better.
 */
describe('Task 4 — the workspaces summary line', () => {
  it('prints no summary when the workspaces read refused — a count of nothing counted', async () => {
    mountRefusing('The ledger is unavailable.');
    await screen.findByText(/ledger is unavailable/i);
    expect(screen.queryByText(/workspaces? you belong to/i)).toBeNull();
  });

  it('summarises the list once it has one', async () => {
    mountWith([workspace({ id: 'ws1', memberCount: 1 }), workspace({ id: 'ws2', memberCount: 1 })]);
    expect(await screen.findByText('2 workspaces you belong to')).toBeInTheDocument();
  });

  /**
   * Fix round 1 — the case the coordinator's ruling 3 requires: a
   * SUCCESSFUL read that answers `[]` is `!== null`, so without the
   * `length > 0` term this would print "0 workspaces you belong to."
   * directly above the empty-state sentence. Both halves are asserted: the
   * summary is absent, AND the page's own empty-state copy is what actually
   * renders instead — a presence-only check on the empty-state sentence
   * would pass even if the summary also leaked through above it.
   */
  it('prints no summary — and the empty-state sentence instead — when the read succeeds with zero workspaces', async () => {
    mountWith([]);
    expect(
      await screen.findByText('No workspaces yet. Ask an admin for an invite link, or create your own.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/workspaces? you belong to/i)).toBeNull();
  });
});
