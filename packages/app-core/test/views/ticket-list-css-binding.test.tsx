import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fireEvent, render } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TicketList } from '../../src/views/ticket-list.js';
import type { GroupLabels } from '../../src/views/list-model.js';
import {
  DEFAULT_VIEW_PREFS,
  type Grouping,
  type ListColumnId,
  type ListRow,
  type ProjectViewPrefs,
} from '../../src/view-types.js';
import { claim, listRowSeed } from '../helpers/seed.js';

/**
 * 13.671 — THE LIST'S `.gn-list*` CLASSES AND THE RULES THAT STYLE THEM ARE ONE
 * FACT SPELLED IN TWO PACKAGES, AND THE DECLARATIONS THIS RESTYLE TURNS ON ARE
 * READ OUT OF `ui.css` RATHER THAN ASSUMED.
 *
 * WHY THIS FILE EXISTS, exactly. `ticket-list.test.tsx`'s block docblock used to
 * say the visual half of the restyle was "held by `packages/ui/test/
 * components.test.tsx` and `apps/web/e2e-viewport/`". MEASURED, that was FALSE:
 * neither suite names a single `.gn-list__*` selector. Every `it` in the ui file
 * names another block, and the viewport sweeps never open this tab at all (the
 * project page defaults to the board). The false claim sat above
 * `.gn-list__columns-tray[hidden] { display: none }` — a rule that could have
 * been deleted with every suite in this repo green while the tray stopped
 * closing in a real browser, because the component closes the tray with the
 * `hidden` ATTRIBUTE and `display: flex` outranks the UA sheet's treatment of
 * it. So this file is the thing the old sentence pointed at, and it reads the
 * declarations rather than describing them.
 *
 * WHAT IT CAN AND CANNOT SEE. It is declaration-level: it proves the rule exists
 * and says the right thing, and it proves the classes and attributes the rules
 * key on are really produced by the component. It measures NO COMPUTED result —
 * there is no browser here — so a declaration that is present and then
 * overridden, or a token that resolves to a colour nobody wanted, is still
 * invisible. That residual gap is named rather than papered over, and closing it
 * needs a viewport sweep for this tab, which does not exist.
 *
 * THE TECHNIQUE IS `test/inbox/inbox-css-binding.test.tsx` (11.95), which laid
 * it down for the inbox in the same package. Two differences, both deliberate:
 * the class walk below is a UNION ACROSS SEVERAL RENDERS (this component draws
 * its controls, its pinned surface, its sections and its empty sentence under
 * different conditions, and one render cannot be the maximal fixture the way the
 * inbox's one tree could), and the comparison is EQUALITY in both directions
 * with the unstyled half NAMED, so a class that stops being styled and a class
 * that stops being rendered are both red rather than one of them being silence.
 */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

/**
 * Comments stripped FIRST: a class named only inside a CSS comment is styled by
 * nothing, and leaving comments in would let a DELETED rule keep this file green
 * out of its own explanatory prose — the `.gn-list__columns-tray[hidden]` rule
 * carries a paragraph of it right above.
 */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Every `gn-list…` class NAMED IN A SELECTOR, sorted and deduplicated. */
function styledClasses(css: string): string[] {
  const hits = [...stripComments(css).matchAll(/\.(gn-list[A-Za-z0-9_-]*)/g)].flatMap(
    (hit) => hit[1] ?? [],
  );
  return [...new Set(hits)].sort();
}

/** Every `gn-list…` class actually on an element in a rendered tree. */
function renderedClasses(root: ParentNode): string[] {
  const hits = [...root.querySelectorAll<HTMLElement>('*')].flatMap((element) =>
    [...element.classList].filter((name) => name.startsWith('gn-list')),
  );
  return [...new Set(hits)].sort();
}

/**
 * The declarations of the rule whose selector list is EXACTLY `selector`, or
 * `null` when no rule starts that way. Anchored at a line start — borrowed from
 * `packages/ui/test/in-transit.test.ts` via the inbox file — so
 * `.gn-list__collapse` cannot match the two-selector rule it shares with
 * `.gn-list__open` and cannot match inside a longer selector; the pinning below
 * depends on that, since the length this file asserts is NOT on the shared rule.
 */
function declarationsFor(css: string, selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const stripped = stripComments(css);
  const head = new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, 'gm');
  for (const match of stripped.matchAll(head)) {
    // ⚠ A SELECTOR LIST IS NOT "EXACTLY" EITHER OF ITS MEMBERS, and the
    // line-start anchor above does NOT capture that on its own. It happens to
    // work for `.gn-list__collapse`, whose shared-rule line ends in a comma
    // (`.gn-list__collapse,`) and so cannot match `^\.gn-list__collapse\s*\{` —
    // **and it silently fails for `.gn-list__open`, whose shared-rule line IS
    // `^\.gn-list__open {`**, returning the two-head rule's body instead of the
    // specific one's. Nothing read `.gn-list__open` through this function until
    // case 13.1151 did, which is exactly why it went unnoticed: the limitation
    // was written in this docblock as if it were handled, and it was handled for
    // one of the two names. A candidate whose preceding text ends in a comma is
    // a later head of a list, so it is skipped rather than answered with.
    const before = stripped.slice(0, match.index).trimEnd();
    if (before.endsWith(',')) continue;
    return match[1] ?? null;
  }
  return null;
}

const CSS = readFileSync(join(REPO_ROOT, 'packages/ui/src/ui.css'), 'utf8');

describe('13.671 the scanners are proven against planted input before they are trusted', () => {
  it('reads classes out of selectors, ignores commented-out ones, and is not fooled by a prefix', () => {
    const planted = [
      '/* .gn-list__ghost { color: red; } — a rule that was DELETED */',
      '.gn-list { background: var(--gn-surface); }',
      '.gn-list__column-option input[type=\'checkbox\']:checked + .gn-list__column-box { background: var(--gn-accent); }',
      '.gn-timeline__weeks { color: blue; }',
    ].join('\n');
    // `__ghost` absent (comment), `gn-timeline__weeks` absent (wrong prefix), and
    // the compound selector contributes BOTH of its classes.
    expect(styledClasses(planted)).toEqual([
      'gn-list',
      'gn-list__column-box',
      'gn-list__column-option',
    ]);
  });

  it('reads classes off a rendered tree and ignores the host it was handed', () => {
    const host = document.createElement('div');
    host.innerHTML =
      '<div class="gn-list"><span class="gn-list__collapse gn-timeline__weeks"></span></div>';
    // The host itself is not scanned — only descendants — which is why the real
    // fixture below wraps its component in a container it does not own.
    expect(renderedClasses(host)).toEqual(['gn-list', 'gn-list__collapse']);
  });

  it('declarationsFor finds a rule, refuses a selector that merely PREFIXES another, and reports a miss', () => {
    const planted = [
      '.gn-list__columns-tray { display: flex; }',
      '.gn-list__columns-tray[hidden] { display: none; }',
      '.gn-list__collapse,',
      '.gn-list__open { font: inherit; }',
      '.gn-list__collapse { min-width: 1.375rem; }',
    ].join('\n');
    expect(declarationsFor(planted, '.gn-list__columns-tray')).toBe(' display: flex; ');
    expect(declarationsFor(planted, '.gn-list__columns-tray[hidden]')).toBe(' display: none; ');
    // NOT the shared two-selector rule's body: a selector list is not "exactly"
    // either of its members, and answering with that body would make the length
    // assertions below pass against the wrong rule.
    expect(declarationsFor(planted, '.gn-list__collapse')).toBe(' min-width: 1.375rem; ');
    expect(declarationsFor(planted, '.gn-list__nothing')).toBeNull();
  });
});

const LABELS: GroupLabels = {
  epicTitle: (id) => (id === 'epic_reg' ? 'Registrations' : id),
  typeName: (id) => id,
};

/**
 * EVERY column the component can draw, and the fixture's own docblock says why
 * it must be maximal: the class-parity case below compares this render's class
 * set against `ui.css`'s in BOTH directions, so a column missing here would
 * report its cell's class as "styled but rendered by nothing". `priority` joined
 * the list with the Priority column (spec 2026-09-22).
 */
const ALL_COLUMNS: ListColumnId[] = ['status', 'assignee', 'dueDate', 'progress', 'type', 'priority'];

/**
 * THE FIXTURE, and it has to be the MAXIMAL one: every conditional class this
 * component can draw is produced somewhere below, because the equality check in
 * the next describe fails on a class that is styled and never rendered. Read
 * against the component, the conditions are —
 *
 * - `__collapse` / `__caret-spacer` — a row WITH children and a row WITHOUT.
 * - `__assignee` — a row with an assignee; the `Unassigned` arm renders a bare
 *   `<span>` and is deliberately not represented (no class, so nothing to bind).
 * - `__due` / `__empty-cell` — a row with a claimed date and a row with none.
 * - `__section-title` / `__section-meta` — a non-`flat` grouping, which is what
 *   makes `groupMeta` non-null.
 * - `__pinned` — a row assigned to the viewer (`currentUserId` below).
 * - `__origin` — the `default` origin arm, rendered by the SECOND render, since
 *   a project whose halves were both chosen draws no note at all.
 * - `__narrowing` / `__empty` — the third render, which is narrowed and has no
 *   rows and a caller-supplied sentence.
 * - `__row--dragging` / `__row--drop-before` / `__tail-drop` — the FOURTH
 *   render (second wave Task 4), which passes `rowDrag` and is then DRIVEN.
 *   Two of the three exist only mid-gesture — `dragstart` paints
 *   `--dragging` on the source, `dragover` paints `--drop-before` on the row
 *   under the pointer — so a render that merely passed the prop would leave
 *   two styled classes unrendered and the equality check below would be
 *   RIGHT to redden. That is not a hypothetical: this file reddened exactly
 *   that way when the three classes were first added, which is the check
 *   working as designed rather than an inconvenience of it.
 * - `__select` (second wave Task 11) — the row-checkbox cell, drawn only when a
 *   caller supplies `selection`. The FIFTH render passes one.
 * - `__bulk-close` is the ONE class in this union that `TicketList` does not
 *   render itself: it is the class on the control a caller puts in the
 *   `controls` slot, and that slot is the whole reason it exists (`apps/web`'s
 *   List arm is its only consumer today). The fifth render reproduces that node,
 *   because the alternative — leaving it out — would redden the CSS-side case
 *   below for a class that IS rendered in the product, one package up. Named
 *   here rather than silently satisfied, since a reader of the union deserves to
 *   know which of its members the component is not the author of.
 */
const ROWS: ListRow[] = [
  listRowSeed({ ticketId: 'epicA', title: 'Registrations', typeId: 'epic', typeRank: 1 }),
  listRowSeed({
    ticketId: 't2',
    title: 'DLT registration',
    parentId: 'epicA',
    epicId: 'epic_reg',
    stateId: 'doing',
    stateName: 'Doing',
    stateCategory: 'active',
    assignee: { id: 'me', name: 'Kiro' },
    assignedProvenance: claim(),
    dueDate: { date: '2026-08-30', claim: claim({ actorName: 'Kiro', actorId: 'me' }) },
  }),
  listRowSeed({ ticketId: 't3', title: 'Chase the vendor', parentId: 't2', epicId: 'epic_reg' }),
  listRowSeed({
    ticketId: 't5',
    title: 'Done thing',
    stateId: 'done',
    stateName: 'Done',
    stateCategory: 'terminal',
  }),
];

function chose(grouping: Grouping): ProjectViewPrefs {
  return {
    columns: { origin: 'stored', value: ALL_COLUMNS },
    grouping: { origin: 'stored', value: grouping },
  };
}

function listOf(props: Partial<Parameters<typeof TicketList>[0]>) {
  return (
    <TicketList
      rows={ROWS}
      currentUserId="me"
      prefs={DEFAULT_VIEW_PREFS}
      onPrefsChange={vi.fn()}
      labels={LABELS}
      onOpenTicket={vi.fn()}
      {...props}
    />
  );
}

/**
 * The fourth render, DRIVEN (second wave Task 4). Two of the three classes the
 * drag adds exist only while a gesture is in flight, so this one is not enough
 * to pass the prop — it has to start a drag on one row and move it over
 * another. The source is the first row and the target the last, so the two
 * markers land on two DIFFERENT rows in the same tree: a `--dragging` and a
 * `--drop-before` on one element would let a component that painted the wrong
 * one of the two still pass a class-union scan.
 */
function dragGestureRender(): HTMLElement {
  const host = document.createElement('div');
  const { container } = render(listOf({ rowDrag: { onReorder: vi.fn() } }));
  host.append(container);

  const rowFor = (ticketId: string): Element => {
    const row = container.querySelector(`[data-testid="ticket-card-${ticketId}"]`)?.closest('tr');
    if (row === null || row === undefined) throw new Error(`no <tr> for ${ticketId}`);
    return row;
  };

  // jsdom implements neither `DataTransfer` nor `DragEvent`; testing-library
  // attaches whatever is passed straight onto the fired event. Same stand-in
  // shape `ticket-list.test.tsx` (13.705) and `board-drag-drop.test.tsx` use.
  const dataTransfer = {
    setData: () => {},
    getData: () => '',
    effectAllowed: 'uninitialized',
  } as unknown as DataTransfer;

  fireEvent.dragStart(rowFor('epicA'), { dataTransfer });
  fireEvent.dragOver(rowFor('t5'), { dataTransfer });
  return host;
}

/** Every class this component can put on screen, unioned across the conditions. */
function renderEverything(): HTMLElement {
  const host = document.createElement('div');
  // Not `container` from a single `render` call: this scans SEVERAL renders, so
  // it collects them into a host it owns — the same "the host is not scanned"
  // shape the scanner's own planted-input case proves above.
  for (const element of [
    listOf({ prefs: chose('status') }),
    listOf({}),
    listOf({ rows: [], narrowing: 'stateCategories: active', emptyCopy: 'Nothing here.' }),
    // The fifth render (second wave Task 11) — the only one that draws the
    // checkbox cell, and the only one that reproduces the caller's own control
    // in the `controls` slot. See the fixture docblock for why `__bulk-close` is
    // a member of this union that the component does not author.
    listOf({
      selection: { selected: new Set<string>(), onToggle: vi.fn() },
      controls: (
        <button type="button" className="gn-list__bulk-close">
          Close selected (0)
        </button>
      ),
    }),
  ]) {
    host.append(render(element).container);
  }
  host.append(dragGestureRender());
  return host;
}

describe('13.671 every class the List renders is a class ui.css styles, and the unstyled ones are NAMED', () => {
  it('no rendered class is unstyled except the known-inert hooks, which are listed rather than left out', () => {
    // TWO DIRECTIONS, TWO CASES, so a failure names which side of the package
    // boundary moved. This one reddens on a TSX-side rename (a class the
    // component renders that no rule styles) — measured: renaming the spacer to
    // `gn-list__caret-spacer-x` in `ticket-list.tsx` reddens exactly this case.
    const rendered = renderedClasses(renderEverything());
    const styled = styledClasses(CSS);

    // The walks really walked. An empty list on either side would satisfy the
    // comparison below by finding nothing at all — the shape of a scanner whose
    // regex stopped matching after somebody reformatted the stylesheet.
    expect(rendered.length).toBeGreaterThan(20);
    expect(styled.length).toBeGreaterThan(20);

    // NEITHER LIST IS TYPED. Typing the styled names would make this file a THIRD
    // spelling of every class — the duplication this case exists to catch — and a
    // typo in it would read as a component defect. The two sides are compared to
    // each other and to nothing else.
    //
    // The ONE subtraction is the rendered classes that carry no declaration in
    // `ui.css` at all. They are listed rather than left out, because "a rendered
    // class with no rule" is the defect this half of the case is FOR — this
    // task's own review found two of them (`gn-list__columns-text`,
    // `gn-list__column-label`) and they were dropped for being inert. A new one
    // cannot hide: adding a class to the component without a rule changes this
    // list and reddens here.
    const knownInert = [
      // Pre-existing and structural: these four are hooks the component has
      // carried since Task 9 with no declaration behind any of them. (The
      // Group-by wrapper's own `gn-list__control` is NOT here — it is styled, as
      // the ancestor of `.gn-list__control .gn-select__trigger`.)
      'gn-list__empty',
      'gn-list__narrowing',
      'gn-list__pinned',
      'gn-list__section',
      // This restyle's own, and the one that is a TEST HOOK rather than a style:
      // 13.662 reads the section's NAME and its META as two separate spans, and a
      // class is what makes `querySelector` able to address the first of them. It
      // inherits the band's weight and colour, which is the intent — the
      // prototype's own name/meta pair differ by the meta's overrides alone.
      'gn-list__section-name',
    ];
    expect(rendered.filter((name) => !styled.includes(name))).toEqual(knownInert);
  });

  it('and no rule styles a class nothing renders — the CSS-side rename, which the case above cannot see', () => {
    // Measured: renaming `.gn-list__columns-tray[hidden]` to `…-x[hidden]` in
    // `ui.css` leaves the case above green and reddens this one by name. Both
    // directions matter — a rule for a class no element carries is a style that
    // has quietly stopped applying, and nothing else in this repo reads these
    // selectors at all.
    const rendered = renderedClasses(renderEverything());
    const styled = styledClasses(CSS);
    expect(styled.filter((name) => !rendered.includes(name))).toEqual([]);
  });
});

describe('13.671 the tray is closed by CSS the component can rely on, and the caret column is one width', () => {
  it('`hidden` is honoured because the tray declares `display: flex` — BOTH halves, in one shape', () => {
    // Read as ONE SHAPE so a missing rule reads as `null` beside the present one
    // rather than as an absent assertion. The pair is the finding: `hidden` is a
    // UA-sheet rule, and an author `display: flex` beats it at equal
    // specificity, so the `[hidden]` rule is not decoration — deleting it leaves
    // every suite green (measured: nothing else in this repo names a
    // `.gn-list__*` selector) while the tray stops closing in a browser.
    const declarations = [
      '.gn-list__columns-tray',
      '.gn-list__columns-tray[hidden]',
    ].map((selector) => {
      const body = declarationsFor(CSS, selector);
      return { selector, display: body === null ? null : /display:\s*([a-z-]+)/.exec(body)?.[1] };
    });
    expect(declarations).toEqual([
      { selector: '.gn-list__columns-tray', display: 'flex' },
      { selector: '.gn-list__columns-tray[hidden]', display: 'none' },
    ]);
  });

  it('the component really writes that attribute, so the rule above has something to match', () => {
    // The declaration-level check is only half the fact; the other half is the
    // component. 13.661 pins the open/close state by name — this pins the exact
    // ATTRIBUTE the selector keys on, so a component that closed the tray some
    // other way (a class, an unmounted subtree) would leave the CSS rule dead
    // and this case red.
    const { container } = render(listOf({}));
    const tray = container.querySelector('.gn-list__columns-tray');
    expect(tray?.hasAttribute('hidden')).toBe(true);
  });

  it('the spacer and the caret are the SAME width — an absolute anchor beside the relative one', () => {
    // `.gn-list__caret-spacer` reserves the caret's column for a row that has no
    // caret, which is the only thing making a leaf start at the same x as its
    // parent. It is a RELATIVE fact (two lengths agreeing), so it is asserted
    // relative-first and then anchored absolutely on BOTH sides: the
    // prototype's own number is 22px (`desktop.dc.html:446` caret, `:449`
    // spacer) and it is no longer this file's number — **E4-26 raised the caret
    // to WCAG 2.5.8's 24px in-list floor and the spacer followed**, because a
    // 24px caret beside a 22px spacer shears every leaf off its parent's left
    // edge by 2px. A relative assertion with no absolute beside it passes when
    // BOTH values drift together, which is precisely the change the alignment
    // would not survive; the two absolutes are what caught this one.
    const spacer = declarationsFor(CSS, '.gn-list__caret-spacer');
    const caret = declarationsFor(CSS, '.gn-list__collapse');
    const spacerWidth = spacer === null ? null : /width:\s*([\d.]+rem)/.exec(spacer)?.[1];
    const caretMinWidth =
      caret === null ? null : /min-width:\s*([\d.]+rem)/.exec(caret)?.[1];
    // BOTH absolutes moved 1.375rem -> 1.5rem together in E4-26, and they had
    // to: the prototype's spacer is 22px to match its 22px caret, and the caret
    // was raised to WCAG 2.5.8's 24px in-list floor. Two absolutes plus the
    // relative assertion is what makes a co-drift impossible here.
    expect(spacerWidth).toBe('1.5rem');
    expect(caretMinWidth).toBe('1.5rem');
    expect(spacerWidth).toBe(caretMinWidth);
  });
});

describe('13.671 the column chips keep a keyboard focus ring, and it is drawn where a person can see it', () => {
  it('the real checkbox is transparent AND its focus is drawn on the box beside it', () => {
    // BOTH halves, again in one shape. The input is a real checkbox moved out of
    // flow and made `opacity: 0` — which erases the UA's own focus ring — so the
    // focus indicator has to be re-drawn, and before this restyle's review it
    // was not: the five chips were focusable and SILENT. `grep -n "gn-list.*focus
    // \| focus.*gn-list"` over `ui.css` returned nothing against 43
    // `:focus-visible` rules elsewhere, which is what a lost indicator looks
    // like in a diff: no rule, not a wrong one.
    const hiddenInput = declarationsFor(CSS, ".gn-list__column-option input[type='checkbox']");
    expect(hiddenInput).not.toBeNull();
    expect(hiddenInput ?? '').toMatch(/opacity:\s*0/);
    expect(hiddenInput ?? '').toMatch(/position:\s*absolute/);

    const focusRing = declarationsFor(
      CSS,
      ".gn-list__column-option input[type='checkbox']:focus-visible + .gn-list__column-box",
    );
    expect(focusRing).not.toBeNull();
    expect(focusRing).toMatch(/outline:\s*2px solid var\(--gn-focus-ring\)/);
    // `:focus-visible` and not `:focus` is a decision, not a spelling: clicking a
    // `<label>` focuses its input, and a ring around a chip somebody just clicked
    // with a mouse is noise the platform does not draw either. It needs no
    // assertion of its own — the lookup above names the selector EXACTLY, so a
    // rule relaxed to `:focus` leaves this `null` and reddens here.
    // `--gn-focus-ring` is not declared as a literal anywhere: the custom
    // properties are EMITTED from the role names in `packages/ui/src/tokens.ts`
    // by `themeStylesheet()`, and the ui package's own "every `var(--gn-…)` in
    // `ui.css` names a declared role" case already reddens on a var that resolves
    // to nothing (measured there: adding `--gn-nonexistent` reddens it and no
    // other test in the repo). Not restated here — a second copy of that check is
    // a second thing to keep in step.
  });

  it('the input the ring is keyed on is really focusable, and really that box’s previous sibling', () => {
    // THE HALF A STYLESHEET READ CANNOT SEE. The rule above is an adjacent
    // sibling selector, and it paints only if the DOM really has the box
    // immediately after the input — reorder the two spans and the rule stays
    // exactly as written while the ring stops appearing. Focusability is the
    // other half: the same restyle is what moved the checkbox out of flow, so an
    // input that ended up `disabled`, `tabindex="-1"` or `display: none` would
    // take the whole keyboard path with it and leave the rule above unsatisfiable.
    const { container } = render(listOf({}));
    const chips = [...container.querySelectorAll<HTMLElement>('.gn-list__column-option')];
    // SIX since spec 2026-09-22 added the Priority column. Kept as a literal
    // rather than derived from `chips.length`: this number is what stops an
    // all-zero query — a renamed class, a tray that failed to render — from
    // satisfying `every` below vacuously.
    expect(chips.length).toBe(6);
    const shapes = chips.map((chip) => {
      const input = chip.querySelector<HTMLInputElement>('input[type="checkbox"]');
      const box = chip.querySelector<HTMLElement>('.gn-list__column-box');
      return {
        focusable: input !== null && !input.disabled && input.tabIndex === 0,
        boxFollowsInput: input !== null && box !== null && input.nextElementSibling === box,
      };
    });
    expect(shapes).toEqual(
      Array.from({ length: 6 }, () => ({ focusable: true, boxFollowsInput: true })),
    );
  });
});

describe('13.671 the attributes the gn-list selectors key on are attributes the component writes', () => {
  it('every `[attribute]` in a gn-list selector is on an element the List renders', async () => {
    // The other half of the binding, and the one a class check cannot see: a
    // selector `.gn-list__columns-tray[hidden]` is dead weight if the component
    // spells the attribute differently, and renaming it in the stylesheet leaves
    // every class in it still matching.
    const styled = [
      ...stripComments(CSS).matchAll(/^[^{}\n]*\.gn-list[^{}\n]*\{/gm),
    ].flatMap((hit) => [...(hit[0] ?? '').matchAll(/\[([a-z-]+)/g)].flatMap((m) => m[1] ?? []));
    expect([...new Set(styled)].sort()).toEqual(['aria-expanded', 'hidden', 'type']);

    const user = userEvent.setup();
    const { container } = render(listOf({}));
    const names = new Set(
      [...container.querySelectorAll<HTMLElement>('*')].flatMap((element) =>
        element.getAttributeNames(),
      ),
    );
    for (const attribute of new Set(styled)) {
      expect(names.has(attribute), `the List never writes [${attribute}]`).toBe(true);
    }

    // `aria-expanded` is written as a BOOLEAN, and the rule that uses it is the
    // caret's `[aria-expanded='true']` — so the attribute's presence is not
    // enough: React serialises `true` to the string the selector asks for, and
    // this is where that is measured rather than assumed.
    await user.click(container.querySelector('.gn-list__columns-toggle') as HTMLElement);
    expect(
      container.querySelector('.gn-list__columns-toggle')?.getAttribute('aria-expanded'),
    ).toBe('true');
    expect(container.querySelector('.gn-list__columns-tray')?.hasAttribute('hidden')).toBe(false);
  });
});

/**
 * Case `13.1151` — E4-26 — the List view's two per-row controls meet the 24-px
 * in-list floor, and the whole row still has no larger door.
 *
 * Measured on the List at 1512: `button.gn-list__collapse` **22×22** and
 * `button.gn-list__open` **125×22** (×26 rows, 17px/22px) — both under WCAG
 * 2.5.8's 24px floor, which is the same floor `.gn-my-work__title` and
 * `.gn-attention__title` were moved to on 2026-09-08. `grep -n onClick
 * packages/app-core/src/views/ticket-list.tsx` finds **three handlers** — the
 * Columns toggle, the caret and the title — and **no `<tr>`/row handler**, so
 * unlike the board card (`13.523`) there is no larger equivalent target and
 * 2.5.8's *Equivalent* exception does not apply. The prototype draws 22; the
 * floor wins, as it did for `.gn-attention__title`.
 *
 * **The title button is raised through its LINE BOX, not a `min-height`, and
 * that is worth asserting rather than assuming:** `.gn-list__open` declares
 * `font-size`/`line-height` only, so its height IS its line box and a
 * `min-height` added there would be a second, competing mechanism.
 */
describe('13.1151 the List row controls meet the 24px in-list floor', () => {
  const REM = 16;

  function px(value: string | undefined): number | null {
    if (value === undefined) return null;
    const m = /([\d.]+)rem/.exec(value);
    return m?.[1] === undefined ? null : Number(m[1]) * REM;
  }

  /** Both halves, read the way the assertions below read them. */
  function floorsOf(css: string): { caretMin: number | null; caretHeight: number | null; openLineBox: number | null } {
    const caret = declarationsFor(css, '.gn-list__collapse');
    const open = declarationsFor(css, '.gn-list__open');
    return {
      caretMin: px(caret === null ? undefined : /min-width:\s*([\d.]+rem)/.exec(caret)?.[1]),
      caretHeight: px(caret === null ? undefined : /min-height:\s*([\d.]+rem)/.exec(caret)?.[1]),
      openLineBox: px(open === null ? undefined : /line-height:\s*([\d.]+rem)/.exec(open)?.[1]),
    };
  }

  it('13.1151 the caret is 24×24 and the title’s line box is 24px', () => {
    const f = floorsOf(CSS);
    expect(f, `read from ui.css: ${JSON.stringify(f)}`).toEqual({
      caretMin: 24,
      caretHeight: 24,
      openLineBox: 24,
    });
  });

  it('13.1151 the floor is asserted as a FLOOR, not as a width', () => {
    // `>= 24` rather than `=== 24` on the two min sizes: a later edit that gave
    // the caret a larger in-list target is an improvement, not a regression,
    // and an equality would redden on it. The exact values are still pinned
    // above; this is the half that says what the number is FOR.
    const f = floorsOf(CSS);
    expect(f.caretMin).toBeGreaterThanOrEqual(24);
    expect(f.caretHeight).toBeGreaterThanOrEqual(24);
    expect(f.openLineBox).toBeGreaterThanOrEqual(24);
  });

  it('13.1151 a planted 22px caret reddens the same reader, in the same path', () => {
    // MUTATION WITNESS: the pre-fix value planted by REPLACING the real rule —
    // not appended. `declarationsFor` answers with the FIRST head that matches,
    // so a rule appended at the end of the file would leave the real one being
    // read and the plant would be inert: a control that does not traverse the
    // measurement's path is not a control. This is the same lesson
    // `settings-shell-tokens.test.ts`'s `withRule` records, arrived at twice.
    const real = CSS.slice(CSS.indexOf('.gn-list__collapse {'));
    const planted = CSS.replace(
      real.slice(0, real.indexOf('{') + 1) ,
      '.gn-list__collapse {\n  min-width: 1.375rem;\n  min-height: 1.375rem;\n',
    );
    expect(planted, 'the plant matched nothing — the witness is inert').not.toBe(CSS);
    expect(declarationsFor(planted, '.gn-list__collapse')).toContain('min-width: 1.375rem');
    expect(floorsOf(planted).caretMin, 'the planted 22px read back as the floor').toBe(22);
    // And the real stylesheet still reads as the fixed one, in the same
    // function, so the plant above cannot have replaced anything.
    expect(floorsOf(CSS).caretMin).toBe(24);
  });
});

/**
 * Case `13.1346` — "Group by is two lines" is ONE layout fact with two halves, and
 * neither half alone fixes it.
 *
 * `.gn-list__control` is an `inline-flex` row holding a label and the shared
 * `Select` (`ui.css:1379`). The trigger is `width: 100%`, so inside that row it
 * took the width and the LABEL — the only shrinkable item — wrapped: that is the
 * measured origin of the `Group` / `by` the owner photographed. So the fix is
 * that the label leaves the shrink (`flex: none`) and refuses to break
 * (`white-space: nowrap`), AND the trigger stops claiming the row (`width:
 * auto`). Either declaration without the other leaves the bug reachable.
 *
 * This file is the right home for it and `ticket-list.test.tsx` is not: jsdom has
 * no layout engine, so `13.1345` can witness the class names and nothing about
 * their effect. Those two declarations ARE the effect, read out of the stylesheet
 * rather than described — and what this file still cannot see is stated the way
 * its own header states it: a declaration that is present and then OVERRIDDEN
 * reads as present here.
 */
describe('13.1346 the Group by control holds one line', () => {
  it('13.1346 the label is nowrap and out of the shrink, and the trigger is content-sized', () => {
    const label = declarationsFor(CSS, '.gn-list__control-label');
    expect(label, 'no `.gn-list__control-label` rule in ui.css').not.toBeNull();
    expect(label).toContain('white-space: nowrap');
    // `nowrap` alone leaves the label shrinkable; a shrunk-to-nothing label still
    // wraps nothing and the row still reflows, so both halves are asserted.
    expect(label).toContain('flex: none');

    const scopedTrigger = declarationsFor(CSS, '.gn-list__control .gn-select__trigger');
    expect(scopedTrigger, 'no `.gn-list__control .gn-select__trigger` rule in ui.css').not.toBeNull();
    expect(scopedTrigger).toContain('width: auto');

    // CONTROL, in this same `it`: `width: auto` has to be an OVERRIDE of a real
    // declaration, not a declaration that appeared from nowhere. The shared base
    // rule still claims the full width — and it must, because every Select that is
    // not this control is full-width. If the base rule ever stopped saying
    // `width: 100%`, the scoped `auto` would still pass this case while meaning
    // something entirely different.
    const baseTrigger = declarationsFor(CSS, '.gn-select__trigger');
    expect(baseTrigger, 'no base `.gn-select__trigger` rule in ui.css').not.toBeNull();
    expect(baseTrigger).toContain('width: 100%');

    // CONTROL 2, same `it`: the reader reached TWO different rules, not the same
    // body twice. `declarationsFor` is line-anchored precisely so the scoped rule
    // and the shared one cannot answer for each other, and this is the assertion
    // that would fail if that anchoring regressed.
    expect(scopedTrigger).not.toBe(baseTrigger);
  });
});
