import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '../src/providers.js';
import { clearWorkspaceNameCache } from '../src/use-workspace-name.js';
import { clearWorkspaceProjectsCache } from '../src/use-workspace-projects.js';
import { ruleFor } from './helpers/css-rule-scan.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * 13.1302–13.1304 — THE PROJECT HEAD ROW (owner request 2026-09-22).
 *
 * The owner put the prototype's project header beside the build's and asked for
 * the build's *"project header and controls area"* arranged *"more like the
 * prototype"*. This is an ARRANGEMENT change only: no control is added, removed
 * or relabelled, and the accessible-names ratchet (`Features.md:33`) must not
 * move.
 *
 * **What the prototype does** (`design-system/interactive/desktop.dc.html:319-341`):
 * a column wrapper (`:319`) holding two rows. Row 1 (`:320`) is
 * `display:flex; gap:12px; align-items:center; flex-wrap:wrap;
 * justify-content:space-between; margin-top:24px` — the LEFT half (`:321-323`)
 * is a `flex-direction:column; gap:4px` box carrying the crumb `<p>` over the
 * `<h1>`, and the RIGHT half (`:325`) is the controls row. Row 2 (`:338-341`)
 * is the view rail (an `inline-flex`, content-sized track) beside a summary.
 *
 * **The objection this answers, and who answered it.** `page.tsx`'s docblock
 * records that the title was moved OUT of the controls row *in fix round 2*,
 * because a 34px `<h1>` placed directly inside a `flex-wrap: wrap;
 * align-items: center` row was centred on one line with the 13px crumb and the
 * buttons. That objection is about the `<h1>` being a SIBLING of the controls;
 * the prototype puts the crumb and the title in a COLUMN inside the row
 * (`:321`), which is what the owner's 2026-09-22 instruction supersedes
 * fix round 2's placement to build. The owner's instruction wins.
 *
 * **What jsdom can witness here.** jsdom applies no layout: these cases assert
 * DOM STRUCTURE (which element is a descendant of which) and the stylesheet
 * DECLARATIONS those structures are styled by. The 24px-vs-1.5rem top margin,
 * the `space-between` split and the rail's content-sized width are paint, and
 * the controller checks the paint after landing.
 */

const WORKSPACE = '01J9WORKSPACE0000000000000';
const PROJECT = '01J9PROJECT000000000000000';
const ANSELMA = '01J9USER000000000000000000';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ workspaceId: WORKSPACE, projectId: PROJECT }),
  usePathname: () => `/w/${WORKSPACE}/p/${PROJECT}`,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: ANSELMA, name: 'Anselma Marak' } } }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import ProjectPage from '../app/w/[workspaceId]/p/[projectId]/page.js';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
/**
 * The stylesheet the new head/identity rules live in. Read from SOURCE, not from
 * `packages/ui/dist`: the web suite imports the built package by name, but a
 * rule's DECLARATIONS are asserted against the file the source of truth for them
 * — the same choice `members-styling.test.ts:52` makes for its own family.
 */
const UI_CSS = readFileSync(resolve(TEST_DIR, '../../../packages/ui/src/ui.css'), 'utf8');

beforeEach(() => {
  clearWorkspaceNameCache();
  clearWorkspaceProjectsCache();
});

/**
 * The names come from the SAME `getMyWorkspaces` read `AppNav` already makes on
 * this page, so the crumb and title both resolve from one fixture — the mount is
 * copied from `project-page-chrome.test.tsx` (`13.431`'s own world) for exactly
 * that reason.
 */
const world = (archived: boolean) =>
  stubServices({
    getMyWorkspaces: async () => [
      {
        id: WORKSPACE,
        name: 'Garo Hills Logistics',
        prefix: 'GH',
        role: 'owner',
        memberCount: 3,
        nameRestrictedProjectCount: 0,
        projects: [
          {
            id: PROJECT,
            name: 'Errand tracking',
            prefix: 'ET',
            archived,
            ticketCount: 4,
            blockedCount: 0,
          },
        ],
      },
    ],
  });

describe('13.1302 the breadcrumb, the title and the archived line are one identity column', () => {
  it('13.1302 nests all three under `.gn-project__identity`, in that order', async () => {
    render(
      <Providers services={world(true)}>
        <ProjectPage />
      </Providers>,
    );

    // An archived project, so all THREE children the column is meant to hold are
    // present in the same render: crumb, `<h1>`, and the E2-38 state line. A
    // live project would leave the third absent and the order claim half-checked.
    await screen.findByRole('heading', { name: 'Errand tracking', level: 1 });

    const identity = document.querySelector('.gn-project__identity');
    expect(identity).not.toBeNull();

    const crumb = identity?.querySelector('.gn-project__breadcrumb');
    const title = identity?.querySelector('.gn-project__title');
    const archived = identity?.querySelector('.gn-project__archived');
    // Each of the three is INSIDE the column — the claim the arrangement rests
    // on. A `querySelector` from the column cannot be satisfied by an element
    // that merely sits next to it.
    expect(crumb).not.toBeNull();
    expect(title).not.toBeNull();
    expect(archived).not.toBeNull();
    expect(title?.tagName).toBe('H1');

    // ...and in the prototype's own order (`:321-323`): crumb over title, the
    // archive state line under both. Asserted as ORDER rather than as membership
    // because a column holding all three in the wrong sequence is still a column
    // and still passes every containment check above.
    const follows = (first: Element | null | undefined, second: Element | null | undefined) =>
      first !== null &&
      first !== undefined &&
      second !== null &&
      second !== undefined &&
      (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    expect(follows(crumb, title)).toBe(true);
    expect(follows(title, archived)).toBe(true);
  });
});

describe('13.1303 the identity column and the controls share one head row', () => {
  it('13.1303 puts the column and the header in `.gn-project__head`; the rail is the next row', async () => {
    render(
      <Providers services={world(true)}>
        <ProjectPage />
      </Providers>,
    );

    // The search box is the witness that the CONTROLS row rendered — it is the
    // one control `.gn-project__header` renders unconditionally (the workflow
    // picker is gated on `board.data.groups.length > 1`, and `board` is
    // deliberately left un-stubbed here, so a query for it would be absent for a
    // reason that has nothing to do with this arrangement).
    await screen.findByRole('searchbox', { name: 'Search the board' });

    const head = document.querySelector('.gn-project__head');
    expect(head).not.toBeNull();

    const identity = head?.querySelector(':scope > .gn-project__identity');
    const header = head?.querySelector(':scope > .gn-project__header');
    // BOTH are direct children of the ONE head row. `:scope >` is the point: the
    // header contains a search box and the identity contains a heading either
    // way, so a plain descendant query passes for two siblings that were never
    // wrapped in a row together — which is exactly the state this case exists to
    // rule out.
    expect(identity).not.toBeNull();
    expect(header).not.toBeNull();
    expect(header?.contains(screen.getByRole('searchbox', { name: 'Search the board' }))).toBe(
      true,
    );

    // CONTROL, same case: the rail is the NEXT ROW, not a third child of the head
    // row. Without this arm, a `.gn-project__head` wrapped around the identity,
    // the controls AND the rail would satisfy every assertion above — and would
    // be the prototype's row 1 and row 2 collapsed into one, which the owner's
    // screenshot does not show.
    const rail = screen.getByRole('tablist', { name: 'Project view' });
    expect(head?.contains(rail)).toBe(false);
  });
});

describe('13.1304 the head row and the identity column are styled as the prototype draws them', () => {
  /**
   * Anchored with `^` and `\s*\{` so `.gn-project__header` cannot match
   * `.gn-project__head` (and vice versa): both names begin `__head`, and a bare
   * substring pattern would let either report the other's body — the same
   * first-match hazard `packages/ui/test/components.test.tsx:548` records for
   * its own helper.
   */
  const head = ruleFor(UI_CSS, /^\.gn-project__head\s*\{/);
  const identity = ruleFor(UI_CSS, /^\.gn-project__identity\s*\{/);
  const header = ruleFor(UI_CSS, /^\.gn-project__header\s*\{/);

  it('13.1304 `.gn-project__head` splits its two halves and carries the row margin', () => {
    expect(head).toBeDefined();
    expect(head).toMatch(/justify-content:\s*space-between/);
    expect(head).toMatch(/flex-wrap:\s*wrap/);
    // The prototype's `margin-top:24px` (`:320`), at this repo's 16px root. It
    // moved UP from `.gn-project__header`, which held it while the controls were
    // the top of the page: in the prototype the margin belongs to the row that
    // holds BOTH the identity and the controls.
    expect(head).toMatch(/margin-top:\s*1\.5rem/);
  });

  it('13.1304 `.gn-project__identity` is the prototype\'s column', () => {
    expect(identity).toBeDefined();
    expect(identity).toMatch(/flex-direction:\s*column/);
  });

  it('13.1304 CONTROL — `.gn-project__header` no longer carries the margin', () => {
    // A rule must EXIST for the absence to mean anything: `ruleFor` returns
    // `undefined` for a vanished selector, and `undefined` satisfies a bare
    // `not.toMatch`. Pinning presence first is what makes the next line a claim
    // about this schedule rather than about a missing one.
    expect(header).toBeDefined();
    // Both margins on both rules would double the gap to 48px, which is the
    // defect this arm exists to catch. `.gn-project__head` now owns it.
    expect(header).not.toMatch(/margin-top/);
  });
});
