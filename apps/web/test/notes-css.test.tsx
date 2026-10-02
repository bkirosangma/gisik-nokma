import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectRef, RosterMember, WorkspaceRef } from '@gisik-nokma/app-core';
import type { NoteDetail, NoteSummary, SubmittedEvent } from '@gisik-nokma/domain';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * Cases 18.224–18.226 — the two-column layout and its breakpoints, the TOC's
 * heading gate reaching the page's own wiring, and the CSS binding scanner
 * (spec §8.2, §9.1–9.2; Task 9's 11.95 shape applied to `.gn-notes*`).
 */
const routerReplace = vi.fn();
const routerPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, replace: routerReplace }),
  useParams: () => ({}),
  usePathname: () => '/notes',
  useSearchParams: () => new URLSearchParams(),
}));
let mockSessionUser: { id: string; name: string; email?: string } | null = {
  id: 'u_kiro',
  name: 'Kiro',
  email: 'kiro@example.com',
};
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: mockSessionUser } }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import { NotesPage } from '../src/notes/notes-page.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const CSS = readFileSync(join(REPO_ROOT, 'apps/web/app/globals.css'), 'utf8');

/** Comments stripped first, exactly as the inbox scanner does it. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Every `gn-notes…` class NAMED IN A SELECTOR, sorted, deduplicated. */
function styledClasses(css: string): string[] {
  const hits = [...stripComments(css).matchAll(/\.(gn-notes[A-Za-z0-9_-]*)/g)].flatMap((hit) => hit[1] ?? []);
  return [...new Set(hits)].sort();
}

/** Every `gn-notes…` class actually on an element in the rendered tree. */
function renderedClasses(root: ParentNode): string[] {
  const hits = [...root.querySelectorAll<HTMLElement>('*')].flatMap((element) =>
    [...element.classList].filter((name) => name.startsWith('gn-notes')),
  );
  return [...new Set(hits)].sort();
}

/** Every `[data-…]` attribute name a `gn-notes` selector keys on. */
function styledAttributes(css: string): string[] {
  const notesRules = [...stripComments(css).matchAll(/^[^{}\n]*\.gn-notes[^{}\n]*\{/gm)].flatMap((hit) => hit[0] ?? []);
  const hits = notesRules.flatMap((selector) => [...selector.matchAll(/\[(data-[a-z-]+)/g)].flatMap((a) => a[1] ?? []));
  return [...new Set(hits)].sort();
}

/** The declarations of the rule whose selector list is EXACTLY `selector`. */
function declarationsFor(css: string, selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(stripComments(css));
  return rule?.[1] ?? null;
}

/**
 * Every `@media (...)` block in `css` whose body touches `.${prefix}`, in file
 * order — depth-counted rather than regex-matched to the next `}` so a rule
 * INSIDE the block (which has its own braces) cannot truncate it early.
 */
function mediaBlocksTouching(css: string, prefix: string): Array<{ condition: string; body: string }> {
  const stripped = stripComments(css);
  const blocks: Array<{ condition: string; body: string }> = [];
  const opener = /@media\s*\(([^)]*)\)\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = opener.exec(stripped)) !== null) {
    let depth = 1;
    let i = match.index + match[0].length;
    for (; i < stripped.length && depth > 0; i++) {
      if (stripped[i] === '{') depth++;
      else if (stripped[i] === '}') depth--;
    }
    const body = stripped.slice(match.index + match[0].length, i - 1);
    if (body.includes(`.${prefix}`)) blocks.push({ condition: (match[1] ?? '').trim(), body });
  }
  return blocks;
}

describe('18.226 the scanners are proven against planted input before they are trusted', () => {
  it('reads classes out of selectors, ignores commented-out ones', () => {
    const planted = [
      '/* .gn-notes__ghost { color: red; } — a rule that was DELETED */',
      '.gn-notes { background: var(--gn-surface); }',
      '.gn-notes__tree--drawer[data-open=\'true\'] .gn-notes__row { color: blue; }',
      '.gn-note-document { color: green; }',
    ].join('\n');
    expect(styledClasses(planted)).toEqual(['gn-notes', 'gn-notes__row', 'gn-notes__tree--drawer']);
  });

  it('reads classes off a rendered tree, ignoring a similarly-prefixed sibling class', () => {
    const host = document.createElement('div');
    host.innerHTML = '<div class="gn-notes"><span class="gn-notes__row gn-note-document"></span></div>';
    expect(renderedClasses(host)).toEqual(['gn-notes', 'gn-notes__row']);
  });

  it('finds a media block by depth, not by the first inner brace', () => {
    const planted = ['.gn-notes__toc { display: none; }', '@media (min-width: 64rem) {', '  .gn-notes__toc { display: block; }', '  .gn-notes__body { grid-template-columns: 1fr; }', '}'].join('\n');
    const blocks = mediaBlocksTouching(planted, 'gn-notes');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.condition).toBe('min-width: 64rem');
    expect(blocks[0]!.body).toContain('.gn-notes__body');
  });
});

describe('18.224 the two-column layout and its ONE breakpoint', () => {
  /**
   * AMENDED (owner request 2026-09-23, brand-mark-wide-notes Unit 4) — the
   * right-hand TOC column and its `min-width: 64rem` breakpoint are REMOVED
   * by owner request, replaced by the floating `TocLauncher` (13.1479+),
   * available at every width instead of gated on a third breakpoint. The
   * document column is now two tracks (`18rem minmax(0, 1fr)`) at every width
   * above `60rem`, not three above `64rem` — this case now pins that there is
   * exactly ONE breakpoint left touching `.gn-notes`, and that no value
   * anywhere in the file still declares a third track, so a value reverted
   * from a stale branch or pasted back by a future edit reddens here.
   *
   * Mutation: `60rem` → `59rem` on the `@media (max-width: 60rem)` line —
   * this test's own pinned condition string goes red; likewise `width > 60rem`
   * → `width > 61rem` on the split-scroll block.
   */
  it('pins the base grid and its ONE breakpoint, and no rule anywhere declares a third track', () => {
    const base = declarationsFor(CSS, '.gn-notes__body');
    expect(base).not.toBeNull();
    expect(base ?? '').toMatch(/grid-template-columns:\s*18rem minmax\(0, 1fr\);/);

    const blocks = mediaBlocksTouching(CSS, 'gn-notes');
    // EXACT set, in file order: a reintroduced `min-width: 64rem` breakpoint
    // on a `.gn-notes` selector anywhere in the file would add it back here.
    // AMENDED 2026-09-30 (notes split-scroll, 18.480–18.484): the second entry is
    // the EXACT COMPLEMENT of the first (`width > 60rem` is every width the
    // `max-width: 60rem` block does not cover), so there is still ONE breakpoint —
    // 60rem — with a rule set on each side of it; no third point was added.
    // AMENDED 2026-10-01 (mobile-web Task 9, 21.130–21.131): the middle entry is the phone arm — the
    // product's one 40rem phone breakpoint (FD1), which every screen shares — holding the toggle's,
    // document's, title's and toolbar's phone rules. It adds no layout breakpoint of the notes page's own.
    expect(blocks.map((b) => b.condition)).toEqual(['max-width: 60rem', 'max-width: 40rem', 'width > 60rem']);
    // …and the phone arm is no LAYOUT breakpoint: it sets no grid of its own (the notes page's one split stays at 60rem).
    expect(blocks[1]!.body).not.toMatch(/grid-template/);

    const narrow = blocks[0]!.body;
    expect(narrow).toMatch(/\.gn-notes__body\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/);
    expect(narrow).toMatch(/\.gn-notes__tree-toggle\s*\{[^}]*display:\s*inline-flex;/);
    expect(narrow).toMatch(/\.gn-notes__tree--drawer\s*\{[^}]*display:\s*none;/);
    expect(narrow).toMatch(/\.gn-notes__tree--drawer\[data-open='true'\]\s*\{[^}]*display:\s*block;/);

    // The stronger, file-wide form advisor flagged: not merely "the removed
    // BLOCK is gone" but "the removed VALUE is nowhere", comments stripped —
    // a docblock quoting the old rule would otherwise still match a naive scan.
    expect(stripComments(CSS)).not.toMatch(/grid-template-columns:\s*18rem minmax\(0, 1fr\) 14rem/);
  });

  /**
   * 13.1485 — the notes page is WIDE (owner: "the width is too narrow ...
   * basically the entire page minus the left pane") — `.gn-shell`'s own
   * `80rem` cap is lifted by a MODIFIER class (`.gn-shell`'s shared by every
   * route; only the notes page's own `<main>` carries the modifier) rather
   * than edited in place, and `.gn-notes`'s own `73.75rem` cap is dropped
   * directly — it is already page-scoped (globals.css's own docblock: no
   * `app-core` component renders a `.gn-notes*` class).
   *
   * Source order asserted, not merely presence: `.gn-shell--wide` must come
   * AFTER `.gn-shell` in the file, since the two selectors carry EQUAL
   * specificity (one class each) and only source order decides the tie.
   * MUTATION TARGET: move `.gn-shell--wide` above `.gn-shell`.
   */
  it('13.1485 .gn-shell--wide lifts the cap, declared AFTER .gn-shell for the specificity tie', () => {
    const stripped = stripComments(CSS);
    const shellIndex = stripped.indexOf('.gn-shell {');
    const wideIndex = stripped.indexOf('.gn-shell--wide');
    expect(shellIndex).toBeGreaterThan(-1);
    expect(wideIndex).toBeGreaterThan(shellIndex);

    const wideRule = declarationsFor(CSS, '.gn-shell--wide');
    expect(wideRule).not.toBeNull();
    expect(wideRule ?? '').toMatch(/max-width:\s*none;/);

    const notesRule = declarationsFor(CSS, '.gn-notes');
    expect(notesRule).not.toBeNull();
    expect(notesRule ?? '').toMatch(/max-width:\s*none;/);
  });

  /** The CSS rule from the case above only matters if the page's `<main>` actually carries the modifier. */
  it('13.1485b the rendered <main> carries gn-shell, gn-shell--wide and gn-notes-page', async () => {
    const services = stubServices({ getMyWorkspaces: async () => [], getMembers: async () => [] });
    render(
      <Providers services={services}>
        <NotesPage />
      </Providers>,
    );
    const notesDiv = await screen.findByTestId('notes-page');
    expect(notesDiv.closest('main')).toHaveClass('gn-shell', 'gn-shell--wide', 'gn-notes-page');
  });

  /**
   * 13.1486 — the editor area has a real MINIMUM height (owner: "the height
   * should also be enough to feel like its a note"), reusing
   * `--app-nav-offset` (globals.css `:root`) with its own `0px` fallback
   * rather than a second magic number for the same fact.
   *
   * AMENDED 2026-10-02 (UX fixes T9, 23.162, audit NP-04): the floor moved OFF the
   * `.gn-notes__editor` wrapper (where it was an invisible band under a 134px
   * field) onto the visible field, `.gn-notes__editor .ticket-editor .ticket-editor__content`.
   * 23.162 is the case that pins the wrapper's absence; this keeps the field's derivation.
   */
  it('13.1486 the visible editor field carries a min-height built from --app-nav-offset (AMENDED: no longer the wrapper)', () => {
    const rule = declarationsFor(CSS, '.gn-notes__editor .ticket-editor .ticket-editor__content');
    expect(rule).not.toBeNull();
    expect(rule ?? '').toMatch(/min-height:\s*max\(40dvh,\s*calc\(100dvh - var\(--app-nav-offset,\s*0px\)/);
    expect(declarationsFor(CSS, '.gn-notes__editor') ?? '').not.toMatch(/min-height/);
  });

  /**
   * 13.1489 — Confluence-style inner padding on the document column (owner:
   * "take inspiration from confluence").
   */
  it('13.1489 .gn-notes__document carries clamp()-based horizontal padding', () => {
    const rule = declarationsFor(CSS, '.gn-notes__document');
    expect(rule).not.toBeNull();
    expect(rule ?? '').toMatch(/padding:\s*0\s+clamp\(/);
  });
});

/**
 * 13.1490 — `.gn-notes__toc` (owner: "a small floating icon at the left
 * bottom of the screen") — the SAME `<aside aria-label="On this page">` case
 * 18.181 already requires present with no note open now DOUBLES as the
 * floating launcher's fixed container, instead of the removed
 * display:none/64rem pair. `z-index: 30` matches `.gn-select__panel`/
 * `.gn-popover`'s own tier (`packages/ui/src/ui.css`) — below
 * `.gn-dialog__scrim`/`.gn-sheet__scrim` (40) and `.gn-toast-layer` (60), as
 * the brief requires.
 */
describe('13.1490 .gn-notes__toc is the floating launcher’s fixed container', () => {
  it('is fixed, bottom-left, safe-area aware, and below the dialog/toast tiers', () => {
    const rule = declarationsFor(CSS, '.gn-notes__toc');
    expect(rule).not.toBeNull();
    const body = rule ?? '';
    expect(body).toMatch(/position:\s*fixed;/);
    expect(body).toMatch(/left:/);
    expect(body).toMatch(/bottom:/);
    expect(body).toMatch(/env\(safe-area-inset-/);
    expect(body).toMatch(/z-index:\s*30;/);
    // Below the dialog/sheet scrim (40) and the toast layer (60) — never above.
    const zIndexMatch = /z-index:\s*(\d+);/.exec(body);
    expect(zIndexMatch).not.toBeNull();
    expect(Number(zIndexMatch![1])).toBeLessThan(40);
  });
});

/**
 * 18.302 — Unit 6b (owner, 2026-09-23: "Any Author should not be 2 lines").
 * `.gn-select__trigger`'s own `width: 100%` shrinks it below its label's
 * natural width as a bare flex item of `.gn-notes__filters`, wrapping the
 * text — the Select component is otherwise right (every other mount gives
 * it a constrained container), so the fix is scoped to this row rather than
 * to the shared component.
 */
describe('18.302 the notes filters keep each Select label on one line', () => {
  it('18.302 the search input takes the remaining width; the filter group refuses to shrink and each trigger refuses to wrap', () => {
    const input = declarationsFor(CSS, '.gn-notes__search-input');
    expect(input, '.gn-notes__search-input rule').not.toBeNull();
    expect(input).toMatch(/flex:\s*1 1 auto;/);
    expect(input).toMatch(/min-width:\s*0;/);

    const filters = declarationsFor(CSS, '.gn-notes__filters');
    expect(filters, '.gn-notes__filters rule').not.toBeNull();
    expect(filters).toMatch(/flex:\s*none;/);

    const trigger = declarationsFor(CSS, '.gn-notes__filters .gn-select__trigger');
    expect(trigger, '.gn-notes__filters .gn-select__trigger rule').not.toBeNull();
    // 18.312 relaxed the trigger's `flex: none` to `0 1 auto`: it may now shrink,
    // but only by ellipsis after the row has wrapped (see 18.312) — never a wrap.
    expect(trigger).toMatch(/flex:\s*0 1 auto;/);
    expect(trigger).toMatch(/white-space:\s*nowrap;/);

    // CONTROL: the Select component's OWN base rule is untouched — this is
    // a fix at the notes row, not a change to every mount of `<Select>`.
    const base = declarationsFor(CSS, '.gn-select__trigger');
    expect(base, '.gn-select__trigger base rule (packages/ui, not this file)').toBeNull();
  });
});

/**
 * 18.312 — owner report 2026-09-29 (screenshot): "Any author" rendered ~550px wide
 * and "Any scope" ran past the right edge. `.gn-select__trigger` declares
 * `width: 100%` (packages/ui — right for a form row), and inside the unsized,
 * `flex: none` `.gn-notes__filters` that percentage resolves against the group's
 * own max-content width, so EACH trigger came out as wide as BOTH together and
 * the second overflowed. The fix is scoped to this row: `width: auto`, capped,
 * the label ellipsised, the group clamped to its container.
 */
describe('18.312 the notes filter triggers size to their content, not to the filter group', () => {
  it('18.312 the row states width: auto with a cap and an ellipsised label; the shared base keeps width: 100%', () => {
    const trigger = declarationsFor(CSS, '.gn-notes__filters .gn-select__trigger');
    expect(trigger, '.gn-notes__filters .gn-select__trigger rule').not.toBeNull();
    // The rule that fixes it: content width, not a percentage of the group.
    expect(trigger).toMatch(/(?:^|[\s;])width:\s*auto;/);
    // A sane cap so a long author name cannot rebuild the 550px select.
    expect(trigger).toMatch(/max-width:\s*16rem;/);
    // 6b's never-wrap survives; the trigger may only shrink AFTER the row has
    // wrapped, and it does so by ellipsis (below), never by a second line.
    expect(trigger).toMatch(/white-space:\s*nowrap;/);
    expect(trigger).toMatch(/min-width:\s*0;/);

    const label = declarationsFor(CSS, '.gn-notes__filters .gn-select__trigger > :not(.gn-select__chevron)');
    expect(label, 'the value-label rule inside the row').not.toBeNull();
    expect(label).toMatch(/overflow:\s*hidden;/);
    expect(label).toMatch(/text-overflow:\s*ellipsis;/);
    expect(label).toMatch(/min-width:\s*0;/);

    // The group itself never exceeds the row it sits in (390px viewport), and
    // the row can itself shrink to the page (measured: without `min-width: 0` on
    // `.gn-notes__search` its min-content pins the group at 520px on a 390 page).
    expect(declarationsFor(CSS, '.gn-notes__search')).toMatch(/min-width:\s*0;/);
    const filters = declarationsFor(CSS, '.gn-notes__filters');
    expect(filters).toMatch(/max-width:\s*100%;/);

    // CONTROL: `Select`'s own base rule keeps `width: 100%` — every other mount
    // gives the trigger a constrained container and relies on it.
    const UI = readFileSync(join(REPO_ROOT, 'packages/ui/src/ui.css'), 'utf8');
    expect(declarationsFor(UI, '.gn-select__trigger')).toMatch(/width:\s*100%;/);
  });
});

// ── Fixtures shared by 18.225 and 18.226 ────────────────────────────────────

const WS_A = '01J9WSLOGISTICS000000000000';
const P_COLD = '01J9PCOLDROOM00000000000000';
const OPEN_NOTE = '01J9NOTEOPEN0000000000000000';
const GROUP_NOTE = '01J9NOTEGROUP00000000000000';
const DELETED_NOTE = '01J9NOTEDELETED0000000000000';
const DELETED_NOTE_B = '01J9NOTEDELETEDB000000000000';
const TICKET = '01J9TICKET00000000000000000';

function project(id: string, name: string): ProjectRef {
  return { id, name, prefix: 'PJ', archived: false, ticketCount: 0, blockedCount: 0 };
}
function workspace(over: Partial<WorkspaceRef> & { id: string }): WorkspaceRef {
  return {
    name: 'Garo Hills Logistics',
    prefix: 'CC',
    role: 'owner',
    archived: false,
    memberCount: 2,
    nameRestrictedProjectCount: 0,
    projects: [],
    ...over,
  };
}
const WS_A_REF = workspace({ id: WS_A, projects: [project(P_COLD, 'Cold room')] });
const MEMBERS: RosterMember[] = [
  { id: 'u_kiro', name: 'Kiro', role: 'owner' },
  { id: 'u_ana', name: 'Ana Marak', role: 'member' },
];

function body(content: unknown[]) {
  return { type: 'doc', content };
}
function paragraph(text: string) {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}
function heading(level: 1 | 2 | 3, text: string) {
  return { type: 'heading', attrs: { level }, content: [{ type: 'text', text }] };
}

function noteSummary(over: Partial<NoteSummary> & { noteId: string }): NoteSummary {
  return {
    workspaceId: WS_A,
    homeProjectId: '',
    authorId: 'u_kiro',
    title: 'Untitled',
    scope: { mode: 'private' },
    attachedTickets: [],
    deleted: false,
    createdAt: '2026-09-23T06:00:00.000Z',
    updatedAt: '2026-09-23T06:00:00.000Z',
    ...over,
  };
}
function noteDetail(over: Partial<NoteDetail> & { noteId: string }): NoteDetail {
  return { ...noteSummary(over), body: body([paragraph('Empty')]), schemaVersion: 2, ...over };
}

describe('18.225 the TOC lists headings at three or more, and nothing below that', () => {
  /**
   * AMENDED (brand-mark-wide-notes Unit 5) — `NotesPage`'s `<aside>` now
   * wraps `TocLauncher` (13.1479-13.1484) rather than rendering `ReadingTOC`
   * directly, so the rail is no longer visible without a click: opening the
   * launcher button is now part of proving the wiring, not a change to what
   * is proven. `extractReadingMeta` (packages/editor, case 9.288) already
   * gates `ReadingTOC` at three headings, and `TocLauncher` re-gates its
   * OWN button on the exported `MIN_HEADINGS` (13.1478/13.1479) — this case
   * proves the WIRING built here reaches both: `NoteDocument`'s
   * heading-reporting effect, up through `onHeadingsChange`, into
   * `NotesPage`'s `<aside>`. A doc with three `heading` nodes shows the
   * button, and opening it shows the rail; one with two shows neither.
   *
   * Mutation: drop `onHeadingsChange={setHeadings}` from `NotesPage`'s
   * `<NoteDocument .../>` call — headings never reach the TOC, and BOTH arms
   * below go red (the three-heading arm finds no button to click, and the
   * two-heading arm's "no button" assertion is no longer proof of the gate).
   */
  it('three headings render the launcher button, opened it shows the rail; two render no button at all', async () => {
    const user = userEvent.setup();
    const threeHeadingsNote = noteDetail({
      noteId: OPEN_NOTE,
      title: 'Cold room log',
      body: body([heading(1, 'Overview'), paragraph('x'), heading(2, 'Readings'), paragraph('y'), heading(2, 'Actions'), paragraph('z')]),
    });
    const services = stubServices({
      getMyWorkspaces: async () => [WS_A_REF],
      getMembers: async () => MEMBERS,
      getNote: async (_ws, id) => (id === OPEN_NOTE ? threeHeadingsNote : null),
      getNotes: async () => [],
      getDeletedNotes: async () => [],
    });
    const first = render(
      <Providers services={services}>
        <NotesPage noteId={OPEN_NOTE} />
      </Providers>,
    );
    await screen.findByTestId('note-document');
    const launcher = await screen.findByRole('button', { name: 'On this page' });
    await user.click(launcher);
    await waitFor(() => expect(screen.getAllByRole('link', { name: /Overview|Readings|Actions/ })).toHaveLength(3));
    first.unmount();

    // CONTROL — the same wiring, two headings: no launcher button at all,
    // which is the STRONGER, already-verified `TocLauncher` gate (13.1479)
    // rather than merely "the rail's own links are absent".
    const twoHeadingsNote = noteDetail({
      noteId: OPEN_NOTE,
      title: 'Cold room log',
      body: body([heading(1, 'Overview'), paragraph('x'), heading(2, 'Readings'), paragraph('y')]),
    });
    const services2 = stubServices({
      getMyWorkspaces: async () => [WS_A_REF],
      getMembers: async () => MEMBERS,
      getNote: async (_ws, id) => (id === OPEN_NOTE ? twoHeadingsNote : null),
      getNotes: async () => [],
      getDeletedNotes: async () => [],
    });
    const { unmount } = render(
      <Providers services={services2}>
        <NotesPage noteId={OPEN_NOTE} />
      </Providers>,
    );
    await screen.findAllByTestId('note-document');
    // A settling window equal to the one the positive arm needed, so the
    // control is not merely "asked before the effect could have run".
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(screen.queryByRole('button', { name: 'On this page' })).toBeNull();
    unmount();
  });
});

describe('18.226 every class the Notes page renders is a class globals.css styles, and the reverse', () => {
  /**
   * THE MAXIMAL FIXTURE. No single `NotesPage` render can show every
   * conditional class at once (search replaces the tree; a deleted note's
   * banner needs a DIFFERENT open note than the badges/history arms) — so
   * this drives ONE populated page through every surface Task 9 (and the
   * tasks before it) can draw, snapshotting the rendered class set after
   * each state change, then unions two small supplementary renders for the
   * states that genuinely cannot coexist with the rest.
   */
  // 20 s, not vitest's default 5 s (flake 18.226, BRIEF-flake-18226-timeout-2026-10-02): this one `it` drives a whole populated page
  // through every state and asserts a class SET, never a duration. Under machine load (load average 60-72) it took 2203 ms at 5211eee4
  // and 4139 ms at the release tip against 846 ms when quiet, and timed out in 3 of 5 full web runs and once in a gate (G0, 07:32).
  // The global `testTimeout` is unchanged and no other test is touched.
  it('the two sets are EQUAL — a rename on either side reddens here', async () => {
    const user = userEvent.setup();
    const seen = new Set<string>();
    const snap = (container: HTMLElement) => {
      for (const c of renderedClasses(container)) seen.add(c);
    };

    let refuseType: string | null = null;
    const openNote = noteDetail({
      noteId: OPEN_NOTE,
      title: 'Compressor log',
      attachedTickets: [{ ticketId: TICKET, projectId: P_COLD, key: 'CCSO-1183', title: 'Renew the trade licence' }],
      body: body([paragraph('Compressor stopped')]),
    });
    const groupNote = noteSummary({ noteId: GROUP_NOTE, homeProjectId: P_COLD, title: 'Freezer audit' });
    const deletedNote = noteSummary({ noteId: DELETED_NOTE, title: 'Old draft', deleted: true });

    const services = stubServices({
      getMyWorkspaces: async () => [WS_A_REF],
      getMembers: async () => MEMBERS,
      getNote: async (_ws, id) => (id === OPEN_NOTE ? openNote : null),
      getNotes: async () => [{ ...openNote }, groupNote],
      getDeletedNotes: async () => [deletedNote],
      getNoteHistory: async () => [{ eventId: 'ev_1', authorId: 'u_kiro', recordedAt: '2026-09-23T08:00:00.000Z', seq: 2 }],
      getNoteVersion: async () => body([paragraph('An earlier version')]),
      searchNotes: async (_ws, text, options) =>
        text === 'zzzz'
          ? { notes: [] }
          : {
              notes: [
                {
                  noteId: GROUP_NOTE,
                  title: 'Freezer audit',
                  snippet: 'The **compressor** failed overnight',
                  homeProjectId: P_COLD,
                  scopeMode: 'private' as const,
                  attachedTicketKeys: ['CCSO-9'],
                  authorId: 'u_kiro',
                  updatedAt: '2026-09-23T09:00:00.000Z',
                  source: options.mode,
                },
              ],
              corrected: options.mode === 'lexical' ? ['compressor'] : undefined,
            },
    });
    services.dataSource.ingest = async (events: SubmittedEvent[]) => {
      const type = events[0]?.type;
      if (type === refuseType) {
        return events.map((event) => ({
          status: 'refused' as const,
          eventId: event.id,
          rule: 'x',
          reason: 'Not allowed right now.',
        }));
      }
      return events.map((event) => ({
        status: 'committed' as const,
        eventId: event.id,
        seq: 1,
        serverTime: '2026-09-23T09:00:00.000Z',
      }));
    };

    const { container, unmount: unmountMain } = render(
      <Providers services={services}>
        <NotesPage noteId={OPEN_NOTE} />
      </Providers>,
    );
    await screen.findByTestId('note-document');
    snap(container); // header, bar, body, tree, tree-head, filter, rows/row/row-item/row-title/keys/key,
    // group/group-title, deleted/restore button, session-absent, editor,
    // title, byline, author, edited, scope/scope-wrap, badges, reading-time,
    // byline-actions, toc(wrapper), search/search-input/filters.

    // New note → dialog, then a refused Create → dialog-failure.
    await user.click(screen.getByRole('button', { name: 'Create note' }));
    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Draft');
    refuseType = 'note.created';
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(container.querySelector('.gn-notes__dialog-failure')).not.toBeNull());
    snap(container); // dialog, field, field-label, input, dialog-actions, dialog-failure
    refuseType = null;
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    // History → the list, then a version.
    await user.click(screen.getByRole('button', { name: 'History' }));
    await screen.findByTestId('history-list');
    await waitFor(() => expect(screen.queryAllByTestId(/^history-row-/).length).toBeGreaterThan(0));
    snap(container); // history-list, history-row
    await user.click(screen.getAllByTestId(/^history-row-/)[0]!);
    await waitFor(() => expect(container.querySelector('.gn-notes__history-version')).not.toBeNull());
    snap(container); // history-version, history-banner, history-actions
    await user.click(screen.getByRole('button', { name: 'Close sheet' }));

    // The scope chip → the popover → Specific people → a refused write.
    await user.click(screen.getByTestId('note-scope'));
    const scopePopover = await screen.findByRole('dialog', { name: 'Change who can see this note' });
    await user.click(within(scopePopover).getByRole('button', { name: /Scope/ }));
    await user.click(await screen.findByRole('option', { name: 'Specific people' }));
    await user.click(within(scopePopover).getByRole('checkbox', { name: /Ana/ }));
    refuseType = 'note.scope_set';
    await user.click(screen.getByRole('button', { name: 'Save audience' }));
    // The popover is portaled to `document.body` (`Popover`'s own
    // `createPortal`), so it is a SIBLING of `container`, not a descendant —
    // `container.querySelector` cannot see it.
    await waitFor(() => expect(scopePopover.querySelector('.gn-notes__scope-failure')).not.toBeNull());
    snap(scopePopover); // scope-editor, scope-failure (scope/scope-wrap already in snap #1)
    refuseType = null;

    // The tree's Deleted group → a refused Restore.
    refuseType = 'note.restored';
    await user.click(screen.getByRole('button', { name: 'Restore Old draft' }));
    await waitFor(() => expect(container.querySelector('.gn-notes__restore-failure')).not.toBeNull());
    snap(container); // restore-failure
    refuseType = null;

    // Search: a query with hits (results/result/result-title/snippet/mark's
    // classes are not gn-notes-prefixed, so the mark itself is out of scope)
    // and corrected, then a query with none.
    await user.type(screen.getByTestId('notes-search'), 'compressor');
    await waitFor(() => expect(container.querySelector('.gn-notes__results')).not.toBeNull(), { timeout: 2000 });
    snap(container); // search-results, corrected, results, result, result-title, snippet
    await userEvent.clear(screen.getByTestId('notes-search'));
    await user.type(screen.getByTestId('notes-search'), 'zzzz');
    await waitFor(() => expect(container.querySelector('.gn-notes__no-results')).not.toBeNull(), { timeout: 2000 });
    snap(container); // no-results
    await userEvent.clear(screen.getByTestId('notes-search'));
    unmountMain();

    // ── Supplementary renders: states that cannot coexist with the above ──
    // Each one unmounts before the next starts — `screen` binds to
    // `document.body`, so a still-mounted render would leave two matches for
    // every role query the next render issues.

    // A DELETED note open (as its own author): the banner.
    const deletedOpenServices = stubServices({
      getMyWorkspaces: async () => [WS_A_REF],
      getMembers: async () => MEMBERS,
      getNote: async (_ws, id) => (id === DELETED_NOTE_B ? noteDetail({ noteId: DELETED_NOTE_B, title: 'Gone', deleted: true }) : null),
      getNotes: async () => [],
      getDeletedNotes: async () => [],
    });
    const deletedRender = render(
      <Providers services={deletedOpenServices}>
        <NotesPage noteId={DELETED_NOTE_B} />
      </Providers>,
    );
    await screen.findByText('This note was deleted');
    snap(deletedRender.container); // deleted-banner
    deletedRender.unmount();

    // A note that opens over a recovered draft (its own author): the draft banner.
    window.localStorage.setItem(
      'gn.note-draft.u_kiro.' + OPEN_NOTE,
      JSON.stringify({ doc: body([paragraph('kept on this device')]), at: Date.now() }),
    );
    const draftRender = render(
      <Providers
        services={stubServices({
          getMyWorkspaces: async () => [WS_A_REF],
          getMembers: async () => MEMBERS,
          getNote: async (_ws, id) =>
            id === OPEN_NOTE ? noteDetail({ noteId: OPEN_NOTE, updatedAt: '2020-01-01T00:00:00.000Z' }) : null,
          getNotes: async () => [],
          getDeletedNotes: async () => [],
        })}
      >
        <NotesPage noteId={OPEN_NOTE} />
      </Providers>,
    );
    await screen.findByTestId('draft-restore-banner');
    snap(draftRender.container); // draft-banner
    draftRender.unmount();
    window.localStorage.clear();

    // No workspace at all: the empty tree, and the Create button it still
    // draws (spec §9.7) opened on an empty roster — dialog-empty.
    const emptyServices = stubServices({ getMyWorkspaces: async () => [], getMembers: async () => [] });
    const emptyRender = render(
      <Providers services={emptyServices}>
        <NotesPage />
      </Providers>,
    );
    await screen.findByText('No notes yet');
    await user.click(screen.getByRole('button', { name: 'Create note' }));
    await screen.findByText(/not in a workspace yet/);
    snap(emptyRender.container); // empty, dialog, dialog-empty, hint (NO_NOTE_COPY)
    emptyRender.unmount();

    // Loading: the workspaces read never lands.
    const loadingRender = render(
      <Providers services={stubServices({ getMyWorkspaces: () => new Promise(() => {}) })}>
        <NotesPage />
      </Providers>,
    );
    await screen.findByText('Loading…');
    snap(loadingRender.container); // loading
    loadingRender.unmount();

    // Signed out.
    mockSessionUser = null;
    const signedOutRender = render(
      <Providers services={stubServices({})}>
        <NotesPage />
      </Providers>,
    );
    await waitFor(() => expect(signedOutRender.container.querySelector('.gn-notes__session')).not.toBeNull());
    snap(signedOutRender.container); // session
    signedOutRender.unmount();

    const rendered = [...seen].sort();
    const styled = styledClasses(CSS);

    // The walks really walked.
    expect(rendered.length).toBeGreaterThan(30);
    expect(styled.length).toBeGreaterThan(30);

    // NEITHER LIST IS TYPED HERE — see the inbox scanner's own docblock for why.
    expect(rendered).toEqual(styled);
  });

  it('the one data-attribute globals.css keys a .gn-notes rule on is really rendered', async () => {
    const services = stubServices({
      getMyWorkspaces: async () => [WS_A_REF],
      getMembers: async () => MEMBERS,
      getNotes: async () => [],
      getDeletedNotes: async () => [],
    });
    const { container } = render(
      <Providers services={services}>
        <NotesPage />
      </Providers>,
    );
    await within(container).findByRole('navigation', { name: 'Notes' });
    // `data-style` is the document's own style switch (on <html>, read by every `[data-style="neo"] …` rule, G-2 25.324), not a
    // thing this page renders; the one attribute a Notes rule keys on is the drawer's `data-open`.
    const styled = styledAttributes(CSS).filter((attribute) => attribute !== 'data-style');
    expect(styled).toEqual(['data-open']);
    const rendered = [...container.querySelectorAll<HTMLElement>('*')].flatMap((el) =>
      el.getAttributeNames().filter((name) => name.startsWith('data-')),
    );
    for (const attribute of styled) expect(rendered).toContain(attribute);
  });
});

/**
 * 18.480–18.484 — the notes page scrolls its TREE and its DOCUMENT separately
 * above 60rem (owner, 2026-09-30: "the gn-notes-tree and the gn-notes__document
 * should have separate scrolls").
 *
 * jsdom lays nothing out, so this is the CSS CONTRACT: which rules exist above the
 * breakpoint, and that none of them exist at or below it. What scrolling then
 * DOES (the tree's `scrollTop` and `window.scrollY` stay 0 while the document
 * scrolls, and vice versa) is the 🧪 browser cases 18.490–18.493.
 */
function wideBody(): string {
  const blocks = mediaBlocksTouching(CSS, 'gn-notes');
  const wide = blocks.find((b) => b.condition === 'width > 60rem');
  expect(wide, 'a `@media (width > 60rem)` block touching .gn-notes').toBeDefined();
  return wide!.body;
}

/** The declarations of `selector` INSIDE a media block's body (rules there are indented, so `declarationsFor` cannot read them). */
function ruleIn(body: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(body);
  expect(rule, `${selector} inside the block`).not.toBeNull();
  return rule?.[1] ?? '';
}

describe('18.480 the tree scrolls on its own above 60rem', () => {
  /** MUTATION TARGET: delete `overflow-y: auto` from `.gn-notes__tree` in the `width > 60rem` block. */
  it('18.480 .gn-notes__tree is overflow-y: auto and contains its overscroll there; CONTROL: its base rule scrolls nothing, so at and below 60rem the page scrolls as one', () => {
    const tree = ruleIn(wideBody(), '.gn-notes__tree');
    expect(tree).toMatch(/overflow-y:\s*auto;/);
    expect(tree).toMatch(/overscroll-behavior:\s*contain;/);
    // CONTROL (same `it`): the same scan reads the document's rule too, and the tree's base rule is scroll-free.
    expect(ruleIn(wideBody(), '.gn-notes__document')).toMatch(/overflow-y:\s*auto;/);
    expect(declarationsFor(CSS, '.gn-notes__tree') ?? '').not.toMatch(/overflow/);
  });
});

describe('18.481 the document scrolls on its own above 60rem', () => {
  /** MUTATION TARGET: delete `overflow-y: auto` from `.gn-notes__document` in the `width > 60rem` block. */
  it('18.481 .gn-notes__document is overflow-y: auto and contains its overscroll there, with room under the last line; CONTROL: its base rule scrolls nothing', () => {
    const document_ = ruleIn(wideBody(), '.gn-notes__document');
    expect(document_).toMatch(/overflow-y:\s*auto;/);
    expect(document_).toMatch(/overscroll-behavior:\s*contain;/);
    expect(document_).toMatch(/padding-bottom:/); // the shell's own bottom padding is zeroed below, so the last line needs its own
    expect(ruleIn(wideBody(), '.gn-notes__tree')).toMatch(/overflow-y:\s*auto;/); // CONTROL: the sibling is found by the same scan
    const base = declarationsFor(CSS, '.gn-notes__document') ?? '';
    expect(base).toMatch(/padding:\s*0\s+clamp\(/); // the existing rule is what the control reads
    expect(base).not.toMatch(/overflow/);
  });
});

describe('18.482 the page fills the viewport below the bar, so the PAGE does not scroll', () => {
  /**
   * The bar's height is `--app-nav-offset` (`:root`, hand-set 4.35rem and already what
   * `.gn-notes__editor`'s `min-height` and the heading `scroll-margin-top` use) — the
   * token, never a second number. The shell's own `padding-bottom: 3rem` would leave
   * exactly that much page scroll, so it is zeroed on the notes `<main>`.
   * MUTATION TARGET: `var(--app-nav-offset)` → `4.35rem`, or drop the shell padding reset.
   */
  it('18.482 .gn-notes is a flex column of 100dvh minus the bar, the body takes the rest on a zero-floor row, and the shell padding is 0', () => {
    const body = wideBody();
    const notes = ruleIn(body, '.gn-notes');
    expect(notes).toMatch(/display:\s*flex;/);
    expect(notes).toMatch(/flex-direction:\s*column;/);
    expect(notes).toMatch(/height:\s*calc\(100dvh - var\(--app-nav-offset\)\);/);
    const rows = ruleIn(body, '.gn-notes__body');
    expect(rows).toMatch(/flex:\s*1;/);
    expect(rows).toMatch(/min-height:\s*0;/);
    // A bare auto row is sized by its content and would push the columns past the viewport instead of scrolling.
    expect(rows).toMatch(/grid-template-rows:\s*minmax\(0,\s*1fr\);/);
    // Scoped to the notes page since UX fixes Task 3 (case 23.040): the project page and the workflow editor wear `.gn-shell--wide` too.
    expect(ruleIn(body, '.gn-notes-page.gn-shell--wide')).toMatch(/padding-bottom:\s*0;/);
    // CONTROL (same `it`): the token this leans on is the one the bar's other readers use, and it is defined.
    expect(stripComments(CSS)).toMatch(/:root\s*\{\s*--app-nav-offset:\s*4\.35rem;\s*\}/);
    expect(body).not.toMatch(/4\.35rem/);
  });
});

describe('18.483 at and below 60rem NOTHING changes', () => {
  /**
   * MUTATION TARGET: add `overflow-y: auto` to the BASE `.gn-notes__document` rule (or to
   * the `max-width: 60rem` block) — the page would then scroll in two places on a phone.
   */
  it('18.483 no region scrolls, fills the viewport or is pinned outside the wide block; the two conditions are exact complements; CONTROL: the narrow block still holds the drawer rules', () => {
    const blocks = mediaBlocksTouching(CSS, 'gn-notes');
    // AMENDED 2026-10-01 (mobile-web Task 9): the middle entry is the shared 40rem phone arm; it reads only
    // `blocks[0]` below, so the phone arm's no-scroll / no-height rule is held by 21.130's `phoneBodies` loop
    // (`phone-screens-b.test.ts`) instead.
    expect(blocks.map((b) => b.condition)).toEqual(['max-width: 60rem', 'max-width: 40rem', 'width > 60rem']);
    const narrow = blocks[0]!.body;
    expect(narrow).toMatch(/\.gn-notes__tree--drawer\s*\{[^}]*display:\s*none;/); // CONTROL: this is the block that matters
    expect(narrow).not.toMatch(/overflow|overscroll|100dvh|min-height|grid-template-rows|flex:|scroll-margin/);

    // The base rules the two regimes share carry nothing that would scroll or pin the page.
    for (const selector of ['.gn-notes', '.gn-notes__body', '.gn-notes__tree', '.gn-notes__document']) {
      const base = declarationsFor(CSS, selector);
      expect(base, selector).not.toBeNull();
      expect(base ?? '', selector).not.toMatch(/overflow|overscroll|100dvh|grid-template-rows|display:\s*flex|flex:/);
    }
  });
});

describe('18.484 a jump inside the column lands 1rem under ITS top, not under a bar that is not over it', () => {
  /**
   * `.gn-notes__editor` headings carry `scroll-margin-top: calc(var(--app-nav-offset) + 1rem)`
   * because the sticky bar sits OVER a window-scrolled page. Above 60rem the column starts
   * below the bar, so keeping the bar's offset would land every table-of-contents jump and
   * `#heading` link about 70px low. MUTATION TARGET: delete the override from the wide block.
   */
  it('18.484 the wide block resets the heading scroll-margin to 1rem; CONTROL: the base rule (narrow, window-scrolled) still clears the bar', () => {
    const heading = /\.gn-notes__editor :is\(h1, h2, h3, h4, h5, h6\)/;
    expect(ruleIn(wideBody(), '.gn-notes__editor :is(h1, h2, h3, h4, h5, h6)')).toMatch(/scroll-margin-top:\s*1rem;/);
    expect(stripComments(CSS)).toMatch(
      new RegExp(`${heading.source}\\s*\\{\\s*scroll-margin-top:\\s*calc\\(var\\(--app-nav-offset,\\s*0px\\)\\s*\\+\\s*1rem\\);`),
    );
  });
});

describe('18.486 the wide block is declared AFTER every rule it overrides', () => {
  /**
   * A media query adds no specificity, so `@media (width > 60rem) { .x { … } }` beats an earlier
   * `.x { … }` and LOSES to a later one — the same tie 13.1485 pins for `.gn-shell--wide` (whose notes-only padding, `.gn-notes-page.gn-shell--wide`, is the one wide-block rule with no base rule). The heading
   * `scroll-margin-top` base rule sits in the KB-parity section near the end of the file; a wide block
   * filed earlier (where the first cut of it was) is silently ignored and every jump lands ~86px low,
   * while the TEXT of the override is still present, so 18.484 alone cannot see it.
   * MUTATION TARGET: move the wide block above the base heading rule (or above any base `.gn-notes*` rule).
   */
  it('18.486 every selector the wide block sets has all its other declarations BEFORE the block; CONTROL: the scan finds each base rule at least once', () => {
    const stripped = stripComments(CSS);
    const start = stripped.indexOf('@media (width > 60rem)');
    expect(start).toBeGreaterThan(-1);
    const selectors = ['.gn-notes', '.gn-notes__body', '.gn-notes__tree', '.gn-notes__document', '.gn-notes__editor :is(h1, h2, h3, h4, h5, h6)'];
    for (const selector of selectors) {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const base = [...stripped.matchAll(new RegExp(`^${escaped}\\s*\\{`, 'gm'))].map((m) => m.index ?? -1);
      expect(base.length, `a base rule for ${selector}`).toBeGreaterThan(0); // CONTROL: the scan is not vacuous
      for (const index of base) expect(index, `${selector} base rule at ${index} is AFTER the wide block at ${start}`).toBeLessThan(start);
    }
  });
});

describe('18.487 each scroller is the containing block of the absolute nodes inside it', () => {
  /**
   * N1b (measured in a real browser, 2026-09-30): the page still scrolled at 1280px
   * (`scrollHeight` 6271 vs `innerHeight` 725) and a TOC click moved the WINDOW 155.5px. The node
   * doing it is `TicketEditorSlot`'s visually-hidden `disabledReason` span
   * (`packages/editor/src/components/TicketEditorSlot.tsx`, `id={useId()}`, an INLINE
   * `position: absolute`): the notes editor mounts the slot with no `submit`, so the span renders on
   * every note, and nothing above it was positioned (`.editor-slot` clips but is not a containing
   * block). An absolute box escapes the overflow of every ancestor that is not its containing block,
   * so it sat at its static position at the bottom of the note and stretched the PAGE.
   * `.editor-slot__attach-input` is a second instance of the same shape.
   * THIS SCANS THE STYLESHEET, so it cannot see an inline-styled culprit — it pins the cure instead:
   * a scroller that is `position: relative` is the containing block for, and clips, every absolute
   * descendant whatever styled it. On `.gn-notes` alone it would not work (it does not clip, so the
   * node still overflows it and still extends the page). `position: relative` creates no containing
   * block for `position: fixed`, so the popups, the TOC launcher and the progress bar keep anchoring
   * to the viewport. Whether the window is now unscrollable is the 🧪 case 18.490.
   * MUTATION TARGET: delete `position: relative` from either rule in the `width > 60rem` block.
   */
  it('18.487 .gn-notes__document and .gn-notes__tree are position: relative in the wide block and nowhere else; CONTROL: both are also the scrollers, and .gn-notes is not the fix', () => {
    const wide = wideBody();
    for (const selector of ['.gn-notes__document', '.gn-notes__tree']) {
      expect(ruleIn(wide, selector), `${selector} in the wide block`).toMatch(/position:\s*relative;/);
      // Nothing changes at or below 60rem: the base rule is not positioned either.
      expect(declarationsFor(CSS, selector) ?? '', `${selector} base rule`).not.toMatch(/position:/);
    }
    const narrow = mediaBlocksTouching(CSS, 'gn-notes').find((b) => b.condition === 'max-width: 60rem');
    expect(narrow, 'the max-width: 60rem block').toBeDefined();
    expect(narrow!.body).not.toMatch(/\.gn-notes__(?:tree|document)[^{]*\{[^}]*position:/);
    // CONTROL (same `it`): the containing blocks are the very rules that scroll, and `.gn-notes` is not
    // made `position: relative` instead — it does not clip, so that would not stop the page scrolling.
    expect(ruleIn(wide, '.gn-notes__document')).toMatch(/overflow-y:\s*auto;/);
    expect(ruleIn(wide, '.gn-notes__tree')).toMatch(/overflow-y:\s*auto;/);
    expect(ruleIn(wide, '.gn-notes')).not.toMatch(/position:/);
  });
});
