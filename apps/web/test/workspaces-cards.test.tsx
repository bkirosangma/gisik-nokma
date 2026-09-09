import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectRef, WorkspaceRef } from '@gisik-nokma/app-core';
import WorkspacesPage from '../app/workspaces/page.js';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * 3.153/3.154 — the two `data-testid` hooks Plan 11 T13's E2E needs to
 * address one specific workspace or project card among structurally
 * identical siblings (house style `mapping-row-${state.id}` /
 * `state-node-${data.stateId}`): the id goes on the entity's own container,
 * disambiguation only — every interaction here still goes through the
 * accessible `name`/role, never the testid itself.
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
    role: 'owner',
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
      { id: 'p1', name: 'Shop operations', archived: false, ticketCount: 4, blockedCount: 1 },
      { id: 'p2', name: 'Deliveries', archived: false, ticketCount: 0, blockedCount: 0 },
    ],
  },
  {
    id: 'ws2',
    name: 'Second Workspace',
    role: 'member',
    memberCount: 2,
    nameRestrictedProjectCount: 0,
    projects: [{ id: 'p3', name: 'Only project', archived: false, ticketCount: 2, blockedCount: 0 }],
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

describe('Workspaces page — entity-keyed data-testid hooks (Plan 11 T13)', () => {
  it('3.153 keys each workspace card by its own workspaceId, distinguishing two siblings', async () => {
    mount();
    const ws1 = await screen.findByTestId('workspace-card-ws1');
    const ws2 = screen.getByTestId('workspace-card-ws2');
    expect(ws1).not.toBe(ws2);
    expect(within(ws1).getByRole('heading', { name: 'Convenience Corner' })).toBeInTheDocument();
    expect(within(ws2).getByRole('heading', { name: 'Second Workspace' })).toBeInTheDocument();
  });

  it('3.154 keys each project card by its own projectId, scoped inside its own workspace card', async () => {
    mount();
    const ws1 = await screen.findByTestId('workspace-card-ws1');
    const p1 = within(ws1).getByTestId('project-card-p1');
    const p2 = within(ws1).getByTestId('project-card-p2');
    expect(p1).not.toBe(p2);
    expect(within(p1).getByRole('link', { name: 'Shop operations' })).toHaveAttribute(
      'href',
      '/w/ws1/p/p1',
    );
    expect(within(p2).getByRole('link', { name: 'Deliveries' })).toHaveAttribute('href', '/w/ws1/p/p2');
    // The other workspace's project never leaks into this one's scope.
    expect(within(ws1).queryByTestId('project-card-p3')).toBeNull();
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
    archived: false,
    ticketCount: 0,
    blockedCount: 0,
    ...over,
  };
}

function workspace(over: Partial<WorkspaceRef> & { id: string }): WorkspaceRef {
  return {
    name: 'Convenience Corner',
    role: 'owner',
    memberCount: 0,
    nameRestrictedProjectCount: 0,
    projects: [],
    ...over,
  };
}

describe('13.379 the card renders every element from data the route served', () => {
  it('shows the monogram, the member count, both chips, the per-project count, the archived split and the restricted line', async () => {
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
    // `{ selector: '.gn-avatar' }` disambiguates from the head's own door
    // (Round 19b): the card's head is now a `<Link aria-label={workspace.name}>`
    // wrapping the avatar, so TWO elements share this accessible name — the
    // door and the monogram inside it — and a bare `getByLabelText` cannot
    // tell them apart. Two elements sharing a name is not itself a defect;
    // only this query needed to say which one it means.
    expect(
      within(card).getByLabelText('Convenience Corner', { selector: '.gn-avatar' }),
    ).toHaveTextContent('CC');

    expect(within(card).getByText('5 members')).toBeInTheDocument();
    // THE TWO CHIP NUMBERS, and every input to them is a different number so
    // neither can be the other by accident: 9+4+7 tickets, 3+1+2 blocked, over
    // the projects the card NAMES. `20 − 6 = 14` active, `6` blocked.
    expect(within(card).getByText('14 active')).toBeInTheDocument();
    expect(within(card).getByText('6 blocked')).toBeInTheDocument();

    // Per-project counts, scoped to their own row so a card that printed one
    // project's number on another's row reddens.
    const p1 = within(card).getByTestId('project-card-p1');
    expect(within(p1).getByText('9 tickets')).toBeInTheDocument();
    const p2 = within(card).getByTestId('project-card-p2');
    expect(within(p2).getByText('4 tickets')).toBeInTheDocument();

    // ARCHIVED IS HIDDEN BY DEFAULT, and the toggle's accessible name carries
    // the workspace so two cards do not present two identical buttons.
    expect(within(card).queryByTestId('project-card-p3')).toBeNull();
    const toggle = within(card).getByRole('button', {
      name: 'Show archived projects in Convenience Corner',
    });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    const p3 = within(card).getByTestId('project-card-p3');
    // Marked as well as hidden: revealing it is not the whole of "archived".
    expect(within(p3).getByText('Archived')).toBeInTheDocument();
    expect(
      within(card).getByRole('button', { name: 'Hide archived projects in Convenience Corner' }),
    ).toHaveAttribute('aria-expanded', 'true');

    // ONE text node, plural. `getByText` on the whole sentence is the assertion
    // that a three-interpolation version would fail.
    expect(within(card).getByText('2 projects · name restricted')).toBeInTheDocument();
  });

  it('renders no restricted line and no archive toggle when there is nothing to say', async () => {
    // THE NEGATIVE CONTROL for both, and it is not decoration: `0 projects ·
    // name restricted` would appear on every owner's card, where the count is
    // zero by construction, and a toggle revealing nothing lies about the shape
    // of the data.
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
    expect(within(card).queryByRole('button', { name: /archived/ })).toBeNull();
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
    expect(within(card).getByText('1 project · name restricted')).toBeInTheDocument();
  });
});

describe('13.380 a guest card shows one "Restricted" chip and no number anywhere', () => {
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
        projects: [
          project({ id: 'p1', name: 'Shared with a guest', ticketCount: null, blockedCount: null }),
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

    // The name is still served (rulings P32/P38 withhold names, not this one),
    // and so is the restricted line — the string the whole owner ruling exists
    // to make renderable.
    expect(within(card).getByRole('link', { name: 'Shared with a guest' })).toBeInTheDocument();
    expect(within(card).getByText('1 project · name restricted')).toBeInTheDocument();
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
 * 13.390 — the card's HEAD is a door to `/w/<id>` (Round 19b, owner feedback
 * item 1: *"the workspace card should be clickable ... and on click it should
 * lead into the workspace page"*).
 *
 * The accessible name is asserted to be EXACTLY the workspace's name, not that
 * name padded with the role sentence or repeated — the failure a naive
 * `aria-label` built from the head's full text content would produce, since
 * the avatar carries its own `aria-label` and the role sentence sits beside
 * the heading inside the same link.
 *
 * "No nested interactive content" is asserted the only way it can be from
 * outside the DOM tree: every OTHER control on the card (the project links,
 * the archived toggle, "My Work") is still reachable as its OWN top-level
 * role, scoped to the card — which a browser could not do if any of them were
 * nested inside the door anchor (nested interactive elements are invalid HTML
 * and most browsers hoist the inner one out of the outer, breaking exactly
 * this kind of scoped lookup).
 */
describe('13.390 the card is a door to /w/<id>', () => {
  it('the head is a link named by the workspace, and every other control stays reachable on its own', async () => {
    mountWith([
      workspace({
        id: 'ws1',
        name: 'Convenience Corner',
        role: 'owner',
        memberCount: 3,
        projects: [
          project({ id: 'p1', name: 'Shop operations', ticketCount: 2, blockedCount: 0 }),
          project({ id: 'p2', name: 'Old signage', archived: true, ticketCount: 1, blockedCount: 0 }),
        ],
      }),
    ]);
    const card = await screen.findByTestId('workspace-card-ws1');

    const door = within(card).getByRole('link', { name: 'Convenience Corner' });
    expect(door).toHaveAttribute('href', '/w/ws1');
    // EXACTLY the name — not padded with the role sentence, which sits
    // inside the same link visually but must not join its accessible name.
    expect(door).not.toHaveAccessibleName(/owner/i);

    // Every OTHER control is still its own top-level reachable role, scoped
    // to the card — which nesting inside `door` would have broken.
    expect(within(card).getByRole('link', { name: 'My Work' })).toHaveAttribute(
      'href',
      '/w/ws1/my-work',
    );
    expect(within(card).getByRole('link', { name: 'Shop operations' })).toBeInTheDocument();
    const toggle = within(card).getByRole('button', {
      name: 'Show archived projects in Convenience Corner',
    });
    await userEvent.click(toggle);
    expect(within(card).getByRole('link', { name: 'Old signage' })).toBeInTheDocument();
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
